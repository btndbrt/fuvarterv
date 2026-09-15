/* Fuvarterv — the Schedule tab: chains, optimisation, ride generation.

   The optimizer itself lives in src/domain/optimizer.js. This screen only drives it
   and renders the result. */

import { useState, useMemo } from "react";
import { Plus, AlertTriangle, X, ChevronsRight, ChevronDown, Lock, Unlock, Zap, ArrowLeftRight, Settings2, Table, Warehouse, Printer, Scale } from "lucide-react";
import { DAYS, uid, byId } from "../domain/constants.js";
import { mondayOf, weekdayIdx, minToTime, fmtDateFull, toISO } from "../domain/datetime.js";
import { locName, matrixKey, computeMatrix } from "../domain/geo.js";
import { resolveDay, dayStats, optimizeWeek, withGeneratedRides, handRidesReplaced, driverAvailableFor, driverPay, chainUse, depotLegs, chainShifts } from "../domain/optimizer.js";
import { baseOf } from "../domain/logic.js";
import { fmtFt, fmtH } from "../ui/format.js";
import { Field, NumField, Modal, PlateChip, TeamDot, EmptyState, InfoDot, BusyOverlay } from "../ui/base.jsx";
import { VignettePill } from "../ui/VignettePill.jsx";
import { driversWithWeekWork } from "./PrintSheets.jsx";

/* ---------- Schedule ---------- */

export function taskHardIssues(state, weekday, t) {
  const out = [];
  const maxSeats = Math.max(0, ...state.vehicles.map((v) => Number(v.seats) || 0));
  if (t.pax > maxSeats) out.push(`Nincs jármű elegendő férőhellyel (${t.pax} fő > ${maxSeats}).`);
  if (!state.drivers.some((d) => driverAvailableFor(d, weekday, t.start, t.end)))
    out.push(`Egyik sofőr sem érhető el ${minToTime(t.start)}–${minToTime(t.end)} között.`);
  return out;
}

export function TaskRow({ state, task: t, locked, chainLocked, inChain, onLock, onMove, reasons }) {
  const team = byId(state.teams, t.teamId);
  const body = (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`dirpill ${t.dir === "vissza" ? "v" : ""}`}>{t.dir === "oda" ? "ODA" : "VISSZA"}</span>
      <TeamDot color={team?.color || "#999"} size={10} />
      <span className="font-semibold text-sm">{team?.name || "?"}</span>
      <span className="tnum text-base">{minToTime(t.start)}–{minToTime(t.end)}</span>
      <span className="text-xs" style={{ color: "var(--ink2)" }}>
        {locName(state, t.from)} → {locName(state, t.to)} · {t.pax} fő
      </span>
      <span className="flex gap-1 ml-auto">
        {inChain && (
          /* Inside a locked chain the task is already held by the chain, so its own
             switch would promise something it cannot deliver. It is shown locked and
             disabled, with the reason on hover, rather than hidden — a control that
             vanishes reads as a bug. */
          <button className="iconbtn" disabled={chainLocked}
            style={{ width: 32, height: 32, ...(locked ? { background: "var(--surface-inv)", color: "var(--on-inv)", borderColor: "var(--surface-inv)" } : {}) }}
            onClick={onLock}
            title={chainLocked ? "Az egész lánc zárolva van — a feloldás a lánc fejlécében van." : ""}
            aria-label={locked ? "Zárolás feloldása" : "Zárolás"}>
            {locked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
        )}
        <button className="iconbtn" style={{ width: 32, height: 32 }} onClick={onMove} aria-label="Áthelyezés"><ArrowLeftRight size={14} /></button>
      </span>
      {t.plan && t.plan.length > 0 ? (
        <div className="text-xs tnum" style={{ color: "var(--ink2)", width: "100%", fontWeight: 500 }}>
          {t.dir === "oda"
            ? <>{t.plan.map((s) => `${minToTime(s.arr)} ${locName(state, s.stationId)}${s.count ? ` (${s.count})` : ""}`).join(" · ")} → {minToTime(t.venueTime)} {locName(state, t.to)}</>
            : <>{minToTime(t.venueTime)} {locName(state, t.from)} → {t.plan.map((s) => `${minToTime(s.arr)} ${locName(state, s.stationId)}${s.count ? ` (${s.count})` : ""}`).join(" · ")}</>}
        </div>
      ) : t.breakdown && t.breakdown.length > 0 && (
        <div className="text-xs" style={{ color: "var(--ink2)", width: "100%" }}>
          {t.dir === "oda" ? "Felszállás" : "Leszállás"}: {t.breakdown.map((b) => `${locName(state, b.stationId)} ${b.count}`).join(" · ")}
        </div>
      )}
    </div>
  );
  if (!inChain) return (
    <div>
      {body}
      {(reasons || []).map((r, i) => <div key={i} className="text-xs mt-1" style={{ color: "var(--danger)" }}>{r}</div>)}
    </div>
  );
  return (
    <div className="rail-row" style={{ paddingTop: 4, paddingBottom: 4 }}>
      <span className="rail-dot sm" aria-hidden />
      {body}
    </div>
  );
}

