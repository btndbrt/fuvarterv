import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { weekdayIdx, mondayOf, toISO } from "../src/domain/datetime.js";
import { driversWithWeekWork, PrintSheets, DriverWeekTable } from "../src/screens/PrintSheets.jsx";

/*
 * The printed week sheet: one driver, picked first, their week as a table.
 *
 *   Nothing is built until a driver is chosen, and only drivers with work that week
 *   are offered — a blank sheet in a pile of handouts reads as a printing failure.
 *
 *   The table is built from the SAVED rides, the same list the driver tab reads, so
 *   paper and phone cannot disagree.
 */

const DATE = "2025-01-08";               // Wednesday
const WEEKDAY = weekdayIdx(DATE);
const WEEK = "2025-01-06";
const weekMon = mondayOf(WEEK);

const settings = { arriveEarlyMin: 10, departAfterMin: 10, calloutFee: 1500, dwellMin: 2,
  estSpeedKmh: 60, fallbackLegMin: 12, preferredBias: 0, defaultBaseId: "h1" };

function makeState({ defaultBaseId = "h1" } = {}) {
  return {
    stations: [{ id: "s1", name: "Zákányszék", address: "Fő tér 1.", lat: 46.2745, lon: 19.889 }],
    bases: [{ id: "h1", name: "Klub telephely", address: "Telephely u. 2.", lat: 46.2745, lon: 19.889 }],
    venues: [{ id: "v1", name: "Városi Sportcsarnok", address: "", lat: 46.4, lon: 20.1, needsVignette: false }],
    vehicles: [{ id: "b1", name: "Busz", plate: "AB-123", seats: 20, hasVignette: false, baseId: null }],
    drivers: [
      { id: "d1", name: "Anna", phone: "+36 30 111 2222", wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: null },
      { id: "d2", name: "Béla", phone: "", wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: null },
    ],
    teams: [{ id: "tm", name: "U12 lányok", color: "#c33", stationIds: ["s1"], venueIds: ["v1"],
      passengerCount: 10, stationCounts: { s1: 10 }, routeMode: "auto", routeAnchorId: null,
      returnStationIds: null, returnStationCounts: {}, returnRouteAnchorId: null }],
    trainings: [{ id: "tr", teamId: "tm", venueId: "v1", type: "weekly", days: [WEEKDAY],
      date: null, start: "16:00", end: "18:00", stops: null }],
    /* Anna drives on Wednesday; Béla is on the books but has nothing this week. */
    rides: [
      { id: "r1", trainingId: "tr", day: WEEKDAY, date: null, vehicleId: "b1", driverId: "d1", dir: "oda",
        stops: [{ id: "r1s1", stationId: "s1", time: "15:20", count: 10 }] },
      { id: "r2", trainingId: "tr", day: WEEKDAY, date: null, vehicleId: "b1", driverId: "d1", dir: "vissza",
        stops: [{ id: "r2s1", stationId: "s1", time: "18:45", count: 10 }] },
    ],
    assignments: {}, matrix: null,
    settings: { ...settings, defaultBaseId },
  };
}

let container, root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

function mount(el) {
  act(() => { root = createRoot(container); root.render(el); });
}
const btn = (text) => [...container.querySelectorAll("button")].find((b) => b.textContent.includes(text));
const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const choose = (select, value) => act(() => {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
});

describe("who can be printed", () => {
  test("only drivers with rides that week, with how many", () => {
    const out = driversWithWeekWork(makeState(), weekMon);
    expect(out.map((x) => [x.driver.name, x.rides])).toEqual([["Anna", 2]]);
  });

  test("another week offers nobody", () => {
    const s = makeState();
    // A one-off training the following week is not this week's work.
    s.trainings[0] = { ...s.trainings[0], type: "once", date: "2025-01-15", days: [] };
    s.rides.forEach((r) => { r.day = null; r.date = "2025-01-15"; });
    expect(driversWithWeekWork(s, weekMon)).toEqual([]);
  });

  test("with no rides saved nobody is offered, and the screen says why", () => {
    const s = makeState();
    s.rides = [];
    mount(<PrintSheets state={s} weekMonISO={WEEK} onClose={() => {}} />);
    expect(container.textContent).toContain("egyik sofőrnek sincs fuvarja");
    expect(btn("Nyomtatás").disabled).toBe(true);
  });
});

