/* Fuvarterv — the printed week sheet: one driver's rides for the week, as a table.

   Deliberately NOT a PDF library. The browser's own "Save as PDF" already produces
   a PDF, and going through a library would mean shipping an embedded Unicode font
   just so ő and ű survive, on top of a bundle that is already one large chunk.

   The driver is picked first and only then is the table built. A sheet is handed to
   one person, so a stack of every driver's week would be paper nobody asked for.

   The rows come from the same saved rides and the same shift grouping the driver tab
   reads, so a driver's phone and a driver's sheet cannot show different times: the
   same rides, the same depot runs, the same paid time, only laid out as a table. */

import { useState } from "react";
import { ChevronLeft, Printer, X } from "lucide-react";
import { DAYS, byId } from "../domain/constants.js";
import { toISO, addDays, mondayOf, fmtDate, fmtWeekRange, minToTime } from "../domain/datetime.js";
import { driverDayRides, venueDepartMin, seatSum } from "../domain/logic.js";
import { driverDayShifts, driverPay, rideUse } from "../domain/optimizer.js";
import { locName } from "../domain/geo.js";
import { fmtH } from "../ui/format.js";
import { EmptyState, Field } from "../ui/base.jsx";

/* The driver's week, day by day: each day's rides grouped into shifts, and the paid
   time the schedule bills for that day, minimum shift included, so the sheet can be
   checked against the pay without a second calculation. */
export function driverWeek(state, driverId, weekMon) {
  const driver = byId(state.drivers, driverId);
  return DAYS.map((_, weekday) => {
    const dateISO = toISO(addDays(weekMon, weekday));
    const entries = driverDayRides(state, driverId, dateISO);
    return {
      weekday, dateISO, rides: entries.length,
      shifts: driverDayShifts(state, entries),
      paid: entries.length ? driverPay(state, driver, entries.map((e) => rideUse(state, e.ride, e.training))).paid : 0,
    };
  });
}

/* Drivers with at least one ride that week, and how many. Only they are offered: a
   blank sheet reads as a printing failure, not as a week off. */
export function driversWithWeekWork(state, weekMon) {
  return state.drivers
    .map((driver) => ({
      driver,
      rides: DAYS.reduce((n, _, i) => n + driverDayRides(state, driver.id, toISO(addDays(weekMon, i))).length, 0),
    }))
    .filter((x) => x.rides > 0);
}

/* One ride's route on one line, in the order it is driven: outbound the stops lead
   to the venue, on the return leg the venue comes first. The venue times are the
   ones the driver tab shows — arrive by the training's start, leave after its end. */
function routeText(state, ride, training) {
  const stops = ride.stops.map((s) => `${s.time || "–:–"} ${locName(state, s.stationId)}${Number(s.count) > 0 ? ` (${s.count})` : ""}`);
  const venue = locName(state, training.venueId);
  return (ride.dir || "oda") === "vissza"
    ? [`${minToTime(venueDepartMin(state, training))} ${venue}`, ...stops].join(" → ")
    : [...stops, `${training.start} ${venue}`].join(" → ");
}

const plateOf = (state, vehicleId) => byId(state.vehicles, vehicleId)?.plate || "?";

/* One day of the table, as its own <tbody> so a day is never split across pages. The
   day's name spans all its rows; a day without work still gets a row, so a driver
   reading down the sheet sees "free" rather than a gap they have to interpret. */
