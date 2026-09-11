import { describe, test, expect } from "vitest";
import { mondayOf } from "../src/domain/datetime.js";
import { legMin } from "../src/domain/geo.js";
import {
  optimizeDay,
  genDayTasks,
  mkChain,
  chainUse,
  chainShifts,
  emptyRunMin,
  homeTripMin,
  driverPay,
  dayStats,
  depotLegs,
} from "../src/domain/optimizer.js";

/*
 * Sending the bus home in the middle of the afternoon.
 *
 * The complaint these tests pin down: a bus dropped the children off, drove 22
 * minutes back to the depot, stood there for an hour and a half, then drove 22
 * minutes out again to fetch them. Nobody does that. The optimizer did, because
 * empty running was free and the waiting was not, so any trip home that physically
 * fitted in the gap looked like a saving.
 *
 * Two things had to change. Empty minutes are now charged (ADR-29), which makes the
 * trade honest. And the chain cards render by SHIFT rather than by chain, so a
 * driver who stays out is no longer drawn arriving at the depot after they left it.
 *
 * What must NOT change: a short trip home still pays for itself, and a club that
 * sets the empty-running price to zero gets exactly the old arithmetic back.
 */

const WEEKDAY = 2;
const WEEK_MON = mondayOf(new Date(2025, 0, 6));

const ZAK = { lat: 46.2745, lon: 19.889 };            // the club's own village
const FAR = { id: "vFAR", name: "Szeged", lat: 46.2530, lon: 20.1414, needsVignette: false };
const NEAR = { id: "vNEAR", name: "Mórahalom", lat: 46.2172, lon: 19.883, needsVignette: false };
const EGER = { id: "vEGER", name: "Eger", lat: 47.9026, lon: 20.3772, needsVignette: false };

function makeState({ venue = FAR, runCostPerMin = 100, vehicleBase = null } = {}) {
  return {
    stations: [{ id: "sZAK", name: "Zákányszék", ...ZAK }],
    bases: [
      { id: "hZAK", name: "Klub", ...ZAK },
      { id: "hEGER", name: "Egri garázs", lat: 47.9026, lon: 20.3772 },
    ],
    venues: [venue],
    vehicles: [{ id: "b1", name: "Busz", plate: "AB-1", seats: 20, hasVignette: true, baseId: vehicleBase }],
    drivers: [{ id: "d1", name: "Anna", wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: null }],
    teams: [{
      id: "tm", name: "TM", color: "#000", stationIds: ["sZAK"], venueIds: [venue.id],
      passengerCount: 10, stationCounts: { sZAK: 10 }, routeMode: "auto", routeAnchorId: null,
      returnStationIds: null, returnStationCounts: {}, returnRouteAnchorId: null,
    }],
    trainings: [{
      id: "tr", teamId: "tm", venueId: venue.id, type: "weekly", days: [WEEKDAY],
      date: null, start: "16:00", end: "18:00", stops: null,
    }],
    rides: [], assignments: {}, matrix: null,
    settings: {
      arriveEarlyMin: 10, departAfterMin: 10, calloutFee: 1500, dwellMin: 2,
      estSpeedKmh: 60, fallbackLegMin: 12, preferredBias: 0, fairnessBias: 0,
      runCostPerMin, defaultBaseId: "hZAK",
    },
  };
}

/* Every depot run in a day's plan, as the screens draw them: one out of the depot
   per shift and one back, never one per chain. */
const depotRuns = (state, chains) => {
  const places = chainShifts(state, chains);
  let n = 0;
  for (const c of chains) {
    const legs = depotLegs(state, chainUse(c, c.driverId, c.vehicleId));
    const p = places.get(c);
    if (legs && p.first) n++;
    if (legs && p.last) n++;
  }
  return n;
};

