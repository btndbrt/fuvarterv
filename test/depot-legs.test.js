import { describe, test, expect } from "vitest";
import { mondayOf } from "../src/domain/datetime.js";
import { legMin } from "../src/domain/geo.js";
import {
  depotLegs,
  spanOf,
  mergeShifts,
  rideUse,
  driverDayShifts,
  chainUse,
  mkChain,
  genDayTasks,
} from "../src/domain/optimizer.js";

/*
 * Depot runs as a VISIBLE thing. The arithmetic already existed inside spanOf and
 * drove paid time; these tests pin down the derived form the screens render, and
 * the one property that matters most: the depot times a driver reads and the hours
 * the club is billed for come from the same calculation and cannot drift apart.
 *
 * Nothing here is persisted. Every leg is a function of the vehicle's depot and the
 * endpoints, which is what makes changing a depot safe.
 */

const WEEKDAY = 2;
const WEEK_MON = mondayOf(new Date(2025, 0, 6));

const EGER = { id: "vEGER", name: "Eger", lat: 47.9026, lon: 20.3772, needsVignette: false };
const KOZELI = { id: "vKOZ", name: "Mórahalom", lat: 46.2172, lon: 19.883, needsVignette: false };

function makeState({ venue = EGER, base = "hZAK" } = {}) {
  return {
    stations: [{ id: "sZAK", name: "Zákányszék", address: "Fő tér 1.", lat: 46.2745, lon: 19.889 }],
    bases: [{ id: "hZAK", name: "Klub", address: "Telephely u. 2.", note: "", lat: 46.2745, lon: 19.889 }],
    venues: [venue],
    vehicles: [{ id: "b1", name: "Busz", plate: "AB-1", seats: 20, hasVignette: true, baseId: null }],
    drivers: [{ id: "d1", name: "Anna", wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: null }],
    teams: [{
      id: "tm", name: "TM", color: "#000", stationIds: ["sZAK"], venueIds: [venue.id],
      passengerCount: 10, stationCounts: { sZAK: 10 }, routeMode: "auto", routeAnchorId: null,
      returnStationIds: null, returnStationCounts: {}, returnRouteAnchorId: null,
    }],
    trainings: [{
      id: "tr", teamId: "tm", venueId: venue.id, type: "weekly", days: [WEEKDAY],
      date: null, start: "14:00", end: "16:00", stops: null,
    }],
    rides: [], assignments: {}, matrix: null,
    settings: { arriveEarlyMin: 10, departAfterMin: 10, calloutFee: 1500, dwellMin: 2,
      estSpeedKmh: 60, fallbackLegMin: 12, preferredBias: 0, defaultBaseId: base },
  };
}

const chainOf = (state) => {
  const { tasks } = genDayTasks(state, WEEKDAY, WEEK_MON);
  return mkChain(state, tasks, { driverId: "d1", vehicleId: "b1" });
};

