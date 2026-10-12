import { describe, test, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../src/data/storage.js";
import { ensureShape } from "../src/data/seed.js";
import { depotMigrationPlan, applyDepotMigration } from "../src/domain/logic.js";
import { depotLegs } from "../src/domain/optimizer.js";

/*
 * Moving the depot from the bus to the driver (ADR-32).
 *
 * The club's live data has buses with their own depot. Moving them on load would
 * reprice the schedule with nobody watching (E8), and since ensureShape runs on every
 * load it would also undo a depot the dispatcher later cleared. So the move is a plan
 * the dispatcher sees and approves once: each bus's depot goes to the drivers whose
 * own bus it is, and the bus's depot is cleared. Until then, lookup is unchanged.
 */

const B = (id) => ({ id, name: id, address: "", note: "", lat: 46.2 + id.length / 100, lon: 19.9 });
const drv = (id, extra = {}) => ({ id, name: id, wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: null, baseId: null, baseRules: [], ...extra });
const bus = (id, baseId = null) => ({ id, name: id, plate: id.toUpperCase(), seats: 8, hasVignette: false, baseId });

function makeState() {
  return {
    stations: [{ id: "sA", name: "Megálló", lat: 46.30, lon: 19.90 }],
    venues: [{ id: "v0", name: "Csarnok", lat: 46.35, lon: 19.95, needsVignette: false }],
    bases: [B("hA"), B("hBB"), B("hCCC"), B("hOWN")],
    vehicles: [bus("b1", "hA"), bus("b2", "hBB"), bus("b3", "hCCC"), bus("b4")],
    drivers: [
      drv("anna", { preferredVehicleId: "b1" }),
      drv("bela", { preferredVehicleId: "b2" }),
      drv("cili", { preferredVehicleId: "b2" }),           // shift partner on b2
      drv("dani", { preferredVehicleId: "b1", baseId: "hOWN" }),
      drv("emma"),                                          // drives whatever is free
    ],
    teams: [], trainings: [], rides: [], assignments: {}, matrix: null,
    settings: { ...DEFAULT_SETTINGS, defaultBaseId: null },
  };
}

describe("depotMigrationPlan", () => {
  test("nothing to move when no bus has a depot of its own", () => {
    const s = makeState();
    s.vehicles = s.vehicles.map((v) => ({ ...v, baseId: null }));
    expect(depotMigrationPlan(s)).toBe(null);
  });

  test("each bus's depot goes to the drivers whose own bus it is", () => {
    const p = depotMigrationPlan(makeState());
    expect(p.moves).toEqual([
      { driverId: "anna", vehicleId: "b1", baseId: "hA" },
      { driverId: "bela", vehicleId: "b2", baseId: "hBB" },
      { driverId: "cili", vehicleId: "b2", baseId: "hBB" },
    ]);
  });

  test("a driver who already has a depot keeps it", () => {
    expect(depotMigrationPlan(makeState()).kept).toEqual([{ driverId: "dani", vehicleId: "b1", baseId: "hOWN" }]);
  });

  test("a bus nobody has as their own is listed: its depot would be lost", () => {
    expect(depotMigrationPlan(makeState()).orphaned).toEqual([{ vehicleId: "b3", baseId: "hCCC" }]);
  });

  test("drivers left without a depot are listed: they will start from the club's", () => {
    expect(depotMigrationPlan(makeState()).toClub).toEqual(["emma"]);
  });
});

describe("applyDepotMigration", () => {
  test("drivers get the depots, and every bus's depot is cleared", () => {
    const s = applyDepotMigration(makeState());
    const base = (id) => s.drivers.find((d) => d.id === id).baseId;
    expect([base("anna"), base("bela"), base("cili"), base("dani"), base("emma")]).toEqual(["hA", "hBB", "hBB", "hOWN", null]);
    expect(s.vehicles.every((v) => v.baseId === null)).toBe(true);
  });

  test("it is done once: afterwards there is nothing left to move", () => {
    expect(depotMigrationPlan(applyDepotMigration(makeState()))).toBe(null);
  });

  test("it does not touch the original state", () => {
    const s = makeState();
    applyDepotMigration(s);
    expect(s.vehicles[0].baseId).toBe("hA");
    expect(s.drivers[0].baseId).toBe(null);
  });

  test("a driver on their own bus leaves from the same depot before and after", () => {
    const before = makeState(), after = applyDepotMigration(before);
    for (const [driverId, vehicleId] of [["anna", "b1"], ["bela", "b2"], ["cili", "b2"], ["dani", "b1"]]) {
      const u = { driverId, vehicleId, weekday: 0, start: 600, end: 700, from: "sA", to: "v0" };
      expect(depotLegs(after, u)).toEqual(depotLegs(before, u));
    }
  });
});

describe("nothing moves by itself", () => {
  test("loading the data keeps the bus's depot where it is", () => {
    const s = ensureShape(makeState());
    expect(s.vehicles[0].baseId).toBe("hA");
    expect(s.drivers[0].baseId).toBe(null);
  });

  test("before the move, a driver without a depot still leaves from the bus's", () => {
    const u = { driverId: "anna", vehicleId: "b1", weekday: 0, start: 600, end: 700, from: "sA", to: "v0" };
    expect(depotLegs(makeState(), u).out.baseId).toBe("hA");
  });
});