/* One depot run, drawn in the same line style as a deadhead between two tasks,
   because that is exactly what it is: an empty trip somebody is paid for.

   "Kiállás" and "beállás" are the trade's own words for leaving the depot and
   coming back, so they are what the drivers expect to read. */
export function DepotLine({ state, leg, kind }) {
  const out = kind === "out";
  return (
    <div className="linkline" title={out ? "Kiállás a telephelyről" : "Beállás a telephelyre"}>
      <Warehouse size={13} />
      <span className="tnum">{minToTime(out ? leg.depart : leg.arrive)}</span>
      {out ? "kiállás" : "beállás"}: {locName(state, leg.fromId)} → {locName(state, leg.toId)} ({leg.min} p üresjárat)
    </div>
  );
}

export function ChainCard({ state, chain: c, place, onLock, onMove, onToggleChainLock }) {
  /* Priced by the SHIFT, not by this chain alone. A driver who cannot get home
     between two chains turned out once, so there is one call-out fee and one depot
     run at each end — and the card has to say so, or it charges a second fee the
     day's total never counted and draws a trip home that never happened.

     `place` says where this chain sits in its shift. Falling back to a shift of one
     keeps the component renderable on its own. */
  const use = chainUse(c, c.driverId, c.vehicleId);
  const solo = { pay: driverPay(state, c.driver, [use]), chains: 1, first: true, last: true, gap: null };
  const { pay, chains: inShift, first, last, gap } = place || solo;
  const { paid, cost, shifts } = pay;
  const span = shifts[0];
  /* Derived here, not stored on the chain: the depot comes from the vehicle (or
     the club default), so it follows a change of either with nothing to migrate. */
  const legs = depotLegs(state, use);
  const fromBase = span && (span.start !== c.start || span.end !== c.end);
  return (
    <div className="card mb-3 overflow-hidden">
      <div className="p-3 flex items-center gap-2 flex-wrap" style={{ background: "var(--surface-inv)", color: "var(--on-inv)" }}>
        <span className="disp text-base">{c.driver?.name || "— nincs sofőr —"}</span>
        {c.vehicle && <PlateChip plate={c.vehicle.plate} />}
        {c.vehicle?.hasVignette && <VignettePill />}
        {c.vehicle && <span className="text-xs" style={{ color: "var(--on-inv)", opacity: .7 }}>{c.vehicle.seats} fh</span>}
        <span className="tnum ml-auto text-base">{minToTime(c.start)}–{minToTime(c.end)}</span>
        {onToggleChainLock && (
          <button className="header-ic" onClick={onToggleChainLock}
            aria-pressed={!!c.locked}
            aria-label={c.locked ? "Lánc feloldása" : "Lánc zárolása"}
            title={c.locked
              ? "A lánc zárolva: az optimalizálás nem rendezi át, és nem veszi el a sofőrt vagy a járművet. Új feladatot még hozzáfűzhet."
              : "Zárolja az egész láncot: marad a feladatok összetétele, a sofőr és a jármű."}>
            {c.locked ? <Lock size={17} /> : <Unlock size={17} />}
          </button>
        )}
      </div>
      <div className="px-3 py-1 text-xs flex gap-3 flex-wrap" style={{ color: "var(--ink2)", borderBottom: "1px solid var(--line)" }}>
        {/* The money belongs to the shift, so it is stated once, on the chain that
            opens it. Repeating it on the next card would read as a second turn-out. */}
        {first ? (
          <>
            <span>fizetett: <b>{fmtH(paid)}</b>{paid > (span ? span.end - span.start : c.end - c.start) ? " (min. műszak)" : ""}</span>
            {fromBase && <span>műszak: <b className="tnum">{minToTime(span.start)}–{minToTime(span.end)}</b> (telephelytől)</span>}
            <span>ktg.: <b>{fmtFt(cost)}</b></span>
            {inShift > 1 && <span>egy műszak, <b>{inShift} lánc</b></span>}
          </>
        ) : (
          <span>ugyanaz a műszak: <b className="tnum">{minToTime(span.start)}–{minToTime(span.end)}</b> — a fizetett idő és a kiszállási díj a műszak első láncánál szerepel</span>
        )}
        <span>max. létszám: <b>{c.maxPax} fő</b></span>
      </div>
      {c.issues.length > 0 && (
        <div className="px-3 pt-2 flex flex-col gap-1">
          {c.issues.map((m, i) => (
            <div key={i} className="banner banner-danger" style={{ padding: "6px 10px" }}><AlertTriangle size={15} />{m}</div>
          ))}
        </div>
      )}
      <div className="rail p-3 flex flex-col gap-1">
        {/* Only the chain that OPENS the shift gets a run out of the depot, and only
            the one that closes it gets the run back. In between the bus stays where
            it is: what separates two chains of one shift is an empty trip and a wait
            on site, never a trip home. Drawing the depot legs per chain put the bus
            back at the depot in the middle of the afternoon, with times that
            overlapped the trip it was still making. */}
        {legs && first && <DepotLine state={state} leg={legs.out} kind="out" />}
        {gap && (
          <div className="linkline" title="A busz a helyszínen marad — nincs idő hazamenni">
            <ChevronsRight size={13} />
            {gap.dead > 0
              ? <>{gap.dead} p üresjárat: {locName(state, gap.from)} → {locName(state, gap.to)}{gap.wait > 0 && <> · {gap.wait} p várakozás</>}</>
              : <>{gap.wait} p várakozás itt: {locName(state, gap.to)}</>}
          </div>
        )}
        {c.tasks.map((t, i) => (
          <div key={t.id}>
            <TaskRow state={state} task={t} locked={t.locked || c.locked} chainLocked={c.locked} inChain
              onLock={() => onLock(t.id)} onMove={() => onMove(t)} />
            {i < c.links.length && (
              <div className="linkline">
                <ChevronsRight size={13} />
                {c.links[i].infeasible
                  ? <b style={{ color: "var(--danger)" }}>{c.links[i].short} perc hiányzik az átálláshoz ({locName(state, c.links[i].a.to)} → {locName(state, c.links[i].b.from)})</b>
                  : <>{c.links[i].dead} p üresjárat: {locName(state, c.links[i].a.to)} → {locName(state, c.links[i].b.from)}{c.links[i].idle > 0 && <> · {c.links[i].idle} p várakozás</>}</>}
              </div>
            )}
          </div>
        ))}
        {legs && last && <DepotLine state={state} leg={legs.back} kind="back" />}
      </div>
    </div>
  );
}

