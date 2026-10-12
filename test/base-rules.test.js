import { describe, test, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../src/data/storage.js";
import { ensureShape, seedState } from "../src/data/seed.js";
import { mondayOf, timeToMin } from "../src/domain/datetime.js";
import { legMin } from "../src/domain/geo.js";
import { baseAt, startBaseOf, endBaseOf, deleteGuard } from "../src/domain/logic.js";
import { depotLegs, spanOf, driverPay, emptyRunMin, homeTripMin, genDayTasks, chainUse, mkChain, rideUse, driverDayShifts } from "../src/domain/optimizer.js";

/*
 * Time-dependent depots (driver.baseId, driver.baseRules).
 *
 * A bus is not always kept in one place. A driver who works at an office until 16:00
 * has the bus there during the day; after work it is at home. The depot goes with the
 * DRIVER (the dispatcher's call): a single all-day depot plus a list of windows shaped
 * like the driver's availability:
 *
 *   baseRules: [{ days: [weekdayIdx], start: "HH:MM", end: "HH:MM", baseId }]
 *
 * Lookup order: the driver's window, the driver's baseId, the vehicle's baseId, the
 * club depot. A run with no (registered) driver uses the vehicle's.
 *
 * The depot a shift STARTS from is the one valid when the bus leaves; the depot it
 * RETURNS to is the one valid when it gets back. The two may differ. With no driver
 * depots everything is exactly as before — the existing depot tests stay unchanged to
 * prove it.
 */

const WEEK_MON = mondayOf("2026-08-03");          // a Monday
const MON = 0, THU = 3, FRI = 4;

/* A stop and a venue, an office close to the stop and a home far from it. */
const STOP = { id: "sA", name: "Megálló", lat: 46.30, lon: 19.90 };
const VENUE = { id: "v0", name: "Csarnok", lat: 46.35, lon: 19.95, needsVignette: false };
const WORK = { id: "hWORK", name: "Munkahely", address: "", note: "", lat: 46.32, lon: 19.92 };
const HOME = { id: "hHOME", name: "Otthon", address: "", note: "", lat: 46.10, lon: 19.70 };

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/* The rules sit on driver d1; `baseId` is the vehicle's own depot, the fallback the
   existing cases are written against. */
function makeState({ baseRules = [], baseId = "hHOME", driverBase = null, defaultBaseId = null, trainings = [] } = {}) {
  return {
    stations: [STOP], venues: [VENUE], bases: [WORK, HOME],
    vehicles: [{ id: "b1", name: "Busz", plate: "AB-1", seats: 20, hasVignette: false, baseId }],
    drivers: [{ id: "d1", name: "Anna", wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: null, baseId: driverBase, baseRules }],
    teams: [{ id: "tm", name: "TM", color: "#000", stationIds: ["sA"], venueIds: ["v0"], passengerCount: null,
      stationCounts: { sA: 5 }, routeMode: "auto", routeAnchorId: null, returnStationIds: null,
      returnStationCounts: {}, returnRouteAnchorId: null }],
    trainings, rides: [], assignments: {}, matrix: null,
    settings: { ...DEFAULT_SETTINGS, estSpeedKmh: 60, fairnessBias: 0, defaultBaseId },
  };
}

/* "Works until 16:00 every day": the bus is at the office until then, at home after. */
const untilFour = [{ days: ALL_DAYS, start: "00:00", end: "16:00", baseId: "hWORK" }];

/* An occupancy (not named use*, which the linter reads as a React hook) that must be at the stop at `start` and ends at the venue at `end`. */
const occ = (weekday, start, end) => ({ driverId: "d1", vehicleId: "b1", weekday, start, end, from: "sA", to: "v0" });

/* Who and when, for baseAt. */
const who = (weekday, driverId = "d1", vehicleId = "b1") => ({ driverId, vehicleId, weekday });

describe("data model", () => {
  test("ensureShape gives every driver no depot and an empty rule list, and keeps saved ones", () => {
    const s = ensureShape({ drivers: [{ id: "a" }, { id: "b", baseId: "hWORK", baseRules: untilFour }] });
    expect(s.drivers[0].baseId).toBe(null);
    expect(s.drivers[0].baseRules).toEqual([]);
    expect(s.drivers[1].baseId).toBe("hWORK");
    expect(s.drivers[1].baseRules).toEqual(untilFour);
  });

  test("the fixture's drivers carry no depot of their own", () => {
    for (const d of seedState().drivers) {
      expect(d.baseId).toBe(null);
      expect(d.baseRules).toEqual([]);
    }
  });
});

describe("baseAt: which depot the driver's rules put the run at", () => {
  const s = makeState({ baseRules: [{ days: [MON, THU], start: "08:00", end: "16:10", baseId: "hWORK" }] });

  test("inside a window on a listed day, the rule's depot", () => {
    expect(baseAt(s, who(MON), timeToMin("12:00"))).toBe("hWORK");
    expect(baseAt(s, who(THU), timeToMin("08:00"))).toBe("hWORK");     // start is inclusive
  });

  test("outside the window, or on another day, the fallback depot", () => {
    expect(baseAt(s, who(MON), timeToMin("16:10"))).toBe("hHOME");    // end is exclusive
    expect(baseAt(s, who(MON), timeToMin("07:59"))).toBe("hHOME");
    expect(baseAt(s, who(FRI), timeToMin("12:00"))).toBe("hHOME");
  });

  test("fallback order: the driver's depot, the vehicle's, the club's, then none", () => {
    expect(baseAt(makeState({ driverBase: "hWORK" }), who(MON), 600)).toBe("hWORK");
    expect(baseAt(makeState(), who(MON), 600)).toBe("hHOME");
    const club = makeState({ baseId: null, defaultBaseId: "hWORK" });
    expect(baseAt(club, who(MON), 600)).toBe("hWORK");
    expect(baseAt(makeState({ baseId: null }), who(MON), 600)).toBe(null);
  });

  test("no weekday known (an older caller) means the fallback depot", () => {
    expect(baseAt(s, who(undefined), timeToMin("12:00"))).toBe("hHOME");
  });

  test("an incomplete or back-to-front window is ignored", () => {
    const bad = makeState({ baseRules: [
      { days: [MON], start: "", end: "16:00", baseId: "hWORK" },
      { days: [MON], start: "17:00", end: "09:00", baseId: "hWORK" },
      { days: [MON], start: "08:00", end: "16:00", baseId: null },
    ] });
    expect(baseAt(bad, who(MON), 600)).toBe("hHOME");
  });
});

describe("the dispatcher's case: works until 16:00 every day", () => {
  const s = makeState({ baseRules: untilFour });
  const fromWork = legMin(s, "hWORK", "sA"), fromHome = legMin(s, "hHOME", "sA");

  test("the fixture really has the office near and home far", () => {
    expect(fromHome).toBeGreaterThan(fromWork + 10);
  });

  /* The bus must leave at 16:10 to make the pickup from the office. 16:10 is past the
     office window, so naively the bus "is at home" — but leaving home in time would
     have meant setting off before 16:00, while it was still at the office. The rule
     valid at the LATEST departure that still arrives on time is the office's. */
  test("a 16:10 departure leaves from the workplace", () => {
    const u = occ(MON, timeToMin("16:10") + fromWork, timeToMin("18:00"));
    expect(startBaseOf(s, u)).toEqual({ baseId: "hWORK", depart: timeToMin("16:10") });
    expect(depotLegs(s, u).out).toMatchObject({ baseId: "hWORK", fromId: "hWORK", depart: timeToMin("16:10") });
  });

  test("a 17:00 departure leaves from home", () => {
    const u = occ(MON, timeToMin("17:00") + fromHome, timeToMin("19:00"));
    expect(startBaseOf(s, u)).toEqual({ baseId: "hHOME", depart: timeToMin("17:00") });
    expect(spanOf(s, u).start).toBe(timeToMin("17:00"));
  });
});

describe("start depot resolution", () => {
  test("two consistent depots: the later departure wins", () => {
    /* Both depots are valid all day for this departure: the home rule covers the early
       departure, the office rule the late one. The office one leaves later. */
    const s = makeState({ baseRules: [
      { days: ALL_DAYS, start: "00:00", end: "15:00", baseId: "hHOME" },
      { days: ALL_DAYS, start: "15:00", end: "23:59", baseId: "hWORK" },
    ] });
    const u = occ(MON, timeToMin("15:30"), timeToMin("17:00"));
    expect(startBaseOf(s, u).baseId).toBe("hWORK");
  });

  test("it is deterministic: the same occupancy always gets the same depot", () => {
    const s = makeState({ baseRules: untilFour });
    const u = occ(MON, timeToMin("16:20"), timeToMin("18:00"));
    expect(startBaseOf(s, u)).toEqual(startBaseOf(s, u));
  });

  test("Mon–Thu from the office, Friday from home", () => {
    const s = makeState({ baseRules: [{ days: [0, 1, 2, 3], start: "00:00", end: "16:10", baseId: "hWORK" }] });
    const at = (wd) => startBaseOf(s, occ(wd, timeToMin("15:00"), timeToMin("17:00"))).baseId;
    expect(at(MON)).toBe("hWORK");
    expect(at(THU)).toBe("hWORK");
    expect(at(FRI)).toBe("hHOME");
  });
});

describe("start and end depots may differ", () => {
  const s = makeState({ baseRules: untilFour });
  const fromWork = legMin(s, "hWORK", "sA"), backHome = legMin(s, "v0", "hHOME");
  const u = occ(MON, timeToMin("16:10") + fromWork, timeToMin("19:00"));

  test("out of the office, back home", () => {
    expect(endBaseOf(s, u)).toEqual({ baseId: "hHOME", arrive: timeToMin("19:00") + backHome });
    const legs = depotLegs(s, u);
    expect(legs.out.baseId).toBe("hWORK");
    expect(legs.back).toMatchObject({ baseId: "hHOME", fromId: "v0", toId: "hHOME", arrive: timeToMin("19:00") + backHome });
  });

  test("paid time runs from leaving one depot to reaching the other", () => {
    expect(spanOf(s, u)).toEqual({ start: timeToMin("16:10"), end: timeToMin("19:00") + backHome });
    const pay = driverPay(s, s.drivers[0], [u]);
    expect(pay.paid).toBe(timeToMin("19:00") + backHome - timeToMin("16:10"));
  });

  test("empty running is both legs, each to its own depot", () => {
    expect(emptyRunMin(s, [u])).toBe(fromWork + backHome);
  });

  test("an end inside a window returns to that window's depot", () => {
    const early = occ(MON, timeToMin("12:00"), timeToMin("13:00"));
    expect(endBaseOf(s, early).baseId).toBe("hWORK");
  });
});

describe("rules reach the uses built from tasks and rides", () => {
  const tr = { id: "tr", teamId: "tm", venueId: "v0", type: "weekly", days: [MON], date: null, start: "17:00", end: "18:30", stops: null };

  test("a chain built from tasks knows its weekday", () => {
    const s = makeState({ baseRules: untilFour, trainings: [tr] });
    const { tasks } = genDayTasks(s, MON, WEEK_MON);
    expect(tasks.every((t) => t.weekday === MON)).toBe(true);
    const c = mkChain(s, tasks, { driverId: "d1", vehicleId: "b1" });
    expect(chainUse(c, "d1", "b1").weekday).toBe(MON);
  });

  test("a ride knows its weekday, weekly or one-off", () => {
    const s = makeState({ trainings: [tr, { ...tr, id: "tx", type: "once", days: [], date: "2026-08-07" }] });
    expect(rideUse(s, { trainingId: "tr", day: MON, dir: "oda", stops: [] }, s.trainings[0]).weekday).toBe(MON);
    expect(rideUse(s, { trainingId: "tx", day: null, date: "2026-08-07", dir: "oda", stops: [] }, s.trainings[1]).weekday).toBe(FRI);
  });

  test("the driver sheet draws each depot run from its own depot", () => {
    const s = makeState({ baseRules: untilFour, trainings: [tr] });
    const ride = { id: "r1", trainingId: "tr", day: MON, dir: "oda", vehicleId: "b1", driverId: "d1",
      stops: [{ id: "x", stationId: "sA", time: "16:20", count: 5 }] };
    const [sh] = driverDayShifts(s, [{ ride, training: tr }]);
    expect(sh.out.baseId).toBe("hWORK");
    expect(sh.back.baseId).toBe("hHOME");
  });
});

describe("the depot goes with the driver, not the bus", () => {
  /* Two buses, two drivers. Anna (d1) has the office-until-16:00 rule and lives at
     HOME; b2 is kept at WORK; b1 has no depot of its own. */
  const s = makeState({ baseRules: untilFour, driverBase: "hHOME", baseId: null });
  s.vehicles.push({ id: "b2", name: "Busz 2", plate: "AB-2", seats: 20, hasVignette: false, baseId: "hWORK" });
  s.drivers.push({ id: "d2", name: "Béla", wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: null, baseId: null, baseRules: [] });
  const evening = (driverId, vehicleId) => ({ ...occ(MON, timeToMin("19:00"), timeToMin("20:00")), driverId, vehicleId });

  test("a driver given another bus takes their own depot to it", () => {
    expect(depotLegs(s, evening("d1", "b2")).out.baseId).toBe("hHOME");
    expect(depotLegs(s, evening("d1", "b1")).out.baseId).toBe("hHOME");
  });

  test("a driver with no depot of their own falls back to the bus's", () => {
    expect(depotLegs(s, evening("d2", "b2")).out.baseId).toBe("hWORK");
  });

  test("two drivers sharing one bus each start from their own depot", () => {
    expect(depotLegs(s, evening("d1", "b2")).out.baseId).toBe("hHOME");
    expect(depotLegs(s, evening("d2", "b2")).out.baseId).toBe("hWORK");
  });

  test("a run without a registered driver uses the bus's depot", () => {
    expect(depotLegs(s, evening(null, "b2")).out.baseId).toBe("hWORK");
    expect(depotLegs(s, evening(null, "b1"))).toBe(null);
  });

  test("the driver's all-day depot applies even with no weekday known", () => {
    const u = { ...evening("d1", "b2"), weekday: undefined };
    expect(startBaseOf(s, u).baseId).toBe("hHOME");
  });
});

describe("homeTripMin uses the depot valid at each end of the gap", () => {
  /* A morning run ends at 12:00 while the bus belongs at the office; the evening
     run leaves after 16:00 when it belongs at home. Going "home" in between means
     the office on the way back and home on the way out. */
  test("back to the office after the first task, out of home for the second", () => {
    const am = { id: "am", teamId: "tm", venueId: "v0", type: "weekly", days: [MON], date: null, start: "10:30", end: "11:50", stops: null };
    const pm = { ...am, id: "pm", start: "19:00", end: "20:00" };
    const s = makeState({ baseRules: untilFour, trainings: [am, pm] });
    const { tasks } = genDayTasks(s, MON, WEEK_MON);
    const A = tasks.find((t) => t.trainingId === "am" && t.dir === "vissza");
    const B = tasks.find((t) => t.trainingId === "pm" && t.dir === "oda");
    expect(homeTripMin(s, A, B)).toBe(legMin(s, A.to, "hWORK") + legMin(s, "hHOME", B.from));
  });

  /* The driver is not chosen yet at chaining time either, so the question is asked of
     every driver: could ANY of them get home? A driver with a depot of their own takes
     it to whichever bus they get; one without takes the bus's. */
  test("a driver's own depot is what decides whether they can go home", () => {
    const am = { id: "am", teamId: "tm", venueId: "v0", type: "weekly", days: [MON], date: null, start: "10:30", end: "11:50", stops: null };
    const pm = { ...am, id: "pm", start: "19:00", end: "20:00" };
    const s = makeState({ driverBase: "hWORK", trainings: [am, pm] });
    const { tasks } = genDayTasks(s, MON, WEEK_MON);
    const A = tasks.find((t) => t.trainingId === "am" && t.dir === "vissza");
    const B = tasks.find((t) => t.trainingId === "pm" && t.dir === "oda");
    expect(homeTripMin(s, A, B)).toBe(legMin(s, A.to, "hWORK") + legMin(s, "hWORK", B.from));
    s.drivers.push({ id: "d2", name: "Béla", wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: null, baseId: null, baseRules: [] });
    const viaBus = legMin(s, A.to, "hHOME") + legMin(s, "hHOME", B.from);
    expect(homeTripMin(s, A, B)).toBe(Math.min(viaBus, legMin(s, A.to, "hWORK") + legMin(s, "hWORK", B.from)));
  });

  test("with no drivers at all, the buses' depots are asked, as before", () => {
    const am = { id: "am", teamId: "tm", venueId: "v0", type: "weekly", days: [MON], date: null, start: "10:30", end: "11:50", stops: null };
    const pm = { ...am, id: "pm", start: "19:00", end: "20:00" };
    const s = makeState({ trainings: [am, pm] });
    s.drivers = [];
    const { tasks } = genDayTasks(s, MON, WEEK_MON);
    const A = tasks.find((t) => t.trainingId === "am" && t.dir === "vissza");
    const B = tasks.find((t) => t.trainingId === "pm" && t.dir === "oda");
    expect(homeTripMin(s, A, B)).toBe(legMin(s, A.to, "hHOME") + legMin(s, "hHOME", B.from));
  });
});

describe("empty rules change nothing", () => {
  test("a rule pointing at the vehicle's own depot gives the same legs as no rule", () => {
    const none = makeState();
    const same = makeState({ baseRules: [{ days: ALL_DAYS, start: "00:00", end: "23:59", baseId: "hHOME" }] });
    for (const [a, b] of [[600, 700], [900, 1000], [1100, 1300]]) {
      expect(depotLegs(same, occ(MON, a, b))).toEqual(depotLegs(none, occ(MON, a, b)));
    }
  });
});

describe("deleteGuard counts depots used only by a driver", () => {
  test("a depot named only in a driver's baseRules cannot be deleted", () => {
    const s = makeState({ baseRules: untilFour });
    expect(deleteGuard(s, "bases", "hWORK")).toContain("Használatban: 1");
  });

  test("a depot that is only a driver's all-day depot cannot be deleted", () => {
    const s = makeState({ driverBase: "hWORK" });
    expect(deleteGuard(s, "bases", "hWORK")).toContain("Használatban: 1");
  });

  test("a driver using one depot both ways is counted once, and so is the vehicle", () => {
    const s = makeState({ driverBase: "hHOME", baseRules: [{ days: [MON], start: "08:00", end: "12:00", baseId: "hHOME" }] });
    expect(deleteGuard(s, "bases", "hHOME")).toContain("Használatban: 2");
  });
});
