import { describe, test, expect } from "vitest";
import { mondayOf } from "../src/domain/datetime.js";
import { DAYS } from "../src/domain/constants.js";
import {
  optimizeWeek, optimizeDay, fairShares, fairPenalty, imbalanceOf, paidByDriver,
} from "../src/domain/optimizer.js";

/*
 * Spreading the work evenly across the drivers.
 *
 * The optimizer's original instinct is to hire the cheapest legal driver every time,
 * which on a roster paid the same rate means whoever it happens to look at first
 * runs the entire week. These tests pin the corrected behaviour, and the two things
 * that make it usable rather than merely even: it must not over-assign a driver whose
 * availability makes an equal share impossible, and it must settle rather than
 * oscillate.
 */

const WEEK_MON = mondayOf("2026-08-03");
const TRAINING_DAYS = [0, 1, 2, 3];

/* Four drivers on identical wages and four identical trainings, one per day. Pure
   cost has no reason whatsoever to prefer one driver, which is what makes this a
   clean test of the fairness term rather than of the pricing. */
function makeState({ fairnessBias = 5000, driverDays = null } = {}) {
  return {
    teams: TRAINING_DAYS.map((d) => ({ id: `tm${d}`, name: `tm${d}`, stationIds: ["s0"], venueIds: ["v0"],
      passengerCount: null, stationCounts: { s0: 4 }, routeMode: "auto", routeAnchorId: null })),
    stations: [{ id: "s0", name: "s0", lat: 46.1, lon: 19.1 }],
    venues: [{ id: "v0", name: "v0", lat: 46.2, lon: 19.2 }],
    bases: [],
    vehicles: [0, 1, 2, 3].map((i) => ({ id: `V${i}`, name: `V${i}`, plate: `AB-${i}`, seats: 8 })),
    drivers: [0, 1, 2, 3].map((i) => ({
      id: `D${i}`, name: `D${i}`, wage: 3000, minShiftMin: 60, preferredVehicleId: null,
      availability: driverDays?.[i] ? driverDays[i].map((d) => ({ days: [d], start: "00:00", end: "23:59" })) : [],
    })),
    trainings: TRAINING_DAYS.map((d) => ({ id: `tr${d}`, teamId: `tm${d}`, venueId: "v0", type: "weekly",
      days: [d], date: null, start: "16:00", end: "17:30" })),
    rides: [], matrix: null, assignments: {},
    settings: { arriveEarlyMin: 10, departAfterMin: 10, calloutFee: 1500, dwellMin: 2,
      estSpeedKmh: 50, fallbackLegMin: 12, preferredBias: 0, defaultBaseId: null, fairnessBias },
  };
}

const minutesOf = (out) => [...out.fairness.after.values()];
const working = (out) => [...out.fairness.after.entries()].filter(([, m]) => m > 0);

describe("the penalty itself", () => {
  test("zero bias is off, and costs nothing anywhere", () => {
    expect(fairPenalty(0, 900, 300)).toBe(0);
  });

  test("a driver with no possible share is never penalised", () => {
    expect(fairPenalty(5000, 900, 0)).toBe(0);
  });

  test("it bites harder the further past a driver's share they are", () => {
    const atShare = fairPenalty(5000, 300, 300);
    const overOnce = fairPenalty(5000, 600, 300);
    const overTwice = fairPenalty(5000, 900, 300);
    // Quadratic, so each further step costs more than the one before it.
    expect(overOnce - atShare).toBeGreaterThan(0);
    expect(overTwice - overOnce).toBeGreaterThan(overOnce - atShare);
  });

  test("availability decides the share, so nobody is chased past what they can take", () => {
    const state = makeState({ driverDays: { 3: [0] } });   // D3 works Mondays only
    const entries = TRAINING_DAYS.map((d) => ({ weekday: d, start: 900, end: 1000 }));
    const shares = fairShares(state, entries, 1000);
    expect(shares.get("D3")).toBeLessThan(shares.get("D0"));
    expect(shares.get("D0")).toBe(shares.get("D1"));
  });
});

describe("a week with fairness off", () => {
  /* The control. Without it the test below proves nothing: it has to be shown that
     the optimizer really does dump the whole week on one person. */
  test("one driver takes the entire week", () => {
    const out = optimizeWeek(makeState({ fairnessBias: 0 }), WEEK_MON);
    expect(working(out)).toHaveLength(1);
    expect(out.fairness.imbalanceAfter).toBeGreaterThan(2);
  });

  test("it is left exactly as it was, with no refinement passes at all", () => {
    const out = optimizeWeek(makeState({ fairnessBias: 0 }), WEEK_MON);
    expect(out.passes).toBe(0);
    expect(out.converged).toBe(true);
  });
});

