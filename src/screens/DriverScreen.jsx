/* Fuvarterv — the driver view: one day's route, in large type.

   This is the only screen a driver-role user sees, and it is read-only. Designed for
   a phone propped on a dashboard, so everything is big and the next stop is obvious
   at a glance. */

import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Warehouse } from "lucide-react";
import { DAYS, byId } from "../domain/constants.js";
import { toISO, addDays, parseISO, weekdayIdx, timeToMin, minToTime, fmtDate } from "../domain/datetime.js";
import { seatSum, venueDepartMin, driverDayRides } from "../domain/logic.js";
import { driverDayShifts } from "../domain/optimizer.js";
import { locName, locOf } from "../domain/geo.js";
import { PlateChip, TeamDot, EmptyState, InfoDot } from "../ui/base.jsx";

/* ---------- Driver view ---------- */

/* The driver matching the signed-in user, linked by the e-mail address entered on
   the driver's record. With no match it falls back to the first driver, so browsing
   as an admin (or in a test, with no e-mail at all) behaves exactly as before. */
export function defaultDriverId(drivers, myEmail) {
  const em = (myEmail || "").trim().toLowerCase();
  const mine = em && drivers.find((d) => (d.email || "").trim().toLowerCase() === em);
  return (mine || drivers[0])?.id || "";
}

/* A depot run on the driver's own sheet. Dashed, and deliberately quieter than a
   pickup: it is a trip they make, but nobody is waiting at the end of it. */
export function DepotRow({ state, leg, kind }) {
  const out = kind === "out";
  const base = locOf(state, leg.baseId);
  return (
    <div className="card p-3" style={{ borderStyle: "dashed" }}>
      <div className="flex items-baseline gap-3 flex-wrap">
        <Warehouse size={18} aria-hidden style={{ alignSelf: "center", color: "var(--ink2)" }} />
        <span className="tnum" style={{ fontSize: 24, lineHeight: 1 }}>{minToTime(out ? leg.depart : leg.arrive)}</span>
        <span className="font-semibold" style={{ fontSize: 17 }}>{out ? "kiállás" : "beállás"}</span>
        <span style={{ fontSize: 17, color: "var(--ink2)" }}>{locName(state, leg.baseId)}</span>
        <span className="text-sm ml-auto" style={{ color: "var(--ink2)" }}>{leg.min} p üresjárat</span>
      </div>
      {base?.address && <div className="text-sm mt-1" style={{ color: "var(--ink2)" }}>{base.address}</div>}
    </div>
  );
}

/* One ride, as the driver reads it on a phone. Lifted out of the day loop so the
   shift grouping can wrap it, and so the print sheet can reuse it unchanged. */
export function RideCard({ state, ride, training, isToday, nowMin }) {
  const team = byId(state.teams, training.teamId);
  const venue = byId(state.venues, training.venueId);
  const vehicle = byId(state.vehicles, ride.vehicleId);
  const dir = ride.dir || "oda";
  const nextIdx = isToday ? ride.stops.findIndex((s) => (timeToMin(s.time) ?? 0) >= nowMin) : -1;
  const pax = seatSum(ride.stops);
  const stopRows = ride.stops.map((s, i) => {
    const st = byId(state.stations, s.stationId);
    const past = isToday && (timeToMin(s.time) ?? 0) < nowMin && i !== nextIdx;
    const isNext = i === nextIdx;
    return (
      <div key={s.id} className="rail-row" style={past ? { opacity: 0.45 } : {}}>
        <span className={`rail-dot ${isNext ? "next" : ""}`} aria-hidden />
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="tnum" style={{ fontSize: 28, lineHeight: 1 }}>{s.time || "–:–"}</span>
          <span className="font-semibold" style={{ fontSize: 19 }}>{st?.name || "?"}</span>
          {Number(s.count) > 0 && <span className="text-base" style={{ color: "var(--ink2)" }}>{s.count} fő</span>}
          {isNext && <span className="pill pill-miss disp">KÖVETKEZŐ</span>}
        </div>
        {st?.address && <div className="text-sm mt-1" style={{ color: "var(--ink2)" }}>{st.address}</div>}
      </div>
    );
  });
  const venueRow = (
    <div className="rail-row" key="__venue">
      <span className="rail-dot dest" aria-hidden />
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="tnum" style={{ fontSize: 28, lineHeight: 1, color: "var(--ok)" }}>
          {dir === "vissza" ? minToTime(venueDepartMin(state, training)) : training.start}
        </span>
        <span className="font-semibold" style={{ fontSize: 19 }}>{venue?.name}</span>
      </div>
      <div className="text-sm mt-1" style={{ color: "var(--ink2)" }}>
        {venue?.address ? `${venue.address} · ` : ""}
        {dir === "vissza" ? "innen indul a hazaszállítás" : "eddigre kell a helyszínen lenni"}
      </div>
    </div>
  );
  return (
    <div className="card overflow-hidden">
      <div className="cardhead p-3 flex items-center gap-3" style={{ background: "var(--surface-inv)", color: "var(--on-inv)" }}>
        <TeamDot color={team?.color || "#999"} size={14} />
        <div className="flex-1 min-w-0">
          <div className="disp text-lg truncate flex items-center gap-2">
            <span className={`dirpill ${dir === "vissza" ? "v" : ""}`} style={dir === "vissza" ? { borderColor: "var(--on-inv)", background: "var(--on-inv)", color: "var(--surface-inv)" } : { borderColor: "var(--on-inv)", color: "var(--on-inv)" }}>{dir === "oda" ? "ODA" : "VISSZA"}</span>
            <span className="truncate">{team?.name}</span>
          </div>
          <div className="text-sm" style={{ color: "var(--on-inv)", opacity: .7 }}>edzés {training.start}–{training.end}</div>
        </div>
        {vehicle && <div className="text-right">
          <PlateChip plate={vehicle.plate} />
          <div className="text-xs mt-1" style={{ color: "var(--on-inv)", opacity: .7 }}>{vehicle.name}{pax ? ` · ${pax} fő` : ""}</div>
        </div>}
      </div>
      <div className="rail p-4 flex flex-col" style={{ gap: 18 }}>
        {dir === "vissza" ? [venueRow, ...stopRows] : [...stopRows, venueRow]}
        {ride.stops.length === 0 && <div className="text-sm" style={{ color: "var(--ink2)" }}>Ehhez a fuvarhoz még nincsenek megállók megadva.</div>}
      </div>
    </div>
  );
}