export function MoveModal({ state, task, chains, currentChainId, onClose, onToChain, onToNew, onToUnassigned }) {
  const [nd, setNd] = useState(state.drivers[0]?.id || "");
  const [nv, setNv] = useState(state.vehicles[0]?.id || "");
  const targets = chains.filter((c) => c.id !== currentChainId);
  return (
    <Modal title={`Áthelyezés — ${task.label}`} onClose={onClose}>
      {targets.length > 0 && <h4 className="disp text-sm mb-2">Meglévő láncba</h4>}
      <div className="flex flex-col gap-2 mb-3">
        {targets.map((c) => (
          <button key={c.id} className="btn btn-ghost" style={{ justifyContent: "flex-start" }} onClick={() => onToChain(c.id)}>
            <ChevronsRight size={15} /> {c.driver?.name || "?"} · {c.vehicle?.plate || "?"} ({minToTime(c.start)}–{minToTime(c.end)})
          </button>
        ))}
        {currentChainId && (
          <button className="btn btn-ghost" style={{ justifyContent: "flex-start" }} onClick={onToUnassigned}>
            <X size={15} /> Fedetlenek közé (kivétel a láncból)
          </button>
        )}
      </div>
      <h4 className="disp text-sm mb-2">Új lánc indítása</h4>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sofőr">
          <select className="inp" value={nd} onChange={(e) => setNd(e.target.value)}>
            {state.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Jármű">
          <select className="inp" value={nv} onChange={(e) => setNv(e.target.value)}>
            {state.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.plate}){v.hasVignette ? " · matricás" : ""}</option>)}
          </select>
        </Field>
      </div>
      <button className="btn btn-pri w-full" disabled={!nd || !nv} onClick={() => onToNew(nd, nv)}>
        <Plus size={15} /> Új lánc ezzel a feladattal
      </button>
      <p className="text-xs mt-2" style={{ color: "var(--ink2)" }}>
        A kézi áthelyezés automatikusan zárolja a feladatot, így az újraoptimalizálás nem írja felül,
        és a fuvarok is azonnal frissülnek. Ha ütközést okoz, pirossal jelezzük, de engedjük.
      </p>
    </Modal>
  );
}

export /* Modulszinten, nem a renderben: a komponensen belül definiált komponensnek
   minden renderben új típusa lenne, ezért a React a teljes részfát újra
   mountolná (itt ártalmatlan, de pontosan ez a minta okoz máshol beviteli
   fókuszvesztést). */
