/* Fuvarterv — the printed day sheets: one page per driver.

   Deliberately NOT a PDF library. The browser's own "Save as PDF" already produces
   a PDF, and going through a library would mean shipping an embedded Unicode font
   just so ő and ű survive, on top of a bundle that is already one large chunk.

   The sheets reuse the driver tab's own components rather than restating the
   layout. A driver's phone and a driver's sheet then cannot show different times:
   the same rides, the same shift grouping, the same depot runs, only printed. */

import { Printer, X } from "lucide-react";
import { DAYS } from "../domain/constants.js";
import { weekdayIdx, fmtDate, minToTime } from "../domain/datetime.js";
import { driverDayRides } from "../domain/logic.js";
import { driverDayShifts, driverPay, rideUse } from "../domain/optimizer.js";
import { fmtH } from "../ui/format.js";
import { EmptyState } from "../ui/base.jsx";
import { RideCard, DepotRow } from "./DriverScreen.jsx";

/* Only drivers who actually drive that day. A blank sheet in a pile of handouts
   invites the question "did mine not print?", which is worse than no sheet. */
export function driversWithWork(state, dateISO) {
  return state.drivers
    .map((driver) => ({ driver, entries: driverDayRides(state, driver.id, dateISO) }))
    .filter((x) => x.entries.length > 0);
}

export function DriverSheet({ state, driver, entries, dateISO }) {
  const shifts = driverDayShifts(state, entries);
  /* The same figure the schedule bills, minimum shift included, so a driver can
     check their sheet against their pay without a second calculation. */
  const { paid } = driverPay(state, driver, entries.map((e) => rideUse(state, e.ride, e.training)));

  return (
    <section className="print-sheet">
      <header className="print-head">
        <div>
          <div className="disp" style={{ fontSize: 26, lineHeight: 1.1 }}>{driver.name}</div>
          {driver.phone && <div className="text-sm" style={{ color: "var(--ink2)" }}>{driver.phone}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="disp" style={{ fontSize: 18 }}>{DAYS[weekdayIdx(dateISO)]}</div>
          <div className="text-sm tnum" style={{ color: "var(--ink2)" }}>{fmtDate(dateISO)}</div>
        </div>
      </header>

      <div className="print-summary tnum">
        {shifts.map((sh, i) => (
          <span key={i}>{minToTime(sh.start)}–{minToTime(sh.end)}</span>
        ))}
        <span>{entries.length} fuvar</span>
        <span>fizetett: <b>{fmtH(paid)}</b></span>
      </div>

      <div className="flex flex-col gap-4">
        {shifts.map((sh, si) => (
          <div key={si} className="flex flex-col gap-4">
            {sh.out && <DepotRow state={state} leg={sh.out} kind="out" />}
            {sh.rows.map(({ ride, training }) => (
              /* isToday is false on paper: a "next stop" marker would be a lie the
                 moment the sheet leaves the printer. */
              <RideCard key={ride.id} state={state} ride={ride} training={training}
                isToday={false} nowMin={0} />
            ))}
            {sh.back && <DepotRow state={state} leg={sh.back} kind="back" />}
          </div>
        ))}
      </div>
    </section>
  );
}

export function PrintSheets({ state, dateISO, onClose }) {
  const sheets = driversWithWork(state, dateISO);

  return (
    <div className="print-overlay">
      <div className="print-bar noprint">
        <button className="iconbtn" onClick={onClose} aria-label="Bezárás"><X size={18} /></button>
        <span className="disp text-base">
          Napi lapok — {DAYS[weekdayIdx(dateISO)]} {fmtDate(dateISO)}
        </span>
        <span className="text-sm" style={{ color: "var(--ink2)" }}>
          {sheets.length} sofőr, laponként egy
        </span>
        <button className="btn btn-pri ml-auto" onClick={() => window.print()} disabled={!sheets.length}>
          <Printer size={16} /> Nyomtatás
        </button>
      </div>

      <div className="print-page">
        {sheets.length === 0 ? (
          <EmptyState>
            Erre a napra egyik sofőrnek sincs fuvarja. Előbb futtasd az optimalizálást,
            majd a <b>Fuvarok generálása a beosztásból</b> gombot.
          </EmptyState>
        ) : (
          sheets.map(({ driver, entries }) => (
            <DriverSheet key={driver.id} state={state} driver={driver} entries={entries} dateISO={dateISO} />
          ))
        )}
      </div>
    </div>
  );
}
