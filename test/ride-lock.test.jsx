import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { RideEditor } from "../src/screens/RideScreen.jsx";
import { saveLockedRide, unlockRideTask, withGeneratedRides, resolveDay, optimizeDay, rideLocked } from "../src/domain/optimizer.js";
import { mondayOf } from "../src/domain/datetime.js";

/*
 * Locking a ride made by hand on the Week page.
 *
 * A ride has no lock of its own: the lock goes on the schedule task it stands for,
 * where the optimizer already honours it. What these tests guard is the promise the
 * box makes — once ticked, the optimizer changes neither the crew nor the ride.
 */

const DATE = "2026-09-15";                 // a Tuesday
const WD = 1;
const weekMon = mondayOf(DATE);
const TASK = { id: "tr:1:oda" };

function makeState({ split = false } = {}) {
  return {
    teams: [{ id: "tm", name: "U14", color: "#f00", venueIds: ["v1"], passengerCount: null, routeMode: "auto", routeAnchorId: null,
      stationIds: split ? ["s1", "s2"] : ["s1"], stationCounts: split ? { s1: 5, s2: 5 } : { s1: 5 } }],
    stations: [{ id: "s1", name: "Kistelek", lat: 46.4, lon: 19.9 }, { id: "s2", name: "Balástya", lat: 46.42, lon: 20.0 }],
    venues: [{ id: "v1", name: "Csarnok", lat: 46.2, lon: 19.9 }],
    bases: [],
    vehicles: [0, 1].map((i) => ({ id: `V${i}`, name: `Busz${i}`, plate: `AB-${i}`, seats: 8, hasVignette: false, baseId: null })),
    drivers: [0, 1].map((i) => ({ id: `D${i}`, name: `Sofőr${i}`, wage: 3000, minShiftMin: 60, availability: [], preferredVehicleId: null })),
    trainings: [{ id: "tr", teamId: "tm", venueId: "v1", type: "weekly", days: [WD], date: null, start: "16:00", end: "17:30", stops: null }],
    rides: [], matrix: null, assignments: {},
    settings: { arriveEarlyMin: 10, departAfterMin: 10, calloutFee: 1500, dwellMin: 2,
      estSpeedKmh: 50, fallbackLegMin: 12, preferredBias: 0, defaultBaseId: null, fairnessBias: 0 },
  };
}

// Hand-made, with a departure time the generator would never write.
const handRide = { id: "hand", trainingId: "tr", day: WD, date: null, dir: "oda", driverId: "D1", vehicleId: "V1",
  stops: [{ id: "st1", stationId: "s1", time: "15:05", count: 5 }] };

/* An optimizer run followed by the rebuild the week apply does, ids stamped first. */
function optimiseAndRebuild(s) {
  const chains = optimizeDay(s, WD, weekMon).chains.map((c, i) => ({ ...c, id: c.id || `new${i}` }));
  return { chains, rides: withGeneratedRides(s, WD, weekMon, chains) };
}

