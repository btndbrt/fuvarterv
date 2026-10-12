import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ScheduleScreen } from "../src/screens/ScheduleScreen.jsx";
import { driversWithoutBase } from "../src/domain/logic.js";
import { DEFAULT_SETTINGS } from "../src/data/storage.js";

/*
 * The missing-depot warning names drivers, not buses (ADR-32): the depot is the
 * driver's, and a bus has none of its own once the old ones are moved. A driver
 * counts as having one when the lookup would find one for them: their own depot or
 * windows, the club's, or — until the move — the old depot of every bus they could
 * be given.
 */

const H = { id: "h1", name: "Klub telephely", address: "", note: "", lat: 46.27, lon: 19.88 };
const drv = (id, name, extra = {}) => ({ id, name, wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: null, baseId: null, baseRules: [], ...extra });
const makeState = ({ defaultBaseId = null, vehicleBase = null, drivers, fixedVehicle = false } = {}) => ({
  stations: [], venues: [], bases: [H],
  vehicles: [
    { id: "b1", name: "Kisbusz 1", plate: "AB-1", seats: 8, hasVignette: false, baseId: vehicleBase },
    { id: "b2", name: "Kisbusz 2", plate: "AB-2", seats: 8, hasVignette: false, baseId: null },
  ],
  drivers: drivers || [drv("d1", "Anna"), drv("d2", "Béla", { baseId: "h1" })],
  teams: [], trainings: [], rides: [], assignments: {}, matrix: null,
  settings: { ...DEFAULT_SETTINGS, defaultBaseId, fixedVehicle },
});

describe("driversWithoutBase", () => {
  test("drivers with neither a depot of their own nor the club's", () => {
    expect(driversWithoutBase(makeState()).map((d) => d.id)).toEqual(["d1"]);
  });

  test("the club depot covers everyone", () => {
    expect(driversWithoutBase(makeState({ defaultBaseId: "h1" }))).toEqual([]);
  });

  test("time windows count as a depot of their own", () => {
    const s = makeState({ drivers: [drv("d1", "Anna", { baseRules: [{ days: [0], start: "00:00", end: "16:00", baseId: "h1" }] })] });
    expect(driversWithoutBase(s)).toEqual([]);
  });

  test("before the move, an old bus depot covers a driver only if every bus they could get has one", () => {
    expect(driversWithoutBase(makeState({ vehicleBase: "h1" })).map((d) => d.id)).toEqual(["d1"]);
    const pinned = makeState({ vehicleBase: "h1", fixedVehicle: true, drivers: [drv("d1", "Anna", { preferredVehicleId: "b1" })] });
    expect(driversWithoutBase(pinned)).toEqual([]);
  });
});

let container, root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });
const btn = (text) => [...container.querySelectorAll("button")].find((b) => b.textContent.includes(text));
const mount = (state) => act(() => { root = createRoot(container); root.render(<ScheduleScreen state={state} update={() => {}} />); });
const openWarnings = () => act(() => btn("figyelmeztetés").dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("the warning on the Schedule screen", () => {
  test("names the drivers without a depot", () => {
    /* Two depots, so the screen asks to pick one instead of offering the only one. */
    const s = makeState();
    s.bases = [H, { ...H, id: "h2", name: "Másik" }];
    mount(s);
    openWarnings();
    expect(container.textContent).toContain("1 sofőrnek nincs telephelye: Anna");
    expect(container.textContent).not.toContain("járműnek nincs telephelye");
    expect(container.textContent).toContain("add meg a sofőröknél");
  });

  test("says so when no driver has one", () => {
    mount(makeState({ drivers: [drv("d1", "Anna"), drv("d2", "Béla")] }));
    openWarnings();
    expect(container.textContent).toContain("Egy sofőrnek sincs telephelye");
  });

  test("is gone with a club depot", () => {
    mount(makeState({ defaultBaseId: "h1" }));
    expect(btn("figyelmeztetés")).toBeFalsy();
  });
});
