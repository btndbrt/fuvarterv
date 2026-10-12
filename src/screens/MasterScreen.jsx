/* Fuvarterv — master data: stations, venues, depots, vehicles, drivers. */

import { useState } from "react";
import { Plus, Pencil, AlertTriangle, MapPin, X } from "lucide-react";
import { DAYS_SHORT, uid } from "../domain/constants.js";
import { normalizePlate, plateExists, deleteGuard } from "../domain/logic.js";
import { Field, Check, Modal, DangerBtn, PlateChip, EmptyState } from "../ui/base.jsx";
import { MapPickerModal } from "../ui/MapPicker.jsx";
import { VignettePill } from "../ui/VignettePill.jsx";
import { DepotMigrationBanner } from "./DepotMigration.jsx";

/* ---------- Master data ---------- */
export const MASTER_TABS = [
  { key: "stations", label: "Állomások", sing: "állomás" },
  { key: "venues", label: "Helyszínek", sing: "helyszín" },
  { key: "bases", label: "Telephelyek", sing: "telephely" },
  { key: "vehicles", label: "Járművek", sing: "jármű" },
  { key: "drivers", label: "Sofőrök", sing: "sofőr" },
];

export function MasterScreen({ tab, state, update, notice, setNotice }) {
  const [form, setForm] = useState(null); // null | {} | entity
  const items = state[tab];
  const meta = MASTER_TABS.find((t) => t.key === tab);

  const save = (item) => {
    update((s) => item.id
      ? { ...s, [tab]: s[tab].map((x) => x.id === item.id ? item : x) }
      : { ...s, [tab]: [...s[tab], { ...item, id: uid() }] });
    setForm(null);
  };
  const remove = (id) => update((s) => ({ ...s, [tab]: s[tab].filter((x) => x.id !== id) }));

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between py-3">
        <span className="text-sm" style={{ color: "var(--ink2)" }}>{items.length} {meta.label.toLowerCase()}</span>
        <button className="btn btn-pri" onClick={() => setForm({})}><Plus size={17} /> Új {meta.sing}</button>
      </div>

      {notice && <div className="banner banner-warn mb-3"><AlertTriangle size={18} />{notice}</div>}
      {(tab === "vehicles" || tab === "drivers" || tab === "bases") && <DepotMigrationBanner state={state} update={update} />}

      <div className="flex flex-col gap-2 card-list">
        {items.map((it) => (
          <div key={it.id} className="card p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-semibold flex items-center gap-2 flex-wrap">
                {tab === "vehicles"
                  ? <>{it.name} <PlateChip plate={it.plate} />{it.hasVignette && <VignettePill />}</>
                  : <>{it.name}{tab === "venues" && it.needsVignette && <VignettePill need />}{it.lat != null && it.lon != null
                      ? <MapPin size={14} style={{ color: "var(--ok)" }} aria-label="Koordináta megadva" />
                      : <AlertTriangle size={14} style={{ color: "var(--warn)" }} aria-label="Hiányzó koordináta" />}</>}
              </div>
              <div className="text-sm" style={{ color: "var(--ink2)" }}>
                {tab === "vehicles" && `${it.seats} férőhely (sofőr nélkül)`}
                {tab === "drivers" && <>{it.phone ? <a href={`tel:${it.phone.replace(/\s/g, "")}`} className="underline">{it.phone}</a> : "nincs telefonszám"}{it.email ? ` · ${it.email}` : ""}{(it.baseRules || []).length ? ` · ${it.baseRules.length} időszakos telephely` : ""}</>}
                {(tab === "stations" || tab === "venues" || tab === "bases") && (it.address || "nincs cím")}
                {it.note ? ` · ${it.note}` : ""}
              </div>
            </div>
            <button className="iconbtn" onClick={() => setForm(it)} aria-label="Szerkesztés"><Pencil size={16} /></button>
            <DangerBtn small onConfirm={() => remove(it.id)}
              disabledReason={deleteGuard(state, tab, it.id)}
              onBlocked={(r) => setNotice(`Nem törölhető. ${r}`)} />
          </div>
        ))}
        {items.length === 0 && <EmptyState>Üres lista. Az <b>Új {meta.sing}</b> gombbal vehetsz fel elemet.</EmptyState>}
      </div>

      {form !== null && (
        <MasterForm kind={tab} state={state} entity={form.id ? form : null} onCancel={() => setForm(null)} onSave={save} />
      )}
    </div>
  );
}