describe("the driver is picked before anything is built", () => {
  test("the overlay opens on the picker, with no table and nothing to print", () => {
    mount(<PrintSheets state={makeState()} weekMonISO={WEEK} onClose={() => {}} />);
    expect(container.querySelector(".print-table")).toBe(null);
    expect(btn("Nyomtatás").disabled).toBe(true);
    expect(btn("Menetrend megjelenítése").disabled).toBe(true);
    const options = [...container.querySelectorAll("select option")].map((o) => o.textContent);
    expect(options).toEqual(["– válassz sofőrt –", "Anna (2 fuvar)"]);
  });

  test("choosing a driver builds their table and enables printing", () => {
    mount(<PrintSheets state={makeState()} weekMonISO={WEEK} onClose={() => {}} />);
    choose(container.querySelector("select"), "d1");
    click(btn("Menetrend megjelenítése"));
    expect(container.querySelector(".print-table")).toBeTruthy();
    expect(container.textContent).toContain("Anna");
    expect(btn("Nyomtatás").disabled).toBe(false);
  });

  test("another driver can be chosen without closing", () => {
    mount(<PrintSheets state={makeState()} weekMonISO={WEEK} onClose={() => {}} />);
    choose(container.querySelector("select"), "d1");
    click(btn("Menetrend megjelenítése"));
    click(btn("Másik sofőr"));
    expect(container.querySelector(".print-table")).toBe(null);
    expect(container.querySelector("select")).toBeTruthy();
  });

  /* The toolbar drives the browser's print dialog and must never reach paper. */
  test("the toolbar is marked as not printable", () => {
    mount(<PrintSheets state={makeState()} weekMonISO={WEEK} onClose={() => {}} />);
    expect(container.querySelector(".print-bar").classList.contains("noprint")).toBe(true);
  });
});

describe("what the table says", () => {
  const table = (s = makeState()) =>
    mount(<DriverWeekTable state={s} driver={s.drivers[0]} weekMon={weekMon} />);
  const rowsText = () => [...container.querySelectorAll("tbody tr")].map((tr) => tr.textContent);

  test("the driver, the week and both rides with their routes", () => {
    table();
    const text = container.textContent;
    expect(text).toContain("+36 30 111 2222");
    expect(text).toContain("Heti menetrend");
    expect(text).toContain("2 fuvar");
    expect(text).toContain("Szerda");
    expect(text).toContain("U12 lányok");
    expect(text).toContain("AB-123");
    expect(text).toContain("15:20 Zákányszék (10) → 16:00 Városi Sportcsarnok");
    expect(text).toContain("18:10 Városi Sportcsarnok → 18:45 Zákányszék (10)");
  });

  test("every day of the week has its own section, and a day off says so", () => {
    table();
    expect(container.querySelectorAll(".print-table tbody")).toHaveLength(7);
    expect(container.querySelectorAll("td.empty")).toHaveLength(6);
    expect(container.querySelector("td.empty").textContent).toBe("Nincs fuvar");
  });

  /* The sheet is where a driver finds out what time to leave the yard. The depot
     here sits on the stop itself, so the two-hour training is time enough to go
     home: two shifts, each opened and closed by its own depot run — the same
     grouping the driver tab shows. */
  test("the depot runs open and close each shift", () => {
    table();
    const wed = rowsText().filter((t) => !t.includes("Nincs fuvar"));
    expect(wed).toHaveLength(6);
    expect(wed[0]).toContain("Kiállás");
    expect(wed[0]).toContain("Klub telephely");
    expect(wed[1]).toContain("ODA");
    expect(wed[2]).toContain("Beállás");
    expect(wed[3]).toContain("Kiállás");
    expect(wed[4]).toContain("VISSZA");
    expect(wed[5]).toContain("Beállás");
  });

  test("with no depot configured the table simply omits those rows", () => {
    table(makeState({ defaultBaseId: null }));
    expect(container.textContent).not.toContain("Kiállás");
    expect(container.textContent).toContain("U12 lányok");
  });

  test("the day's name spans all of its rows", () => {
    table();
    const day = [...container.querySelectorAll("td.day")].find((td) => td.textContent.includes("Szerda"));
    expect(day.rowSpan).toBe(6);
  });
});

describe("the button that opens all this", () => {
  /* The schedule screen cannot render the overlay itself, so it fires an event and
     the app shell picks it up. Nothing else connects the two. */
  test("the schedule screen fires the print event for the week on screen", async () => {
    const { ScheduleScreen } = await import("../src/screens/ScheduleScreen.jsx");
    let fired = null;
    const onPrint = (e) => { fired = e.detail; };
    window.addEventListener("fuvarterv:print", onPrint);
    try {
      mount(<ScheduleScreen state={makeState()} update={() => {}} />);
      const b = btn("Heti menetrend nyomtatása");
      expect(b.disabled).toBe(false);
      expect(b.textContent).toContain("1 sofőr");
      click(b);
      expect(fired).toEqual({ weekMonISO: toISO(mondayOf(new Date())) });
    } finally {
      window.removeEventListener("fuvarterv:print", onPrint);
    }
  });

  test("with no rides that week the button refuses to open an empty sheet", async () => {
    const { ScheduleScreen } = await import("../src/screens/ScheduleScreen.jsx");
    const s = makeState();
    s.rides = [];
    mount(<ScheduleScreen state={s} update={() => {}} />);
    expect(btn("Heti menetrend nyomtatása").disabled).toBe(true);
  });
});
