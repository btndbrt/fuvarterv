import { describe, test, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../src/data/storage.js";
import { ensureShape, seedState } from "../src/data/seed.js";
import { mondayOf } from "../src/domain/datetime.js";
import {
  isMatch, matchesOn, storedChains, withStoredChains, rideOnDate, driverDayRides, findConflicts,
  findRides, deleteGuard, chainRefs,
} from "../src/domain/logic.js";
import {
  genDayTasks, resolveDay, optimizeDay, optimizeWeek, dayStats, withGeneratedRides, applyWeek,
} from "../src/domain/optimizer.js";

/*
 * Matches (ADR-33): a one-off training marked as a match, with one or more buses, each
 * with a free-text driver (a coach or a parent — no user record). The buses pick the
 * team up from its stops like a training, the team split across them by stops when it
 * does not fit one, and each bus is blocked for the match window. The plan of a match
 * DATE is stored per date (dateAssignments), so the weekly template every other week
 * uses stays as it was.
 */

const WEEK_MON = mondayOf("2026-08-03");          // Monday 3 August
const NEXT_MON = mondayOf("2026-08-10");
const SAT = 5;
const MATCH_DATE = "2026-08-08";                  // that week's Saturday

const bus = (id, seats = 8) => ({ id, name: id, plate: `${id}-100`, seats, hasVignette: false, baseId: null });
const driver = (id, pref, extra = {}) => ({
  id, name: id, wage: 3000, minShiftMin: 60, availability: [], preferredVehicleId: pref, baseId: null, baseRules: [], ...extra,
});
const team = (id, pax, stop = "s0") => ({
  id, name: id, color: "#000", stationIds: [stop], venueIds: ["v0", "vM"], passengerCount: null,
  stationCounts: { [stop]: pax }, routeMode: "auto", routeAnchorId: null, returnStationIds: null,
  returnStationCounts: {}, returnRouteAnchorId: null,
});
const MATCH = { id: "trM", teamId: "tmM", venueId: "vM", type: "once", days: [], date: MATCH_DATE,
  start: "10:00", end: "12:00", stops: null, match: { buses: [{ vehicleId: "A", driverName: "Kiss edző" }] } };
const withBuses = (...buses) => ({ ...MATCH, match: { buses } });
const WEEKLY = { id: "trW", teamId: "tm", venueId: "v0", type: "weekly", days: [SAT], date: null,
  start: "10:30", end: "11:30", stops: null, match: null };

function makeState({ match = MATCH, matchPax = 6, vehicles = [bus("A"), bus("B")], drivers = [driver("d1", "A")],
  trainings = [WEEKLY], assignments = {}, dateAssignments = {}, rides = [], fixed = true } = {}) {
  return {
    stations: [{ id: "s0", name: "Megálló", lat: 46.30, lon: 19.90 }, { id: "s1", name: "Másik megálló", lat: 46.31, lon: 19.91 }],
    venues: [{ id: "v0", name: "Csarnok", lat: 46.35, lon: 19.95, needsVignette: false },
      { id: "vM", name: "Vendégpálya", lat: 46.40, lon: 20.10, needsVignette: false }],
    bases: [], vehicles, drivers,
    teams: [team("tm", 6), team("tmM", matchPax, "s1")],
    trainings: match ? [...trainings, match] : trainings,
    rides, assignments, dateAssignments, matrix: null,
    settings: { ...DEFAULT_SETTINGS, fixedVehicle: fixed, fairnessBias: 0, preferredBias: 1000 },
  };
}

const matchChain = (r) => r.chains.find((c) => c.match);

describe("data model", () => {
  test("a training is no match until marked, and a saved match survives a reload", () => {
    const s = ensureShape({ trainings: [{ id: "a", type: "weekly", days: [1] }, { ...MATCH }] });
    expect(s.trainings[0].match).toBe(null);
    expect(s.trainings[1].match).toEqual(MATCH.match);
  });

  test("dateAssignments defaults to empty, so old data plans every date from the template", () => {
    expect(ensureShape({}).dateAssignments).toEqual({});
    expect(seedState().dateAssignments).toEqual({});
  });

  test("only a one-off training with at least one bus is a match", () => {
    expect(isMatch(MATCH)).toBe(true);
    expect(isMatch({ ...MATCH, match: null })).toBe(false);
    expect(isMatch({ ...MATCH, match: { buses: [] } })).toBe(false);
    expect(isMatch({ ...MATCH, match: { buses: [{ vehicleId: "", driverName: "x" }] } })).toBe(false);
    expect(isMatch({ ...WEEKLY, match: MATCH.match })).toBe(false);
  });

  test("a match saved with a single bus (the first draft's shape) loads as a one-bus list", () => {
    const s = ensureShape({ trainings: [{ ...MATCH, match: { vehicleId: "A", driverName: "Kiss edző" } }] });
    expect(s.trainings[0].match).toEqual({ buses: [{ vehicleId: "A", driverName: "Kiss edző" }] });
  });

  test("matchesOn lists the matches of one date", () => {
    expect(matchesOn(makeState(), MATCH_DATE).map((t) => t.id)).toEqual(["trM"]);
    expect(matchesOn(makeState(), "2026-08-15")).toEqual([]);
  });
});

describe("the match chain", () => {
  test("a team that fits one match bus goes whole", () => {
    const legs = genDayTasks(makeState(), SAT, WEEK_MON).tasks.filter((t) => t.trainingId === "trM");
    expect(legs.map((t) => t.dir).sort()).toEqual(["oda", "vissza"]);
    expect(legs.every((t) => t.match && t.pax === 6)).toBe(true);
  });

  test("a bigger team is split by stops to the match buses' seats", () => {
    const s = makeState({ matchPax: 12, match: withBuses({ vehicleId: "A", driverName: "Kiss edző" }, { vehicleId: "B", driverName: "Szülő" }) });
    const legs = genDayTasks(s, SAT, WEEK_MON).tasks.filter((t) => t.trainingId === "trM");
    expect(legs.length).toBe(4);
    expect(legs.every((t) => t.match && t.pax <= 8)).toBe(true);
  });

  test("resolveDay derives it: the match bus, no driver, the free-text name, locked", () => {
    const r = resolveDay(makeState(), SAT, WEEK_MON);
    const m = matchChain(r);
    expect(m).toMatchObject({ vehicleId: "A", driverId: null, driverName: "Kiss edző", locked: true });
    expect(m.tasks.map((t) => t.trainingId)).toEqual(["trM", "trM"]);
    expect(r.unassigned.some((t) => t.trainingId === "trM")).toBe(false);
  });

  test("each match bus gets one group, out and back, with its own driver", () => {
    const s = makeState({ matchPax: 12, match: withBuses({ vehicleId: "A", driverName: "Kiss edző" }, { vehicleId: "B", driverName: "Szülő" }) });
    const ms = resolveDay(s, SAT, WEEK_MON).chains.filter((c) => c.match);
    expect(ms.map((c) => [c.vehicleId, c.driverName])).toEqual([["A", "Kiss edző"], ["B", "Szülő"]]);
    expect(ms.every((c) => c.tasks.map((t) => t.dir).sort().join() === "oda,vissza")).toBe(true);
    expect(ms.reduce((a, c) => a + Math.max(...c.tasks.filter((t) => t.dir === "oda").map((t) => t.pax)), 0)).toBe(12);
    expect(ms.flatMap((c) => c.issues)).toEqual([]);
  });

  test("too few buses: the group left without one is flagged, saying how many are needed", () => {
    const ms = resolveDay(makeState({ matchPax: 12 }), SAT, WEEK_MON).chains.filter((c) => c.match);
    expect(ms.length).toBe(2);
    const orphan = ms.find((c) => !c.vehicleId);
    expect(orphan.issues.join(" ")).toContain("2 busz kell");
  });

  test("a bus the team does not need is flagged, and is not booked", () => {
    const s = makeState({ match: withBuses({ vehicleId: "A", driverName: "Kiss edző" }, { vehicleId: "B", driverName: "Szülő" }) });
    const ms = resolveDay(s, SAT, WEEK_MON).chains.filter((c) => c.match);
    expect(ms.map((c) => c.vehicleId)).toEqual(["A"]);
    expect(ms[0].issues.join(" ")).toContain("B-100");
  });

  test("it earns nothing: no paid time, no cost", () => {
    const st = dayStats(makeState(), [matchChain(resolveDay(makeState(), SAT, WEEK_MON))]);
    expect(st.paidMin).toBe(0);
    expect(st.cost).toBe(0);
  });

  test("other weeks have no match chain", () => {
    expect(matchChain(resolveDay(makeState(), SAT, NEXT_MON))).toBeUndefined();
  });
});

describe("the optimizer on a match date", () => {
  test("the match bus is not given to anyone during the match", () => {
    const out = optimizeDay(makeState(), SAT, WEEK_MON);
    const others = out.chains.filter((c) => !c.match);
    expect(others.length).toBe(1);
    expect(others[0].vehicleId).toBe("B");
  });

  test("the driver whose fixed bus it is may take another bus that day", () => {
    const out = optimizeDay(makeState(), SAT, WEEK_MON);
    expect(out.chains.find((c) => !c.match)).toMatchObject({ driverId: "d1", vehicleId: "B" });
    expect(out.uncovered).toEqual([]);
  });

  test("with no match the fixed pairing holds as before", () => {
    const out = optimizeDay(makeState({ match: null }), SAT, WEEK_MON);
    expect(out.chains[0]).toMatchObject({ driverId: "d1", vehicleId: "A" });
  });

  test("after the match the bus is free again, and its driver gets it back", () => {
    const late = { ...WEEKLY, id: "trL", start: "17:00", end: "18:00" };
    const out = optimizeDay(makeState({ trainings: [late] }), SAT, WEEK_MON);
    expect(out.chains.find((c) => !c.match)).toMatchObject({ driverId: "d1", vehicleId: "A" });
  });

  test("every match bus is booked: with two buses at the match, the weekly task gets the third", () => {
    const s = makeState({ matchPax: 12, vehicles: [bus("A"), bus("B"), bus("C")],
      match: withBuses({ vehicleId: "A", driverName: "Kiss edző" }, { vehicleId: "B", driverName: "Szülő" }) });
    const out = optimizeDay(s, SAT, WEEK_MON);
    expect(out.chains.filter((c) => !c.match).map((c) => c.vehicleId)).toEqual(["C"]);
  });

  test("an uncovered task says the match has the bus", () => {
    const out = optimizeDay(makeState({ vehicles: [bus("A")] }), SAT, WEEK_MON);
    const reasons = out.uncovered.flatMap((u) => u.reasons).join(" ");
    expect(reasons).toContain("Mérkőzés");
    expect(reasons).toContain("A-100");
  });

  test("the match chain is part of the result, marked, and never assigned a driver", () => {
    const m = optimizeDay(makeState(), SAT, WEEK_MON).chains.find((c) => c.match);
    expect(m).toMatchObject({ driverId: null, vehicleId: "A", driverName: "Kiss edző" });
  });

  test("the week's fairness shares leave the match out", () => {
    const s = makeState();
    s.settings.fairnessBias = 5000;
    const out = optimizeWeek(s, WEEK_MON);
    const shares = [...out.fairness.shares.values()].reduce((a, b) => a + b, 0);
    expect(Math.round(shares)).toBe(out.totals.paidMin);
  });
});

describe("where a day's plan is stored", () => {
  const TEMPLATE = [{ id: "c1", driverId: "d1", vehicleId: "A", taskIds: [{ id: "trW:5:oda", locked: false }] }];

  test("a match date reads the weekly template until it has a plan of its own", () => {
    const s = makeState({ assignments: { [SAT]: { chains: TEMPLATE } } });
    expect(storedChains(s, SAT, WEEK_MON)).toEqual(TEMPLATE);
    const dated = [{ ...TEMPLATE[0], vehicleId: "B" }];
    const s2 = { ...s, dateAssignments: { [MATCH_DATE]: { chains: dated } } };
    expect(storedChains(s2, SAT, WEEK_MON)).toEqual(dated);
    expect(storedChains(s2, SAT, NEXT_MON)).toEqual(TEMPLATE);
  });

  test("writing a match date leaves the template alone", () => {
    const s = makeState({ assignments: { [SAT]: { chains: TEMPLATE } } });
    const dated = [{ ...TEMPLATE[0], vehicleId: "B" }];
    const s2 = withStoredChains(s, SAT, WEEK_MON, dated);
    expect(s2.assignments[SAT].chains).toEqual(TEMPLATE);
    expect(s2.dateAssignments[MATCH_DATE].chains).toEqual(dated);
  });

  test("writing an ordinary date writes the template, as before", () => {
    const s = makeState({ match: null });
    const s2 = withStoredChains(s, SAT, WEEK_MON, TEMPLATE);
    expect(s2.assignments[SAT].chains).toEqual(TEMPLATE);
    expect(s2.dateAssignments).toEqual({});
  });

  test("a dated plan for a date that no longer has a match is ignored", () => {
    const s = makeState({ match: null, assignments: { [SAT]: { chains: TEMPLATE } },
      dateAssignments: { [MATCH_DATE]: { chains: [] } } });
    expect(storedChains(s, SAT, WEEK_MON)).toEqual(TEMPLATE);
  });

  test("the match chain is never stored", () => {
    const s = makeState();
    const s2 = withStoredChains(s, SAT, WEEK_MON, [...TEMPLATE, { id: "match:trM", match: true, vehicleId: "A", taskIds: [] }]);
    expect(s2.dateAssignments[MATCH_DATE].chains).toEqual(TEMPLATE);
  });

  test("chainRefs counts dated plans too, so a driver in one cannot be deleted", () => {
    const s = makeState({ dateAssignments: { [MATCH_DATE]: { chains: [{ id: "x", driverId: "d1", vehicleId: "B", taskIds: [] }] } } });
    expect(chainRefs(s, "driverId", "d1")).toBe(1);
  });

  test("a bus used by a match cannot be deleted", () => {
    expect(deleteGuard(makeState(), "vehicles", "A")).toContain("Használatban");
  });
});

describe("applying a week with a match", () => {
  test("the match date goes to dateAssignments, the template stays, the match chain is not stored", () => {
    const TEMPLATE = [{ id: "c1", driverId: "d1", vehicleId: "A", taskIds: [{ id: "trW:5:oda", locked: false }] }];
    const s = makeState({ assignments: { [SAT]: { chains: TEMPLATE } } });
    const out = optimizeWeek(s, WEEK_MON);
    const next = applyWeek(s, WEEK_MON, out.days);
    expect(next.assignments[SAT].chains).toEqual(TEMPLATE);
    const dated = next.dateAssignments[MATCH_DATE].chains;
    expect(dated.every((c) => !c.match && !String(c.id).startsWith("match:"))).toBe(true);
    expect(dated.find((c) => c.taskIds.some((x) => x.id.startsWith("trW")))).toMatchObject({ driverId: "d1", vehicleId: "B" });
  });

  test("the rides of the match date are dated; the template's stay for the other weeks", () => {
    const templateRide = { id: "r0", trainingId: "trW", day: SAT, date: null, dir: "oda", vehicleId: "A", driverId: "d1", source: "schedule", stops: [] };
    const s = makeState({ rides: [templateRide] });
    const next = applyWeek(s, WEEK_MON, optimizeWeek(s, WEEK_MON).days);
    expect(next.rides.find((r) => r.id === "r0")).toBeTruthy();
    const dated = next.rides.filter((r) => r.trainingId === "trW" && r.date === MATCH_DATE);
    expect(dated.length).toBe(2);
    expect(dated.every((r) => r.day === null && r.vehicleId === "B")).toBe(true);
  });

  test("the match's own rides carry the bus and the free-text driver", () => {
    const s = makeState();
    const next = applyWeek(s, WEEK_MON, optimizeWeek(s, WEEK_MON).days);
    const m = next.rides.filter((r) => r.trainingId === "trM");
    expect(m.length).toBe(2);
    expect(m.every((r) => r.vehicleId === "A" && r.driverId === "" && r.driverName === "Kiss edző")).toBe(true);
  });
});

describe("rides on a match date", () => {
  const template = { id: "r0", trainingId: "trW", day: SAT, date: null, dir: "oda", vehicleId: "A", driverId: "d1", source: "schedule", stops: [{ id: "x", stationId: "s0", time: "10:00", count: 6 }] };
  const dated = { ...template, id: "r1", day: null, date: MATCH_DATE, vehicleId: "B" };
  const withPlan = (extra = {}) => makeState({ rides: [template, dated], dateAssignments: { [MATCH_DATE]: { chains: [] } }, ...extra });

  test("once the date has its own plan, the template ride steps aside on that date only", () => {
    const s = withPlan();
    expect(rideOnDate(s, template, WEEKLY, MATCH_DATE)).toBe(false);
    expect(rideOnDate(s, dated, WEEKLY, MATCH_DATE)).toBe(true);
    expect(rideOnDate(s, template, WEEKLY, "2026-08-15")).toBe(true);
    expect(rideOnDate(s, dated, WEEKLY, "2026-08-15")).toBe(false);
  });

  test("before it has one, the template ride still shows", () => {
    const s = makeState({ rides: [template] });
    expect(rideOnDate(s, template, WEEKLY, MATCH_DATE)).toBe(true);
  });

  test("the driver's day and the week card read the dated ride", () => {
    const s = withPlan();
    expect(driverDayRides(s, "d1", MATCH_DATE).map((x) => x.ride.id)).toEqual(["r1"]);
    expect(driverDayRides(s, "d1", "2026-08-15").map((x) => x.ride.id)).toEqual(["r0"]);
    expect(findRides(s, WEEKLY, SAT, MATCH_DATE).map((r) => r.id)).toEqual(["r1"]);
    expect(findRides(s, WEEKLY, SAT, "2026-08-15").map((r) => r.id)).toEqual(["r0"]);
  });

  test("the template ride and the dated one never clash: they are never on the same date", () => {
    const s = withPlan();
    const both = { ...dated, vehicleId: "A" };
    expect(findConflicts({ ...s, rides: [template, both] }, both)).toEqual([]);
  });

  test("rebuilding the match date replaces its dated rides and keeps the template's", () => {
    const s = withPlan();
    const chains = resolveDay(s, SAT, WEEK_MON).chains;
    const rides = withGeneratedRides(s, SAT, WEEK_MON, chains);
    expect(rides.some((r) => r.id === "r0")).toBe(true);
    expect(rides.some((r) => r.id === "r1")).toBe(false);
  });
});
