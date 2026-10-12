/* Fuvarterv — plates, occurrences, ride windows, clashes, delete guards.

   Pure domain: no window, no network, no Math.random on any decision path. */

import { byId } from "./constants.js";
import { toISO, parseISO, weekdayIdx, addDays, timeToMin } from "./datetime.js";
import { legMin } from "./geo.js";

/* Plate: upper-cased, hyphen at the letter/digit boundary (ABC-123, AABB-123). */
export function normalizePlate(raw) {
  const s = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = s.match(/^([A-Z]+)(\d+)$/);
  if (m) return `${m[1]}-${m[2]}`;
  return s;
}
export function plateExists(state, plate, exceptId) {
  const p = normalizePlate(plate);
  return state.vehicles.some((v) => v.id !== exceptId && normalizePlate(v.plate) === p);
}

/* Every occurrence of every training inside one week. */
export function weekOccurrences(state, mon) {
  const out = [];
  for (const t of state.trainings) {
    if (t.type === "weekly") {
      for (const di of t.days) out.push({ training: t, dayIdx: di, dateISO: toISO(addDays(mon, di)) });
    } else if (t.date) {
      const diff = Math.round((parseISO(t.date) - mon) / 86400000);
      if (diff >= 0 && diff < 7) out.push({ training: t, dayIdx: weekdayIdx(t.date), dateISO: t.date });
    }
  }
  return out.sort((a, b) => a.dayIdx - b.dayIdx || (timeToMin(a.training.start) ?? 0) - (timeToMin(b.training.start) ?? 0));
}



/* ---------- Matches (ADR-33) ----------
   A match is a one-off training marked with the bus that takes the team and a
   free-text driver (a coach or a parent, who has no user record):

     training.match: null | { vehicleId, driverName }

   Only a one-off training with a bus counts; anything else reads as no match. */
export const isMatch = (t) => !!(t && t.type === "once" && t.match?.vehicleId);
export const matchesOn = (state, dateISO) =>
  state.trainings.filter((t) => isMatch(t) && t.date === dateISO);
export const isMatchDate = (state, dateISO) => matchesOn(state, dateISO).length > 0;

/* ---------- Where a day's plan is stored ----------
   The schedule is a weekly template, assignments[weekday], which every week reuses.
   A match DATE is the exception: the match takes a bus for that one day, and the
   plan around it (another bus for that bus's driver, say) must not leak into every
   other week. So a match date's plan is stored under its date:

     dateAssignments: { "YYYY-MM-DD": { chains } }

   A match date reads its dated plan once it has one, and the template until then —
   so a freshly entered match first shows the usual plan with the clash flagged.
   Every write on a match date goes to the dated plan. A dated plan whose date no
   longer has a match is ignored: the day is ordinary again. */
const dateOf = (weekMon, weekday) => toISO(addDays(weekMon, weekday));

/* The date's own plan, or null when the date reads the template. */
export function datedPlan(state, dateISO) {
  if (!isMatchDate(state, dateISO)) return null;
  return state.dateAssignments?.[dateISO] || null;
}

export function storedChains(state, weekday, weekMon) {
  const dated = weekMon ? datedPlan(state, dateOf(weekMon, weekday)) : null;
  return (dated || state.assignments?.[weekday])?.chains || [];
}

/* The match chain is derived from the training every time and is never stored. */
export function withStoredChains(state, weekday, weekMon, chains) {
  const keep = chains.filter((c) => !c.match);
  const date = weekMon ? dateOf(weekMon, weekday) : null;
  if (date && isMatchDate(state, date))
    return { ...state, dateAssignments: { ...(state.dateAssignments || {}), [date]: { chains: keep } } };
  return { ...state, assignments: { ...(state.assignments || {}), [weekday]: { chains: keep } } };
}

/* Does this ride show on this date? A one-off training's ride on its own date. A
   weekly training's ride either belongs to the template (day set, no date) and shows
   on every matching weekday — except a date with a plan of its own — or was written
   for one match date (date set, day null) and shows there only. */