/* A list of weekly time windows: day chips, a from–to pair, and a delete button per
   row. Shared by a driver's availability and a vehicle's depot windows, which have the
   same shape on purpose so one editor and one mental model serve both. `extra` renders
   whatever else a row carries (the vehicle's depot picker); `blank` is a new row.

   Module level, not inside MasterForm: a component defined in a render function is a
   new type on every render, and its inputs would lose focus on each keystroke. */
function WindowList({ items, onChange, blank, addLabel, extra }) {
  const set = (i, patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="flex flex-col gap-2">
      {items.map((w, i) => (
        <div key={i} className="card p-2">
          <div className="flex gap-1 flex-wrap mb-2">
            {DAYS_SHORT.map((d, di) => (
              <button key={di} className={`chip ${(w.days || []).includes(di) ? "on" : ""}`} style={{ padding: "4px 10px", minHeight: 32 }}
                onClick={() => set(i, { days: (w.days || []).includes(di) ? w.days.filter((x) => x !== di) : [...(w.days || []), di].sort((a, b) => a - b) })}>{d}</button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <input type="time" className="inp" style={{ minHeight: 38, padding: "6px 8px" }} value={w.start}
              onChange={(e) => set(i, { start: e.target.value })} />
            <span>–</span>
            <input type="time" className="inp" style={{ minHeight: 38, padding: "6px 8px" }} value={w.end}
              onChange={(e) => set(i, { end: e.target.value })} />
            <button className="iconbtn" style={{ width: 34, height: 34 }} aria-label="Idősáv törlése"
              onClick={() => onChange(items.filter((_, j) => j !== i))}><X size={15} /></button>
          </div>
          {extra && <div className="mt-2">{extra(w, (patch) => set(i, patch))}</div>}
        </div>
      ))}
      <button className="btn btn-ghost" onClick={() => onChange([...items, blank()])}>
        <Plus size={15} /> {addLabel}
      </button>
    </div>
  );
}

/* A window is kept on save only when it is complete. A half-filled one would
   otherwise be stored, ignored by the scheduler, and look to the user as if it
   applied. */
const completeWindow = (w) => (w.days || []).length && w.start && w.end;

export function MasterForm({ kind, state, entity, onSave, onCancel }) {
  const blank = {
    stations: { name: "", address: "", note: "", lat: null, lon: null },
    venues: { name: "", address: "", note: "", lat: null, lon: null, needsVignette: false },
    bases: { name: "", address: "", note: "", lat: null, lon: null },
    vehicles: { name: "", plate: "", seats: 8, note: "", hasVignette: false },
    drivers: { name: "", phone: "", email: "", note: "", wage: 3000, minShiftMin: 180, availability: [], baseId: null, baseRules: [] },
  }[kind];
  const [f, setF] = useState(entity || blank);
  const [plateErr, setPlateErr] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const meta = MASTER_TABS.find((t) => t.key === kind);
  const singCap = meta.sing.charAt(0).toUpperCase() + meta.sing.slice(1);
  /* A station, venue or depot cannot be saved without a coordinate. Without one
     legMin falls back to fallbackLegMin and the point drops out of the matrix, so the
     optimizer plans hours of work on wrong travel times, with nothing to show for it.

     Older records that predate this rule are flagged in the list, and editing one
     cannot be completed until a coordinate is set. */
  const needsCoord = kind === "stations" || kind === "venues" || kind === "bases";
  const hasCoord = f.lat != null && f.lon != null;

  const trySave = () => {
    if (needsCoord && !hasCoord) return;
    if (kind === "vehicles") {
      const p = normalizePlate(f.plate);
      if (!p) { setPlateErr("A rendszám kötelező."); return; }
      if (plateExists(state, p, entity?.id)) { setPlateErr(`Ez a rendszám már létezik: ${p}`); return; }
      onSave({ ...f, plate: p, seats: Math.max(1, Number(f.seats) || 1), hasVignette: !!f.hasVignette, baseId: f.baseId || null });
      return;
    }
    if (kind === "drivers") {
      onSave({
        ...f,
        email: (f.email || "").trim().toLowerCase(),
        wage: Math.max(0, Number(f.wage) || 0),
        minShiftMin: Math.max(0, Number(f.minShiftMin) || 0),
        availability: (f.availability || []).filter(completeWindow),
        baseId: f.baseId || null,
        baseRules: (f.baseRules || []).filter((w) => completeWindow(w) && w.baseId && w.end > w.start),
      });
      return;
    }
    onSave(f);
  };

  return (
    <Modal title={entity ? `${singCap} szerkesztése` : `Új ${meta.sing}`} onClose={onCancel}>
      <Field label="Név *"><input className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      {needsCoord && (
        <>
          <Field label="Cím"><input className="inp" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label="Koordináta *" hint="Kötelező. A térképen koppintással jelölöd ki, a jelölő húzható; új kijelölés felülírja a korábbit.">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="tnum" style={{ fontSize: 16 }}>
                {hasCoord ? `${Number(f.lat).toFixed(5)}, ${Number(f.lon).toFixed(5)}` : "nincs megadva"}
              </span>
              <button className="btn btn-ghost" onClick={() => setMapOpen(true)}>
                <MapPin size={16} /> {hasCoord ? "Módosítás térképen" : "Kijelölés térképen"}
              </button>
            </div>
          </Field>
          {!hasCoord && (
            <div className="banner banner-warn mb-3"><AlertTriangle size={18} />A koordináta kötelező — jelöld ki a térképen a mentéshez.</div>
          )}
          {kind === "venues" && (
            <Check label="Csak országos matricás autóval érhető el"
              hint="Autópályán megközelíthető helyszín. A beosztás ide csak matricás járművet oszt be, és jelzi, ha nincs szabad."
              checked={f.needsVignette} onChange={(b) => setF({ ...f, needsVignette: b })} />
          )}
        </>
      )}
      {kind === "vehicles" && (
        <>
          <Field label="Rendszám *" hint="Automatikusan nagybetűs, kötőjeles formára alakítjuk.">
            <input className="inp" value={f.plate}
              onChange={(e) => { setF({ ...f, plate: e.target.value }); setPlateErr(""); }}
              onBlur={() => setF({ ...f, plate: normalizePlate(f.plate) })}
              placeholder="pl. abc123 → ABC-123" />
          </Field>
          {plateErr && <div className="banner banner-danger mb-3"><AlertTriangle size={18} />{plateErr}</div>}
          {f.plate && !plateErr && <div className="mb-3">Előnézet: <PlateChip plate={normalizePlate(f.plate)} /></div>}
          <Field label="Férőhelyek száma (sofőr nélkül) *">
            <input type="number" min="1" className="inp" value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} />
          </Field>
          <Check label="Van országos autópálya-matricája"
            hint="Matricás helyszínre a beosztás csak ilyen járművet oszt be."
            checked={f.hasVignette} onChange={(b) => setF({ ...f, hasVignette: b })} />
        </>
      )}
      {kind === "drivers" && (
        <>
          <Field label="Telefonszám"><input type="tel" className="inp" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+36 30 …" /></Field>
          <Field label="E-mail (belépéshez)" hint="Ha a sofőr ezzel a címmel lép be az appba, alapból a saját napiterve nyílik meg a Sofőr fülön.">
            <input type="email" className="inp" value={f.email || ""} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="sofor@klub.hu" />
          </Field>
          <Field label="Preferált jármű" hint="Ha megadod, az optimalizáló ehhez a sofőrhöz ezt a járművet részesíti előnyben (nem kötelező érvényű).">
            <select className="inp" value={f.preferredVehicleId || ""} onChange={(e) => setF({ ...f, preferredVehicleId: e.target.value || null })}>
              <option value="">— nincs —</option>
              {state.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.plate})</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Órabér (Ft/óra)">
              <input type="number" min="0" className="inp" value={f.wage ?? ""} onChange={(e) => setF({ ...f, wage: e.target.value })} />
            </Field>
            <Field label="Min. műszak (perc)"
              hint="A legrövidebb műszak, amit a klub kifizet. Ez dönti el, megéri-e a sofőrt két fuvar között hazaküldeni: minél magasabb, annál inkább marad a helyszínen — és annál inkább egyben marad a napja.">
              <input type="number" min="0" className="inp" value={f.minShiftMin ?? ""} onChange={(e) => setF({ ...f, minShiftMin: e.target.value })} />
            </Field>
          </div>
          <Field label="Elérhetőség" hint="Ha nincs idősáv megadva, a sofőr bármikor beosztható.">
            <WindowList items={f.availability || []} onChange={(availability) => setF({ ...f, availability })}
              addLabel="Idősáv hozzáadása" blank={() => ({ days: [], start: "15:00", end: "21:00" })} />
          </Field>
          <Field label="Telephely" hint="Innen indul és ide tér vissza a sofőr a buszával — bármelyik buszt kapja. Ha nincs megadva, a klub telephelye számít.">
            <select className="inp" aria-label="A sofőr telephelye" value={f.baseId || ""} onChange={(e) => setF({ ...f, baseId: e.target.value || null })}>
              <option value="">— a klub telephelye —</option>
              {state.bases.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Időszakos telephely"
            hint="Ha a sofőr bizonyos napokon, bizonyos időben máshol van a buszával (pl. a munkahelyén 16:00-ig), add meg itt. A kiállás annál a telephelynél kezdődik, amelyik az induláskor érvényes, a beállás annál ér véget, amelyik a visszaérkezéskor. Idősávon kívül a fenti telephely számít.">
            {state.bases.length === 0 ? (
              <div className="text-sm" style={{ color: "var(--ink2)" }}>Előbb vegyél fel telephelyet az Adatok → Telephelyek fülön.</div>
            ) : (
              <WindowList items={f.baseRules || []} onChange={(baseRules) => setF({ ...f, baseRules })}
                addLabel="Időszakos telephely hozzáadása"
                blank={() => ({ days: [], start: "00:00", end: "16:00", baseId: state.bases[0].id })}
                extra={(w, set) => (
                  <select className="inp" aria-label="Telephely ebben az idősávban" value={w.baseId || ""}
                    onChange={(e) => set({ baseId: e.target.value || null })}>
                    {state.bases.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )} />
            )}
          </Field>
        </>
      )}
      <Field label="Megjegyzés"><input className="inp" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <div className="flex gap-2 mt-4">
        <button className="btn btn-pri flex-1" disabled={!f.name.trim() || (needsCoord && !hasCoord)} onClick={trySave}>Mentés</button>
        <button className="btn btn-ghost" onClick={onCancel}>Mégse</button>
      </div>
      {mapOpen && (
        <MapPickerModal
          state={state}
          item={f}
          title={`${f.name.trim() || singCap} — hely kijelölése`}
          onSave={(lat, lon) => { setF({ ...f, lat, lon }); setMapOpen(false); }}
          onClose={() => setMapOpen(false)}
        />
      )}
    </Modal>
  );
}