function DayRows({ state, day }) {
  /* Rows are collected as data first, because the day cell has to open the FIRST
     row and its rowSpan is only known once all of them are counted. */
  const rows = [];
  const depot = (key, kind, time, leg, vehicleId) => rows.push({
    key, className: "depot", time, task: kind,
    route: `${locName(state, leg.fromId)} → ${locName(state, leg.toId)} (${leg.min} p üresjárat)`,
    plate: plateOf(state, vehicleId), pax: "",
  });
  day.shifts.forEach((sh, si) => {
    const first = sh.rows[0].ride, last = sh.rows[sh.rows.length - 1].ride;
    if (sh.out) depot(`out${si}`, "Kiállás", sh.out.depart, sh.out, first.vehicleId);
    for (const { ride, training, use } of sh.rows) {
      rows.push({
        key: ride.id, className: "", time: use.start,
        task: (
          <>
            <b>{byId(state.teams, training.teamId)?.name || "?"}</b>
            <span className="dir">{(ride.dir || "oda") === "vissza" ? "VISSZA" : "ODA"}</span>
          </>
        ),
        route: routeText(state, ride, training),
        plate: plateOf(state, ride.vehicleId),
        pax: seatSum(ride.stops) || "",
      });
    }
    if (sh.back) depot(`back${si}`, "Beállás", sh.back.arrive, sh.back, last.vehicleId);
  });

  const dayCell = (
    <td className="day" rowSpan={Math.max(rows.length, 1)}>
      <div>{DAYS[day.weekday]}</div>
      <div className="sub">{fmtDate(day.dateISO)}</div>
      {day.rides > 0 && <div className="sub">fizetett: {fmtH(day.paid)}</div>}
    </td>
  );
  if (!rows.length) return (
    <tbody><tr>{dayCell}<td colSpan={5} className="empty">Nincs fuvar</td></tr></tbody>
  );
  return (
    <tbody>
      {rows.map((r, i) => (
        <tr key={r.key} className={r.className}>
          {i === 0 && dayCell}
          <td className="time">{minToTime(r.time)}</td>
          <td>{r.task}</td>
          <td>{r.route}</td>
          <td>{r.plate}</td>
          <td className="num">{r.pax}</td>
        </tr>
      ))}
    </tbody>
  );
}

export function DriverWeekTable({ state, driver, weekMon }) {
  const days = driverWeek(state, driver.id, weekMon);
  const rides = days.reduce((a, d) => a + d.rides, 0);
  const paid = days.reduce((a, d) => a + d.paid, 0);

  return (
    <section className="print-sheet">
      <header className="print-head">
        <div>
          <div className="disp" style={{ fontSize: 26, lineHeight: 1.1 }}>{driver.name}</div>
          {driver.phone && <div className="text-sm" style={{ color: "var(--ink2)" }}>{driver.phone}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="disp" style={{ fontSize: 18 }}>Heti menetrend</div>
          <div className="text-sm tnum" style={{ color: "var(--ink2)" }}>{fmtWeekRange(weekMon)}</div>
        </div>
      </header>

      <div className="print-summary tnum">
        <span>{rides} fuvar</span>
        <span>fizetett: <b>{fmtH(paid)}</b></span>
      </div>

      <div className="print-scroll">
        <table className="print-table">
          <thead>
            <tr><th>Nap</th><th>Idő</th><th>Feladat</th><th>Útvonal</th><th>Jármű</th><th className="num">Fő</th></tr>
          </thead>
          {days.map((d) => <DayRows key={d.weekday} state={state} day={d} />)}
        </table>
      </div>
    </section>
  );
}

export function PrintSheets({ state, weekMonISO, onClose }) {
  const weekMon = mondayOf(weekMonISO);
  const candidates = driversWithWeekWork(state, weekMon);
  const [pick, setPick] = useState("");
  const [driverId, setDriverId] = useState(null);
  const driver = driverId ? byId(state.drivers, driverId) : null;

  return (
    <div className="print-overlay">
      <div className="print-bar noprint">
        <button className="iconbtn" onClick={onClose} aria-label="Bezárás"><X size={18} /></button>
        <span className="disp text-base">Heti menetrend — {fmtWeekRange(weekMon)}</span>
        {driver && (
          <button className="btn btn-ghost" onClick={() => setDriverId(null)}><ChevronLeft size={16} /> Másik sofőr</button>
        )}
        <button className="btn btn-pri ml-auto" onClick={() => window.print()} disabled={!driver}>
          <Printer size={16} /> Nyomtatás
        </button>
      </div>

      <div className="print-page">
        {driver ? (
          <DriverWeekTable state={state} driver={driver} weekMon={weekMon} />
        ) : candidates.length === 0 ? (
          <EmptyState>
            Ezen a héten egyik sofőrnek sincs fuvarja. Futtasd a Beosztás fülön a
            <b> Heti beosztás optimalizálása</b> gombot, és alkalmazd a javaslatot.
          </EmptyState>
        ) : (
          <div className="card p-4 noprint" style={{ maxWidth: 420, margin: "0 auto" }}>
            <Field label="Melyik sofőr heti menetrendjét nyomtatod?">
              <select className="inp" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">– válassz sofőrt –</option>
                {candidates.map(({ driver: d, rides }) => <option key={d.id} value={d.id}>{d.name} ({rides} fuvar)</option>)}
              </select>
            </Field>
            <button className="btn btn-pri w-full" disabled={!pick} onClick={() => setDriverId(pick)}>
              Menetrend megjelenítése
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