export function rideOnDate(state, ride, training, dateISO) {
  if (!training) return false;
  if (training.type !== "weekly") return training.date === dateISO;
  if (ride.date) return ride.date === dateISO;
  return ride.day === weekdayIdx(dateISO) && !datedPlan(state, dateISO);
}

/* One training session can have several rides: more than one bus carrying the team.
   With a date, the rides that show on that date; without one, the template's. */
export function findRides(state, training, dayIdx, dateISO = null) {
  const dated = training.type === "weekly" && dateISO && datedPlan(state, dateISO);
  return state.rides.filter((r) => r.trainingId === training.id
    && (training.type !== "weekly" || (dated ? r.date === dateISO : r.day === dayIdx && !r.date)));
}

/* Departure time from the venue on a return leg: training end plus the margin. */
export function venueDepartMin(state, training) {
  return (timeToMin(training.end) ?? 0) + (state.settings?.departAfterMin ?? 0);
}

/* The window in which a ride occupies its driver and vehicle.

   Outbound: first stop's departure until the last stop plus the run to the venue,
   so one driver or bus can make several trips for the SAME training without
   showing a false clash. Return: departure from the venue until the last stop's
   arrival. */
export function rideWindow(state, ride, training) {
  const stops = (ride.stops || []).filter((s) => timeToMin(s.time) != null);
  if ((ride.dir || "oda") === "vissza") {
    const dep = venueDepartMin(state, training);
    if (!stops.length) return [dep, dep + 1];
    const last = Math.max(...stops.map((s) => timeToMin(s.time)));
    return [dep, Math.max(dep + 1, last)];
  }
  const startCap = timeToMin(training.start) ?? 0;
  if (!stops.length) return [startCap, startCap];
  const first = Math.min(...stops.map((s) => timeToMin(s.time)));
  const last = stops.reduce((a, b) => (timeToMin(a.time) >= timeToMin(b.time) ? a : b));
  const end = timeToMin(last.time) + legMin(state, last.stationId, training.venueId);
  return [first, Math.max(first + 1, end)];
}

/* One driver's rides on one date, in the order they are actually driven.

   The driver tab and the printed sheets both read through here on purpose: what a
   driver sees on their phone and what they are handed on paper must be the same
   list, in the same order, or the sheet is worse than useless. */
export function driverDayRides(state, driverId, dateISO) {
  return state.rides
    .filter((r) => r.driverId === driverId)
    .map((r) => ({ ride: r, training: byId(state.trainings, r.trainingId) }))
    .filter(({ ride, training }) => rideOnDate(state, ride, training, dateISO))
    .sort((a, b) => rideWindow(state, a.ride, a.training)[0] - rideWindow(state, b.ride, b.training)[0]);
}

/* Can these two rides ever show on the same date? The date-aware version of
   occursOnSameDay: a template ride and a ride written for one match date never do,
   because on that date the template steps aside. */
export function ridesShareADay(state, rA, tA, rB, tB) {
  const dateOf1 = (r, t) => (t.type === "weekly" ? r.date || null : t.date || null);
  const dA = dateOf1(rA, tA), dB = dateOf1(rB, tB);
  if (dA && dB) return dA === dB;
  if (!dA && !dB) return occursOnSameDay(rA, tA, rB, tB);
  /* One is dated, the other a template ride: they meet on the dated one's date if
     the template still shows there. */
  const [dated, rT, tT] = dA ? [dA, rB, tB] : [dB, rA, tA];
  return rideOnDate(state, rT, tT, dated);
}

export function occursOnSameDay(rA, tA, rB, tB) {
  if (tA.type === "once" && tB.type === "once") return tA.date === tB.date;
  // A one-off training with no date cannot be placed in the week at all.
  // weekdayIdx(null) used to throw a TypeError from here, mid-render on the week
  // screen, taking the whole page down.
  const dayOf = (t, r) => (t.type === "weekly" ? r.day : (t.date ? weekdayIdx(t.date) : null));
  const dayA = dayOf(tA, rA), dayB = dayOf(tB, rB);
  if (dayA == null || dayB == null) return false;
  return dayA === dayB;
}

