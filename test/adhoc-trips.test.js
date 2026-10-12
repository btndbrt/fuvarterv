import { describe, test, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../src/data/storage.js";
import { ensureShape, seedState } from "../src/data/seed.js";
import { mondayOf } from "../src/domain/datetime.js";
import { tripBuses, matchesOn, deleteGuard } from "../src/domain/logic.js";
import { resolveDay, optimizeDay, optimizeWeek, applyWeek, dayStats, genDayTasks } from "../src/domain/optimizer.js";

/*
 * Ad hoc trips (ADR-35): on one date, a coach or a parent drives a WEEKLY training's
 * team, with buses picked for that date. It is the match mechanism (ADR-33) applied to
 * one occurrence of a weekly training: the legs go on those buses from the team's
 * stops, the buses are booked for the window, their own drivers may take another bus
 * that day, the free-text driver earns nothing, and the date gets its own plan, so
 * every other week is untouched.
 *
 *   adhocTrips: { "YYYY-MM-DD": { [trainingId]: { buses: [{ vehicleId, driverName }] } } }
 */

const WEEK_MON = mondayOf("2026-08-03");          // Monday 3 August
const NEXT_MON = mondayOf("2026-08-10");
const SAT = 5;
const DATE = "2026-08-08";                        // that week's Saturday

const bus = (id, seats = 8) => ({ id, name: id, plate: `${id}-100`, seats, hasVignette: false, baseId: null });
const driver = (id, pref) => ({ id, name: id, wage: 3000, minShiftMin: 60, availability: [], preferredVehicleId: pref, baseId: null, baseRules: [] });
const team = (id, pax, stop = "s0") => ({
  id, name: id, color: "#000", stationIds: [stop], venueIds: ["v0"], passengerCount: null,
  stationCounts: { [stop]: pax }, routeMode: "auto", routeAnchorId: null, returnStationIds: null,
  returnStationCounts: {}, returnRouteAnchorId: null,
});
const weekly = (id, teamId, start, end) => ({ id, teamId, venueId: "v0", type: "weekly", days: [SAT], date: null, start, end, stops: null, match: null });
const COACH = { buses: [{ vehicleId: "A", driverName: "Kiss edző" }] };

function makeState({ adhoc = { [DATE]: { trU12: COACH } }, pax = 6, vehicles = [bus("A"), bus("B")], other = true, rides = [], assignments = {} } = {}) {
  return {
    stations: [{ id: "s0", name: "Megálló", lat: 46.30, lon: 19.90 }, { id: "s1", name: "Másik", lat: 46.31, lon: 19.91 }],
    venues: [{ id: "v0", name: "Csarnok", lat: 46.35, lon: 19.95, needsVignette: false }],
    bases: [], vehicles, drivers: [driver("d1", "A")],
    teams: [team("U12", pax, "s1"), team("U14", 6)],
    trainings: [weekly("trU12", "U12", "10:00", "11:30"), ...(other ? [weekly("trU14", "U14", "10:30", "11:30")] : [])],
    rides, assignments, dateAssignments: {}, adhocTrips: adhoc, matrix: null,
    settings: { ...DEFAULT_SETTINGS, fixedVehicle: true, fairnessBias: 0, preferredBias: 1000 },
  };
}
const adhocChains = (r) => r.chains.filter((c) => c.adhoc);

describe("data model", () => {
  test("adhocTrips defaults to empty, so every weekly training runs as before", () => {
    expect(ensureShape({}).adhocTrips).toEqual({});
    expect(seedState().adhocTrips).toEqual({});
  });

  test("tripBuses: a weekly training's buses on that date only; a match's own buses", () => {
    const s = makeState();
    const tr = s.trainings[0];
    expect(tripBuses(s, tr, DATE)).toEqual(COACH.buses);
    expect(tripBuses(s, tr, "2026-08-15")).toEqual([]);
    const match = { ...tr, id: "m", type: "once", days: [], date: DATE, match: COACH };
    expect(tripBuses(s, match, DATE)).toEqual(COACH.buses);
  });

  test("the date counts as a trip date, so it gets its own plan", () => {
    expect(matchesOn(makeState(), DATE).map((t) => t.id)).toEqual(["trU12"]);
    expect(matchesOn(makeState(), "2026-08-15")).toEqual([]);
  });

  test("an entry for a date the training does not happen on is ignored", () => {
    const s = makeState({ adhoc: { "2026-08-07": { trU12: COACH } } });   // a Friday
    expect(matchesOn(s, "2026-08-07")).toEqual([]);
  });

  test("a bus used by an ad hoc trip cannot be deleted", () => {
    expect(deleteGuard(makeState(), "vehicles", "A")).toContain("Használatban");
  });
});

describe("on that date", () => {
  test("the team goes on the picked bus with the free-text driver, out and back, locked", () => {
    const r = resolveDay(makeState(), SAT, WEEK_MON);
    const [c] = adhocChains(r);
    expect(c).toMatchObject({ vehicleId: "A", driverId: null, driverName: "Kiss edző", locked: true, match: true });
    expect(c.tasks.map((t) => t.dir).sort()).toEqual(["oda", "vissza"]);
    expect(r.unassigned.some((t) => t.trainingId === "trU12")).toBe(false);
  });

  test("a bigger team is split by stops across the picked buses", () => {
    const s = makeState({ pax: 12, adhoc: { [DATE]: { trU12: { buses: [{ vehicleId: "A", driverName: "Kiss edző" }, { vehicleId: "B", driverName: "Szülő" }] } } } });
    expect(genDayTasks(s, SAT, WEEK_MON).tasks.filter((t) => t.trainingId === "trU12").length).toBe(4);
    expect(adhocChains(resolveDay(s, SAT, WEEK_MON)).map((c) => [c.vehicleId, c.driverName])).toEqual([["A", "Kiss edző"], ["B", "Szülő"]]);
  });

  test("the bus is booked, and its own driver takes another bus that day", () => {
    const out = optimizeDay(makeState(), SAT, WEEK_MON);
    expect(out.chains.filter((c) => !c.match)).toEqual([expect.objectContaining({ driverId: "d1", vehicleId: "B" })]);
  });

  test("an uncovered task says a coach or parent has the bus", () => {
    const out = optimizeDay(makeState({ vehicles: [bus("A")] }), SAT, WEEK_MON);
    const reasons = out.uncovered.flatMap((u) => u.reasons).join(" ");
    expect(reasons).toContain("A-100");
    expect(reasons).toMatch(/edző|szülő/);
  });

  test("the free-text driver earns nothing", () => {
    const s = makeState();
    expect(dayStats(s, adhocChains(resolveDay(s, SAT, WEEK_MON)))).toMatchObject({ paidMin: 0, cost: 0 });
  });
});

describe("every other week is untouched", () => {
  test("the next Saturday has no ad hoc chain, and the training needs a driver as usual", () => {
    const r = resolveDay(makeState(), SAT, NEXT_MON);
    expect(adhocChains(r)).toEqual([]);
    expect(r.unassigned.some((t) => t.trainingId === "trU12")).toBe(true);
  });

  test("applying the week writes the date's own plan and dated rides; the template and its rides stay", () => {
    const TEMPLATE = [{ id: "c1", driverId: "d1", vehicleId: "A", taskIds: [{ id: "trU12:5:oda", locked: false }] }];
    const tRide = { id: "r0", trainingId: "trU12", day: SAT, date: null, dir: "oda", vehicleId: "A", driverId: "d1", source: "schedule", stops: [] };
    const s = makeState({ assignments: { [SAT]: { chains: TEMPLATE } }, rides: [tRide] });
    const next = applyWeek(s, WEEK_MON, optimizeWeek(s, WEEK_MON).days);
    expect(next.assignments[SAT].chains).toEqual(TEMPLATE);
    expect(next.dateAssignments[DATE]).toBeTruthy();
    expect(next.rides.find((r) => r.id === "r0")).toBeTruthy();
    const coach = next.rides.filter((r) => r.trainingId === "trU12" && r.date === DATE);
    expect(coach.length).toBe(2);
    expect(coach.every((r) => r.day === null && r.vehicleId === "A" && r.driverId === "" && r.driverName === "Kiss edző")).toBe(true);
  });

  test("removing the entry makes the date ordinary again", () => {
    const s = makeState({ adhoc: { [DATE]: { trU12: { buses: [] } } } });
    expect(adhocChains(resolveDay(s, SAT, WEEK_MON))).toEqual([]);
    expect(matchesOn(s, DATE)).toEqual([]);
  });
});
