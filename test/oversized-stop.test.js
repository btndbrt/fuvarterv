import { describe, test, expect } from "vitest";
import { mondayOf } from "../src/domain/datetime.js";
import { genDayTasks, optimizeDay } from "../src/domain/optimizer.js";

/*
 * A stop with more people than the biggest vehicle.
 *
 * The split used to put a stop's whole headcount on ONE bus, so such a stop made
 * the whole leg unsplittable: one task nobody could carry, and the stops that would
 * have fit went uncovered with it. Now the stop itself is shared between buses.
 *
 * On the same path, a stop with an empty count ("not entered yet") was dropped from
 * every bus of a split leg, so nobody picked those children up.
 */

const WEEKDAY = 2;
const WEEK_MON = mondayOf(new Date(2025, 0, 6));

const settings = { arriveEarlyMin: 10, departAfterMin: 10, calloutFee: 1500,
  dwellMin: 2, estSpeedKmh: 50, fallbackLegMin: 12, preferredBias: 0 };

function makeState(stationCounts, { passengerCount = null, vehicles = 2 } = {}) {
  return {
    stations: [
      { id: "sA", name: "A", lat: 46.10, lon: 19.80 },
      { id: "sB", name: "B", lat: 46.20, lon: 19.85 },
      { id: "sC", name: "C", lat: 46.30, lon: 19.90 },
    ],
    venues: [{ id: "v0", name: "V", lat: 46.25, lon: 19.88 }],
    vehicles: Array.from({ length: vehicles }, (_, i) => ({ id: `b${i}`, name: `b${i}`, plate: `B-${i}`, seats: 8 })),
    drivers: [{ id: "d1", name: "Anna", wage: 3000, minShiftMin: 120, availability: [], preferredVehicleId: null },
      { id: "d2", name: "Béla", wage: 3000, minShiftMin: 120, availability: [], preferredVehicleId: null }],
    rides: [], assignments: {}, matrix: null, settings,
    teams: [{ id: "tm", name: "TM", color: "#000", stationIds: ["sA", "sB", "sC"], venueIds: ["v0"],
      passengerCount, stationCounts, routeMode: "manual", routeAnchorId: null,
      returnStationIds: null, returnStationCounts: {}, returnRouteAnchorId: null }],
    trainings: [{ id: "tr", teamId: "tm", venueId: "v0", type: "weekly",
      days: [WEEKDAY], date: null, start: "16:00", end: "17:30", stops: null }],
  };
}
const run = (state) => genDayTasks(state, WEEKDAY, WEEK_MON);
const oda = (tasks) => tasks.filter((t) => t.dir === "oda");
const shareOf = (tasks, sid) => tasks.map((t) => t.plan.find((p) => p.stationId === sid)?.count).filter(Boolean);

describe("egy megálló több, mint a legnagyobb jármű", () => {
  test("a megálló létszáma több buszra oszlik, a többi megálló is buszt kap", () => {
    const { tasks } = run(makeState({ sA: 10, sB: 3, sC: 2 }));
    const o = oda(tasks);
    expect(o).toHaveLength(2);
    expect(o.every((t) => t.pax <= 8)).toBe(true);
    expect(o.reduce((a, t) => a + t.pax, 0)).toBe(15);
    expect(shareOf(o, "sA").sort((a, b) => b - a)).toEqual([8, 2]);
    expect(shareOf(o, "sB")).toEqual([3]);
  });

  test("a bontás a kiírt létszámban is látszik", () => {
    const { tasks } = run(makeState({ sA: 10, sB: 3, sC: 2 }));
    for (const t of oda(tasks))
      expect(t.breakdown.reduce((a, b) => a + b.count, 0)).toBe(t.pax);
  });

  test("a figyelmeztetés megnevezi a több buszra osztott megállót", () => {
    const { skipped } = run(makeState({ sA: 10, sB: 3, sC: 2 }));
    expect(skipped.some((m) => /2 buszra bontva/.test(m) && /A \(8 \+ 2 fő\)/.test(m))).toBe(true);
    expect(skipped.some((m) => /nem osztható/.test(m))).toBe(false);
  });

  test("elég járművel az optimalizáló minden feladatot lefed", () => {
    const out = optimizeDay(makeState({ sA: 10, sB: 3, sC: 2 }), WEEKDAY, WEEK_MON);
    expect(out.uncovered).toEqual([]);
  });
});

describe("üres létszámú megálló bontott útvonalon", () => {
  test("nem marad ki: felkerül egy buszra, a hiányzó létszámmal", () => {
    const { tasks, skipped } = run(makeState({ sA: 6, sB: 5, sC: "" }, { passengerCount: 14 }));
    const withC = oda(tasks).filter((t) => t.plan.some((p) => p.stationId === "sC"));
    expect(withC).toHaveLength(1);
    expect(oda(tasks).reduce((a, t) => a + t.pax, 0)).toBe(14);
    expect(oda(tasks).every((t) => t.pax <= 8)).toBe(true);
    expect(skipped.some((m) => /C megállónál nincs megadva létszám/.test(m) && /hiányzó 3 fővel/.test(m))).toBe(true);
  });

  test("ha a hiányzó létszám egy buszba sem fér, megmondjuk", () => {
    const { skipped } = run(makeState({ sA: 4, sB: 3, sC: "" }, { passengerCount: 17 }));
    expect(skipped.some((m) => /a rájuk eső 10 fő több, mint a legnagyobb jármű/.test(m))).toBe(true);
  });

  test("megálló nélküli maradék: szólunk, nem hallgatjuk el", () => {
    const { tasks, skipped } = run(makeState({ sA: 4, sB: 3, sC: 2 }, { passengerCount: 11 }));
    expect(oda(tasks)).toHaveLength(2);
    expect(skipped.some((m) => /maradék 2 fő/.test(m) && /nem jutott hely/.test(m))).toBe(true);
  });

  test("ha csak a megálló nélküli maradék miatt nem fér egy buszba, nem bontjuk", () => {
    const { tasks, skipped } = run(makeState({ sA: 2, sB: 2, sC: 1 }, { passengerCount: 12 }));
    expect(oda(tasks)).toHaveLength(1);
    expect(oda(tasks)[0].pax).toBe(12);
    expect(skipped.some((m) => /maradék 7 fő/.test(m) && /nincs elég nagy jármű/.test(m))).toBe(true);
  });
});