/* Vehicle and driver clashes against a candidate (possibly unsaved) ride. */
export function findConflicts(state, cand) {
  const tA = byId(state.trainings, cand.trainingId);
  if (!tA) return [];
  const out = [];
  for (const r of state.rides) {
    if (r.id === cand.id) continue;
    const tB = byId(state.trainings, r.trainingId);
    if (!tB) continue;
    if (!ridesShareADay(state, cand, tA, r, tB)) continue;
    const [a1, a2] = rideWindow(state, cand, tA);
    const [b1, b2] = rideWindow(state, r, tB);
    if (!(a1 < b2 && b1 < a2)) continue;
    if (cand.vehicleId && cand.vehicleId === r.vehicleId) out.push({ type: "vehicle", ride: r, training: tB });
    if (cand.driverId && cand.driverId === r.driverId) out.push({ type: "driver", ride: r, training: tB });
  }
  return out;
}

export const seatSum = (stops) => stops.reduce((a, s) => a + (Number(s.count) > 0 ? Number(s.count) : 0), 0);

/* Delete guards for the master data. */
/* How many saved schedule chains reference this driver or vehicle.

   Counting rides alone is not enough: a chain can exist in the schedule without
   having been generated into rides yet. Delete the driver and resolveDay silently
   resolves to `undefined`, so the chain renders with no warning and a wage of
   zero. */
export function chainRefs(state, field, id) {
  let c = 0;
  for (const day of [...Object.values(state.assignments || {}), ...Object.values(state.dateAssignments || {})])
    for (const ch of day?.chains || []) if (ch[field] === id) c++;
  return c;
}

/* Where the stops come from: the training's own list, or the team's.

   A team can have several trainings, possibly at different venues, and the stops,
   headcounts and order may differ per training. A training's `stops` field is
   therefore a COMPLETE override: either null (the team's list applies, which is
   the original behaviour) or a full list of its own using the same field names.

   The matching field names are not an accident. They let one resolver and one
   editor component serve both levels with no adapter in between.

   Inheriting by direction (outbound from the training, return from the team) is
   deliberately impossible: that would produce an unreadable matrix of cases. A
   training either uses the team's list or has a complete one of its own. */
export function legSource(team, training) {
  return training?.stops || team || {};
}
export const hasOwnStops = (training) => !!training?.stops;

/* One direction's "leg" of a stop list: which stops it touches, with how many
   people, and which stop is pinned to the end of the line.

   This is the ONLY place that decides whether the return leg uses its own list or
   mirrors the outbound one. With no `returnStationIds`, both directions get the
   outbound fields, so the original behaviour is unchanged and existing teams need
   no migration. The rule lives inside the source, so a training with its own list
   mirrors ITS outbound leg, not the team's.

   `isOverride` matters because ordering differs: a mirrored return leg must be
   reversed, but a hand-built return list must NOT be — its order is already the
   intended one. */
export function legFor(team, training, dir) {
  const src = legSource(team, training);
  const own = dir === "vissza" && Array.isArray(src.returnStationIds);
  const routeMode = src.routeMode || "auto";
  if (!own) {
    return {
      stationIds: src.stationIds || [],
      stationCounts: src.stationCounts || {},
      routeAnchorId: src.routeAnchorId ?? null,
      routeMode,
      isOverride: false,
    };
  }
  return {
    stationIds: src.returnStationIds,
    stationCounts: src.returnStationCounts || {},
    routeAnchorId: src.returnRouteAnchorId ?? null,
    routeMode,
    isOverride: true,
  };
}

/* The team-level call. This wrapper states the invariant the return-leg tests
   check: with no override, nothing changes. */