describe("a ride saved with the lock", () => {
  test("puts its task in a locked chain with the ride's crew, and is pinned to it", () => {
    const s = saveLockedRide(makeState(), handRide, WD, weekMon, TASK);
    const chains = s.assignments[WD].chains;
    expect(chains).toHaveLength(1);
    expect(chains[0]).toMatchObject({ driverId: "D1", vehicleId: "V1", taskIds: [{ id: TASK.id, locked: true }] });
    const r = s.rides.find((x) => x.id === "hand");
    expect(r).toMatchObject({ taskId: TASK.id, source: "manual", runId: chains[0].id });
    expect(rideLocked(s, r, WD)).toBe(true);
  });

  test("survives the optimizer: same crew, same ride, same stops", () => {
    const s = saveLockedRide(makeState(), handRide, WD, weekMon, TASK);
    const { chains, rides } = optimiseAndRebuild(s);

    const held = chains.find((c) => c.tasks.some((t) => t.id === TASK.id));
    expect(held).toMatchObject({ driverId: "D1", vehicleId: "V1" });
    const oda = rides.filter((r) => r.trainingId === "tr" && r.dir === "oda");
    expect(oda).toHaveLength(1);
    expect(oda[0]).toMatchObject({ id: "hand", driverId: "D1", vehicleId: "V1", runId: held.id });
    expect(oda[0].stops).toEqual(handRide.stops);
    // The other direction was not locked, and is still generated.
    expect(rides.filter((r) => r.dir === "vissza" && r.source === "schedule")).toHaveLength(1);
  });

  test("without the lock, the same ride is replaced", () => {
    const s = { ...makeState(), rides: [handRide] };
    expect(optimiseAndRebuild(s).rides.some((r) => r.id === "hand")).toBe(false);
  });

  test("unlocking releases it to the optimizer again", () => {
    const s = unlockRideTask(saveLockedRide(makeState(), handRide, WD, weekMon, TASK), WD, TASK.id);
    expect(s.assignments[WD].chains[0]).toMatchObject({ locked: false, taskIds: [{ id: TASK.id, locked: false }] });
    const rides = withGeneratedRides(s, WD, weekMon, resolveDay(s, WD, weekMon).chains);
    expect(rides.some((r) => r.id === "hand")).toBe(false);
  });

  /* The Schedule tab is still where the lock lives, so moving the locked task there
     must take the ride with it rather than leave it with the old driver. */
  test("follows its task when the task is moved to another crew on the Schedule tab", () => {
    let s = saveLockedRide(makeState(), handRide, WD, weekMon, TASK);
    s = { ...s, assignments: { [WD]: { chains: [{ id: "moved", driverId: "D0", vehicleId: "V0", taskIds: [{ id: TASK.id, locked: true }] }] } } };
    const r = withGeneratedRides(s, WD, weekMon, resolveDay(s, WD, weekMon).chains).find((x) => x.id === "hand");
    expect(r).toMatchObject({ driverId: "D0", vehicleId: "V0", runId: "moved" });
    expect(r.stops).toEqual(handRide.stops);
  });
});

describe("the lock box in the ride editor", () => {
  let container, root;
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
  afterEach(() => { act(() => root?.unmount()); container.remove(); });

  const mount = (state, onUpdate = () => {}) => act(() => {
    root = createRoot(container);
    root.render(<RideEditor state={state} update={onUpdate} training={state.trainings[0]} dayIdx={WD} dateISO={DATE} onBack={() => {}} />);
  });
  const box = () => container.querySelector('input[type="checkbox"]');
  const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  const save = () => click([...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Fuvar mentése"));

  test("ticking it and saving locks a hand-made ride", () => {
    const s = { ...makeState(), rides: [handRide] };
    let next = null;
    mount(s, (fn) => { next = fn(s); });
    expect(box().checked).toBe(false);
    click(box());
    save();

    expect(next.assignments[WD].chains[0]).toMatchObject({ driverId: "D1", vehicleId: "V1", taskIds: [{ id: TASK.id, locked: true }] });
    expect(next.rides.find((r) => r.id === "hand")).toMatchObject({ taskId: TASK.id, stops: handRide.stops });
  });

  test("a locked ride opens ticked, and unticking it releases the task", () => {
    const s = saveLockedRide(makeState(), handRide, WD, weekMon, TASK);
    let next = null;
    mount(s, (fn) => { next = fn(s); });
    expect(box().checked).toBe(true);
    click(box());
    save();
    expect(next.assignments[WD].chains[0].taskIds).toEqual([{ id: TASK.id, locked: false }]);
  });

  test("a hand-made ride is not shown locked just because its task is locked for another crew", () => {
    const s = { ...makeState(), rides: [handRide],
      assignments: { [WD]: { chains: [{ id: "c", driverId: "D0", vehicleId: "V0", taskIds: [{ id: TASK.id, locked: true }] }] } } };
    mount(s);
    expect(box().checked).toBe(false);
  });

  test("a leg split across buses cannot be locked from a hand-made ride", () => {
    mount({ ...makeState({ split: true }), rides: [handRide] });
    expect(box().disabled).toBe(true);
  });
});