function CmpRow({ label, va, vb }) {
  return (<tr><td>{label}</td><td className="b">{va}</td><td className="b">{vb}</td></tr>);
}

/* The week proposal. Deliberately not a seven-fold version of the daily modal: at
   that size nobody reads chains, they read who is working how much. So the fairness
   table comes first, the day-by-day summary second, and the chains stay on the daily
   screen where they can actually be edited. */
function WeekProposalModal({ state, out, onApply, onClose }) {
  const a = out.totalsBefore, b = out.totals;
  const rows = state.drivers
    .map((d) => ({
      d,
      before: out.fairness.before.get(d.id) || 0,
      after: out.fairness.after.get(d.id) || 0,
      share: out.fairness.shares.get(d.id) || 0,
    }))
    .filter((r) => r.before > 0 || r.after > 0 || r.share > 0)
    .sort((x, y) => y.after - x.after);

  return (
    <Modal title="Heti optimalizálás — előtte / utána" onClose={onClose}>
      <table className="cmp mb-3">
        <thead><tr><th></th><th>Jelenlegi</th><th>Javasolt</th></tr></thead>
        <tbody>
          <CmpRow label="Láncok a héten" va={a.chains} vb={b.chains} />
          <CmpRow label="Fizetett idő" va={fmtH(a.paidMin)} vb={fmtH(b.paidMin)} />
          <CmpRow label="Becsült költség" va={fmtFt(a.cost)} vb={fmtFt(b.cost)} />
          <CmpRow label="Fedetlen feladat" va={a.uncovered} vb={b.uncovered} />
          {/* 0 = mindenki pontosan a rá jutó részt viszi; 1 = valaki egy teljes
              résszel többet vagy kevesebbet. */}
          <CmpRow label="Egyenlőtlenség" va={out.fairness.imbalanceBefore.toFixed(2)} vb={out.fairness.imbalanceAfter.toFixed(2)} />
        </tbody>
      </table>

      <h4 className="disp text-sm mb-2 flex items-center gap-1"><Scale size={15} /> Munka eloszlása</h4>
      {out.fairness.bias === 0 && (
        <div className="banner banner-warn mb-2"><AlertTriangle size={15} />
          A kiegyenlítés ki van kapcsolva (⚙ → „Egyenletes terhelés súlya” = 0), így csak a költség számít.
        </div>
      )}
      <table className="cmp mb-3">
        <thead><tr><th>Sofőr</th><th>Eddig</th><th>Javasolt</th><th>Arányos rész</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.d.id}>
              <td>{r.d.name}</td>
              <td className="b">{fmtH(r.before)}</td>
              <td className="b">{fmtH(r.after)}</td>
              <td style={{ color: "var(--ink2)" }}>{fmtH(Math.round(r.share))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <EmptyState>Ezen a héten nincs fuvarfeladat.</EmptyState>}

      <h4 className="disp text-sm mb-2">Napok</h4>
      <div className="flex flex-col gap-1 mb-3">
        {out.days.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span style={{ minWidth: 78 }}>{DAYS[i]}</span>
            {r.empty
              ? <span style={{ color: "var(--ink2)" }}>nincs edzés</span>
              : <>
                  <span>{r.stats.chains} lánc · {r.stats.drivers} sofőr</span>
                  <span className="ml-auto tnum">{fmtFt(r.stats.cost)}</span>
                </>}
          </div>
        ))}
      </div>

      {!out.converged && (
        <div className="banner banner-warn mb-2"><AlertTriangle size={15} />
          A kiegyenlítés nem állt be teljesen — futtasd le még egyszer, ha tovább finomítanád.
        </div>
      )}
      {out.uncovered.length > 0 && (
        <div className="banner banner-danger mb-2" style={{ display: "block" }}>
          <b>Nem fedhető le ({out.uncovered.length}):</b>
          {out.uncovered.slice(0, 8).map((u, i) => (
            <div key={i} className="mt-1">• {DAYS[u.weekday]} — {u.task.label}: {u.reasons.join(" ")}</div>
          ))}
          {out.uncovered.length > 8 && <div className="mt-1">• …és még {out.uncovered.length - 8}. A napi nézetben mind látszik.</div>}
        </div>
      )}
      {out.notes.map((n, i) => <div key={i} className="banner banner-warn mb-2"><AlertTriangle size={15} />{n}</div>)}
      {/* The one thing applying can lose. Said before the button, with a count, because
          this used to be a separate, confirmed step. */}
      {out.handReplaced > 0 && (
        <div className="banner banner-warn mb-2"><AlertTriangle size={15} />
          {out.handReplaced} kézzel felvett fuvar lecserélődik a javaslatból készülő fuvarokra. Ha egy
          sofőr–jármű párosításhoz ragaszkodsz, előbb helyezd át és zárold a feladatot a Beosztás fülön.
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button className="btn btn-pri flex-1" onClick={onApply}>Alkalmazás és fuvarok rögzítése</button>
        <button className="btn btn-ghost" onClick={onClose}>Mégse</button>
      </div>
      <p className="text-xs mt-2" style={{ color: "var(--ink2)" }}>
        A zárolt láncok és feladatok sofőrje és járműve nem változik. Az alkalmazás a hét minden napjának
        beosztását felülírja, és a fuvarokat is ebből rögzíti, így a Hét és a Sofőr nézetben azonnal megjelennek.
        Kézi fuvar csak ott marad meg, ahol a javaslat nem tudja lefedni a feladatot.
      </p>
    </Modal>
  );
}

