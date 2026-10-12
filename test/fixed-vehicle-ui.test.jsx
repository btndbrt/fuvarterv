import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ScheduleScreen } from "../src/screens/ScheduleScreen.jsx";
import { DEFAULT_SETTINGS } from "../src/data/storage.js";

/*
 * The fixed driver–bus pairing switch lives in the Schedule screen's ⚙ panel, next to
 * the preference weight it overrides. It must show the stored value and write the
 * flipped one back through update().
 */

const makeState = (fixedVehicle) => ({
  stations: [], venues: [], bases: [],
  vehicles: [{ id: "b1", name: "Busz", plate: "AB-1", seats: 8, hasVignette: false, baseId: null }],
  drivers: [{ id: "d1", name: "Anna", wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: "b1" }],
  teams: [], trainings: [], rides: [], assignments: {}, matrix: null,
  settings: { ...DEFAULT_SETTINGS, fixedVehicle },
});

let container, root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

function mount(state, update = () => {}) {
  act(() => {
    root = createRoot(container);
    root.render(<ScheduleScreen state={state} update={update} />);
  });
  const gear = container.querySelector('button[aria-label="Paraméterek"]');
  act(() => gear.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}
const pairingBox = () => [...container.querySelectorAll("label")]
  .find((l) => l.textContent.includes("Fix sofőr–jármű párosítás"))?.querySelector("input[type=checkbox]");

describe("the fixed pairing switch", () => {
  test("is off by default and turning it on stores true", () => {
    let next = null;
    const s = makeState(false);
    mount(s, (fn) => { next = fn(s); });
    const box = pairingBox();
    expect(box).toBeTruthy();
    expect(box.checked).toBe(false);
    act(() => box.click());
    expect(next.settings.fixedVehicle).toBe(true);
  });

  test("shows a stored true as checked", () => {
    mount(makeState(true));
    expect(pairingBox().checked).toBe(true);
  });
});
