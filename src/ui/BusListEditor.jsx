/* Fuvarterv — the list of buses a trip brings of its own, each with a free-text driver
   (a coach or a parent, who needs no user record). Shared by the training form (a
   match, ADR-33) and the ride editor (an ad hoc trip, ADR-35), so the two read and
   behave the same. */

import { Plus } from "lucide-react";
import { Field } from "./base.jsx";

/* `pax` is the team's headcount, for the "how many buses" hint: headcount over the
   smallest picked bus. A guide only; the plan splits by stops, which can need one more. */
export function BusListEditor({ state, buses, onChange, pax }) {
  const seatList = buses.map((b) => Number(state.vehicles.find((v) => v.id === b.vehicleId)?.seats) || 0).filter((n) => n > 0);
  const seat = seatList.length ? Math.min(...seatList) : 0;
  const needed = seat && pax ? Math.ceil(pax / seat) : 0;
  const set = (i, patch) => onChange(buses.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <>
      {buses.map((b, i) => (
        <div key={i} className="grid grid-cols-2 gap-3 items-end">
          <Field label={`${i + 1}. busz *`}>
            <select className="inp" aria-label={`${i + 1}. busz`} value={b.vehicleId}
              onChange={(e) => set(i, { vehicleId: e.target.value })}>
              {state.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.plate})</option>)}
            </select>
          </Field>
          <Field label="Sofőr" hint={i === 0 ? "Edző vagy szülő — nem kell felhasználónak lennie." : undefined}>
            <div className="flex gap-2">
              <input className="inp" aria-label={`${i + 1}. busz sofőrje`} value={b.driverName || ""} placeholder="pl. Kiss edző"
                onChange={(e) => set(i, { driverName: e.target.value })} />
              {buses.length > 1 && (
                <button className="iconbtn" aria-label={`${i + 1}. busz törlése`}
                  onClick={() => onChange(buses.filter((_, j) => j !== i))}>×</button>
              )}
            </div>
          </Field>
        </div>
      ))}
      <button className="btn btn-ghost mb-2"
        onClick={() => onChange([...buses, { vehicleId: state.vehicles.find((v) => !buses.some((x) => x.vehicleId === v.id))?.id || state.vehicles[0]?.id || "", driverName: "" }])}>
        <Plus size={15} /> Busz hozzáadása
      </button>
      {needed > 0 && (
        <div className={`text-sm mb-3 ${needed > buses.length ? "banner banner-warn" : ""}`} style={needed > buses.length ? undefined : { color: "var(--ink2)" }}>
          A csapat {pax} fő, egy buszra {seat} fér, ezért legalább {needed} busz kell{needed > buses.length ? ` — még ${needed - buses.length} hiányzik.` : "."}
        </div>
      )}
    </>
  );
}

/* A fresh one-bus list: the first bus, no driver name yet. */
export const firstBus = (state) => [{ vehicleId: state.vehicles[0]?.id || "", driverName: "" }];