export const teamLeg = (team, dir) => legFor(team, null, dir);

/* The national motorway vignette. The REQUIREMENT is marked on the venue
   (`needsVignette`); the FACT is on the vehicle (`hasVignette`).

   One of a task's two endpoints is always the venue (outbound: `to`, return:
   `from`), so checking both covers either direction with no special case. Stops
   deliberately cannot be marked: the destination is what forces the vignette, and
   this way there is one field to maintain rather than dozens. */
export const venueNeedsVignette = (state, id) => !!byId(state.venues, id)?.needsVignette;
export const taskNeedsVignette = (state, task) =>
  venueNeedsVignette(state, task.from) || venueNeedsVignette(state, task.to);
export const chainNeedsVignette = (state, chain) =>
  (chain?.tasks || []).some((t) => taskNeedsVignette(state, t));
/* Which vignette-requiring venues this chain visits. Used by the explanations,
   so we say WHICH venue caused the problem rather than only that there is one. */
export const vignetteVenues = (state, chain) => [...new Set((chain?.tasks || [])
  .flatMap((t) => [t.from, t.to])
  .filter((id) => venueNeedsVignette(state, id))
  .map((id) => byId(state.venues, id).name))];

/* Which depot this vehicle leaves from and returns to. A vehicle's own depot
   beats the club's. With neither, null: paid time is then measured from the tasks
   themselves, exactly as it was before depots existed. */
export function baseOf(state, vehicleId) {
  const v = byId(state.vehicles, vehicleId);
  return (v && v.baseId) || state.settings?.defaultBaseId || null;
}

/* ---------- Driver depots (driver.baseId, driver.baseRules) ----------
   The depot goes with the DRIVER: a driver who works at an office until 16:00 has
   the bus there during the day and at home afterwards, and takes that rhythm to
   whichever bus they are given. A driver may have one all-day depot and a list of
   windows shaped like their availability:

     baseRules: [{ days: [weekdayIdx], start: "HH:MM", end: "HH:MM", baseId }]

   A window is half-open, [start, end): at 16:00 a rule ending at 16:00 no longer
   applies. Overlapping windows are resolved by list order, first match wins. Outside
   every window the depot is the driver's baseId, then the vehicle's (baseOf). A
   driver with neither — and a run with no registered driver — behaves exactly as it
   did before driver depots existed (E8). */

/* A window usable for resolution, or null for a half-filled one. An incomplete window
   used to be the reason a driver silently vanished from the day; ignoring it is the
   lesson from availability, applied here too. */
function ruleSpan(r) {
  const a = timeToMin(r?.start), b = timeToMin(r?.end);
  if (!r?.baseId || a == null || b == null || b <= a) return null;
  return [a, b];
}

/* The depot outside every window: the driver's own, then the vehicle's. */
const fallbackBaseOf = (state, u) =>
  byId(state.drivers, u.driverId)?.baseId || baseOf(state, u.vehicleId);

/* The driver's windows that apply on this weekday, or none without one. */
function rulesOn(state, u) {
  if (u.weekday == null) return [];
  return (byId(state.drivers, u.driverId)?.baseRules || [])
    .filter((r) => (r.days || []).includes(u.weekday) && ruleSpan(r));
}

/* Where the run's depot is at minute `min`. `u` names the driver, the vehicle and
   the weekday — a use, or anything shaped like one. */
export function baseAt(state, u, min) {
  for (const r of rulesOn(state, u)) {
    const sp = ruleSpan(r);
    if (sp[0] <= min && min < sp[1]) return r.baseId;
  }
  return fallbackBaseOf(state, u);
}

/* The weekday cut into stretches over which baseAt is constant, from -Infinity to
   +Infinity so every moment of a use falls into exactly one. Times before midnight or
   past it (a return after 24:00) belong to no window, so they get the fallback. */
