import { describe, test, expect } from "vitest";
import { timeToMin, minToTime, weekdayIdx, mondayOf, addDays } from "../src/domain/datetime.js";
import { legMin } from "../src/domain/geo.js";
import { normalizePlate, rideWindow, findConflicts } from "../src/domain/logic.js";
import { bestStationOrder, splitStationsByCapacity } from "../src/domain/optimizer.js";

/* ------------------------------------------------------------------ */
describe("normalizePlate", () => {
  test("hyphen rule: letters then digits get one hyphen", () => {
    expect(normalizePlate("abc123")).toBe("ABC-123");
    expect(normalizePlate("aAbB123")).toBe("AABB-123");
    expect(normalizePlate(" p a k - 5 4 3 ")).toBe("PAK-543");
  });
  test("idempotence", () => {
    for (const s of ["abc123", "ABC-123", "aabb123", "12ab", "a1b2", "", "PAK-543"]) {
      expect(normalizePlate(normalizePlate(s))).toBe(normalizePlate(s));
    }
  });
  test("non-conforming input is uppercased/stripped without a hyphen", () => {
    expect(normalizePlate("12ab")).toBe("12AB");   // starts with digits → no match
    expect(normalizePlate("a1b2")).toBe("A1B2");   // interleaved → no match
    expect(normalizePlate("!!!")).toBe("");        // nothing left
    expect(normalizePlate(null)).toBe("");
  });
});

/* ------------------------------------------------------------------ */
describe("timeToMin / minToTime", () => {
  test("round-trips every valid HH:MM", () => {
    for (let m = 0; m < 1440; m++) {
      expect(timeToMin(minToTime(m))).toBe(m);
    }
  });
  test("clamps out-of-range minutes", () => {
    expect(minToTime(-1)).toBe("00:00");
    expect(minToTime(-999)).toBe("00:00");
    expect(minToTime(1440)).toBe("23:59");
    expect(minToTime(99999)).toBe("23:59");
  });
  test("rounds fractional minutes and handles empty input", () => {
    expect(minToTime(90.4)).toBe("01:30");
    expect(minToTime(90.6)).toBe("01:31");
    expect(timeToMin("")).toBe(null);
    expect(timeToMin(null)).toBe(null);
  });
});