describe("depotLegs", () => {
  test("no depot configured means no legs at all", () => {
    const s = makeState({ base: null });
    expect(depotLegs(s, { vehicleId: "b1", start: 600, end: 700, from: "sZAK", to: "vEGER" })).toBe(null);
  });

  test("the outbound leg lands exactly when the first pickup starts", () => {
    const s = makeState();
    const legs = depotLegs(s, { vehicleId: "b1", start: 600, end: 700, from: "sZAK", to: "vEGER" });
    expect(legs.baseId).toBe("hZAK");
    expect(legs.out.fromId).toBe("hZAK");
    expect(legs.out.toId).toBe("sZAK");
    expect(legs.out.min).toBe(legMin(s, "hZAK", "sZAK"));
    expect(legs.out.arrive).toBe(600);
    expect(legs.out.depart).toBe(600 - legs.out.min);
  });

  test("the return leg leaves the moment the work ends", () => {
    const s = makeState();
    const legs = depotLegs(s, { vehicleId: "b1", start: 600, end: 700, from: "sZAK", to: "vEGER" });
    expect(legs.back.fromId).toBe("vEGER");
    expect(legs.back.toId).toBe("hZAK");
    expect(legs.back.min).toBe(legMin(s, "vEGER", "hZAK"));
    expect(legs.back.depart).toBe(700);
    expect(legs.back.arrive).toBe(700 + legs.back.min);
  });

  /* The point of deriving spanOf from depotLegs: a printed depot time can never
     describe a different trip from the one the driver is paid for. */
  test("the printed legs and the paid span are the same calculation", () => {
    const s = makeState();
    const u = chainUse(chainOf(s), "d1", "b1");
    const legs = depotLegs(s, u);
    expect(spanOf(s, u)).toEqual({ start: legs.out.depart, end: legs.back.arrive });
  });

  /* Regression: the legs used to carry only fromId/toId, so a renderer handed one
     leg on its own could not name the depot and printed a question mark instead. */
  test("each leg names its own depot, not just the parent", () => {
    const s = makeState();
    const legs = depotLegs(s, { vehicleId: "b1", start: 600, end: 700, from: "sZAK", to: "vEGER" });
    expect(legs.out.baseId).toBe("hZAK");
    expect(legs.back.baseId).toBe("hZAK");
    // The shift grouping hands out bare legs, so this is where it actually bites.
    const groups = driverDayShifts(s, dayRides(s));
    expect(groups.every((g) => g.out.baseId === "hZAK" && g.back.baseId === "hZAK")).toBe(true);
  });

  test("a vehicle's own depot beats the club's", () => {
    const s = makeState();
    s.bases.push({ id: "hMAS", name: "Másik telephely", lat: 46.5, lon: 20.1 });
    s.vehicles[0].baseId = "hMAS";
    expect(depotLegs(s, { vehicleId: "b1", start: 600, end: 700, from: "sZAK", to: "vEGER" }).baseId).toBe("hMAS");
  });
});

/* Two rides for one driver on one day: out to the training, home again after it. */
function dayRides(state) {
  const { tasks } = genDayTasks(state, WEEKDAY, WEEK_MON);
  const tr = state.trainings[0];
  return tasks.map((t, i) => ({
    ride: {
      id: `r${i}`, trainingId: tr.id, day: WEEKDAY, date: null,
      vehicleId: "b1", driverId: "d1", dir: t.dir,
      stops: t.plan.map((p, k) => ({ id: `r${i}s${k}`, stationId: p.stationId,
        time: `${String(Math.floor((t.dir === "vissza" ? p.arr : p.dep) / 60)).padStart(2, "0")}:${String((t.dir === "vissza" ? p.arr : p.dep) % 60).padStart(2, "0")}`,
        count: p.count })),
    },
    training: tr,
  }));
}

describe("driverDayShifts", () => {
  test("a distant venue leaves no time to go home, so the day is one turn-out", () => {
    const s = makeState({ venue: EGER });
    const groups = driverDayShifts(s, dayRides(s));
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(2);
    // One departure from the depot and one return, not one pair per ride.
    expect(groups[0].out.fromId).toBe("hZAK");
    expect(groups[0].back.toId).toBe("hZAK");
  });

  test("a nearby venue lets the driver go home, so it splits into two", () => {
    const s = makeState({ venue: KOZELI });
    const groups = driverDayShifts(s, dayRides(s));
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.rows.length === 1)).toBe(true);
    // Each turn-out is bracketed by its own pair of depot runs.
    expect(groups.every((g) => g.out && g.back)).toBe(true);
  });

  /* The invariant that keeps the sheet honest: the groups a driver reads are the
     same shifts driverPay bills, boundary for boundary. */
  test("the groups are exactly the shifts the pay calculation uses", () => {
    for (const venue of [EGER, KOZELI]) {
      const s = makeState({ venue });
      const entries = dayRides(s);
      const groups = driverDayShifts(s, entries);
      const paid = mergeShifts(entries.map((e) => spanOf(s, rideUse(s, e.ride, e.training))));
      expect(groups.map((g) => ({ start: g.start, end: g.end }))).toEqual(paid);
    }
  });

  test("every ride lands in exactly one group", () => {
    const s = makeState({ venue: KOZELI });
    const entries = dayRides(s);
    const ids = driverDayShifts(s, entries).flatMap((g) => g.rows.map((r) => r.ride.id));
    expect(ids.sort()).toEqual(entries.map((e) => e.ride.id).sort());
  });

  test("with no depot the rides still group, just without legs", () => {
    const s = makeState({ venue: EGER, base: null });
    const groups = driverDayShifts(s, dayRides(s));
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((g) => g.out === null && g.back === null)).toBe(true);
  });
});
