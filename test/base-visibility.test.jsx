import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ScheduleScreen } from "../src/screens/ScheduleScreen.jsx";
import { baseOf } from "../src/domain/logic.js";

/*
 * A missing depot says nothing about itself, yet without one the schedule reverts to
 * the old arithmetic and treats every gap as unpaid free time.
 *
 * The trap: adding a depot on the Data tab does NOT by itself select it, either on
 * the club or on the vehicles. baseOf stays null and nothing changes.
 */

const settings = { arriveEarlyMin: 10, departAfterMin: 10, calloutFee: 1500, dwellMin: 2,
  estSpeedKmh: 60, fallbackLegMin: 12, preferredBias: 0, defaultBaseId: null };

const makeState = ({ bases = [], defaultBaseId = null, vehicleBase = null } = {}) => ({
  stations: [], venues: [], bases,
  vehicles: [{ id: "b1", name: "Busz", plate: "AB-1", seats: 8, hasVignette: false, baseId: vehicleBase }],
  drivers: [{ id: "d1", name: "Anna", wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: null }],
  teams: [], trainings: [], rides: [], assignments: {}, matrix: null,
  settings: { ...settings, defaultBaseId },
});
const KLUB = { id: "h1", name: "Klub telephely", address: "", note: "", lat: 46.27, lon: 19.88 };

let container, root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
});

function mount(state, update = () => {}) {
  act(() => {
    root = createRoot(container);
    root.render(<ScheduleScreen state={state} update={update} />);
  });
}
const btn = (text) => [...container.querySelectorAll("button")].find((b) => b.textContent.includes(text));
/* The standing warnings sit behind a toggle now, so the chains start at the top of
   the screen. The toggle still carries the count, which is what keeps a missing
   depot from being silent — but reading the text of a warning means opening it. */
const openWarnings = () => {
  const t = btn("figyelmeztetés");
  if (t) act(() => t.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  return t;
};

describe("a telephely hiánya nem maradhat némán", () => {
  test("felvett, de ki nem választott telephely: a baseOf még null", () => {
    const s = makeState({ bases: [KLUB] });          // csak felvéve, sehol kiválasztva
    expect(baseOf(s, "b1")).toBe(null);
  });

  test("ilyenkor a Beosztás figyelmeztet, és egy kattintással beállítható", () => {
    let next = null;
    const s = makeState({ bases: [KLUB] });
    mount(s, (fn) => { next = fn(s); });
    // Összecsukva is látszik, hogy van mit elintézni — csak a szövege van egy
    // kattintásra.
    expect(openWarnings()).toBeTruthy();
    expect(container.textContent).toContain("hazamehet");
    const fix = btn("beállítása klubtelephelynek");
    expect(fix).toBeTruthy();
    act(() => fix.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(next.settings.defaultBaseId).toBe("h1");
  });

  test("telephely nélkül a felvételre irányít", () => {
    mount(makeState());
    openWarnings();
    expect(container.textContent).toContain("Adatok → Telephelyek");
  });

  test("a figyelmeztetés összecsukva sem néma: a gomb kiírja, hogy van", () => {
    mount(makeState({ bases: [KLUB] }));
    const t = btn("figyelmeztetés");
    expect(t).toBeTruthy();
    expect(t.textContent).toContain("1 figyelmeztetés");
    expect(t.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("hazamehet");   // a szöveg még rejtve
  });

  test("kiválasztott klubtelephellyel nincs figyelmeztetés", () => {
    mount(makeState({ bases: [KLUB], defaultBaseId: "h1" }));
    expect(btn("figyelmeztetés")).toBeFalsy();       // nincs mit összecsukni
    expect(container.textContent).not.toContain("hazamehet");
  });

  test("a jármű saját telephelye is elég", () => {
    mount(makeState({ bases: [KLUB], vehicleBase: "h1" }));
    expect(btn("figyelmeztetés")).toBeFalsy();
    expect(container.textContent).not.toContain("hazamehet");
  });
});

describe("a várakozás a napi mutatók között", () => {
  test("ott van a saját mezője", () => {
    mount(makeState({ bases: [KLUB], defaultBaseId: "h1" }));
    const tiles = [...container.querySelectorAll(".stat")].map((t) => t.textContent);
    expect(tiles.some((t) => t.includes("várakozás"))).toBe(true);
    expect(tiles.some((t) => t.includes("fizetett idő"))).toBe(true);
  });
});
