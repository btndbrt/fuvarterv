import { describe, test, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../src/data/storage.js";
import { ensureShape, seedState } from "../src/data/seed.js";
import { mondayOf } from "../src/domain/datetime.js";
import { fixedVehicleOf } from "../src/domain/logic.js";
import { genDayTasks, optimizeDay, pairingIssue } from "../src/domain/optimizer.js";
import { taskHardIssues } from "../src/screens/ScheduleScreen.jsx";

/*
 * Fixed driver–bus pairing (settings.fixedVehicle).
 *
 * Off, a driver's preferredVehicleId is only a soft penalty and the optimizer still
 * swaps buses between drivers when that saves more than preferredBias. On, it is a
 * HARD constraint: a driver with a preferred bus is only ever offered that bus.
 * Drivers without one are unaffected, two drivers may share one bus, and a lock
 * still wins — a manual move is how an exception is made.
 */

const WEEKDAY = 2;
const WEEK_MON = mondayOf("2026-08-05");

const bus = (id, seats, hasVignette = false) => ({ id, name: id, plate: id, seats, hasVignette });
const driver = (id, pref, extra = {}) => ({
  id, name: id, wage: 3000, minShiftMin: 60, availability: [], preferredVehicleId: pref, ...extra,
});

/* One team of `pax` at one stop, training 16:00–17:30 (or as given). */
function makeState({ vehicles, drivers, fixed = true, pax = 6, chains = [], trainings = null, bias = 1000 }) {
  return {
    teams: [
      { id: "tm", name: "TM", stationIds: ["s0"], venueIds: ["v0"], passengerCount: null, stationCounts: { s0: pax }, routeMode: "auto", routeAnchorId: null },
      { id: "tm2", name: "TM2", stationIds: ["s0"], venueIds: ["v0"], passengerCount: null, stationCounts: { s0: pax }, routeMode: "auto", routeAnchorId: null },
    ],
    stations: [{ id: "s0", name: "s0", lat: 46.1, lon: 19.1 }],
    venues: [{ id: "v0", name: "v0", lat: 46.2, lon: 19.2 }],
    bases: [],
    vehicles, drivers,
    trainings: trainings || [
      { id: "tr", teamId: "tm", venueId: "v0", type: "weekly", days: [WEEKDAY], date: null, start: "16:00", end: "17:30" },
    ],
    rides: [], matrix: null,
    assignments: { [WEEKDAY]: { chains } },
    settings: { ...DEFAULT_SETTINGS, preferredBias: bias, fairnessBias: 0, fixedVehicle: fixed },
  };
}

const reasonsOf = (out) => out.uncovered.flatMap((u) => u.reasons).join(" ");

describe("data model", () => {
  test("the setting defaults to off, so old data keeps the soft preference", () => {
    expect(DEFAULT_SETTINGS.fixedVehicle).toBe(false);
    expect(ensureShape({}).settings.fixedVehicle).toBe(false);
    expect(seedState().settings.fixedVehicle).toBe(false);
  });

  test("a saved true survives a reload", () => {
    expect(ensureShape({ settings: { fixedVehicle: true } }).settings.fixedVehicle).toBe(true);
  });

  test("fixedVehicleOf pins only when the switch is on and the bus exists", () => {
    const s = makeState({ vehicles: [bus("A", 8)], drivers: [driver("d1", "A"), driver("d2", null), driver("d3", "gone")] });
    expect(fixedVehicleOf(s, s.drivers[0])).toBe("A");
    expect(fixedVehicleOf(s, s.drivers[1])).toBe(null);
    /* A preferred bus that no longer exists cannot be driven: treating it as a pin
       would make the driver unusable for good, so it reads as "no preference". */
    expect(fixedVehicleOf(s, s.drivers[2])).toBe(null);
    expect(fixedVehicleOf({ ...s, settings: { ...s.settings, fixedVehicle: false } }, s.drivers[0])).toBe(null);
  });
});

describe("off: the preference stays soft (the old behaviour)", () => {
  test("a driver whose own bus is too small is moved to a bigger one", () => {
    const out = optimizeDay(makeState({ fixed: false, vehicles: [bus("small", 4), bus("big", 20)], drivers: [driver("d1", "small")] }), WEEKDAY, WEEK_MON);
    expect(out.uncovered).toHaveLength(0);
    expect(out.chains.every((c) => c.driverId === "d1" && c.vehicleId === "big")).toBe(true);
  });
});

describe("on: a paired driver only ever gets their own bus", () => {
  test("their own bus too small, nobody else to drive the big one: uncovered, and it says why", () => {
    const state = makeState({ vehicles: [bus("small", 4), bus("big", 20)], drivers: [driver("d1", "small")] });
    const out = optimizeDay(state, WEEKDAY, WEEK_MON);
    expect(out.chains).toHaveLength(0);
    expect(out.uncovered).toHaveLength(2);
    const r = reasonsOf(out);
    expect(r).toContain("Fix sofőr–jármű párosítás");
    expect(r).toContain("d1");
    expect(r).toContain("small");
  });

  test("the Schedule screen's own reason list agrees", () => {
    const state = makeState({ vehicles: [bus("small", 4), bus("big", 20)], drivers: [driver("d1", "small")] });
    const t = genDayTasks(state, WEEKDAY, WEEK_MON).tasks[0];
    expect(pairingIssue(state, WEEKDAY, t)).toContain("Fix sofőr–jármű párosítás");
    expect(taskHardIssues(state, WEEKDAY, t).join(" ")).toContain("Fix sofőr–jármű párosítás");
  });

  test("no pairing reason when the switch is off", () => {
    const state = makeState({ fixed: false, vehicles: [bus("small", 4), bus("big", 20)], drivers: [driver("d1", "small")] });
    const t = genDayTasks(state, WEEKDAY, WEEK_MON).tasks[0];
    expect(pairingIssue(state, WEEKDAY, t)).toBe(null);
  });

  test("a driver without a preferred bus is unaffected and takes the big one", () => {
    const out = optimizeDay(makeState({ vehicles: [bus("small", 4), bus("big", 20)], drivers: [driver("d1", "small"), driver("d2", null)] }), WEEKDAY, WEEK_MON);
    expect(out.uncovered).toHaveLength(0);
    expect(out.chains.every((c) => c.driverId === "d2" && c.vehicleId === "big")).toBe(true);
  });

  test("the vignette and the pairing filter together", () => {
    const state = makeState({ vehicles: [bus("own", 20, false), bus("mat", 20, true)], drivers: [driver("d1", "own")] });
    state.venues[0].needsVignette = true;
    const out = optimizeDay(state, WEEKDAY, WEEK_MON);
    expect(out.chains).toHaveLength(0);
    expect(reasonsOf(out)).toContain("Fix sofőr–jármű párosítás");
  });
});

describe("two drivers may share one bus (shift partners)", () => {
  /* A morning-only and an evening-only driver, both on bus A, with a second bus no
     one is paired to. Off, nothing stops the optimizer handing one of them bus B;
     on, both must end up on A. */
  const trainings = [
    { id: "trAM", teamId: "tm", venueId: "v0", type: "weekly", days: [WEEKDAY], date: null, start: "09:00", end: "10:00" },
    { id: "trPM", teamId: "tm2", venueId: "v0", type: "weekly", days: [WEEKDAY], date: null, start: "18:00", end: "19:00" },
  ];
  const drivers = [
    driver("am", "A", { availability: [{ days: [WEEKDAY], start: "07:00", end: "12:00" }] }),
    driver("pm", "A", { availability: [{ days: [WEEKDAY], start: "16:00", end: "21:00" }] }),
  ];

  test("both drivers work, both on their shared bus", () => {
    const out = optimizeDay(makeState({ vehicles: [bus("A", 8), bus("B", 8)], drivers, trainings }), WEEKDAY, WEEK_MON);
    expect(out.uncovered).toHaveLength(0);
    expect(new Set(out.chains.map((c) => c.driverId))).toEqual(new Set(["am", "pm"]));
    expect(out.chains.every((c) => c.vehicleId === "A")).toBe(true);
  });

  test("when they overlap, only one gets the bus and the other task names the pairing", () => {
    const overlap = trainings.map((t) => ({ ...t, start: "16:00", end: "17:00" }));
    const both = drivers.map((d) => ({ ...d, availability: [] }));
    const out = optimizeDay(makeState({ vehicles: [bus("A", 8), bus("B", 8)], drivers: both, trainings: overlap }), WEEKDAY, WEEK_MON);
    expect(out.chains.every((c) => c.vehicleId === "A")).toBe(true);
    expect(out.uncovered.length).toBeGreaterThan(0);
    expect(reasonsOf(out)).toContain("Fix sofőr–jármű párosítás");

    /* Control: off, the second driver simply takes bus B. */
    const off = optimizeDay(makeState({ fixed: false, vehicles: [bus("A", 8), bus("B", 8)], drivers: both, trainings: overlap }), WEEKDAY, WEEK_MON);
    expect(off.uncovered).toHaveLength(0);
  });
});

describe("a lock still wins", () => {
  const locked = (vehicleId, lockedTasks) => [{
    id: "ch1", driverId: "d1", vehicleId,
    taskIds: lockedTasks.map((id) => ({ id, locked: true })),
  }];

  test("a locked chain keeps a driver on a bus other than their own", () => {
    const state = makeState({ vehicles: [bus("own", 8), bus("other", 8)], drivers: [driver("d1", "own")],
      chains: locked("other", ["tr:2:oda", "tr:2:vissza"]) });
    const out = optimizeDay(state, WEEKDAY, WEEK_MON);
    expect(out.uncovered).toHaveLength(0);
    expect(out.chains).toHaveLength(1);
    expect(out.chains[0].vehicleId).toBe("other");
  });

  /* The improvement loop may graft free tasks onto a skeleton chain. When the
     skeleton is a manual exception (paired driver, foreign bus), grafting would
     quietly extend the exception to work nobody locked. */
  test("the improvement loop does not graft free work onto a locked exception", () => {
    const mk = (fixed) => makeState({ fixed, bias: 0, vehicles: [bus("own", 8), bus("other", 8)], drivers: [driver("d1", "own")],
      chains: locked("other", ["tr:2:oda"]) });

    /* Control: off, the return leg is grafted onto the locked chain (same driver,
       same cost, so the tie goes to one run). */
    const off = optimizeDay(mk(false), WEEKDAY, WEEK_MON);
    expect(off.chains.find((c) => c.tasks.some((t) => t.id === "tr:2:vissza")).vehicleId).toBe("other");

    const on = optimizeDay(mk(true), WEEKDAY, WEEK_MON);
    expect(on.uncovered).toHaveLength(0);
    const ret = on.chains.find((c) => c.tasks.some((t) => t.id === "tr:2:vissza"));
    expect(ret.vehicleId).toBe("own");
    expect(ret.tasks.map((t) => t.id)).toEqual(["tr:2:vissza"]);
  });
});

describe("property: the real fixture, every weekday", () => {
  /* preferredBias 0, so nothing but the hard rule keeps the drivers on their buses:
     with the default bias the soft preference alone already does on this fixture,
     and the test would prove nothing. Seed drivers d3 and d4 share bus b3. */
  const base = seedState();
  const state = { ...base, settings: { ...base.settings, fixedVehicle: true, preferredBias: 0 } };

  /* One test per weekday: a full day of the fixture is the slowest thing the suite
     optimises, and seven of them in one synchronous test outran the default timeout. */
  test.each([0, 1, 2, 3, 4])("weekday %i: every chain's driver is on their own bus, and every task is accounted for", (d) => {
    const out = optimizeDay(state, d, WEEK_MON);
    expect(out.empty).toBe(false);
    for (const c of out.chains) {
      const dr = state.drivers.find((x) => x.id === c.driverId);
      expect(c.vehicleId).toBe(dr.preferredVehicleId);
    }
    const n = out.chains.reduce((a, c) => a + c.tasks.length, 0) + out.uncovered.length;
    expect(n).toBe(genDayTasks(state, d, WEEK_MON).tasks.length);
    for (const u of out.uncovered) expect(u.reasons.length).toBeGreaterThan(0);
  }, 20000);
});
