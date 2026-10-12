/* Fuvarterv — moving bus depots to drivers (ADR-32).

   Shown wherever a bus still has a depot of its own: a banner, a preview of every
   change, and one approval. Nothing moves until the dispatcher approves it. */

import { useState } from "react";
import { AlertTriangle, Warehouse } from "lucide-react";
import { byId } from "../domain/constants.js";
import { depotMigrationPlan, applyDepotMigration } from "../domain/logic.js";
import { Modal } from "../ui/base.jsx";

export function DepotMigrationBanner({ state, update }) {
  const [open, setOpen] = useState(false);
  const plan = depotMigrationPlan(state);
  if (!plan) return null;
  const n = state.vehicles.filter((v) => v.baseId).length;
  const vName = (id) => byId(state.vehicles, id)?.name || "?";
  const dName = (id) => byId(state.drivers, id)?.name || "?";
  const bName = (id) => byId(state.bases, id)?.name || "?";
  const club = state.settings?.defaultBaseId ? `a klub telephelye (${bName(state.settings.defaultBaseId)})` : "a klub telephelye — ez most nincs megadva";
  return (
    <div className="banner banner-warn mb-3" style={{ display: "block" }}>
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} />
        <b>{n} járműnek saját telephelye van. A telephely mostantól a sofőrhöz tartozik.</b>
      </div>
      <div className="mt-1">
        Amíg nem helyezed át, minden a régi módon számol. Az áthelyezés előtt megmutatjuk, mi változik.
      </div>
      <button className="btn btn-ghost mt-2" onClick={() => setOpen(true)}>
        <Warehouse size={16} /> Áthelyezés a sofőrökhöz
      </button>
      {open && (
        <Modal title="Telephelyek áthelyezése a sofőrökhöz" onClose={() => setOpen(false)}>
          <p className="mb-3">A busz telephelyét az a sofőr kapja meg, akinek ez a saját (preferált) busza.</p>
          <ul className="mb-3" style={{ listStyle: "disc", paddingLeft: 20 }}>
            {plan.moves.map((m) => (
              <li key={`m${m.driverId}`}>{vName(m.vehicleId)} ({bName(m.baseId)}) → {dName(m.driverId)}</li>
            ))}
            {plan.kept.map((k) => (
              <li key={`k${k.driverId}`}>{vName(k.vehicleId)}: {dName(k.driverId)} saját telephelye marad ({bName(k.baseId)})</li>
            ))}
            {plan.orphaned.map((o) => (
              <li key={`o${o.vehicleId}`}>
                {vName(o.vehicleId)} ({bName(o.baseId)}): nincs sofőrje — a telephely elvész, {club} számít.
              </li>
            ))}
          </ul>
          {plan.toClub.length > 0 && (
            <p className="mb-3">
              Saját telephely nélkül marad, ezért mostantól {club} számít náluk, bármelyik buszt kapják:{" "}
              <b>{plan.toClub.map(dName).join(", ")}</b>.
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <button className="btn btn-pri flex-1" onClick={() => { update(applyDepotMigration); setOpen(false); }}>Jóváhagyás</button>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Mégse</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