function baseSegments(state, u) {
  const cuts = new Set();
  for (const r of rulesOn(state, u)) {
    const sp = ruleSpan(r);
    cuts.add(sp[0]); cuts.add(sp[1]);
  }
  const pts = [-Infinity, ...[...cuts].sort((a, b) => a - b), Infinity];
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], z = pts[i + 1];
    const probe = a === -Infinity ? (z === Infinity ? 0 : z - 1) : a;
    segs.push({ a, z, baseId: baseAt(state, u, probe) });
  }
  return segs;
}

/* The stretches a run may START from. Leaving a window takes time: "at work until
   15:30" with home 41 minutes away means he is at home from 16:11, not from 15:30, and
   in between the bus can only set off from work. So where a window ENDS and the depot
   changes, the next depot only begins once the driver could have driven there. A
   window's start is not moved — "at work from 12:00" means he is there at 12:00 — and
   neither is anything about where a run ends: the bus goes straight wherever it goes.
   Found on live data, where the model had a driver set off from home two minutes after
   leaving work 41 minutes away. */
function startSegments(state, u) {
  const rules = rulesOn(state, u);
  const out = [];
  for (const seg of baseSegments(state, u)) {
    const prev = out[out.length - 1];
    if (!prev) { out.push({ ...seg }); continue; }
    if (prev.baseId === seg.baseId) { prev.z = seg.z; continue; }
    /* Only where a window hands over to the depot outside the windows. When another
       window starts at that minute, it says he is already there. */
    const windowEnds = rules.some((r) => ruleSpan(r)[1] === seg.a && r.baseId === prev.baseId)
      && !rules.some((r) => ruleSpan(r)[0] === seg.a && r.baseId === seg.baseId);
    const drive = windowEnds && prev.baseId && seg.baseId ? legMin(state, prev.baseId, seg.baseId) : 0;
    const from = Math.min(seg.a + drive, seg.z);
    prev.z = from;
    if (from < seg.z) out.push({ ...seg, a: from });
    else prev.z = seg.z;           // he never gets there before the next change
  }
  return out;
}

/* The depot a use STARTS from, and when the bus leaves it.

   The depot depends on the departure time and the departure time on the depot (it is
   the pickup time minus the run from that depot), so neither can be read off first.
   The rule: take the LATEST moment t at which a bus leaving the depot valid at t still
   reaches the first pickup on time. That depot is the start depot, and the bus leaves
   it at the last moment that still works, pickup minus the run.

   Usually that departure lies inside the depot's own window. When it does not, it is
   because the window closed before the bus had to leave and the next depot is too far
   to make it in time: "works until 16:00", a 16:10 departure from the office, and home
   would have meant setting off at 15:40 while the driver was still at the office. It
   then leaves from where it was when the window closed — physically the only place it
   can leave from. Scanning per stretch makes this exact and deterministic: within one
   stretch the depot is fixed, so the latest feasible t is a closed form.

   A use with no weekday (older callers, tests) has no windows to apply, and gets the
   fallback depot. */
/* No windows to resolve: the fallback is the answer. Taking the short way here also
   keeps the common case as cheap as it was — depotLegs runs inside the assignment
   search thousands of times. */
const noRules = (state, u) => !rulesOn(state, u).length;

export function startBaseOf(state, u) {
  if (noRules(state, u)) {
    const b = fallbackBaseOf(state, u);
    return { baseId: b, depart: u.start - (b ? legMin(state, b, u.from) : 0) };
  }
  let best = null;
  for (const s of startSegments(state, u)) {
    const depart = u.start - (s.baseId ? legMin(state, s.baseId, u.from) : 0);
    if (depart < s.a) continue;                     // would have to leave before this stretch began
    /* Clipped at the stretch's end, which is exclusive: a departure that only works
       after the window closed ranks just below one that is properly inside the next. */
    const t = depart < s.z ? depart : s.z - 1e-6;
    if (!best || t > best.t) best = { t, baseId: s.baseId, depart };
  }
  return { baseId: best.baseId, depart: best.depart };
}

