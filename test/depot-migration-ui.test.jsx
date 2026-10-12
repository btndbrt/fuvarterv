import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MasterScreen, MasterForm } from "../src/screens/MasterScreen.jsx";
import { ScheduleScreen } from "../src/screens/ScheduleScreen.jsx";
import { DEFAULT_SETTINGS } from "../src/data/storage.js";

/*
 * The depot move on screen: a banner on the Data and Schedule screens, a preview of
 * every change, and one approval that applies it. The vehicle form no longer offers a
 * depot of its own.
 */

const HA = { id: "hA", name: "Ásotthalom", address: "", note: "", lat: 46.20, lon: 19.78 };
const HC = { id: "hC", name: "Csillag tér", address: "", note: "", lat: 46.26, lon: 20.12 };

const makeState = () => ({
  stations: [], venues: [], bases: [HA, HC],
  vehicles: [
    { id: "b1", name: "Kisbusz 1", plate: "AB-1", seats: 8, hasVignette: false, baseId: "hA" },
    { id: "b2", name: "Kisbusz 2", plate: "AB-2", seats: 8, hasVignette: false, baseId: "hC" },
  ],
  drivers: [{ id: "d1", name: "Kovács János", wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: "b1", baseId: null, baseRules: [] }],
  teams: [], trainings: [], rides: [], assignments: {}, matrix: null,
  settings: { ...DEFAULT_SETTINGS, defaultBaseId: "hC" },
});

let container, root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

const render = (el) => act(() => { root = createRoot(container); root.render(el); });
const btn = (text) => [...container.querySelectorAll("button")].find((b) => b.textContent.includes(text));
const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("the Data screen offers the move", () => {
  test("a banner names the buses, the preview lists each change, approval applies it", () => {
    let s = makeState();
    render(<MasterScreen tab="vehicles" state={s} update={(fn) => { s = fn(s); }} notice="" setNotice={() => {}} />);
    expect(container.textContent).toContain("2 járműnek saját telephelye van");
    click(btn("Áthelyezés a sofőrökhöz"));
    expect(container.textContent).toContain("Kisbusz 1 (Ásotthalom) → Kovács János");
    expect(container.textContent).toContain("Kisbusz 2 (Csillag tér)");
    expect(container.textContent).toContain("nincs sofőrje");
    click(btn("Jóváhagyás"));
    expect(s.drivers[0].baseId).toBe("hA");
    expect(s.vehicles.every((v) => v.baseId === null)).toBe(true);
  });

  test("no banner once no bus has a depot", () => {
    const s = makeState();
    s.vehicles = s.vehicles.map((v) => ({ ...v, baseId: null }));
    render(<MasterScreen tab="vehicles" state={s} update={() => {}} notice="" setNotice={() => {}} />);
    expect(btn("Áthelyezés a sofőrökhöz")).toBeUndefined();
  });
});

describe("the Schedule screen offers it too", () => {
  test("among the standing warnings", () => {
    render(<ScheduleScreen state={makeState()} update={() => {}} />);
    click(btn("figyelmeztetés"));
    expect(container.textContent).toContain("2 járműnek saját telephelye van");
    expect(btn("Áthelyezés a sofőrökhöz")).toBeTruthy();
  });
});

describe("the vehicle form", () => {
  test("has no depot picker, and saving keeps a depot not yet moved", () => {
    const saved = [];
    const s = makeState();
    render(<MasterForm kind="vehicles" state={s} entity={s.vehicles[0]} onSave={(x) => saved.push(x)} onCancel={() => {}} />);
    expect([...container.querySelectorAll("label > span")].map((e) => e.textContent.trim())).not.toContain("Telephely");
    click(btn("Mentés"));
    expect(saved[0].baseId).toBe("hA");
  });
});