describe("a week with fairness on", () => {
  const out = () => optimizeWeek(makeState(), WEEK_MON);

  test("every driver gets work, and all of them get the same", () => {
    const mins = minutesOf(out());
    expect(mins).toHaveLength(4);
    expect(new Set(mins).size).toBe(1);       // identical, not merely close
  });

  test("the imbalance is gone", () => {
    expect(out().fairness.imbalanceAfter).toBeCloseTo(0, 5);
  });

  test("it settles instead of oscillating", () => {
    const r = out();
    expect(r.converged).toBe(true);
    expect(r.passes).toBeLessThanOrEqual(6);
  });

  /* Fairness is a trade, and the trade has to stay small enough to be worth it. */
  test("the week costs a little more, not a lot", () => {
    const plain = optimizeWeek(makeState({ fairnessBias: 0 }), WEEK_MON);
    const fair = out();
    expect(fair.totals.cost).toBeGreaterThanOrEqual(plain.totals.cost);
    expect(fair.totals.cost).toBeLessThan(plain.totals.cost * 1.25);
  });

  /* Spreading work must never be an excuse for dropping any. */
  test("nothing becomes uncovered in the process", () => {
    expect(out().uncovered).toHaveLength(0);
  });

  test("the result is reproducible, since nothing here is random", () => {
    expect(minutesOf(out())).toEqual(minutesOf(out()));
  });
});

describe("drivers who cannot take an equal share", () => {
  /* D3 can only work Mondays. Aiming at flat equality would keep pushing work at
     them to close a gap their own diary makes impossible. */
  test("a barely-available driver is not over-assigned", () => {
    const out = optimizeWeek(makeState({ driverDays: { 3: [0] } }), WEEK_MON);
    const d3 = out.fairness.after.get("D3") || 0;
    const others = ["D0", "D1", "D2"].map((id) => out.fairness.after.get(id) || 0);
    expect(d3).toBeLessThanOrEqual(Math.max(...others));
  });

  test("the others still share what is left", () => {
    const out = optimizeWeek(makeState({ driverDays: { 3: [0] } }), WEEK_MON);
    const others = ["D0", "D1", "D2"].map((id) => out.fairness.after.get(id) || 0);
    expect(Math.min(...others)).toBeGreaterThan(0);
  });
});

describe("the week as a whole", () => {
  test("all seven days come back, including the empty ones", () => {
    const out = optimizeWeek(makeState(), WEEK_MON);
    expect(out.days).toHaveLength(DAYS.length);
    expect(out.days.filter((d) => d.empty)).toHaveLength(DAYS.length - TRAINING_DAYS.length);
  });

  test("the totals add up from the days", () => {
    const out = optimizeWeek(makeState(), WEEK_MON);
    const cost = out.days.reduce((a, d) => a + (d.stats?.cost || 0), 0);
    expect(out.totals.cost).toBe(cost);
  });

  test("paid minutes agree with what the days actually hold", () => {
    const out = optimizeWeek(makeState(), WEEK_MON);
    const summed = new Map();
    for (const d of out.days)
      for (const [id, m] of paidByDriver(makeState(), d.chains)) summed.set(id, (summed.get(id) || 0) + m);
    expect([...out.fairness.after.entries()].sort()).toEqual([...summed.entries()].sort());
  });

  test("with fairness off a week day matches optimizing that day alone", () => {
    const s = makeState({ fairnessBias: 0 });
    const week = optimizeWeek(s, WEEK_MON);
    const alone = optimizeDay(s, TRAINING_DAYS[0], WEEK_MON);
    expect(week.days[TRAINING_DAYS[0]].stats).toEqual(alone.stats);
  });
});

describe("the imbalance measure", () => {
  test("zero when everyone sits exactly on their share", () => {
    expect(imbalanceOf(new Map([["a", 100], ["b", 200]]), new Map([["a", 100], ["b", 200]]))).toBe(0);
  });

  test("it reports the worst-off driver, not the average", () => {
    const m = new Map([["a", 100], ["b", 0]]);
    const sh = new Map([["a", 50], ["b", 50]]);
    expect(imbalanceOf(m, sh)).toBe(1);   // b is a full share short
  });

  test("drivers who could never work are left out of it", () => {
    expect(imbalanceOf(new Map([["a", 100]]), new Map([["a", 100], ["z", 0]]))).toBe(0);
  });
});
