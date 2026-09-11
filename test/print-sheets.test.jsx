import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { weekdayIdx } from "../src/domain/datetime.js";
import { driversWithWork, PrintSheets, DriverSheet } from "../src/screens/PrintSheets.jsx";

/*
 * The printed day sheets. Two things matter more than layout here:
 *
 *   a driver with no work that day gets no page at all, because a blank sheet in a
 *   pile of handouts reads as a printing failure; and
 *
 *   the sheet is built from the SAVED rides, the same list the driver tab reads, so
 *   paper and phone cannot disagree.
 */

const DATE = "2025-01-08";               // Wednesday
const WEEKDAY = weekdayIdx(DATE);

const settings = { arriveEarlyMin: 10, departAfterMin: 10, calloutFee: 1500, dwellMin: 2,
  estSpeedKmh: 60, fallbackLegMin: 12, preferredBias: 0, defaultBaseId: "h1" };

function makeState({ defaultBaseId = "h1" } = {}) {
  return {
    stations: [{ id: "s1", name: "Zákányszék", address: "Fő tér 1.", lat: 46.2745, lon: 19.889 }],
    bases: [{ id: "h1", name: "Klub telephely", address: "Telephely u. 2.", lat: 46.2745, lon: 19.889 }],
    venues: [{ id: "v1", name: "Városi Sportcsarnok", address: "", lat: 46.4, lon: 20.1, needsVignette: false }],
    vehicles: [{ id: "b1", name: "Busz", plate: "AB-123", seats: 20, hasVignette: false, baseId: null }],
    drivers: [
      { id: "d1", name: "Anna", phone: "+36 30 111 2222", wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: null },
      { id: "d2", name: "Béla", phone: "", wage: 3000, minShiftMin: 0, availability: [], preferredVehicleId: null },
    ],
    teams: [{ id: "tm", name: "U12 lányok", color: "#c33", stationIds: ["s1"], venueIds: ["v1"],
      passengerCount: 10, stationCounts: { s1: 10 }, routeMode: "auto", routeAnchorId: null,
      returnStationIds: null, returnStationCounts: {}, returnRouteAnchorId: null }],
    trainings: [{ id: "tr", teamId: "tm", venueId: "v1", type: "weekly", days: [WEEKDAY],
      date: null, start: "16:00", end: "18:00", stops: null }],
    /* Anna drives; Béla is on the books but has nothing on this day. */
    rides: [
      { id: "r1", trainingId: "tr", day: WEEKDAY, date: null, vehicleId: "b1", driverId: "d1", dir: "oda",
        stops: [{ id: "r1s1", stationId: "s1", time: "15:20", count: 10 }] },
      { id: "r2", trainingId: "tr", day: WEEKDAY, date: null, vehicleId: "b1", driverId: "d1", dir: "vissza",
        stops: [{ id: "r2s1", stationId: "s1", time: "18:45", count: 10 }] },
    ],
    assignments: {}, matrix: null,
    settings: { ...settings, defaultBaseId },
  };
}

let container, root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

function mount(el) {
  act(() => { root = createRoot(container); root.render(el); });
}

describe("who gets a sheet", () => {
  test("only drivers who actually drive that day", () => {
    const s = makeState();
    const out = driversWithWork(s, DATE);
    expect(out.map((x) => x.driver.name)).toEqual(["Anna"]);
    expect(out[0].entries).toHaveLength(2);
  });

  test("a different day produces no sheets at all", () => {
    expect(driversWithWork(makeState(), "2025-01-09")).toEqual([]);
  });

  test("with no rides saved nobody is printed, and the screen says why", () => {
    const s = makeState();
    s.rides = [];
    expect(driversWithWork(s, DATE)).toEqual([]);
    mount(<PrintSheets state={s} dateISO={DATE} onClose={() => {}} />);
    expect(container.textContent).toContain("egyik sofőrnek sincs fuvarja");
    // Nothing to print, so the button must not offer to.
    const print = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Nyomtatás"));
    expect(print.disabled).toBe(true);
  });
});

