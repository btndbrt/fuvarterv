import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ScheduleScreen } from "../src/screens/ScheduleScreen.jsx";

/*
 * The week button, end to end: run it, read the proposal, apply it.
 *
 * What matters here is the apply path. It writes all seven weekdays at once, and a
 * mistake there does not throw — it quietly wipes days it should have left alone, or
 * drops the locks it promised to keep.
 */

const TRAINING_DAYS = [0, 1, 2, 3];

function makeState(fairnessBias = 5000) {
  return {
    teams: TRAINING_DAYS.map((d) => ({ id: `tm${d}`, name: `tm${d}`, color: "#333", stationIds: ["s0"], venueIds: ["v0"],
      passengerCount: null, stationCounts: { s0: 4 }, routeMode: "auto", routeAnchorId: null })),
    stations: [{ id: "s0", name: "s0", lat: 46.1, lon: 19.1 }],
    venues: [{ id: "v0", name: "v0", lat: 46.2, lon: 19.2 }],
    bases: [],
    vehicles: [0, 1].map((i) => ({ id: `V${i}`, name: `V${i}`, plate: `AB-${i}`, seats: 8, hasVignette: false, baseId: null })),
    drivers: [0, 1].map((i) => ({ id: `D${i}`, name: `Sofőr${i}`, wage: 3000, minShiftMin: 60, availability: [], preferredVehicleId: null })),
    trainings: TRAINING_DAYS.map((d) => ({ id: `tr${d}`, teamId: `tm${d}`, venueId: "v0", type: "weekly",
      days: [d], date: null, start: "16:00", end: "17:30", stops: null })),
    rides: [], matrix: null, assignments: {},
    settings: { arriveEarlyMin: 10, departAfterMin: 10, calloutFee: 1500, dwellMin: 2,
      estSpeedKmh: 50, fallbackLegMin: 12, preferredBias: 0, defaultBaseId: null, fairnessBias },
  };
}

let container, root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

const btn = (text) => [...container.querySelectorAll("button")].find((b) => b.textContent.includes(text));
const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

/* The screen defers the calculation by a frame so the button can paint its busy
   state, so the test has to let both timers run. */
function runWeek(state, update = () => {}) {
  act(() => { root = createRoot(container); root.render(<ScheduleScreen state={state} update={update} />); });
  click(btn("Heti optimalizálás"));
  act(() => { vi.runAllTimers(); });
}


describe("the week button", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("requestAnimationFrame", (fn) => setTimeout(fn, 0)); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  test("it opens a proposal that leads with how the work is shared out", () => {
    runWeek(makeState());
    expect(container.textContent).toContain("Heti optimalizálás — előtte / utána");
    expect(container.textContent).toContain("Munka eloszlása");
    expect(container.textContent).toContain("Arányos rész");
    // Both drivers appear, which is the whole point of running the week.
    expect(container.textContent).toContain("Sofőr0");
    expect(container.textContent).toContain("Sofőr1");
  });

  test("it says so when balancing has been switched off", () => {
    runWeek(makeState(0));
    expect(container.textContent).toContain("kiegyenlítés ki van kapcsolva");
  });

  test("applying writes every training day, and leaves the empty ones empty", () => {
    const s = makeState();
    let next = null;
    runWeek(s, (fn) => { next = fn(s); });
    click(btn("Alkalmazás az egész hétre"));

    expect(next).toBeTruthy();
    for (const d of TRAINING_DAYS) expect(next.assignments[d].chains.length).toBeGreaterThan(0);
    for (const d of [4, 5, 6]) expect(next.assignments[d].chains).toEqual([]);
  });

  test("applying shares the week between both drivers", () => {
    const s = makeState();
    let next = null;
    runWeek(s, (fn) => { next = fn(s); });
    click(btn("Alkalmazás az egész hétre"));

    const used = new Set(Object.values(next.assignments).flatMap((a) => a.chains.map((c) => c.driverId)));
    expect(used.size).toBe(2);
  });

  /* Applying a week must not quietly replace a week of rides: days the user already
     adjusted by hand would go with them. Rides stay a per-day, explicit action. */
  test("applying does not touch the saved rides", () => {
    const s = makeState();
    s.rides = [{ id: "keep", trainingId: "tr0", day: 0, date: null, vehicleId: "V0", driverId: "D0", dir: "oda", stops: [] }];
    let next = null;
    runWeek(s, (fn) => { next = fn(s); });
    click(btn("Alkalmazás az egész hétre"));
    expect(next.rides).toEqual(s.rides);
  });

  test("a locked chain keeps its lock through the week apply", () => {
    const s = makeState();
    s.assignments = { 0: { chains: [{ id: "ch1", driverId: "D1", vehicleId: "V1", locked: true,
      taskIds: [{ id: "tr0:0:oda" }, { id: "tr0:0:vissza" }] }] } };
    let next = null;
    runWeek(s, (fn) => { next = fn(s); });
    click(btn("Alkalmazás az egész hétre"));

    const held = next.assignments[0].chains.find((c) => c.locked);
    expect(held).toBeTruthy();
    expect(held.driverId).toBe("D1");
    expect(held.taskIds.map((t) => t.id).sort()).toEqual(["tr0:0:oda", "tr0:0:vissza"]);
  });

  test("cancelling changes nothing at all", () => {
    const s = makeState();
    let called = false;
    runWeek(s, () => { called = true; });
    click(btn("Mégse"));
    expect(called).toBe(false);
    expect(container.textContent).not.toContain("Munka eloszlása");
  });
});
