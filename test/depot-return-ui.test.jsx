import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ScheduleScreen } from "../src/screens/ScheduleScreen.jsx";
import { weekdayIdx, mondayOf } from "../src/domain/datetime.js";
import { genDayTasks } from "../src/domain/optimizer.js";

/*
 * What the Beosztás screen draws when a driver stays out.
 *
 * The chain card used to derive its depot runs and its pay from its own chain alone.
 * A driver holding two chains of ONE shift therefore got a depot run at both ends of
 * both cards: the bus was shown arriving at the depot at 17:03 having already left
 * it at 12:57, and the two cards charged a call-out fee each while the day's total
 * charged one. Rendering by shift is what fixes it.
 *
 * Eger is the fixture because nobody can go home from there, so the two runs are one
 * shift no matter how the chains are recorded.
 */

const WEEKDAY = weekdayIdx(new Date());               // the day the screen opens on
const ZAK = { lat: 46.2745, lon: 19.889 };

function makeState() {
  const s = {
    stations: [{ id: "sZAK", name: "Zákányszék", address: "", note: "", ...ZAK }],
    bases: [{ id: "hZAK", name: "Klub telephely", address: "", note: "", ...ZAK }],
    venues: [{ id: "vEGER", name: "Eger", address: "", note: "", lat: 47.9026, lon: 20.3772, needsVignette: false }],
    vehicles: [{ id: "b1", name: "Busz", plate: "AB-1", seats: 20, hasVignette: true, baseId: null }],
    drivers: [{ id: "d1", name: "Anna", phone: "", wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: null, email: "" }],
    teams: [{
      id: "tm", name: "TM", color: "#000", ageGroup: "", gender: "vegyes",
      stationIds: ["sZAK"], venueIds: ["vEGER"], passengerCount: 10, stationCounts: { sZAK: 10 },
      routeMode: "auto", routeAnchorId: null, returnStationIds: null, returnStationCounts: {}, returnRouteAnchorId: null,
    }],
    trainings: [{
      id: "tr", teamId: "tm", venueId: "vEGER", type: "weekly", days: [WEEKDAY],
      date: null, start: "14:00", end: "16:00", stops: null,
    }],
    rides: [], assignments: {}, matrix: null,
    settings: {
      arriveEarlyMin: 10, departAfterMin: 10, calloutFee: 1500, dwellMin: 2,
      estSpeedKmh: 60, fallbackLegMin: 12, preferredBias: 0, fairnessBias: 0,
      runCostPerMin: 100, defaultBaseId: "hZAK",
    },
  };
  /* Saved as TWO chains for one driver — what a manual move leaves behind, and what
     every schedule saved before this change already holds. */
  const { tasks } = genDayTasks(s, WEEKDAY, mondayOf(new Date()));
  s.assignments = {
    [WEEKDAY]: {
      chains: tasks.map((t, i) => ({
        id: `c${i}`, driverId: "d1", vehicleId: "b1", locked: false,
        taskIds: [{ id: t.id, locked: false }],
      })),
    },
  };
  return s;
}

let container, root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
});

function mount(state) {
  act(() => {
    root = createRoot(container);
    root.render(<ScheduleScreen state={state} update={() => {}} />);
  });
}

const lines = (word) => [...container.querySelectorAll(".linkline")].filter((e) => e.textContent.includes(word));

describe("a two-chain shift is drawn as one turn-out", () => {
  test("one run out of the depot and one back, for the whole shift", () => {
    mount(makeState());
    expect(lines("kiállás")).toHaveLength(1);
    expect(lines("beállás")).toHaveLength(1);
  });

  test("the depot is left before it is returned to", () => {
    mount(makeState());
    const t = (word) => lines(word)[0].querySelector(".tnum").textContent;
    expect(t("kiállás") < t("beállás")).toBe(true);   // 24-hour times sort as strings
  });

  test("between the two chains stands a wait on site, not a trip home", () => {
    mount(makeState());
    expect(lines("várakozás")).toHaveLength(1);
    expect(container.textContent).toContain("Eger");
  });

  test("the second card does not charge a second call-out", () => {
    mount(makeState());
    expect(container.textContent).toContain("ugyanaz a műszak");
    expect(container.textContent).toContain("egy műszak");
  });
});
