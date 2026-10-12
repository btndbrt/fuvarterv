import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { RideEditor } from "../src/screens/RideScreen.jsx";
import { ScheduleScreen } from "../src/screens/ScheduleScreen.jsx";
import { OccCard } from "../src/ui/OccCard.jsx";
import { DEFAULT_SETTINGS } from "../src/data/storage.js";
import { toISO, weekdayIdx, addDays } from "../src/domain/datetime.js";

/*
 * Ad hoc trips on screen (ADR-35): the ride editor of one occurrence of a weekly
 * training sets "a coach or parent drives on this day", with buses and free-text
 * names; the week card marks that date only; the Schedule screen shows the trip's card.
 */

const TODAY = toISO(new Date());
const WD = weekdayIdx(new Date());
const NEXT = toISO(addDays(new Date(), 7));

let container, root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

const render = (el) => act(() => { root = createRoot(container); root.render(el); });
const btn = (label) => [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === label || b.getAttribute("aria-label") === label);
const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const setValue = (el, value) => act(() => {
  const proto = el.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
});
const checkbox = (label) => [...container.querySelectorAll("label")].find((l) => l.textContent.includes(label))?.querySelector("input[type=checkbox]");

const bus = (id) => ({ id, name: `Busz ${id}`, plate: `${id}-100`, seats: 8, hasVignette: false, baseId: null });
const TEAM = { id: "U12", name: "U12", color: "#c00", stationIds: ["s1"], venueIds: ["v0"], passengerCount: null,
  stationCounts: { s1: 6 }, routeMode: "auto", routeAnchorId: null, returnStationIds: null, returnStationCounts: {}, returnRouteAnchorId: null };
const TR = { id: "trU12", teamId: "U12", venueId: "v0", type: "weekly", days: [WD], date: null, start: "17:00", end: "18:30", stops: null, match: null };
const COACH = { buses: [{ vehicleId: "A", driverName: "Kiss edző" }] };

function makeState(extra = {}) {
  return {
    stations: [{ id: "s1", name: "Megálló", lat: 46.31, lon: 19.91 }],
    venues: [{ id: "v0", name: "Csarnok", lat: 46.35, lon: 19.95, needsVignette: false }],
    bases: [], vehicles: [bus("A"), bus("B")],
    drivers: [{ id: "d1", name: "Anna", wage: 3000, minShiftMin: 60, availability: [], preferredVehicleId: "A", baseId: null, baseRules: [] }],
    teams: [TEAM], trainings: [TR], rides: [], assignments: {}, dateAssignments: {}, adhocTrips: {}, matrix: null,
    settings: { ...DEFAULT_SETTINGS, fairnessBias: 0 },
    ...extra,
  };
}

describe("the ride editor of one occurrence", () => {
  test("sets a coach or parent with a bus for that date only, and saves it", () => {
    let s = makeState();
    render(<RideEditor state={s} update={(fn) => { s = fn(s); }} training={TR} dayIdx={WD} dateISO={TODAY} onBack={() => {}} />);
    act(() => checkbox("Ezen a napon edző vagy szülő viszi").click());
    setValue(container.querySelector('select[aria-label="1. busz"]'), "B");
    setValue(container.querySelector('input[aria-label="1. busz sofőrje"]'), "Kiss edző");
    click(btn("Alkalmi sofőr mentése"));
    expect(s.adhocTrips).toEqual({ [TODAY]: { trU12: { buses: [{ vehicleId: "B", driverName: "Kiss edző" }] } } });
  });

  test("unticking and saving removes it again", () => {
    let s = makeState({ adhocTrips: { [TODAY]: { trU12: COACH } } });
    render(<RideEditor state={s} update={(fn) => { s = fn(s); }} training={TR} dayIdx={WD} dateISO={TODAY} onBack={() => {}} />);
    act(() => checkbox("Ezen a napon edző vagy szülő viszi").click());
    click(btn("Alkalmi sofőr mentése"));
    expect(s.adhocTrips[TODAY]?.trU12).toBeUndefined();
  });

  test("is not offered on a one-off training: a match sets its buses in the training form", () => {
    const once = { ...TR, type: "once", days: [], date: TODAY };
    render(<RideEditor state={makeState({ trainings: [once] })} update={() => {}} training={once} dayIdx={WD} dateISO={TODAY} onBack={() => {}} />);
    expect(checkbox("Ezen a napon edző vagy szülő viszi")).toBeUndefined();
  });
});

describe("the week card", () => {
  test("marks that date with the bus and the driver, and not the next week", () => {
    const s = makeState({ adhocTrips: { [TODAY]: { trU12: COACH } } });
    render(<OccCard state={s} occ={{ training: TR, dayIdx: WD, dateISO: TODAY }} onOpen={() => {}} />);
    expect(container.textContent).toContain("EDZŐ/SZÜLŐ");
    expect(container.textContent).toContain("A-100");
    expect(container.textContent).toContain("Kiss edző");
    act(() => root.unmount()); root = null;
    render(<OccCard state={s} occ={{ training: TR, dayIdx: WD, dateISO: NEXT }} onOpen={() => {}} />);
    expect(container.textContent).not.toContain("EDZŐ/SZÜLŐ");
  });
});

describe("the Schedule screen", () => {
  test("shows the trip as its own card, named as such, without lock or move", () => {
    render(<ScheduleScreen state={makeState({ adhocTrips: { [TODAY]: { trU12: COACH } } })} update={() => {}} />);
    const card = [...container.querySelectorAll(".card")].find((c) => c.textContent.includes("Kiss edző"));
    expect(card.textContent).toContain("Edző/szülő · Kiss edző");
    const labels = [...card.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
    expect(labels).not.toContain("Lánc zárolása");
    expect(labels).not.toContain("Áthelyezés");
  });
});