export function DriverScreen({ state, myEmail }) {
  const [selDriverId, setDriverId] = useState(() => defaultDriverId(state.drivers, myEmail));
  const driverId = byId(state.drivers, selDriverId) ? selDriverId : (state.drivers[0]?.id || "");
  const [dateISO, setDateISO] = useState(() => toISO(new Date()));
  const todayISO = toISO(new Date());
  /* Re-render every minute. Without it the "next stop" marker and the dimming of
     past stops froze at the minute the screen was opened, so on a phone left on a
     dashboard the view's whole point never advanced. */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const rides = useMemo(() => driverDayRides(state, driverId, dateISO), [state, driverId, dateISO]);

  /* Rides grouped into turn-outs, each bracketed by its real depot runs. Derived
     here rather than stored: the depot follows the vehicle, so it stays right
     without anything to migrate. */
  const shifts = useMemo(() => driverDayShifts(state, rides), [state, rides]);

  const driver = byId(state.drivers, driverId);

  return (
    <div className="px-4 pb-4">
      <div className="py-3 flex items-center gap-1"><h2 className="disp text-xl">Sofőr nézet</h2><InfoDot align="l" text="Egy sofőr napi fuvarjai, nyomtatható formában. Fent válts sofőrt és napot." /></div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
        {state.drivers.map((d) => (
          <button key={d.id} className={`chip ${d.id === driverId ? "on" : ""}`} onClick={() => setDriverId(d.id)} style={{ whiteSpace: "nowrap" }}>{d.name}</button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <button className="iconbtn" onClick={() => setDateISO(toISO(addDays(parseISO(dateISO), -1)))} aria-label="Előző nap"><ChevronLeft size={18} /></button>
        <button className="disp text-lg" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setDateISO(todayISO)}>
          {DAYS[weekdayIdx(dateISO)]} · {fmtDate(dateISO)} {dateISO === todayISO && <span className="pill pill-miss disp" style={{ verticalAlign: "middle" }}>MA</span>}
        </button>
        <button className="iconbtn" onClick={() => setDateISO(toISO(addDays(parseISO(dateISO), 1)))} aria-label="Következő nap"><ChevronRight size={18} /></button>
      </div>

      {!driver && <EmptyState>Nincs sofőr felvéve. Az Adatok fülön adhatsz hozzá.</EmptyState>}
      {driver && rides.length === 0 && <EmptyState><b>{driver.name}</b> részére erre a napra nincs fuvar.</EmptyState>}

      <div className="flex flex-col gap-4">
        {shifts.map((sh, si) => (
          <div key={si} className="flex flex-col gap-4">
            {sh.out && <DepotRow state={state} leg={sh.out} kind="out" />}
            {sh.rows.map(({ ride, training }) => (
              <RideCard key={ride.id} state={state} ride={ride} training={training}
                isToday={dateISO === todayISO} nowMin={nowMin} />
            ))}
            {sh.back && <DepotRow state={state} leg={sh.back} kind="back" />}
          </div>
        ))}
      </div>
    </div>
  );
}
