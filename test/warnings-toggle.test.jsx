import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ScheduleScreen } from "../src/screens/ScheduleScreen.jsx";
import { weekdayIdx } from "../src/domain/datetime.js";

/*
 * The Beosztás screen's standing warnings live behind one toggle.
 *
 * They used to stack above the chains, so on a day with a few skipped teams the
 * schedule itself started well below the fold and the screen was hard to read. The
 * list is the same; only its placement changed.
 *
 * The line it must not cross is ADR-24: nothing is dropped without saying so. So the
 * toggle carries the count, keeps the warning colour, and is absent only when there
 * is genuinely nothing to report. Transient feedback (the `msg` line after pressing
 * a button) is deliberately NOT in here — it belongs where the user is looking.
 */

const WEEKDAY = weekdayIdx(new Date());
const ZAK = { lat: 46.2745, lon: 19.889 };

/* A team with no stations assigned skips both its legs, which is two warnings; the
   bus without a depot is a third. */
const makeState = ({ withDepot = false, stationIds = [] } = {}) => ({
  stations: [{ id: "sZAK", name: "Zákányszék", address: "", note: "", ...ZAK }],
  bases: [{ id: "hZAK", name: "Klub telephely", address: "", note: "", ...ZAK }],
  venues: [{ id: "vSZE", name: "Csarnok", address: "", note: "", lat: 46.2530, lon: 20.1414, needsVignette: false }],
  vehicles: [{ id: "b1", name: "Busz", plate: "AB-1", seats: 20, hasVignette: true, baseId: null }],
  drivers: [{ id: "d1", name: "Anna", phone: "", wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: null, email: "" }],
  teams: [{
    id: "tm", name: "Csapat", color: "#000", ageGroup: "", gender: "vegyes",
    stationIds, venueIds: ["vSZE"], passengerCount: 10, stationCounts: {},
    routeMode: "auto", routeAnchorId: null, returnStationIds: null, returnStationCounts: {}, returnRouteAnchorId: null,
  }],
  trainings: [{
    id: "tr", teamId: "tm", venueId: "vSZE", type: "weekly", days: [WEEKDAY],
    date: null, start: "16:00", end: "18:00", stops: null,
  }],
  rides: [], assignments: {}, matrix: null,
  settings: {
    arriveEarlyMin: 10, departAfterMin: 10, calloutFee: 1500, dwellMin: 2,
    estSpeedKmh: 60, fallbackLegMin: 12, preferredBias: 0, fairnessBias: 0,
    runCostPerMin: 100, defaultBaseId: withDepot ? "hZAK" : null,
  },
});

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

const toggle = () => [...container.querySelectorAll("button.banner")][0];
const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const banners = () => [...container.querySelectorAll(".banner")];

describe("the schedule's warnings open from one button", () => {
  test("collapsed, the day shows a count and nothing else", () => {
    mount(makeState());
    const t = toggle();
    expect(t).toBeTruthy();
    expect(t.textContent).toContain("3 figyelmeztetés");   // two skipped legs, one depot
    expect(banners()).toHaveLength(1);                     // the toggle is the only one
    expect(container.textContent).not.toContain("nincs állomás rendelve");
  });

  test("opening it shows every warning, closing it puts them away again", () => {
    mount(makeState());
    click(toggle());
    expect(banners()).toHaveLength(4);                     // the toggle plus its three
    expect(container.textContent).toContain("nincs állomás rendelve");
    expect(container.textContent).toContain("sincs telephelye");   // „Egy járműnek sincs telephelye”
    expect(toggle().getAttribute("aria-expanded")).toBe("true");

    click(toggle());
    expect(banners()).toHaveLength(1);
    expect(container.textContent).not.toContain("nincs állomás rendelve");
  });

  test("a clean day has no button at all", () => {
    mount(makeState({ withDepot: true, stationIds: ["sZAK"] }));
    expect(toggle()).toBeFalsy();
  });

  test("the count follows what is actually wrong", () => {
    // Give the team its stations back and only the depot warning is left.
    mount(makeState({ stationIds: ["sZAK"] }));
    expect(toggle().textContent).toContain("1 figyelmeztetés");
  });

  test("the schedule itself is what sits at the top of the list", () => {
    /* The point of the change: with the warnings folded away, the first thing under
       the toggle is the day's work, not a stack of banners. */
    mount(makeState({ stationIds: ["sZAK"] }));
    const cards = [...container.querySelectorAll(".card")];
    const after = cards.filter((c) => toggle().compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after.length).toBeGreaterThan(0);
    expect(banners()).toHaveLength(1);
  });
});
