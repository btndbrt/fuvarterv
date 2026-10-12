import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MasterForm } from "../src/screens/MasterScreen.jsx";
import { ScheduleScreen } from "../src/screens/ScheduleScreen.jsx";
import { DEFAULT_SETTINGS } from "../src/data/storage.js";
import { weekdayIdx, mondayOf } from "../src/domain/datetime.js";
import { genDayTasks } from "../src/domain/optimizer.js";

/*
 * Time-dependent depots on screen: the driver form edits the driver's depot and its
 * windows with the same row pattern the availability uses, and the Schedule screen
 * draws a chain that leaves one depot and returns to another with each run naming its
 * own depot.
 */

const WORK = { id: "hWORK", name: "Munkahely", address: "", note: "", lat: 46.32, lon: 19.92 };
const HOME = { id: "hHOME", name: "Otthon", address: "", note: "", lat: 46.10, lon: 19.70 };

let container, root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

const render = (el) => act(() => { root = createRoot(container); root.render(el); });
const btn = (label) => [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const pick = (select, value) => act(() => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
  setter.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
});

describe("the driver form edits the driver's depot and its windows", () => {
  const state = { stations: [], venues: [], bases: [WORK, HOME], vehicles: [], drivers: [], rides: [], teams: [], trainings: [] };
  const driver = { id: "d1", name: "Anna", phone: "", email: "", note: "", wage: 3000, minShiftMin: 180, availability: [], baseId: null, baseRules: [] };
  const vehicle = { id: "b1", name: "Busz", plate: "AB-1", seats: 8, note: "", hasVignette: false, baseId: "hHOME" };

  test("a depot and a window, given a day and a depot, are saved on the driver", () => {
    const saved = [];
    render(<MasterForm kind="drivers" state={state} entity={driver} onSave={(x) => saved.push(x)} onCancel={() => {}} />);
    pick(container.querySelector('select[aria-label="A sofőr telephelye"]'), "hHOME");
    click(btn("Időszakos telephely hozzáadása"));
    click(btn("H"));
    pick(container.querySelector('select[aria-label="Telephely ebben az idősávban"]'), "hWORK");
    click(btn("Mentés"));
    expect(saved[0].baseRules).toEqual([{ days: [0], start: "00:00", end: "16:00", baseId: "hWORK" }]);
    expect(saved[0].baseId).toBe("hHOME");
  });

  test("a window with no day ticked is dropped on save rather than stored half-filled", () => {
    const saved = [];
    render(<MasterForm kind="drivers" state={state} entity={driver} onSave={(x) => saved.push(x)} onCancel={() => {}} />);
    click(btn("Időszakos telephely hozzáadása"));
    click(btn("Mentés"));
    expect(saved[0].baseRules).toEqual([]);
    expect(saved[0].baseId).toBe(null);
  });

  test("the vehicle form keeps its single depot and no windows", () => {
    const saved = [];
    render(<MasterForm kind="vehicles" state={state} entity={vehicle} onSave={(x) => saved.push(x)} onCancel={() => {}} />);
    expect(btn("Időszakos telephely hozzáadása")).toBeUndefined();
    click(btn("Mentés"));
    expect(saved[0].baseId).toBe("hHOME");
  });

  test("the driver's availability editor still works next to the depot windows", () => {
    const saved = [];
    render(<MasterForm kind="drivers" state={state} entity={driver} onSave={(x) => saved.push(x)} onCancel={() => {}} />);
    click(btn("Idősáv hozzáadása"));
    click(btn("K"));
    click(btn("Mentés"));
    expect(saved[0].availability).toEqual([{ days: [1], start: "15:00", end: "21:00" }]);
  });
});

describe("the Schedule screen draws each depot run from its own depot", () => {
  const WEEKDAY = weekdayIdx(new Date());
  function makeState() {
    const s = {
      stations: [{ id: "sA", name: "Megálló", lat: 46.30, lon: 19.90 }],
      venues: [{ id: "v0", name: "Csarnok", lat: 46.35, lon: 19.95, needsVignette: false }],
      bases: [WORK, HOME],
      vehicles: [{ id: "b1", name: "Busz", plate: "AB-1", seats: 20, hasVignette: false, baseId: null }],
      drivers: [{ id: "d1", name: "Anna", wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: null, baseId: "hHOME",
        baseRules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "16:00", baseId: "hWORK" }] }],
      teams: [{ id: "tm", name: "TM", color: "#000", stationIds: ["sA"], venueIds: ["v0"], passengerCount: null,
        stationCounts: { sA: 5 }, routeMode: "auto", routeAnchorId: null, returnStationIds: null,
        returnStationCounts: {}, returnRouteAnchorId: null }],
      /* Outbound pickup just after 16:00 (from the office, as it cannot be home in
         time), return in the evening (home). One locked chain holds both. */
      trainings: [{ id: "tr", teamId: "tm", venueId: "v0", type: "weekly", days: [WEEKDAY], date: null, start: "16:30", end: "19:00", stops: null }],
      rides: [], assignments: {}, matrix: null,
      settings: { ...DEFAULT_SETTINGS, estSpeedKmh: 60, fairnessBias: 0 },
    };
    const { tasks } = genDayTasks(s, WEEKDAY, mondayOf(new Date()));
    s.assignments = { [WEEKDAY]: { chains: [{ id: "c1", driverId: "d1", vehicleId: "b1", locked: true, taskIds: tasks.map((t) => ({ id: t.id, locked: true })) }] } };
    return s;
  }

  test("kiállás from the office, beállás to home", () => {
    render(<ScheduleScreen state={makeState()} update={() => {}} />);
    const lines = [...container.querySelectorAll(".linkline")].map((e) => e.textContent);
    expect(lines.find((t) => t.includes("kiállás"))).toContain("kiállás: Munkahely → Megálló");
    expect(lines.find((t) => t.includes("beállás"))).toContain("→ Otthon");
  });
});