describe("the bus stops going home for an hour", () => {
  const state = makeState({ venue: FAR });
  const out = optimizeDay(state, WEEKDAY, WEEK_MON);

  test("a training two hours long is one turn-out, not two", () => {
    expect(out.chains).toHaveLength(1);
    expect(out.chains[0].tasks).toHaveLength(2);
  });

  test("the bus waits at the venue instead of driving back and forth", () => {
    // Only the two short runs that open and close the day, not a round trip in the
    // middle: 22 minutes out to the venue and 22 back used to be spent for nothing.
    expect(depotRuns(state, out.chains)).toBe(2);
    const empty = emptyRunMin(state, out.chains.map((c) => chainUse(c, "d1", "b1")));
    expect(empty).toBe(legMin(state, "hZAK", "sZAK") + legMin(state, "sZAK", "hZAK"));
    expect(empty).toBeLessThan(10);
  });

  test("the waiting is paid, and says so", () => {
    const st = dayStats(state, out.chains);
    const { tasks } = genDayTasks(state, WEEKDAY, WEEK_MON);
    const wait = tasks.find((t) => t.dir === "vissza").start - tasks.find((t) => t.dir === "oda").end;
    expect(st.idle).toBe(wait);
    expect(st.drivers).toBe(1);
  });

  test("splitting the day would now cost more, which is why it is not chosen", () => {
    const { tasks } = genDayTasks(state, WEEKDAY, WEEK_MON);
    const d = state.drivers[0];
    const split = tasks.map((t) => chainUse(mkChain(state, [t]), "d1", "b1"));
    const together = [chainUse(mkChain(state, tasks), "d1", "b1")];
    expect(driverPay(state, d, split).cost).toBeGreaterThan(driverPay(state, d, together).cost);
  });
});

describe("a trip home that is worth taking is still taken", () => {
  /* The fix must not simply glue every day into one long shift. Eight minutes of
     empty driving to buy over two hours of unpaid time is a real saving, and the
     club should keep it. */
  const state = makeState({ venue: NEAR });
  const out = optimizeDay(state, WEEKDAY, WEEK_MON);

  test("a venue eight minutes away still sends the bus home between the two runs", () => {
    expect(out.chains).toHaveLength(2);
    expect(depotRuns(state, out.chains)).toBe(4);
  });

  test("and it really is the cheaper of the two", () => {
    const { tasks } = genDayTasks(state, WEEKDAY, WEEK_MON);
    const d = state.drivers[0];
    const split = tasks.map((t) => chainUse(mkChain(state, [t]), "d1", "b1"));
    const together = [chainUse(mkChain(state, tasks), "d1", "b1")];
    expect(driverPay(state, d, split).cost).toBeLessThan(driverPay(state, d, together).cost);
  });
});

describe("the empty-running price is a setting, not a new rule", () => {
  test("at zero it is free again, and the old plan comes back", () => {
    const state = makeState({ venue: FAR, runCostPerMin: 0 });
    const out = optimizeDay(state, WEEKDAY, WEEK_MON);
    expect(out.chains).toHaveLength(2);
  });

  test("at zero no cost changes at all", () => {
    const state = makeState({ venue: FAR, runCostPerMin: 0 });
    const uses = [chainUse(mkChain(state, genDayTasks(state, WEEKDAY, WEEK_MON).tasks), "d1", "b1")];
    const pay = driverPay(state, state.drivers[0], uses);
    expect(pay.cost).toBe(1500 + (pay.paid / 60) * 3000);
  });
});

describe("emptyRunMin counts every empty minute exactly once", () => {
  const state = makeState({ venue: FAR });
  const { tasks } = genDayTasks(state, WEEKDAY, WEEK_MON);

  test("one chain: the two depot runs plus the deadheads inside it", () => {
    const c = mkChain(state, tasks);
    const inside = c.links.reduce((a, l) => a + l.dead, 0);
    expect(emptyRunMin(state, [chainUse(c, "d1", "b1")]))
      .toBe(legMin(state, "hZAK", "sZAK") + legMin(state, "sZAK", "hZAK") + inside);
  });

  test("two chains in one shift: one pair of depot runs, plus the hop between them", () => {
    // Eger is far enough that the driver cannot go home, so the two runs are one
    // shift however they are recorded.
    const s = makeState({ venue: EGER });
    const t = genDayTasks(s, WEEKDAY, WEEK_MON).tasks;
    const uses = t.map((x) => chainUse(mkChain(s, [x]), "d1", "b1"));
    expect(driverPay(s, s.drivers[0], uses).shifts).toHaveLength(1);
    expect(emptyRunMin(s, uses))
      .toBe(legMin(s, "hZAK", "sZAK") + legMin(s, "vEGER", "vEGER") + legMin(s, "sZAK", "hZAK"));
  });
});