/* ------------------------------------------------------------------ */
describe("weekdayIdx (Monday-first, 0..6)", () => {
  test("Monday of any date has index 0, and +k days has index k", () => {
    const seeds = ["2026-08-05", "2024-02-29", "2025-01-01", "2026-12-31", "2023-07-04"];
    for (const s of seeds) {
      const mon = mondayOf(s);
      expect(weekdayIdx(mon)).toBe(0);
      for (let k = 0; k < 7; k++) {
        expect(weekdayIdx(addDays(mon, k))).toBe(k);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
// Deterministic PRNG so the property tests are reproducible.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

describe("bestStationOrder matches brute force for n <= 7", () => {
  const rng = mulberry32(42);
  // Build a state with a full symmetric duration matrix over the given points.
  function distState(ids, venueId) {
    const durations = {};
    const all = [...ids, venueId];
    for (const a of all) for (const b of all) {
      if (a === b) continue;
      const key = `${a}|${b}`;
      if (durations[key] == null) {
        const d = 1 + Math.floor(rng() * 20);
        durations[key] = d;
        durations[`${b}|${a}`] = d;
      }
    }
    return { stations: ids.map((id) => ({ id })), venues: [{ id: venueId }], matrix: { durations }, settings: {} };
  }
  const routeCost = (state, order, { pre = null, post = null }) => {
    let c = pre ? legMin(state, pre, order[0]) : 0;
    for (let i = 0; i < order.length - 1; i++) c += legMin(state, order[i], order[i + 1]);
    if (post) c += legMin(state, order[order.length - 1], post);
    return c;
  };

  test("post-anchored (route ends at the venue)", () => {
    for (let n = 2; n <= 7; n++) {
      for (let trial = 0; trial < 3; trial++) {
        const ids = Array.from({ length: n }, (_, i) => `s${i}`);
        const st = distState(ids, "v");
        const got = bestStationOrder(st, ids, { post: "v" });
        const gotCost = routeCost(st, got, { post: "v" });
        const brute = Math.min(...permutations(ids).map((p) => routeCost(st, p, { post: "v" })));
        expect(gotCost).toBe(brute);
      }
    }
  });

  test("pre + post anchored, and fixedFirst constraint honoured", () => {
    const ids = ["s0", "s1", "s2", "s3", "s4"];
    const st = distState(ids, "v");
    const got = bestStationOrder(st, ids, { pre: "v", post: "v" });
    const brute = Math.min(...permutations(ids).map((p) => routeCost(st, p, { pre: "v", post: "v" })));
    expect(routeCost(st, got, { pre: "v", post: "v" })).toBe(brute);

    const gotF = bestStationOrder(st, ids, { post: "v", fixedFirst: "s2" });
    expect(gotF[0]).toBe("s2");
    const bruteF = Math.min(...permutations(ids).filter((p) => p[0] === "s2").map((p) => routeCost(st, p, { post: "v" })));
    expect(routeCost(st, gotF, { post: "v" })).toBe(bruteF);
  });
});

/* ------------------------------------------------------------------ */
describe("splitStationsByCapacity", () => {
  const ids = (bins) => bins.map((b) => b.stops.map((s) => s.id));
  test("known packing (first-fit-decreasing, original order within a bin)", () => {
    const counts = { a: 3, b: 3, c: 2 };
    const bins = splitStationsByCapacity(["a", "b", "c"], (id) => counts[id], 5);
    expect(ids(bins)).toEqual([["a", "c"], ["b"]]);
    expect(bins.map((b) => b.pax)).toEqual([5, 3]);
  });
  test("returns null only when there is no per-stop count at all", () => {
    expect(splitStationsByCapacity(["a", "b"], () => 0, 5)).toBeNull();
  });
  test("a stop bigger than one bus fills whole buses, the rest is packed with the others", () => {
    const counts = { a: 10, b: 3, c: 2 };
    const bins = splitStationsByCapacity(["a", "b", "c"], (id) => counts[id], 8);
    expect(bins).toEqual([
      { pax: 8, stops: [{ id: "a", count: 8 }] },
      { pax: 7, stops: [{ id: "a", count: 2 }, { id: "b", count: 3 }, { id: "c", count: 2 }] },
    ]);
    expect(ids(splitStationsByCapacity(["a"], () => 16, 8))).toEqual([["a"], ["a"]]);
  });
  test("stops without a count stay on a bus, together, carrying the unplaced people", () => {
    const counts = { a: 5, b: 4 };
    const bins = splitStationsByCapacity(["a", "x", "b", "y"], (id) => counts[id], 8, 3);
    const withX = bins.find((b) => b.stops.some((s) => s.id === "x"));
    expect(withX.stops.filter((s) => s.count === null).map((s) => s.id)).toEqual(["x", "y"]);
    expect(withX.pax).toBe(withX.stops.reduce((a, s) => a + (s.count || 0), 0) + 3);
    expect(bins.reduce((a, b) => a + b.pax, 0)).toBe(12);
    // Nobody unplaced: they still get visited, on the emptiest bus.
    const none = splitStationsByCapacity(["a", "x", "b"], (id) => ({ a: 7, b: 4 })[id], 8);
    expect(none.find((b) => b.stops.some((s) => s.id === "x")).pax).toBe(4);
  });
  test("property: every passenger placed, no bin over capacity", () => {
    const rng = mulberry32(7);
    for (let trial = 0; trial < 200; trial++) {
      const n = 1 + Math.floor(rng() * 6);
      const cap = 4 + Math.floor(rng() * 5);
      const ids = Array.from({ length: n }, (_, i) => `s${i}`);
      const counts = {};
      for (const id of ids) counts[id] = Math.floor(rng() * (2 * cap + 2)); // may exceed cap
      const unknownPax = Math.floor(rng() * (cap + 1));
      const bins = splitStationsByCapacity(ids, (id) => counts[id], cap, unknownPax);
      const withCount = ids.filter((id) => counts[id] > 0);
      if (withCount.length === 0) {
        expect(bins).toBeNull();
        continue;
      }
      // each stop's buses add up to its headcount; an uncounted stop is on exactly one bus
      for (const id of ids) {
        const on = bins.flatMap((b) => b.stops.filter((s) => s.id === id));
        if (counts[id] > 0) expect(on.reduce((a, s) => a + s.count, 0)).toBe(counts[id]);
        else expect(on.map((s) => s.count)).toEqual([null]);
      }
      const unplaced = ids.some((id) => !(counts[id] > 0)) ? unknownPax : 0;
      expect(bins.reduce((a, b) => a + b.pax, 0)).toBe(withCount.reduce((a, id) => a + counts[id], 0) + unplaced);
      for (const b of bins) {
        expect(b.pax).toBeLessThanOrEqual(cap);
        expect(new Set(b.stops.map((s) => s.id)).size).toBe(b.stops.length);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
describe("rideWindow / findConflicts overlap edges", () => {
  const durations = { "s1|v": 10, "v|s1": 10, "s2|v": 10, "v|s2": 10 };
  const T = { id: "T", teamId: "tm", venueId: "v", type: "weekly", days: [2], date: null, start: "16:00", end: "17:30" };
  const baseState = (rides) => ({
    trainings: [T], rides,
    stations: [{ id: "s1" }, { id: "s2" }], venues: [{ id: "v" }],
    matrix: { durations }, settings: { departAfterMin: 10 },
  });
  const A = { id: "A", trainingId: "T", day: 2, date: null, vehicleId: "veh1", driverId: "d1", dir: "oda", stops: [{ id: "as", stationId: "s1", time: "15:30" }] };

  test("rideWindow (oda) = [first stop, last stop + leg to venue]", () => {
    expect(rideWindow(baseState([A]), A, T)).toEqual([930, 940]); // 15:30 .. 15:30+10
  });

  test("windows that merely touch do NOT conflict (strict inequality)", () => {
    const B = { id: "B", trainingId: "T", day: 2, date: null, vehicleId: "veh1", driverId: "d2", dir: "oda", stops: [{ id: "bs", stationId: "s2", time: "15:40" }] };
    const st = baseState([A, B]); // B window [940, 950], A window [930, 940]
    expect(findConflicts(st, A)).toHaveLength(0);
  });

  test("one-minute overlap on the same vehicle IS a conflict", () => {
    const B = { id: "B", trainingId: "T", day: 2, date: null, vehicleId: "veh1", driverId: "d2", dir: "oda", stops: [{ id: "bs", stationId: "s2", time: "15:39" }] };
    const st = baseState([A, B]); // B window [939, 949] overlaps A [930, 940]
    const c = findConflicts(st, A);
    expect(c.some((x) => x.type === "vehicle")).toBe(true);
    expect(c.some((x) => x.type === "driver")).toBe(false); // different drivers
  });
});