export function ScheduleScreen({ state, update }) {
  const weekMon = mondayOf(new Date());
  const [weekday, setWeekday] = useState(weekdayIdx(new Date()));
  const [moveTask, setMoveTask] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [busyMx, setBusyMx] = useState(false);
  const [msg, setMsg] = useState("");
  const [showWarnings, setShowWarnings] = useState(false);
  const [weekProposal, setWeekProposal] = useState(null);
  const [busyWeek, setBusyWeek] = useState(false);

  const res = useMemo(() => resolveDay(state, weekday, weekMon), [state, weekday]);
  const curStats = useMemo(() => dayStats(state, res.chains), [state, res]);
  /* Which shift each chain belongs to, so a card can tell whether it opens one,
     closes one, or merely continues the one before it. Worked out for the whole day
     at once, because the answer depends on the driver's OTHER chains. */
  const places = useMemo(() => chainShifts(state, res.chains), [state, res]);
  const mxStale = state.matrix && state.matrix.key !== matrixKey(state);

  const doMatrix = async () => {
    setBusyMx(true); setMsg("");
    try {
      const m = await computeMatrix(state);
      update((s) => ({ ...s, matrix: m }));
      setMsg(m.source === "osrm"
        ? `Mátrix kész: ${m.n} pont, OSRM útvonaltervezővel.`
        : `Mátrix kész: ${m.n} pont — az útvonaltervező nem volt elérhető, légvonalas becslés (~${state.settings.estSpeedKmh} km/h).`);
    } catch (e) { setMsg(e.message || "A mátrix számítása nem sikerült."); }
    setBusyMx(false);
  };

  /* The one optimise button. The week runs seven days several times over and is
     synchronous, so the browser paints nothing while it works. Yielding a frame first
     lets the busy overlay render before the calculation starts. */
  const doOptimizeWeek = () => {
    setBusyWeek(true);
    requestAnimationFrame(() => setTimeout(() => {
      const out = optimizeWeek(state, weekMon);
      setWeekProposal({ ...out, handReplaced: handRidesReplaced(state, weekMon, out.days) });
      setBusyWeek(false);
    }, 0));
  };

  /* Applying publishes: the schedule AND the rides of all seven days, so the Sofőr
     view shows the plan at once. Locks are what protect manual work — see
     rideReplacedBy. */
  const applyWeekProposal = () => {
    /* Identified ONCE, before the chains are used twice. A chain straight out of the
       optimizer has no id, and stamping one separately for the schedule and for the
       rides gave them two different ids — so a ride could no longer name the run it
       belongs to. */
    const perDay = weekProposal.days.map((r) => (r.chains || []).map((c) => ({ ...c, id: c.id || uid() })));
    update((s) => {
      const assignments = { ...s.assignments };
      let rides = s.rides;
      perDay.forEach((chains, d) => {
        assignments[d] = {
          chains: chains.map((c) => ({
            id: c.id, driverId: c.driverId, vehicleId: c.vehicleId,
            /* The chain-level lock has to survive the round trip, or optimising once
               would quietly unlock every chain the user had settled. */
            locked: !!c.locked,
            taskIds: c.tasks.map((t) => ({ id: t.id, locked: !!t.locked })),
          })),
        };
        rides = withGeneratedRides({ ...s, rides }, d, weekMon, chains);
      });
      return { ...s, assignments, rides };
    });
    setWeekProposal(null);
    setMsg("A heti beosztás alkalmazva és a fuvarok rögzítve — a Hét és a Sofőr nézetben is megjelennek.");
  };

  /* The printed sheet comes from the SAVED rides, not from the chains on screen, so
     it is counted separately: a week whose tasks sit in no chain has nothing to
     print, and printing then would hand out blank paper. */
  const weekMonISO = toISO(weekMon);
  const printCount = useMemo(() => driversWithWeekWork(state, mondayOf(weekMonISO)).length, [state, weekMonISO]);

  /* Lock or release a whole chain. Locking does NOT seal it: the optimizer may still
     append compatible work, and whatever it appends comes back unlocked. */
  const toggleChainLock = (chainId) => update((s) => ({
    ...s,
    assignments: {
      ...s.assignments,
      [weekday]: {
        chains: (s.assignments[weekday]?.chains || []).map((ch) => (ch.id === chainId ? { ...ch, locked: !ch.locked } : ch)),
      },
    },
  }));

  const toggleLock = (taskId) => update((s) => ({
    ...s,
    assignments: {
      ...s.assignments,
      [weekday]: {
        chains: (s.assignments[weekday]?.chains || []).map((ch) => ({
          ...ch, taskIds: ch.taskIds.map((x) => (x.id === taskId ? { ...x, locked: !x.locked } : x)),
        })),
      },
    },
  }));

  /* A manual move reaches the Sofőr view straight away: the day's rides are rebuilt
     from the edited schedule. The moved task is locked, so no later optimisation
     undoes it. Lock toggles need no rebuild — they change no driver, bus or time. */
  const withDayRides = (s) => ({ ...s, rides: withGeneratedRides(s, weekday, weekMon, resolveDay(s, weekday, weekMon).chains) });
  const stripTask = (chains, taskId) =>
    chains.map((ch) => ({ ...ch, taskIds: ch.taskIds.filter((x) => x.id !== taskId) })).filter((ch) => ch.taskIds.length);
  const moveToChain = (taskId, chainId) => update((s) => {
    let chains = stripTask(s.assignments[weekday]?.chains || [], taskId);
    chains = chains.map((ch) => (ch.id === chainId ? { ...ch, taskIds: [...ch.taskIds, { id: taskId, locked: true }] } : ch));
    return withDayRides({ ...s, assignments: { ...s.assignments, [weekday]: { chains } } });
  });
  const moveToNew = (taskId, driverId, vehicleId) => update((s) => {
    const chains = stripTask(s.assignments[weekday]?.chains || [], taskId);
    chains.push({ id: uid(), driverId, vehicleId, taskIds: [{ id: taskId, locked: true }] });
    return withDayRides({ ...s, assignments: { ...s.assignments, [weekday]: { chains } } });
  });
  const moveToUnassigned = (taskId) => update((s) => withDayRides({
    ...s, assignments: { ...s.assignments, [weekday]: { chains: stripTask(s.assignments[weekday]?.chains || [], taskId) } },
  }));
  const setSetting = (k, v) => update((s) => ({ ...s, settings: { ...s.settings, [k]: v } }));

  const moveChainId = moveTask ? (res.chains.find((c) => c.tasks.some((t) => t.id === moveTask.id))?.id || null) : null;
  /* Vehicles with no resolvable depot: neither their own nor the club's. */
  const baseless = state.vehicles.filter((v) => !baseOf(state, v.id));

  /* Every STANDING warning about the day, gathered into one collapsible list so the
     chains start at the top of the screen instead of below a stack of banners.

     Standing, not transient: `msg` is feedback on a button the user just pressed and
     stays where they are looking. What collects here is the state of the day, which
     is true until something is fixed and does not need to be re-read on every visit.

     Collapsed by default, but never silent — the toggle carries the count and keeps
     the warning colour, because a missing depot quietly changes every figure in the
     stat row above it (ADR-24: nothing is dropped without saying so). */
  const warnings = [];
  if (baseless.length > 0) warnings.push(
    <div key="baseless" className="banner banner-warn" style={{ display: "block" }}>
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} />
        <b>{baseless.length === state.vehicles.length ? "Egy járműnek sincs telephelye" : `${baseless.length} járműnek nincs telephelye`}</b>
      </div>
      <div className="mt-1">
        Enélkül a beosztás úgy számol, hogy a sofőr két fuvar között hazamehet — távoli helyszínnél ez nem igaz,
        és a várakozás sem kerül bele a fizetett időbe.
      </div>
      {state.bases.length === 0 ? (
        <div className="mt-1">Vegyél fel telephelyet az <b>Adatok → Telephelyek</b> fülön.</div>
      ) : !state.settings.defaultBaseId && state.bases.length === 1 ? (
        <button className="btn btn-ghost mt-2" onClick={() => setSetting("defaultBaseId", state.bases[0].id)}>
          „{state.bases[0].name}” beállítása klubtelephelynek
        </button>
      ) : (
        <div className="mt-1">Válaszd ki a klub telephelyét a ⚙ panelben, vagy add meg a járműveknél.</div>
      )}
    </div>
  );
  res.skipped.forEach((sk, i) => warnings.push(
    <div key={`sk${i}`} className="banner banner-warn"><AlertTriangle size={16} />{sk}</div>
  ));

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between py-3">
        <span className="flex items-center gap-1">
          <h2 className="disp text-xl">Beosztás</h2>
          <InfoDot align="l" text="Az „Optimalizálás” az egész hétre kiszámolja a legolcsóbb sofőr+jármű láncokat, arányosan elosztja a munkát, és alkalmazáskor a fuvarokat is rögzíti. A zárolt feladatokhoz nem nyúl. A „Mátrix” pontosabb üresjárati időket ad. A láncokat kézzel is átrendezheted." />
        </span>
        <button className="iconbtn" onClick={() => setShowSettings(!showSettings)} aria-label="Paraméterek"><Settings2 size={17} /></button>
      </div>

      {showSettings && (
        <div className="card p-3 mb-3">
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Érkezés edzés előtt (perc)" value={state.settings.arriveEarlyMin} min={0} onCommit={(v) => setSetting("arriveEarlyMin", v)} />
            <NumField label="Indulás edzés után (perc)" value={state.settings.departAfterMin} min={0} onCommit={(v) => setSetting("departAfterMin", v)} />
            <NumField label="Kiszállási díj (Ft)" value={state.settings.calloutFee} min={0} onCommit={(v) => setSetting("calloutFee", v)} />
            <NumField label="Megállónkénti idő (perc)" value={state.settings.dwellMin} min={0} onCommit={(v) => setSetting("dwellMin", v)} />
            <NumField label="Becsült sebesség (km/h)" value={state.settings.estSpeedKmh} min={1} onCommit={(v) => setSetting("estSpeedKmh", v)} />
            <NumField label="Alap üresjárat adat híján (perc)" value={state.settings.fallbackLegMin} min={0} onCommit={(v) => setSetting("fallbackLegMin", v)} />
            <NumField label="Üresjárat költsége (Ft/perc)"
              hint="Az utas nélkül megtett percek ára: üzemanyag és kopás. Ez tartja vissza az optimalizálást attól, hogy két fuvar között hazaküldje a buszt a telephelyre. 0 = az üresjárat ingyenes."
              value={state.settings.runCostPerMin} min={0} onCommit={(v) => setSetting("runCostPerMin", v)} />
            <NumField label="Preferált jármű súlya (Ft)" hint="Mennyire ragaszkodjon a sofőr saját buszához. 0 = kikapcsolva."
              value={state.settings.preferredBias} min={0} onCommit={(v) => setSetting("preferredBias", v)} />
            <NumField label="Egyenletes terhelés súlya (Ft)" hint="Mennyire ossza el a munkát egyenletesen a sofőrök között, a fizetett idő alapján. 0 = kikapcsolva, csak a költség számít."
              value={state.settings.fairnessBias} min={0} onCommit={(v) => setSetting("fairnessBias", v)} />
          </div>
          <Field label="Klub telephelye" hint="Innen indulnak a buszok, ha a járműnél nincs saját telephely megadva. A fizetett idő a telephelytől a visszaérkezésig tart.">
            <select className="inp" value={state.settings.defaultBaseId || ""} onChange={(e) => setSetting("defaultBaseId", e.target.value || null)}>
              <option value="">— nincs megadva —</option>
              {state.bases.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          {!state.settings.defaultBaseId && (
            <div className="banner banner-warn"><AlertTriangle size={16} />
              Telephely nélkül a beosztás úgy számol, hogy a sofőr két fuvar között hazamehet — távoli helyszínnél ez nem igaz, és a várakozás sem jelenik meg.
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
        {DAYS.map((d, i) => (
          <button key={i} className={`chip ${i === weekday ? "on" : ""}`} onClick={() => setWeekday(i)} style={{ whiteSpace: "nowrap" }}>{d}</button>
        ))}
      </div>

      <div className="statgrid mb-3">
        <div className="stat"><b>{curStats.drivers}</b><span>sofőr</span></div>
        <div className="stat"><b>{fmtH(curStats.paidMin)}</b><span>fizetett idő</span></div>
        <div className="stat"><b>{curStats.dead} p</b><span>üresjárat</span></div>
        {/* A várakozás eddig csak az optimalizálás összevetésében látszott, a napi
            mutatók között nem — pedig a fizetett idő jó része lehet. */}
        <div className="stat"><b>{curStats.idle} p</b><span>várakozás</span></div>
        <div className="stat"><b>{fmtFt(curStats.cost)}</b><span>becsült ktg.</span></div>
      </div>

      {warnings.length > 0 && (
        <div className="mb-3">
          <button type="button" className="banner banner-warn" onClick={() => setShowWarnings(!showWarnings)}
            aria-expanded={showWarnings}>
            <AlertTriangle size={16} />
            <span>{warnings.length} figyelmeztetés</span>
            <ChevronDown size={16} className="ml-auto" aria-hidden
              style={{ transform: showWarnings ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
          </button>
          {showWarnings && <div className="flex flex-col gap-2 mt-2">{warnings}</div>}
        </div>
      )}

      <div className="flex gap-2 mb-2 flex-wrap">
        <button className="btn btn-pri flex-1" onClick={doOptimizeWeek} disabled={busyWeek}>
          <Zap size={16} /> Heti beosztás optimalizálása
        </button>
        <button className="btn btn-ghost" onClick={doMatrix} disabled={busyMx}><Table size={16} /> {busyMx ? "Számítás…" : "Mátrix"}</button>
      </div>
      <div className="flex gap-2 mb-2 items-center">
        <button className="btn btn-ghost flex-1" disabled={printCount === 0}
          title={printCount === 0 ? "Ezen a héten még nincsenek fuvarok — előbb futtasd és alkalmazd a heti optimalizálást." : ""}
          onClick={() => window.dispatchEvent(new CustomEvent("fuvarterv:print", { detail: { weekMonISO } }))}>
          <Printer size={16} /> Heti menetrend nyomtatása{printCount > 0 ? ` (${printCount} sofőr)` : ""}
        </button>
        <InfoDot align="r" text="Egy kiválasztott sofőr heti fuvarjai táblázatban, a telephelyi ki- és beállással és a fizetett idővel. A böngésző nyomtatási ablakában PDF-be is mentheted." />
      </div>
      <p className="text-xs mb-3 px-1" style={{ color: "var(--ink2)" }}>
        {state.matrix
          ? <>Üresjárati mátrix: {state.matrix.n} pont, {state.matrix.source === "osrm" ? "OSRM útvonaltervező" : "légvonalas becslés"} ({fmtDateFull(state.matrix.computedAt.slice(0, 10))}).{mxStale && <b style={{ color: "var(--danger)" }}> A pontok azóta változtak — újraszámítás ajánlott!</b>}</>
          : "Még nincs üresjárati mátrix — addig légvonalas becslés / alapérték megy. A Mátrix gomb egyszer számol, az eredmény eltárolódik."}
      </p>
      {msg && <div className="banner banner-warn mb-3"><Table size={16} />{msg}</div>}

      {res.chains.map((c) => (
        <ChainCard key={c.id} state={state} chain={c} place={places.get(c)} onLock={toggleLock} onMove={setMoveTask}
          onToggleChainLock={() => toggleChainLock(c.id)} />
      ))}
      {res.chains.length === 0 && res.tasks.length > 0 && (
        <EmptyState>Ezen a napon még nincs beosztás. Futtasd a heti optimalizálást, vagy helyezz át feladatot kézzel.</EmptyState>
      )}
      {res.tasks.length === 0 && <EmptyState>{DAYS[weekday]}i napra nincs edzés, így fuvarfeladat sincs.</EmptyState>}

      {res.unassigned.length > 0 && (
        <section className="mt-4">
          <h3 className="disp text-base mb-2">Fedetlen feladatok</h3>
          <div className="card p-3 flex flex-col gap-3" style={{ borderColor: "var(--acc)", borderWidth: 2 }}>
            {res.unassigned.map((t) => (
              <TaskRow key={t.id} state={state} task={t} onMove={() => setMoveTask(t)} reasons={taskHardIssues(state, weekday, t)} />
            ))}
          </div>
        </section>
      )}

      {moveTask && (
        <MoveModal state={state} task={moveTask} chains={res.chains} currentChainId={moveChainId}
          onClose={() => setMoveTask(null)}
          onToChain={(cid) => { moveToChain(moveTask.id, cid); setMoveTask(null); }}
          onToNew={(d, v) => { moveToNew(moveTask.id, d, v); setMoveTask(null); }}
          onToUnassigned={() => { moveToUnassigned(moveTask.id); setMoveTask(null); }} />
      )}
      {busyWeek && (
        <BusyOverlay title="Optimalizálás folyamatban…"
          hint="Az egész hét beosztása készül, ez több másodpercig is eltarthat. Kérlek, várj — a javaslat magától megjelenik." />
      )}
      {weekProposal && (
        <WeekProposalModal state={state} out={weekProposal}
          onApply={applyWeekProposal} onClose={() => setWeekProposal(null)} />
      )}
    </div>
  );
}