describe("homeTripMin asks about the bus that would actually run the pair", () => {
  test("no depot anywhere means nobody goes home", () => {
    const s = makeState({ venue: NEAR });
    s.settings.defaultBaseId = null;
    const { tasks } = genDayTasks(s, WEEKDAY, WEEK_MON);
    expect(homeTripMin(s, tasks[0], tasks[1])).toBeNull();
  });

  test("a bus garaged far away cannot get home, even when the club depot is next door", () => {
    /* The old reading took settings.defaultBaseId alone. The club depot sits in the
       same village as the station, so the trip home looked like ten minutes, while
       the pay calculation measured the bus's own depot 187 minutes away and merged
       the two runs into one shift regardless. That disagreement is what produced a
       chain card showing the bus leaving the depot before it had arrived. */
    const s = makeState({ venue: NEAR, vehicleBase: "hEGER" });
    const { tasks } = genDayTasks(s, WEEKDAY, WEEK_MON);
    const viaClub = legMin(s, tasks[0].to, "hZAK") + legMin(s, "hZAK", tasks[1].from);
    const trip = homeTripMin(s, tasks[0], tasks[1]);
    expect(viaClub).toBeLessThan(30);
    expect(trip).toBeGreaterThan(300);
    expect(trip).toBe(legMin(s, tasks[0].to, "hEGER") + legMin(s, "hEGER", tasks[1].from));
  });

  test("and the day then comes out as a single shift, drawn as one", () => {
    const s = makeState({ venue: NEAR, vehicleBase: "hEGER" });
    const out = optimizeDay(s, WEEKDAY, WEEK_MON);
    expect(depotRuns(s, out.chains)).toBe(2);
  });

  test("chains with no id of their own still each get their own entry", () => {
    /* A chain only has an id once it has been saved or locked. chainShifts is keyed
       by the chain itself for that reason: on ids, every unsaved chain of a day would
       collide onto one undefined entry and the cards would read each other's shifts. */
    const s = makeState({ venue: NEAR });
    const out = optimizeDay(s, WEEKDAY, WEEK_MON);
    expect(out.chains.length).toBeGreaterThan(1);
    expect(out.chains.every((c) => c.id === undefined)).toBe(true);
    expect(chainShifts(s, out.chains).size).toBe(out.chains.length);
  });
});

describe("chain cards read the shift, not the chain", () => {
  /* Two chains a driver runs in one unbroken shift. The optimizer avoids making
     these now, but a manual move or a locked chain still can, and a saved schedule
     from before this change already has them. */
  const s = makeState({ venue: EGER });
  const tasks = genDayTasks(s, WEEKDAY, WEEK_MON).tasks;
  const chains = tasks.map((t, i) => {
    const c = mkChain(s, [t], { id: `c${i}`, driverId: "d1", vehicleId: "b1" });
    c.driver = s.drivers[0];
    c.vehicle = s.vehicles[0];
    return c;
  });
  const places = chainShifts(s, chains);

  test("both chains land in the same shift, marked as its opening and its close", () => {
    expect(places.get(chains[0]).chains).toBe(2);
    expect(places.get(chains[0]).first).toBe(true);
    expect(places.get(chains[0]).last).toBe(false);
    expect(places.get(chains[1]).first).toBe(false);
    expect(places.get(chains[1]).last).toBe(true);
  });

  test("one call-out fee, not two: the cards sum to the day's total", () => {
    // The shift is priced once and shared, so counting the opening chain's figure
    // once per shift reproduces the day exactly. Per-chain pricing came to half as
    // much again, because each card charged its own turn-out.
    const shown = chains
      .filter((c) => places.get(c).first)
      .reduce((a, c) => a + places.get(c).pay.cost, 0);
    expect(Math.round(shown)).toBe(dayStats(s, chains).cost);
    expect(Math.round(driverPay(s, s.drivers[0], [chainUse(chains[0], "d1", "b1")]).cost
      + driverPay(s, s.drivers[0], [chainUse(chains[1], "d1", "b1")]).cost)).toBeGreaterThan(shown);
  });

  test("what sits between them is a wait on site, not a trip home", () => {
    const gap = places.get(chains[1]).gap;
    expect(gap.dead).toBe(0);                       // the venue is where both happen
    expect(gap.wait).toBe(tasks[1].start - tasks[0].end);
    expect(places.get(chains[0]).gap).toBeNull();
  });

  test("the depot runs that bracket the shift are the ones actually driven", () => {
    const p0 = places.get(chains[0]), p1 = places.get(chains[1]);
    expect(p0.shift).toBe(p1.shift);
    expect(p0.shift.out.toId).toBe(tasks[0].from);
    expect(p0.shift.back.fromId).toBe(tasks[1].to);
    // And they bracket the paid shift, boundary for boundary.
    expect(p0.pay.shifts[0].start).toBe(p0.shift.out.depart);
    expect(p0.pay.shifts[0].end).toBe(p0.shift.back.arrive);
  });
});
