import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ScheduleScreen } from "../src/screens/ScheduleScreen.jsx";
import { resolveDay, withGeneratedRides } from "../src/domain/optimizer.js";
import { mondayOf } from "../src/domain/datetime.js";

/*
 * The week button, end to end: run it, read the proposal, apply it.
 *
 * What matters here is the apply path. It writes all seven weekdays at once — the
 * schedule and the rides — and a mistake there does not throw: it quietly wipes days
 * it should have left alone, or drops the locks it promised to keep.
 */

const TRAINING_DAYS = [0, 1, 2, 3];
const APPLY = "Alkalmazás és fuvarok rögzítése";

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

/* The screen defers the calculation by a frame so the busy overlay can paint, so the
   test has to let both timers run. */
function runWeek(state, update = () => {}) {
  act(() => { root = createRoot(container); root.render(<ScheduleScreen state={state} update={update} />); });
  click(btn("Heti beosztás optimalizálása"));
  act(() => { vi.runAllTimers(); });
}


describe("the week button", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("requestAnimationFrame", (fn) => setTimeout(fn, 0)); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  test("it is the only optimise button", () => {
    act(() => { root = createRoot(container); root.render(<ScheduleScreen state={makeState()} update={() => {}} />); });
    const labels = [...container.querySelectorAll("button")].map((b) => b.textContent.trim());
    expect(labels.filter((t) => /optimaliz/i.test(t))).toEqual(["Heti beosztás optimalizálása"]);
    expect(labels.some((t) => t.includes("Fuvarok generálása"))).toBe(false);
  });

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
    click(btn(APPLY));

    expect(next).toBeTruthy();
    for (const d of TRAINING_DAYS) expect(next.assignments[d].chains.length).toBeGreaterThan(0);
    for (const d of [4, 5, 6]) expect(next.assignments[d].chains).toEqual([]);
  });

  test("applying shares the week between both drivers", () => {
    const s = makeState();
    let next = null;
    runWeek(s, (fn) => { next = fn(s); });
    click(btn(APPLY));

    const used = new Set(Object.values(next.assignments).flatMap((a) => a.chains.map((c) => c.driverId)));
    expect(used.size).toBe(2);
  });

  /* Applying publishes. The Sofőr view reads rides, so a plan that stopped at the
     schedule would never reach the drivers. */
  test("applying generates the week's rides from the plan", () => {
    const s = makeState();
    let next = null;
    runWeek(s, (fn) => { next = fn(s); });
    click(btn(APPLY));

    expect(next.rides).toHaveLength(TRAINING_DAYS.length * 2);
    for (const d of TRAINING_DAYS)
      for (const dir of ["oda", "vissza"])
        expect(next.rides.filter((r) => r.trainingId === `tr${d}` && r.day === d && r.dir === dir && r.source === "schedule")).toHaveLength(1);
  });

  /* The ids are stamped once and shared. Stamped separately, the saved chain and its
     rides disagree, and the driver's sheet invents a depot trip mid-run (ADR-17). */
  test("every generated ride names the chain it was saved in", () => {
    const s = makeState();
    let next = null;
    runWeek(s, (fn) => { next = fn(s); });
    click(btn(APPLY));

    const chainOf = new Map(Object.values(next.assignments)
      .flatMap((a) => a.chains.flatMap((c) => c.taskIds.map((t) => [t.id, c.id]))));
    for (const r of next.rides) expect(r.runId).toBe(chainOf.get(`${r.trainingId}:${r.day}:${r.dir}`));
  });

  test("an unlocked hand-made ride is replaced, and the proposal says so first", () => {
    const s = makeState();
    s.rides = [{ id: "hand", trainingId: "tr0", day: 0, date: null, vehicleId: "V0", driverId: "D0", dir: "oda", stops: [] }];
    let next = null;
    runWeek(s, (fn) => { next = fn(s); });
    expect(container.textContent).toContain("1 kézzel felvett fuvar lecserélődik");
    click(btn(APPLY));
    expect(next.rides.some((r) => r.id === "hand")).toBe(false);
  });

  test("there is no warning when no hand-made ride would be lost", () => {
    runWeek(makeState());
    expect(container.textContent).not.toContain("kézzel felvett fuvar");
  });

  test("a locked chain keeps its lock, its crew and its rides through the week apply", () => {
    const s = makeState();
    s.assignments = { 0: { chains: [{ id: "ch1", driverId: "D1", vehicleId: "V1", locked: true,
      taskIds: [{ id: "tr0:0:oda" }, { id: "tr0:0:vissza" }] }] } };
    let next = null;
    runWeek(s, (fn) => { next = fn(s); });
    click(btn(APPLY));

    const held = next.assignments[0].chains.find((c) => c.locked);
    expect(held).toBeTruthy();
    expect(held.driverId).toBe("D1");
    expect(held.taskIds.map((t) => t.id).sort()).toEqual(["tr0:0:oda", "tr0:0:vissza"]);
    const rides = next.rides.filter((r) => r.trainingId === "tr0" && r.day === 0);
    expect(rides).toHaveLength(2);
    for (const r of rides) expect(r).toMatchObject({ driverId: "D1", vehicleId: "V1", runId: held.id });
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

describe("rebuilding a day's rides", () => {
  const weekMon = mondayOf(new Date(2026, 8, 14));

  /* Only the outbound leg is chained. The return leg has nothing in the plan, so the
     hand-made ride for it is all the team has — it stays. The generated one for the
     same leg names a run that no longer holds it, so it goes. */
  test("keeps hand-made rides for uncovered legs only", () => {
    const s = makeState();
    s.assignments = { 0: { chains: [{ id: "c1", driverId: "D0", vehicleId: "V0", taskIds: [{ id: "tr0:0:oda" }] }] } };
    s.rides = [
      { id: "hand-oda", trainingId: "tr0", day: 0, dir: "oda", driverId: "D1", vehicleId: "V1", stops: [] },
      { id: "hand-back", trainingId: "tr0", day: 0, dir: "vissza", driverId: "D1", vehicleId: "V1", stops: [] },
      { id: "old-back", trainingId: "tr0", day: 0, dir: "vissza", source: "schedule", driverId: "D0", vehicleId: "V0", stops: [] },
      { id: "other-day", trainingId: "tr1", day: 1, dir: "oda", driverId: "D0", vehicleId: "V0", stops: [] },
    ];
    const rides = withGeneratedRides(s, 0, weekMon, resolveDay(s, 0, weekMon).chains);

    const ids = rides.map((r) => r.id);
    expect(ids).toContain("hand-back");
    expect(ids).toContain("other-day");
    expect(ids).not.toContain("hand-oda");
    expect(ids).not.toContain("old-back");
    const oda = rides.filter((r) => r.trainingId === "tr0" && r.dir === "oda");
    expect(oda).toHaveLength(1);
    expect(oda[0]).toMatchObject({ driverId: "D0", vehicleId: "V0", runId: "c1", source: "schedule" });
  });
});

describe("a manual move", () => {
  // A Monday, so the screen opens on weekday 0, which has a training.
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 14, 10, 0)); });
  afterEach(() => { vi.useRealTimers(); });

  test("locks the task and puts it in the driver's rides at once", () => {
    const s = makeState();
    let next = null;
    act(() => { root = createRoot(container); root.render(<ScheduleScreen state={s} update={(fn) => { next = fn(s); }} />); });
    click(container.querySelector('[aria-label="Áthelyezés"]'));
    click(btn("Új lánc ezzel a feladattal"));

    const chain = next.assignments[0].chains[0];
    expect(chain.taskIds).toEqual([{ id: "tr0:0:oda", locked: true }]);
    const rides = next.rides.filter((r) => r.trainingId === "tr0" && r.day === 0);
    expect(rides).toHaveLength(1);
    expect(rides[0]).toMatchObject({ dir: "oda", driverId: "D0", vehicleId: "V0", runId: chain.id });
  });
});