/* The depot a use RETURNS to, and when the bus gets there. The mirror image of
   startBaseOf: the EARLIEST moment t at which the bus can be back at the depot valid
   at t, having left the last drop-off at the use's end. When the window that would
   take it closes before the bus could arrive, it carries on to the next depot. */
export function endBaseOf(state, u) {
  if (noRules(state, u)) {
    const b = fallbackBaseOf(state, u);
    return { baseId: b, arrive: u.end + (b ? legMin(state, u.to, b) : 0) };
  }
  let best = null;
  for (const s of baseSegments(state, u)) {
    const arrive = u.end + (s.baseId ? legMin(state, u.to, s.baseId) : 0);
    if (arrive >= s.z) continue;                     // the stretch is over before the bus gets there
    const t = Math.max(arrive, s.a);
    if (!best || t < best.t) best = { t, baseId: s.baseId, arrive };
  }
  return { baseId: best.baseId, arrive: best.arrive };
}

/* Does this driver bring a depot of their own, at any time at all? Then the bus's
   depot never matters for their runs. */
export const driverHasBase = (driver) =>
  !!driver?.baseId || (driver?.baseRules || []).some((r) => ruleSpan(r));

/* Drivers for whom the lookup finds no depot at all, so their paid time silently
   falls back to the tasks. Covered: a depot or windows of their own, the club's, or —
   only until the old bus depots are moved — a depot on every bus they could be given
   (just their own bus under the fixed pairing, any bus otherwise). Windows alone
   count: outside them there is no depot, but that is a choice the editor makes
   visible, not a missing setting. */
export function driversWithoutBase(state) {
  if (state.settings?.defaultBaseId) return [];
  return state.drivers.filter((d) => {
    if (driverHasBase(d)) return false;
    const buses = state.vehicles.filter((v) => vehicleAllowedFor(state, d, v.id));
    return !(buses.length && buses.every((v) => v.baseId));
  });
}

/* ---------- Moving bus depots to drivers (ADR-32) ----------
   The depot used to live on the bus. It now goes with the driver, but data saved
   before that still has depots on buses, and they keep working through the lookup's
   last-but-one step (baseOf) until the dispatcher moves them. This is that move.

   It is never done on load: ensureShape runs on every load, so a move there would
   reprice the schedule with nobody watching (E8), and would put back a depot the
   dispatcher had since cleared. Instead it is a plan the dispatcher reads and
   approves once.

   A bus's depot goes to each driver whose own bus (preferredVehicleId) it is — shift
   partners both get it. A driver who already has a depot keeps theirs. A bus with no
   such driver is listed as orphaned, and the drivers still left without a depot are
   listed too, because from then on they start from the club's. Null when no bus has
   a depot, which is also the state after the move. */
export function depotMigrationPlan(state) {
  const buses = state.vehicles.filter((v) => v.baseId);
  if (!buses.length) return null;
  const moves = [], kept = [], orphaned = [];
  for (const v of buses) {
    const owners = state.drivers.filter((d) => d.preferredVehicleId === v.id);
    if (!owners.length) orphaned.push({ vehicleId: v.id, baseId: v.baseId });
    for (const d of owners) {
      if (d.baseId) kept.push({ driverId: d.id, vehicleId: v.id, baseId: d.baseId });
      else moves.push({ driverId: d.id, vehicleId: v.id, baseId: v.baseId });
    }
  }
  const moved = new Set(moves.map((m) => m.driverId));
  const toClub = state.drivers.filter((d) => !d.baseId && !moved.has(d.id)).map((d) => d.id);
  return { moves, kept, orphaned, toClub };
}

/* The approved move, as one new state: drivers get their depots and every bus's is
   cleared, so the plan afterwards is null and the banner goes away for good. */
