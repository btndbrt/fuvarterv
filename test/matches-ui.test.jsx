import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { TrainingForm } from "../src/screens/TeamsScreen.jsx";
import { ScheduleScreen } from "../src/screens/ScheduleScreen.jsx";
import { OccCard } from "../src/ui/OccCard.jsx";
import { DEFAULT_SETTINGS } from "../src/data/storage.js";
import { toISO, weekdayIdx } from "../src/domain/datetime.js";

/*
 * Matches on screen (ADR-33): the training form marks a one-off training as a match
 * and picks its bus and free-text driver; the week card and the Schedule screen mark
 * it; the match chain cannot be locked, unlocked or moved; and edits on a match date
 * go to that date's own plan.
 */

const TODAY = toISO(new Date());
const WD = weekdayIdx(new Date());

let container, root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

const render = (el) => act(() => { root = createRoot(container); root.render(el); });
const btns = (label) => [...container.querySelectorAll("button")].filter((b) => b.textContent.trim() === label || b.getAttribute("aria-label") === label);
const btn = (label) => btns(label)[0];
const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const setValue = (el, value) => act(() => {
  const proto = el.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
});
const checkbox = (label) => [...container.querySelectorAll("label")].find((l) => l.textContent.includes(label))?.querySelector("input[type=checkbox]");

const bus = (id) => ({ id, name: `Busz ${id}`, plate: `${id}-100`, seats: 8, hasVignette: false, baseId: null });
const TEAM = { id: "tmM", name: "U19", color: "#c00", stationIds: ["s1"], venueIds: ["vM"], passengerCount: null,
  stationCounts: { s1: 6 }, routeMode: "auto", routeAnchorId: null, returnStationIds: null, returnStationCounts: {}, returnRouteAnchorId: null };
const MATCH = { id: "trM", teamId: "tmM", venueId: "vM", type: "once", days: [], date: TODAY, start: "10:00", end: "12:00", stops: null,
  match: { vehicleId: "A", driverName: "Kiss edző" } };

function makeState(extra = {}) {
  return {
    stations: [{ id: "s1", name: "Megálló", lat: 46.31, lon: 19.91 }],
    venues: [{ id: "vM", name: "Vendégpálya", lat: 46.40, lon: 20.10, needsVignette: false }],
    bases: [], vehicles: [bus("A"), bus("B")],
    drivers: [{ id: "d1", name: "Anna", wage: 3000, minShiftMin: 60, availability: [], preferredVehicleId: "A", baseId: null, baseRules: [] }],
    teams: [TEAM], trainings: [MATCH], rides: [], assignments: {}, dateAssignments: {}, matrix: null,
    settings: { ...DEFAULT_SETTINGS, fairnessBias: 0 },
    ...extra,
  };
}

describe("the training form", () => {
  const once = { ...MATCH, match: null };

  test("a one-off training can be marked as a match, with a bus and a free-text driver", () => {
    const saved = [];
    render(<TrainingForm state={makeState()} team={TEAM} training={once} onSave={(x) => saved.push(x)} onCancel={() => {}} />);
    act(() => checkbox("Mérkőzés").click());
    setValue(container.querySelector('select[aria-label="A mérkőzés busza"]'), "B");
    setValue(container.querySelector('input[aria-label="A mérkőzés sofőrje"]'), "Kovács (szülő)");
    click(btn("Mentés"));
    expect(saved[0].match).toEqual({ vehicleId: "B", driverName: "Kovács (szülő)" });
  });

  test("unticking it saves an ordinary one-off training", () => {
    const saved = [];
    render(<TrainingForm state={makeState()} team={TEAM} training={MATCH} onSave={(x) => saved.push(x)} onCancel={() => {}} />);
    act(() => checkbox("Mérkőzés").click());
    click(btn("Mentés"));
    expect(saved[0].match).toBe(null);
  });

  test("a weekly training is never a match", () => {
    const saved = [];
    render(<TrainingForm state={makeState()} team={TEAM} training={MATCH} onSave={(x) => saved.push(x)} onCancel={() => {}} />);
    click(btn("Heti"));
    expect(checkbox("Mérkőzés")).toBeUndefined();
    click(btn("H"));
    click(btn("Mentés"));
    expect(saved[0].match).toBe(null);
  });
});

describe("the week card", () => {
  test("marks the match with its bus and driver, also before it has rides", () => {
    render(<OccCard state={makeState()} occ={{ training: MATCH, dayIdx: WD, dateISO: TODAY }} onOpen={() => {}} />);
    expect(container.textContent).toContain("MÉRKŐZÉS");
    expect(container.textContent).toContain("A-100");
    expect(container.textContent).toContain("Kiss edző");
  });

  test("a match ride shows its free-text driver", () => {
    const ride = { id: "r1", trainingId: "trM", day: null, date: TODAY, dir: "oda", vehicleId: "A", driverId: "", driverName: "Kiss edző",
      source: "schedule", stops: [{ id: "x", stationId: "s1", time: "09:30", count: 6 }] };
    render(<OccCard state={makeState({ rides: [ride] })} occ={{ training: MATCH, dayIdx: WD, dateISO: TODAY }} onOpen={() => {}} />);
    const rideLine = [...container.querySelectorAll(".dirpill")][0].parentElement;
    expect(rideLine.textContent).toContain("Kiss edző");
    expect(rideLine.textContent).not.toContain("?");
  });
});

describe("the Schedule screen on a match date", () => {
  test("the match chain is marked, names its driver, and cannot be locked or moved", () => {
    render(<ScheduleScreen state={makeState()} update={() => {}} />);
    const card = [...container.querySelectorAll(".card")].find((c) => c.textContent.includes("Kiss edző"));
    expect(card).toBeTruthy();
    expect(card.textContent).toContain("Mérkőzés");
    const labels = [...card.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
    expect(labels).not.toContain("Lánc zárolása");
    expect(labels).not.toContain("Lánc feloldása");
    expect(labels).not.toContain("Áthelyezés");
  });

  test("a lock toggled on a match date goes to that date's plan, not the template", () => {
    const weekly = { id: "trW", teamId: "tmM", venueId: "vM", type: "weekly", days: [WD], date: null, start: "17:00", end: "18:00", stops: null, match: null };
    const chain = { id: "c1", driverId: "d1", vehicleId: "B", taskIds: [{ id: `trW:${WD}:oda`, locked: false }] };
    let s = makeState({ trainings: [MATCH, weekly], assignments: { [WD]: { chains: [] } }, dateAssignments: { [TODAY]: { chains: [chain] } } });
    render(<ScheduleScreen state={s} update={(fn) => { s = fn(s); }} />);
    click(btn("Zárolás"));
    expect(s.dateAssignments[TODAY].chains[0].taskIds[0].locked).toBe(true);
    expect(s.assignments[WD].chains).toEqual([]);
  });
});
