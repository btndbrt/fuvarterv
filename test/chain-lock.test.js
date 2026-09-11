import { describe, test, expect } from "vitest";
import { mondayOf } from "../src/domain/datetime.js";
import { optimizeDay, resolveDay } from "../src/domain/optimizer.js";

/*
 * Locking a whole chain, as distinct from locking its tasks one at a time.
 *
 * A locked chain holds ALL of its tasks, its driver and its vehicle, whatever the
 * individual task flags say. What it does NOT do is seal itself: the optimizer may
 * still append compatible work, and whatever it appends comes back unlocked, so the
 * next run is free to place it better. A lock holds what was locked, and no more.
 */

const WEEKDAY = 2;
const WEEK_MON = mondayOf("2026-08-05");

/* Two teams, two trainings, and two drivers of very different price. Left alone the
   optimizer always prefers the cheap one — which is what makes the locked case
   meaningful rather than a coincidence. */
function makeState(chains) {
  return {
    teams: [
      { id: "tmA", name: "A", stationIds: ["s0"], venueIds: ["v0"], passengerCount: null, stationCounts: { s0: 3 }, routeMode: "auto", routeAnchorId: null },
      { id: "tmB", name: "B", stationIds: ["s1"], venueIds: ["v0"], passengerCount: null, stationCounts: { s1: 3 }, routeMode: "auto", routeAnchorId: null },
    ],
    stations: [{ id: "s0", name: "s0", lat: 46.1, lon: 19.1 }, { id: "s1", name: "s1", lat: 46.12, lon: 19.12 }],
    venues: [{ id: "v0", name: "v0", lat: 46.2, lon: 19.2 }],
    bases: [],
    vehicles: [{ id: "V", name: "V", plate: "AB-1", seats: 8 }, { id: "V2", name: "V2", plate: "AB-2", seats: 8 }],
    drivers: [
      { id: "D", name: "D", wage: 2000, minShiftMin: 60, availability: [], preferredVehicleId: null },
      { id: "D2", name: "D2", wage: 9000, minShiftMin: 60, availability: [], preferredVehicleId: null },
    ],
    trainings: [
      { id: "trA", teamId: "tmA", venueId: "v0", type: "weekly", days: [WEEKDAY], date: null, start: "16:00", end: "17:30" },
      { id: "trB", teamId: "tmB", venueId: "v0", type: "weekly", days: [WEEKDAY], date: null, start: "18:30", end: "20:00" },
    ],
    rides: [], matrix: null,
    assignments: { [WEEKDAY]: { chains } },
    settings: { arriveEarlyMin: 10, departAfterMin: 10, calloutFee: 1500, dwellMin: 2,
      estSpeedKmh: 50, fallbackLegMin: 12, preferredBias: 0, defaultBaseId: null },
  };
}

/* Deliberately NO per-task locks: the chain is the only thing holding these two
   tasks together on an expensive driver. */
const savedChain = (extra = {}) => [{
  id: "ch1", driverId: "D2", vehicleId: "V2",
  taskIds: [{ id: "trA:2:oda" }, { id: "trA:2:vissza" }],
  ...extra,
}];

const chainWith = (out, taskId) => out.chains.find((c) => c.tasks.some((t) => t.id === taskId));

describe("a chain with no lock is fair game", () => {
  /* The control. Without this the locked test below would prove nothing: it has to
     be shown that the optimizer really would take these tasks away. */
  test("the optimizer moves the work to the cheaper driver and re-chains it", () => {
    const out = optimizeDay(makeState(savedChain()), WEEKDAY, WEEK_MON);
    expect(out.chains.some((c) => c.driverId === "D2")).toBe(false);
    const oda = chainWith(out, "trA:2:oda");
    const vissza = chainWith(out, "trA:2:vissza");
    expect(oda).not.toBe(vissza);   // the pair was split up
  });
});

describe("a locked chain holds together", () => {
  test("all of its tasks stay on it, though none is individually locked", () => {
    const out = optimizeDay(makeState(savedChain({ locked: true })), WEEKDAY, WEEK_MON);
    const c = chainWith(out, "trA:2:oda");
    expect(c.tasks.map((t) => t.id).sort()).toEqual(["trA:2:oda", "trA:2:vissza"]);
  });

  test("it keeps the driver and vehicle it was given, cost notwithstanding", () => {
    const out = optimizeDay(makeState(savedChain({ locked: true })), WEEKDAY, WEEK_MON);
    const c = chainWith(out, "trA:2:oda");
    expect(c.driverId).toBe("D2");
    expect(c.vehicleId).toBe("V2");
  });

  test("the lock survives the run, so optimising twice does not release it", () => {
    const out = optimizeDay(makeState(savedChain({ locked: true })), WEEKDAY, WEEK_MON);
    expect(chainWith(out, "trA:2:oda").locked).toBe(true);
  });

  test("the rest of the day is still optimised around it", () => {
    const out = optimizeDay(makeState(savedChain({ locked: true })), WEEKDAY, WEEK_MON);
    const b = chainWith(out, "trB:2:oda");
    expect(b.driverId).toBe("D");           // the free work still goes to the cheap driver
    expect(b.locked).toBeFalsy();
    expect(out.uncovered).toHaveLength(0);
  });

  /* The agreed semantic: the chain holds the tasks, so the tasks themselves stay
     unlocked and anything appended later is free to move on the next run. */
  test("holding a chain does not silently lock its tasks one by one", () => {
    const out = optimizeDay(makeState(savedChain({ locked: true })), WEEKDAY, WEEK_MON);
    expect(chainWith(out, "trA:2:oda").tasks.every((t) => !t.locked)).toBe(true);
  });
});

describe("reading the flag back", () => {
  test("resolveDay exposes it, so the screen can show the right switch", () => {
    const res = resolveDay(makeState(savedChain({ locked: true })), WEEKDAY, WEEK_MON);
    expect(res.chains.find((c) => c.id === "ch1").locked).toBe(true);
  });

  /* Chains saved before chain locking existed have no such field. They must keep
     behaving exactly as they did, with no migration. */
  test("a chain saved without the field is simply unlocked", () => {
    const res = resolveDay(makeState(savedChain()), WEEKDAY, WEEK_MON);
    expect(res.chains.find((c) => c.id === "ch1").locked).toBe(false);
  });
});