describe("what one sheet says", () => {
  test("the driver, the day and both rides", () => {
    const s = makeState();
    const { driver, entries } = driversWithWork(s, DATE)[0];
    mount(<DriverSheet state={s} driver={driver} entries={entries} dateISO={DATE} />);
    expect(container.textContent).toContain("Anna");
    expect(container.textContent).toContain("+36 30 111 2222");
    expect(container.textContent).toContain("Szerda");
    expect(container.textContent).toContain("U12 lányok");
    expect(container.textContent).toContain("2 fuvar");
    expect(container.textContent).toContain("15:20");
    expect(container.textContent).toContain("18:45");
  });

  /* The whole point of doing depot runs before printing: the sheet is where a
     driver finds out what time to leave the yard. */
  test("the depot runs are on the paper, at both ends of the shift", () => {
    const s = makeState();
    const { driver, entries } = driversWithWork(s, DATE)[0];
    mount(<DriverSheet state={s} driver={driver} entries={entries} dateISO={DATE} />);
    expect(container.textContent).toContain("kiállás");
    expect(container.textContent).toContain("beállás");
    expect(container.textContent).toContain("Klub telephely");
  });

  test("with no depot configured the sheet simply omits those lines", () => {
    const s = makeState({ defaultBaseId: null });
    const { driver, entries } = driversWithWork(s, DATE)[0];
    mount(<DriverSheet state={s} driver={driver} entries={entries} dateISO={DATE} />);
    expect(container.textContent).not.toContain("kiállás");
    expect(container.textContent).toContain("U12 lányok");
  });

  /* "Next stop" is a live marker. On paper it would be a lie from the moment the
     sheet leaves the printer, so it must never be rendered there. */
  test("no live next-stop marker is printed", () => {
    const s = makeState();
    const { driver, entries } = driversWithWork(s, DATE)[0];
    mount(<DriverSheet state={s} driver={driver} entries={entries} dateISO={DATE} />);
    expect(container.textContent).not.toContain("KÖVETKEZŐ");
  });
});

describe("the button that opens all this", () => {
  /* The schedule screen cannot render the overlay itself, so it fires an event and
     the app shell picks it up. Nothing else connects the two. */
  test("the schedule screen fires the print event for the day on screen", async () => {
    const { ScheduleScreen } = await import("../src/screens/ScheduleScreen.jsx");
    const s = makeState();
    /* mondayOf(today) decides which date the screen is showing, so the rides are
       moved onto whichever weekday the run happens to land on. */
    const { mondayOf, toISO, addDays, weekdayIdx } = await import("../src/domain/datetime.js");
    const today = weekdayIdx(new Date());
    s.trainings[0].days = [today];
    s.rides.forEach((r) => { r.day = today; });
    const expected = toISO(addDays(mondayOf(new Date()), today));

    let fired = null;
    const onPrint = (e) => { fired = e.detail; };
    window.addEventListener("fuvarterv:print", onPrint);
    try {
      mount(<ScheduleScreen state={s} update={() => {}} />);
      const b = [...container.querySelectorAll("button")].find((x) => x.textContent.includes("Napi lapok nyomtatása"));
      expect(b).toBeTruthy();
      expect(b.disabled).toBe(false);
      expect(b.textContent).toContain("1 sofőr");
      act(() => b.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      expect(fired).toEqual({ dateISO: expected });
    } finally {
      window.removeEventListener("fuvarterv:print", onPrint);
    }
  });

  test("with no rides that day the button refuses to open an empty stack", async () => {
    const { ScheduleScreen } = await import("../src/screens/ScheduleScreen.jsx");
    const s = makeState();
    s.rides = [];
    mount(<ScheduleScreen state={s} update={() => {}} />);
    const b = [...container.querySelectorAll("button")].find((x) => x.textContent.includes("Napi lapok nyomtatása"));
    expect(b.disabled).toBe(true);
  });
});

describe("the sheet stack", () => {
  test("one page element per driver with work", () => {
    const s = makeState();
    mount(<PrintSheets state={s} dateISO={DATE} onClose={() => {}} />);
    expect(container.querySelectorAll(".print-sheet")).toHaveLength(1);
    expect(container.textContent).toContain("1 sofőr");
  });

  test("a second driver with rides gets their own page", () => {
    const s = makeState();
    s.rides.push({ id: "r3", trainingId: "tr", day: WEEKDAY, date: null, vehicleId: "b1", driverId: "d2",
      dir: "oda", stops: [{ id: "r3s1", stationId: "s1", time: "15:20", count: 4 }] });
    mount(<PrintSheets state={s} dateISO={DATE} onClose={() => {}} />);
    expect(container.querySelectorAll(".print-sheet")).toHaveLength(2);
    expect(container.textContent).toContain("Béla");
  });

  /* The toolbar drives the browser's print dialog and must never reach paper. */
  test("the toolbar is marked as not printable", () => {
    const s = makeState();
    mount(<PrintSheets state={s} dateISO={DATE} onClose={() => {}} />);
    expect(container.querySelector(".print-bar").classList.contains("noprint")).toBe(true);
  });
});