export function applyDepotMigration(state) {
  const plan = depotMigrationPlan(state);
  if (!plan) return state;
  const to = new Map(plan.moves.map((m) => [m.driverId, m.baseId]));
  return {
    ...state,
    drivers: state.drivers.map((d) => (to.has(d.id) ? { ...d, baseId: to.get(d.id) } : d)),
    vehicles: state.vehicles.map((v) => (v.baseId ? { ...v, baseId: null } : v)),
  };
}

/* The one bus this driver may be given, or null when any bus will do.

   Only with settings.fixedVehicle on, and only for a driver whose preferred bus
   still exists. A dangling preferredVehicleId (older data; deleteGuard prevents new
   ones) pinned to nothing would make the driver unusable for good with no way to see
   why, so it reads as "no preference" — the same thing the soft bias already does
   with it, since every bus then carries the same penalty.

   Two drivers may share one bus: nothing here is exclusive. The usual clash check
   is what keeps them off it at the same time. */
export function fixedVehicleOf(state, driver) {
  /* matchRelaxed: set by optimizer.matchDayState on a match date for a driver whose
     own bus is at the match, so they may be given another bus that day. */
  if (!state.settings?.fixedVehicle || !driver?.preferredVehicleId || driver.matchRelaxed) return null;
  return byId(state.vehicles, driver.preferredVehicleId) ? driver.preferredVehicleId : null;
}
export const vehicleAllowedFor = (state, driver, vehicleId) => {
  const fixed = fixedVehicleOf(state, driver);
  return !fixed || fixed === vehicleId;
};

export function deleteGuard(state, kind, id) {
  const n = (c, w) => (c > 0 ? `Használatban: ${c} ${w}.` : null);
  if (kind === "stations") {
    // The return-leg list has to be counted too. A station used only on the way
    // home would otherwise look unreferenced, become deletable, and afterwards
    // teamRouteOrder's filter would silently skip it — nobody would take those
    // children home. The same applies to a training's own list: a station used
    // only there would look unreferenced as well.
    const inSource = (src) => (src.stationIds || []).includes(id) || (src.returnStationIds || []).includes(id);
    const c = state.teams.filter(inSource).length
      + state.trainings.filter((t) => t.stops && inSource(t.stops)).length
      + state.rides.filter((r) => (r.stops || []).some((s) => s.stationId === id)).length;
    return n(c, "csapat/edzés/fuvar");
  }
  if (kind === "venues") {
    const c = state.teams.filter((t) => (t.venueIds || []).includes(id)).length
      + state.trainings.filter((t) => t.venueId === id).length;
    return n(c, "csapat/edzés");
  }
  if (kind === "vehicles") {
    const c = state.rides.filter((r) => r.vehicleId === id).length
      + chainRefs(state, "vehicleId", id)
      // A deleted preferred vehicle penalises its driver forever: offPreferred
      // stays true for every bus, so preferredBias hides that driver for good.
      + state.drivers.filter((d) => d.preferredVehicleId === id).length
      // A match without its bus would silently stop being a match (isMatch).
      + state.trainings.filter((t) => t.match?.vehicleId === id).length;
    return n(c, "fuvar/beosztás/sofőr/mérkőzés");
  }
  if (kind === "bases") {
    // settings.defaultBaseId has to be counted too. Delete the club depot and
    // every vehicle is left without one, and paid time silently falls back to
    // being measured from the tasks.
    // A depot that is a driver's, all day or only in a time window, is just as much
    // in use: delete it and the window points at nothing, so the driver quietly falls
    // back to the bus's depot at exactly the times the dispatcher said they would not
    // be there.
    const c = state.vehicles.filter((v) => v.baseId === id).length
      + state.drivers.filter((d) => d.baseId === id || (d.baseRules || []).some((r) => r.baseId === id)).length
      + (state.settings?.defaultBaseId === id ? 1 : 0);
    return n(c, "jármű/sofőr/beállítás");
  }
  if (kind === "drivers") {
    const c = state.rides.filter((r) => r.driverId === id).length + chainRefs(state, "driverId", id);
    return n(c, "fuvar/beosztás");
  }
  return null;
}
