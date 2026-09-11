/* Fuvarterv — tasks, routing, chaining, resource assignment.

   The scheduling core. Three phases, in order:
     1. genDayTasks   turn the day's trainings into outbound/return tasks
     2. minCostChains link tasks into chains one bus can actually run
     3. assignResources pick the cheapest (driver, vehicle) for each chain

   Pure domain: no window, no network, and no Math.random on any decision path.
   The optimizer must be deterministic, or the same day would produce a different
   schedule on every click. */

import { DAYS, byId, uid } from "./constants.js";
import { timeToMin, minToTime } from "./datetime.js";
import { legMin, locName } from "./geo.js";
import { weekOccurrences, legFor, legSource, taskNeedsVignette, chainNeedsVignette, vignetteVenues, baseOf, rideWindow } from "./logic.js";

/* Held-Karp: the shortest order that visits every station.
   pre/post pin a point before/after the chain (typically the venue);
   fixedFirst/fixedLast force a first/last station. Exact up to n = 10; above that
   the original order is kept, because the table is 2^n by n. */
export function bestStationOrder(state, ids, { pre = null, post = null, fixedFirst = null, fixedLast = null } = {}) {
  const n = ids.length;
  if (n <= 1 || n > 10) return ids.slice();
  const d = (a, b) => legMin(state, a, b);
  const FULL = (1 << n) - 1;
  const dp = Array.from({ length: 1 << n }, () => Array(n).fill(Infinity));
  const par = Array.from({ length: 1 << n }, () => Array(n).fill(-1));
  for (let i = 0; i < n; i++) {
    if (fixedFirst != null && ids[i] !== fixedFirst) continue;
    dp[1 << i][i] = pre ? d(pre, ids[i]) : 0;
  }
  for (let m = 1; m <= FULL; m++)
    for (let i = 0; i < n; i++) {
      const cur = dp[m][i];
      if (!isFinite(cur)) continue;
      for (let j = 0; j < n; j++) {
        if (m & (1 << j)) continue;
        const nm = m | (1 << j), nc = cur + d(ids[i], ids[j]);
        if (nc < dp[nm][j]) { dp[nm][j] = nc; par[nm][j] = i; }
      }
    }
  let best = Infinity, bi = -1;
  for (let i = 0; i < n; i++) {
    if (fixedLast != null && ids[i] !== fixedLast) continue;
    const c = dp[FULL][i] + (post ? d(ids[i], post) : 0);
    if (c < best) { best = c; bi = i; }
  }
  if (bi < 0) return ids.slice();
  const order = [];
  let m = FULL, i = bi;
  while (i !== -1) { order.push(ids[i]); const pi = par[m][i]; m &= ~(1 << i); i = pi; }
  return order.reverse();
}

/* Outbound timetable, computed BACKWARDS from the arrival time at the venue.
   arr = when the bus must be at the stop; dep = arr + dwell. */
export function planOda(state, order, venueId, arriveBy, dwell) {
  let t = arriveBy;
  const stops = [];
  for (let i = order.length - 1; i >= 0; i--) {
    const next = i === order.length - 1 ? venueId : order[i + 1];
    const dep = t - legMin(state, order[i], next);
    const arr = dep - dwell;
    stops.unshift({ stationId: order[i], arr, dep });
    t = arr;
  }
  return { stops, venueArr: arriveBy, start: stops.length ? stops[0].arr : arriveBy, end: arriveBy };
}

/* Return timetable, computed forwards from the departure at the venue. */
export function planVissza(state, order, venueId, departAt, dwell) {
  let t = departAt, prev = venueId;
  const stops = [];
  for (const sid of order) {
    const arr = t + legMin(state, prev, sid);
    const dep = arr + dwell;
    stops.push({ stationId: sid, arr, dep });
    t = dep; prev = sid;
  }
  return { stops, venueDep: departAt, start: departAt, end: stops.length ? stops[stops.length - 1].arr : departAt };
}

/* The route order for one stop list: automatic (with an optional pinned first
   stop) or manual (the order the chips were switched on; reversed for the return
   leg). The list is the training's own if it has one, else the team's. A subset of
   stops may be passed in when a task was split across buses; the pinned stop only
   applies if it is inside that subset. */
export function legRouteOrder(state, team, training, venueId, dir, stationIds) {
  const leg = legFor(team, training, dir);
  const ids = (stationIds || leg.stationIds || []).filter((id) => byId(state.stations, id));
  if (ids.length <= 1 || leg.routeMode === "manual") {
    /* In manual mode the stored order IS the intended order. Reversing is only
       correct when the return leg mirrors the outbound list; when it has its own,
       the user already built it in homeward order. */
    if (dir === "oda" || leg.isOverride) return ids;
    return [...ids].reverse();
  }
  const anchor = leg.routeAnchorId && ids.includes(leg.routeAnchorId) ? leg.routeAnchorId : null;
  if (dir === "oda") return bestStationOrder(state, ids, { post: venueId, fixedFirst: anchor });
  return bestStationOrder(state, ids, { pre: venueId, fixedLast: anchor });
}

/* The team-level call, the shape this had before per-training lists existed. */
export const teamRouteOrder = (state, team, venueId, dir, stationIds) =>
  legRouteOrder(state, team, null, venueId, dir, stationIds);

/* Pack stops into as few buses as possible (first-fit-decreasing): each bus
   carries at most `cap`, and a stop's whole headcount goes on ONE bus.

   Returns null when there are no per-stop headcounts, or when a single stop alone
   exceeds one bus — neither can be split this way. Within each returned bus the
   stops keep the team's original order. */
export function splitStationsByCapacity(stationIds, cnt, cap) {
  const withCount = stationIds.map((id, i) => ({ id, i, c: cnt(id) })).filter((x) => x.c > 0);
  if (!withCount.length || withCount.some((x) => x.c > cap)) return null;
  const bins = [];
  for (const s of [...withCount].sort((a, b) => b.c - a.c)) {
    let b = bins.find((x) => x.load + s.c <= cap);
    if (!b) { b = { items: [], load: 0 }; bins.push(b); }
    b.items.push(s); b.load += s.c;
  }
  return bins.map((b) => b.items.sort((a, z) => a.i - z.i).map((x) => x.id));
}

/* A day's tasks: an outbound and a return task per training occurrence. When a
   team is larger than the biggest vehicle, the task is split across buses by stop,
   each one an independent parallel ride to the same venue. */
export function genDayTasks(state, weekday, weekMon) {
  const occs = weekOccurrences(state, weekMon).filter((o) => o.dayIdx === weekday);
  const tasks = [], skipped = [];
  const N = state.settings.arriveEarlyMin ?? 10, M = state.settings.departAfterMin ?? 10;
  const dwell = state.settings.dwellMin ?? 2;
  const maxSeats = Math.max(0, ...state.vehicles.map((v) => Number(v.seats) || 0));
  /* A team can have several trainings on one day, at different venues and with
     different stop lists. The bare team name would then produce two
     indistinguishable tasks in the schedule and in the warnings. The venue is
     appended only in that case, so labels stay short on ordinary days. */
  const perTeam = occs.reduce((m, x) => ({ ...m, [x.training.teamId]: (m[x.training.teamId] || 0) + 1 }), {});
  for (const o of occs) {
    const t = o.training, team = byId(state.teams, t.teamId);
    if (!team) continue;
    const suffix = t.type === "weekly" ? weekday : "x";
    const teamLabel = perTeam[t.teamId] > 1 ? `${team.name} · ${locName(state, t.venueId)}` : team.name;

    /* One pass per direction. The return leg may have its own stops and its own
       headcounts, so the stop set, the counts, the passenger total AND the split
       across buses all have to be computed per direction.

       The two directions may therefore split into different numbers of buses.
       Nothing forbids that: from here on the tasks are independent, chaining works
       on time and deadhead, and no rule anywhere pairs #1 with #1. */
    for (const dir of ["oda", "vissza"]) {
      const leg = legFor(team, t, dir);
      const dirLabel = dir === "oda" ? "ODA" : "VISSZA";
      const who = leg.isOverride ? `${teamLabel} · ${dirLabel}` : teamLabel;

      const listed = (leg.stationIds || []).filter((id) => byId(state.stations, id));
      if (!listed.length) {
        skipped.push(`${who}: nincs állomás rendelve, ezért nem készült ${dirLabel} feladat.`);
        continue;
      }
      const sc = leg.stationCounts || {};
      const cnt = (sid) => Number(sc[sid]) || 0;

      /* An explicit 0 means "no need to go here", and the stop drops out of the
         route. An EMPTY field is NOT the same thing: it means "not filled in yet".

         With a half-filled breakdown (the coach has entered counts for only two
         stops so far), skipping the rest would mean leaving children behind — which
         is also why legPax keeps falling back to the team total.

         The data can tell them apart: the editor stores a cleared field as "" and a
         typed zero as a number. */
      const zeroed = (sid) => sc[sid] != null && sc[sid] !== "" && Number(sc[sid]) === 0;
      const st = listed.filter((sid) => !zeroed(sid));
      if (!st.length) {
        skipped.push(`${who}: minden megállónál 0 fő szerepel, ezért nem készült ${dirLabel} feladat.`);
        continue;
      }
      /* Zero passengers means there is nobody to carry. This used to produce a
         task anyway (with a warning), so the optimizer assigned a driver and a bus
         to an empty ride, call-out fee and paid hours included.

         pax is the MAXIMUM of the per-stop breakdown and the team total, so 0 means
         there is no headcount anywhere. The right response is not to schedule a
         ride but to say the data is missing. */
      const pax = legPax(team, t, dir);
      if (!pax) {
        skipped.push(`${who}: nincs megadva létszám (se megállónként, se összesen), ezért nem készült ${dirLabel} feladat. Add meg a létszámot a csapatnál vagy az edzésnél.`);
        continue;
      }

      /* One direction's task over a subset of stops. idx = null means the whole
         team on one bus; idx >= 1 is part idx of a task split across `count` buses. */
      const mkTask = (subset, idx, count) => {
        const order = legRouteOrder(state, team, t, t.venueId, dir, subset);
        const split = idx != null;
        const tag = split ? `#${idx}` : "";
        const name = `${teamLabel} · ${dirLabel}${split ? ` (${idx}/${count})` : ""}`;
        const base = {
          id: `${t.id}:${suffix}:${dir}${tag}`, dir, teamId: team.id, trainingId: t.id,
          pax: split ? order.reduce((a, sid) => a + cnt(sid), 0) : pax, label: name,
          breakdown: order.map((sid) => ({ stationId: sid, count: cnt(sid) })).filter((x) => x.count > 0),
        };
        if (dir === "oda") {
          const op = planOda(state, order, t.venueId, timeToMin(t.start) - N, dwell);
          return { ...base, from: order[0], to: t.venueId, start: op.start, end: op.end,
            plan: op.stops.map((x) => ({ ...x, count: cnt(x.stationId) })), venueTime: op.venueArr };
        }
        const vp = planVissza(state, order, t.venueId, timeToMin(t.end) + M, dwell);
        return { ...base, from: t.venueId, to: order[order.length - 1], start: vp.start, end: vp.end,
          plan: vp.stops.map((x) => ({ ...x, count: cnt(x.stationId) })), venueTime: vp.venueDep };
      };

      const bins = maxSeats > 0 && pax > maxSeats ? splitStationsByCapacity(st, cnt, maxSeats) : null;
      if (bins && bins.length > 1) {
        skipped.push(`${who}: a ${pax} fős létszám meghaladja a legnagyobb jármű férőhelyét (${maxSeats} fő), ezért ${bins.length} buszra bontva, megállónként.`);
        bins.forEach((subset, k) => tasks.push(mkTask(subset, k + 1, bins.length)));
      } else {
        if (maxSeats > 0 && pax > maxSeats) {
          const big = st.filter((sid) => cnt(sid) > maxSeats);
          if (big.length)
            skipped.push(`${who}: megállónként sem osztható — ${big.map((sid) => `${locName(state, sid)} (${cnt(sid)} fő)`).join(", ")} önmagában több, mint a legnagyobb jármű (${maxSeats} fő).`);
          else if (!st.some((sid) => cnt(sid) > 0))
            skipped.push(`${who}: a ${pax} fő meghaladja a legnagyobb jármű férőhelyét (${maxSeats} fő), de nincs megállónkénti létszámbontás, ezért nem osztható buszokra — add meg a megállónkénti létszámokat a felosztáshoz.`);
        }
        tasks.push(mkTask(st, null));
      }
    }
  }
  tasks.sort((a, b) => a.start - b.start || a.end - b.end);
  return { tasks, skipped };
}

/* How many people a team needs carried: the GREATER of the per-stop breakdown's
   sum and the stated team total.

   A partial breakdown used to override the total. On a 12-person team where the
   coach had entered counts for only two stops, that produced 5 — no capacity split
   was triggered, and a 6-seat bus turned up for 12 children, with no warning. */
export function legPax(team, training, dir = "oda") {
  const leg = legFor(team, training, dir);
  const sc = leg.stationCounts;
  const sum = (leg.stationIds || []).reduce((a, id) => a + (Number(sc[id]) || 0), 0);
  /* The total is a fallback: it only counts when the per-stop breakdown is
     smaller. The same rule holds for a return leg with its own list — the same
     children travel, they just get off elsewhere. The fallback comes from whichever
     source supplies the stops: on a training with its own list the team's full
     roster does not apply, since fewer people may attend. */
  return Math.max(sum, Number(legSource(team, training).passengerCount) || 0);
}

/* The team-level call, the shape this had before per-training lists existed. */
export const teamPax = (team, dir = "oda") => legPax(team, null, dir);

/* Is the driver available across the whole [startMin, endMin] span on this
   weekday?

   Touching or overlapping windows MERGE: 15:00-17:00 plus 17:00-19:00 together
   cover a 15:00-19:00 shift. A single window used to have to contain the span on
   its own, so a driver like that dropped out of the day with no explanation.

   Incomplete windows (missing a start or an end) are ignored; they used to make a
   driver silently unavailable for the entire day. */
export function driverAvailableFor(driver, weekday, startMin, endMin) {
  const ws = driver.availability || [];
  if (!ws.length) return true; // nothing specified means available at any time
  const spans = ws
    .filter((w) => (w.days || []).includes(weekday))
    .map((w) => [timeToMin(w.start), timeToMin(w.end)])
    .filter(([a, b]) => a != null && b != null && b > a)
    .sort((x, y) => x[0] - y[0]);
  if (!spans.length) return false;
  let [lo, hi] = spans[0];
  for (const [a, b] of spans.slice(1)) {
    if (a <= hi) { hi = Math.max(hi, b); continue; }   // touching or overlapping, so merge
    if (lo <= startMin && endMin <= hi) return true;
    [lo, hi] = [a, b];
  }
  return lo <= startMin && endMin <= hi;
}

/* Chain view model: ordered tasks plus the links between them (deadhead, idle). */
export function mkChain(state, ts, extra = {}) {
  const tasks = [...ts].sort((a, b) => a.start - b.start);
  const links = [];
  for (let i = 0; i < tasks.length - 1; i++) {
    const A = tasks[i], B = tasks[i + 1];
    const dead = legMin(state, A.to, B.from);
    const gap = B.start - A.end;
    links.push({ a: A, b: B, dead, idle: Math.max(0, gap - dead), infeasible: gap < dead, short: dead - gap });
  }
  return {
    ...extra, tasks, links,
    /* A chain ends at the LATEST finish, not at the finish of whichever task
       starts last. A nested task (15:30-16:00 alongside 15:00-19:00) would otherwise
       shorten the chain to 16:00, breaking availability checks, clash detection and
       the paid-time calculation all at once. */
    start: Math.min(...tasks.map((t) => t.start)),
    end: Math.max(...tasks.map((t) => t.end)),
    maxPax: Math.max(...tasks.map((t) => t.pax)),
  };
}

/* The round trip home between two tasks: out of A's end to a depot and on to B's
   start. Null when no depot is known anywhere, which is the "no depot configured"
   case where paid time is measured from the tasks themselves and nobody ever goes
   home mid-day.

   The depot has to be the one the PAY calculation will use, or the two disagree.
   spanOf resolves it per vehicle through baseOf, and the vehicle is not chosen yet
   at chaining time, so this takes the shortest trip over the depots of the buses
   that could actually run both tasks. That is the optimistic reading, matching the
   question being asked: could the driver get home?

   Reading settings.defaultBaseId alone was the bug. A bus with its own baseId made
   the flow decline to chain (the club depot is near, so "they can go home") while
   spanOf merged the two into one shift anyway (the bus's own depot is far). The day
   then came out as two chains the pay model treated as one turn-out, and the screen
   drew a depot round trip that arrived after it had departed. */
export function homeTripMin(state, A, B) {
  const needsV = taskNeedsVignette(state, A) || taskNeedsVignette(state, B);
  const pax = Math.max(A.pax, B.pax);
  const bases = new Set();
  for (const v of state.vehicles) {
    if (v.seats < pax || (needsV && !v.hasVignette)) continue;
    const b = baseOf(state, v.id);
    if (b) bases.add(b);
  }
  if (!bases.size) return null;
  let best = Infinity;
  for (const b of bases) best = Math.min(best, legMin(state, A.to, b) + legMin(state, b, B.from));
  return best;
}

/* Minimum-cost flow for chaining (bipartite graph, successive shortest paths).
   An edge exists when A.end + deadhead(A.to, B.from) <= B.start; its cost is
   wage x gap minus the call-out fee. Flow is only pushed along paths that reduce
   total cost. */
export function minCostChains(n, edges) {
  const S = 2 * n, T = 2 * n + 1, NN = 2 * n + 2;
  const g = [], head = Array(NN).fill(-1);
  const addEdge = (u, v, cap, cost) => {
    g.push({ v, cap, cost, next: head[u] }); head[u] = g.length - 1;
    g.push({ v: u, cap: 0, cost: -cost, next: head[v] }); head[v] = g.length - 1;
  };
  for (let i = 0; i < n; i++) { addEdge(S, i, 1, 0); addEdge(n + i, T, 1, 0); }
  for (const e of edges) addEdge(e.a, n + e.b, 1, e.cost);
  // Safety bound: at most n augmenting paths can exist (each one links one task).
  // Without it the loop would spin forever on a degenerate residual graph.
  for (let guard = 0; guard <= n; guard++) {
    const dist = Array(NN).fill(Infinity), inq = Array(NN).fill(false), pre = Array(NN).fill(-1);
    dist[S] = 0; const q = [S]; inq[S] = true;
    while (q.length) {
      const u = q.shift(); inq[u] = false;
      for (let ei = head[u]; ei !== -1; ei = g[ei].next) {
        const e = g[ei];
        if (e.cap > 0 && dist[u] + e.cost < dist[e.v] - 1e-9) {
          dist[e.v] = dist[u] + e.cost; pre[e.v] = ei;
          if (!inq[e.v]) { inq[e.v] = true; q.push(e.v); }
        }
      }
    }
    if (!isFinite(dist[T]) || dist[T] >= -1e-9) break;
    let v = T;
    while (v !== S) { const ei = pre[v]; g[ei].cap -= 1; g[ei ^ 1].cap += 1; v = g[ei ^ 1].v; }
  }
  const succ = Array(n).fill(-1), pred = Array(n).fill(-1);
  for (let u = 0; u < n; u++)
    for (let ei = head[u]; ei !== -1; ei = g[ei].next) {
      const e = g[ei];
      if (ei % 2 === 0 && e.v >= n && e.v < 2 * n && e.cap === 0) { succ[u] = e.v - n; pred[e.v - n] = u; }
    }
  /* Read the chains back out. Every task must land in EXACTLY ONE chain. If
     succ/pred closed into a cycle (possible with degenerate, zero- or
     negative-length task windows), the old rule of "only pred === -1 starts a
     chain" made every task in that cycle vanish silently: in no chain and not among
     the uncovered either. The `seen` set guarantees each index appears once. */
  const chains = [];
  const seen = new Array(n).fill(false);
  const walk = (startIdx) => {
    const seq = [];
    let c = startIdx;
    while (c !== -1 && !seen[c]) { seen[c] = true; seq.push(c); c = succ[c]; }
    if (seq.length) chains.push(seq);
  };
  for (let i = 0; i < n; i++) if (pred[i] === -1) walk(i);
  for (let i = 0; i < n; i++) if (!seen[i]) walk(i);   // whatever is left inside a cycle
  return chains;
}

/* A chain's two endpoints: where its first task starts and its last one ends.
   (The occupancy record is deliberately NOT named use*, because that reads as a
   React hook — and the linter treats it as one.) */
export const chainFrom = (c) => c.tasks[0].from;
export const chainTo = (c) => c.tasks[c.tasks.length - 1].to;
/* `dead` rides along because empty running is PRICED (ADR-29), and the deadheads
   inside a chain are empty minutes somebody pays for. Carrying it on the occupancy
   is what lets emptyRunMin stay a function of the uses alone, so driverPay — which
   only ever sees uses — can charge for them. */
export const chainUse = (c, driverId, vehicleId) => ({
  driverId, vehicleId, start: c.start, end: c.end, from: chainFrom(c), to: chainTo(c),
  dead: (c.links || []).reduce((a, l) => a + l.dead, 0),
});

/* The two depot runs bracketing one occupancy: out to the first pickup, and back
   from the last drop-off. Null when no depot applies, which is exactly the case
   where paid time is measured from the tasks themselves.

   DERIVED, never stored. A depot run is a function of the vehicle's depot and the
   occupancy's endpoints, so computing it at display time keeps one source of
   truth: change a vehicle's depot and every view follows with nothing to migrate.
   Writing these legs into rides would also drop them into the ride editor's stop
   list, where they could be edited into something the pay calculation never agreed
   to. */
export function depotLegs(state, u) {
  const baseId = baseOf(state, u.vehicleId);
  if (!baseId) return null;
  const outMin = legMin(state, baseId, u.from);
  const backMin = legMin(state, u.to, baseId);
  /* Each leg repeats baseId rather than leaving it on the parent alone: callers
     hand a single leg to a renderer, and a leg that cannot name its own depot is
     one that quietly prints a question mark. */
  return {
    baseId,
    out: { baseId, fromId: baseId, toId: u.from, min: outMin, depart: u.start - outMin, arrive: u.start },
    back: { baseId, fromId: u.to, toId: baseId, min: backMin, depart: u.end, arrive: u.end + backMin },
  };
}

/* A chain's DEPOT-TO-DEPOT span: the driver starts work on leaving the depot and
   finishes on getting back. With no depot the span equals the tasks' own, which is
   exactly the calculation used before depots existed.

   Expressed through depotLegs so the schedule's printed depot times and the paid
   time they are billed under can never disagree. */
export function spanOf(state, u) {
  const d = depotLegs(state, u);
  if (!d) return { start: u.start, end: u.end };
  return { start: d.out.depart, end: d.back.arrive };
}

/* One ride's occupancy of its driver and vehicle, in the shape spanOf and
   depotLegs expect. The endpoints depend on direction: an outbound run ends at the
   venue, a return run starts there. */
export function rideUse(state, ride, training) {
  const [start, end] = rideWindow(state, ride, training);
  const stops = ride.stops || [];
  const vissza = (ride.dir || "oda") === "vissza";
  return {
    driverId: ride.driverId, vehicleId: ride.vehicleId, start, end,
    from: vissza ? training.venueId : (stops[0]?.stationId || null),
    to: vissza ? (stops[stops.length - 1]?.stationId || null) : training.venueId,
  };
}

/* ONE driver's occupancies grouped into SHIFTS: rows whose depot-to-depot spans
   touch are one turn-out, because there is no time to go home in between.

   This is deliberately the same rule mergeShifts applies to pay, so the depot times
   a driver reads off their sheet and the hours the club is billed for cannot
   disagree. Each group carries the depot run that opens it and the one that closes
   it, taken from its first and last row — those are the two trips actually driven.
   A group's own vehicle decides the depot, so a driver changing bus mid-shift still
   gets the right one at each end.

   Every caller that needs "which trips are one turn-out" goes through here: the
   driver's sheet, the schedule's chain cards, and the empty-running charge. The
   grouping used to be inlined in driverDayShifts alone, so the schedule screen went
   without and drew a depot round trip in the middle of a single shift — arriving at
   the depot AFTER it had already left again. A shared helper is what stops the two
   readings drifting apart again.

   `rows` are objects carrying a `use`; whatever else they hold is passed through. */
function groupByShift(state, rows) {
  const sorted = [...rows].sort((a, b) => a.use.start - b.use.start);
  const groups = [];
  for (const r of sorted) {
    const span = spanOf(state, r.use);
    const g = groups[groups.length - 1];
    if (g && span.start <= g.end) { g.rows.push(r); g.end = Math.max(g.end, span.end); continue; }
    groups.push({ rows: [r], start: span.start, end: span.end });
  }
  return groups.map((g) => ({
    ...g,
    out: depotLegs(state, g.rows[0].use)?.out || null,
    back: depotLegs(state, g.rows[g.rows.length - 1].use)?.back || null,
  }));
}

/* A driver's day split into shifts, from their rides. */
export function driverDayShifts(state, entries) {
  return groupByShift(state, entries.map((e) => ({ ...e, use: rideUse(state, e.ride, e.training) })));
}

/* The day's chains grouped into the shifts they will actually be PAID as, keyed by
   THE CHAIN OBJECT. The schedule screen renders from this: the depot run out belongs
   to the first chain of a shift and the run back to the last, and what sits between
   two chains of one shift is a deadhead and a wait on site, not a trip home.

   Keyed by identity rather than by `c.id`, because a chain fresh out of optimizeDay
   has no id at all — only saved chains and locked skeletons do. Keying by id would
   collide every unsaved chain onto one undefined entry, and a card would then read a
   shift belonging to some other chain.

   Grouped per driver, since a shift is one person's turn-out. A chain with no driver
   is its own shift — two unassigned chains have no reason to merge, and nobody is
   being billed for them yet. */
export function chainShifts(state, chains) {
  const byDriver = new Map();
  for (const c of chains || []) {
    const k = c.driverId || c;                 // no driver: the chain keys itself
    if (!byDriver.has(k)) byDriver.set(k, []);
    byDriver.get(k).push(c);
  }
  const out = new Map();
  for (const cs of byDriver.values()) {
    const rows = cs.map((c) => ({ chain: c, use: chainUse(c, c.driverId, c.vehicleId) }));
    for (const g of groupByShift(state, rows)) {
      /* Priced once for the whole shift, so the cards of a two-chain shift cannot
         show two call-out fees for a driver who only turned out once. */
      const pay = driverPay(state, byId(state.drivers, g.rows[0].chain.driverId), g.rows.map((r) => r.use));
      g.rows.forEach((r, i) => out.set(r.chain, {
        shift: g, pay, chains: g.rows.length,
        first: i === 0, last: i === g.rows.length - 1,
        /* The link back to the previous chain of the same shift: the empty trip the
           bus really makes, and how long it then stands there. */
        gap: i === 0 ? null : {
          dead: legMin(state, g.rows[i - 1].use.to, r.use.from),
          from: g.rows[i - 1].use.to,
          to: r.use.from,
          wait: Math.max(0, r.use.start - g.rows[i - 1].use.end - legMin(state, g.rows[i - 1].use.to, r.use.from)),
        },
      }));
    }
  }
  return out;
}

/* The EMPTY minutes a driver's occupancies cost: the depot run that opens each
   shift and the one that closes it, the deadheads between two runs inside a shift,
   and the deadheads inside the chains themselves.

   This is the quantity ADR-29 puts a price on. It is deliberately a function of the
   uses alone — `dead` rides along on the occupancy — because driverPay never sees
   the chains, and the charge has to land in the same place the wages do or the
   optimizer would weigh a priced plan against an unpriced one. */
export function emptyRunMin(state, uses) {
  let min = 0;
  for (const g of groupByShift(state, (uses || []).map((u) => ({ use: u })))) {
    min += (g.out?.min || 0) + (g.back?.min || 0);
    g.rows.forEach((r, i) => {
      min += r.use.dead || 0;
      if (i > 0) min += legMin(state, g.rows[i - 1].use.to, r.use.from);
    });
  }
  return min;
}

/* A driver's shifts: overlapping depot-to-depot spans merge into ONE shift.

   This is where "can the driver go home between two rides" is decided, with no
   separate rule: if there is no time to get home and back, the two spans overlap,
   so they become one shift — with the waiting time at the venue paid. */
export function mergeShifts(spans) {
  const out = [];
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

/* A driver's paid time and cost, from the chain occupancies assigned to them.
   The call-out fee is PER SHIFT, not per chain: somebody who could not go home in
   between did not turn out twice.

   Cost is wages, plus the call-out fees, PLUS the empty running (ADR-29). Until the
   last of those existed, driving an empty bus was free: the optimizer would happily
   send it 22 minutes back to the depot and 22 minutes out again to avoid paying for
   96 minutes of waiting, because only the waiting had a price. Charging the empty
   minutes here — in the one function every cost in the app is built from — is what
   makes that trade honest everywhere at once, the assignment search and the
   improvement loop included. */
export function driverPay(state, driver, uses) {
  const shifts = mergeShifts(uses.map((u) => spanOf(state, u)));
  let paid = 0, cost = 0;
  for (const sh of shifts) {
    const p = Math.max(sh.end - sh.start, driver?.minShiftMin || 0);
    paid += p;
    cost += (state.settings.calloutFee || 0) + (p / 60) * (driver?.wage || 0);
  }
  const empty = emptyRunMin(state, uses);
  cost += empty * (state.settings.runCostPerMin || 0);
  return { paid, cost, shifts, emptyMin: empty };
}

/* On-site waiting: the time between two chains that fall inside one shift. The
   driver cannot go home, so they wait there. Nothing used to count this. */
export function onSiteWait(state, uses) {
  const us = [...uses].sort((a, b) => a.start - b.start);
  let w = 0;
  for (let i = 0; i < us.length - 1; i++) {
    const a = us[i], b = us[i + 1];
    // The driving between the two is a deadhead, not standing about. Counting the
    // whole gap as waiting made this stat disagree with the chain card's own
    // breakdown, which splits the two.
    if (spanOf(state, b).start <= spanOf(state, a).end)
      w += Math.max(0, b.start - a.end - legMin(state, a.to, b.from));
  }
  return w;
}

/* ---------------------------------------------------------------------------
   Fairness: spreading the work, not just pricing it.
   ---------------------------------------------------------------------------
   Left to itself the optimizer hires the cheapest legal driver every time, so the
   lowest wage on the roster runs the whole week and everyone else sits at home.
   These three functions add a second pull, against paid minutes.

   PAID minutes, not chains or money: it is what a driver actually gives up, and the
   minimum-shift floor is part of it, because a short call-out still costs them the
   evening. Money would be the wrong unit — it would make a cheap driver work longer
   to "catch up" with an expensive one.

   Deterministic throughout. There is no randomness here, despite the feature being
   described as randomising drivers: the same week must always produce the same
   schedule, and a penalty gets there without breaking that. */

/* Paid minutes per driver across a set of chains, by the same reckoning that bills
   them: depot to depot, shifts merged, minimum shift applied. */
export function paidByDriver(state, chains) {
  const uses = new Map();
  for (const c of chains || []) {
    if (!c.driverId) continue;
    if (!uses.has(c.driverId)) uses.set(c.driverId, []);
    uses.get(c.driverId).push(chainUse(c, c.driverId, c.vehicleId));
  }
  const out = new Map();
  for (const [id, us] of uses) out.set(id, driverPay(state, byId(state.drivers, id), us).paid);
  return out;
}

/* Each driver's fair share of the paid minutes, weighted by how much of the work
   they could legally have taken.

   Weighting matters more than it looks. A driver free only on Tuesdays can never
   reach an equal slice of the week, and a penalty aimed at flat equality would keep
   pushing work at them to close a gap their own availability makes impossible —
   over-assigning the least available person, which is the opposite of fair.

   `entries` need only weekday, start and end: enough to ask who could have covered
   what. */
export function fairShares(state, entries, totalPaidMin) {
  const w = new Map();
  let sum = 0;
  for (const d of state.drivers) {
    const n = (entries || []).filter((e) => driverAvailableFor(d, e.weekday, e.start, e.end)).length;
    w.set(d.id, n);
    sum += n;
  }
  const out = new Map();
  for (const d of state.drivers) out.set(d.id, sum > 0 ? (totalPaidMin * w.get(d.id)) / sum : 0);
  return out;
}

/* The penalty for a driver sitting at `minutes` when their share is `share`.

   Quadratic in the ratio, so the cost of another hour rises the further past their
   share a driver already is. At exactly their share the marginal pull is
   2 x bias / share per minute; `bias` is therefore in the same forint-ish units as
   preferredBias, and 0 turns the whole thing off. Under-worked drivers are not
   rewarded, only over-worked ones charged: the penalty is what the search is trying
   to avoid, and pulling work away from one driver necessarily hands it to another. */
export const fairPenalty = (bias, minutes, share) =>
  (!bias || share <= 0) ? 0 : bias * ((minutes / share) ** 2);

/* Do two chains using the SAME resource clash? Not overlapping in time is not
   enough: the bus also has to physically get there.

   Without this check one driver and bus could be given a chain ending in one
   village at 15:50 and another starting in a different town at 15:50 — a physically
   impossible roster, with no warning. */
export function resourceClash(state, u, c) {
  // A chain object carries no from/to field; the endpoints come from its tasks.
  // (c.from / c.to would be undefined, legMin would return 0, and the check would
  // silently permit every deadhead.)
  if (u.start < c.end && c.start < u.end) return true;                             // overlap in time
  if (u.end <= c.start) return u.end + legMin(state, u.to, chainFrom(c)) > c.start; // u, then c
  return c.end + legMin(state, chainTo(c), u.from) > u.start;                       // c, then u
}

/* Exact (driver, vehicle) to chain assignment: backtracking search with cost-bound pruning.

   `fairness` is optional: { bias, shares, baseline }. When present, a chain's price
   carries the change in its driver's fairness penalty as well as the money, where
   `baseline` is what that driver already has booked elsewhere in the week. Omit it
   and this behaves exactly as it did before fairness existed. */
export function assignResources(state, weekday, freeChains, fixedUse, fairness = null) {
  const chains = [...freeChains].sort((a, b) => a.start - b.start);
  let best = null, iter = 0, capped = false;
  const rec = (i, used, acc, cost) => {
    if (iter++ > 30000) { capped = true; return; }
    if (best && cost >= best.cost) return;
    if (i === chains.length) { best = { cost, picks: acc.map((x) => ({ ...x })) }; return; }
    const c = chains[i];
    const opts = [];
    /* The vignette is as hard a constraint as capacity: a bus without one is never
       even considered for a chain going to a venue that requires it. The optimizer
       then cannot propose a bad plan, so there is nothing to undo by hand. */
    const needsV = chainNeedsVignette(state, c);
    for (const d of state.drivers) {
      if (!driverAvailableFor(d, weekday, c.start, c.end)) continue;
      if (used.some((u) => u.driverId === d.id && resourceClash(state, u, c))) continue;
      for (const v of state.vehicles) {
        if (v.seats < c.maxPax) continue;
        if (needsV && !v.hasVignette) continue;
        if (used.some((u) => u.vehicleId === v.id && resourceClash(state, u, c))) continue;
        /* A chain's price is the INCREMENT to that driver's cost for the day. If
           it attaches to a shift they already have (because they cannot go home in
           between), the price is only the extra paid time, with no second call-out
           fee. */
        const mine = used.filter((u) => u.driverId === d.id);
        const after = driverPay(state, d, [...mine, chainUse(c, d.id, v.id)]);
        const before = driverPay(state, d, mine);
        const delta = after.cost - before.cost;
        /* Both halves come from the two calls already made for the money, so
           fairness costs the search nothing extra. */
        let fair = 0;
        if (fairness?.bias) {
          const base = fairness.baseline?.get(d.id) || 0;
          const share = fairness.shares?.get(d.id) || 0;
          fair = fairPenalty(fairness.bias, base + after.paid, share)
            - fairPenalty(fairness.bias, base + before.paid, share);
        }
        // Soft preferred-vehicle bias: penalize putting a driver on any bus
        // other than their preferred one, so the optimizer keeps drivers on
        // their usual vehicle unless a real constraint (capacity/availability/
        // contention) or a larger true saving makes it worthwhile.
        const offPreferred = d.preferredVehicleId && v.id !== d.preferredVehicleId;
        const bias = offPreferred ? (state.settings.preferredBias || 0) : 0;
        opts.push({ d, v, cost: delta + bias + fair });
      }
    }
    opts.sort((x, y) => x.cost - y.cost || x.v.seats - y.v.seats);
    for (const o of opts) {
      used.push(chainUse(c, o.d.id, o.v.id));
      acc.push({ chain: c, driverId: o.d.id, vehicleId: o.v.id });
      rec(i + 1, used, acc, cost + o.cost);
      acc.pop(); used.pop();
    }
    if (!opts.length) {
      acc.push({ chain: c, uncovered: true });
      rec(i + 1, used, acc, cost + 1e7);
      acc.pop();
    }
  };
  rec(0, [...fixedUse], [], 0);
  return { picks: best ? best.picks : [], cost: best ? best.cost : (chains.length ? 1e9 : 0), capped };
}

export function contentionReasons(state, weekday, t) {
  const av = state.drivers.filter((d) => driverAvailableFor(d, weekday, t.start, t.end));
  const needsV = taskNeedsVignette(state, t);
  const bigV = state.vehicles.filter((v) => v.seats >= t.pax && (!needsV || v.hasVignette));
  const what = needsV ? "elegendő férőhelyű, országos matricás jármű" : "elegendő férőhelyű jármű";
  return [`Erőforrás-ütközés: ${DAYS[weekday]} ${minToTime(t.start)}–${minToTime(t.end)} között minden alkalmas erőforrás foglalt (elérhető sofőr: ${av.length}, ${what}: ${bigV.length}).`];
}

/* Resolve the saved schedule into a view model, with live clash detection. */
export function resolveDay(state, weekday, weekMon) {
  const { tasks, skipped } = genDayTasks(state, weekday, weekMon);
  const tmap = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const assigned = new Set();
  const chains = [];
  let droppedChains = 0;
  for (const ch of (state.assignments?.[weekday]?.chains || [])) {
    const ts = ch.taskIds.filter((x) => tmap[x.id]).map((x) => ({ ...tmap[x.id], locked: !!x.locked }));
    /* A chain's task ids can go stale. The id contains the split index, so after
       a change to the stops or the headcounts a `...:vissza` id can become
       `...:vissza#1` and `...:vissza#2`. The chain would then disappear, taking its
       stored driver, vehicle and locks with it — silently. Count those and let the
       caller say so, because to a user this reads as "my schedule vanished". */
    if (!ts.length) { droppedChains++; continue; }
    ts.forEach((t) => assigned.add(t.id));
    const c = mkChain(state, ts, { id: ch.id, driverId: ch.driverId, vehicleId: ch.vehicleId, locked: !!ch.locked });
    c.driver = byId(state.drivers, ch.driverId);
    c.vehicle = byId(state.vehicles, ch.vehicleId);
    c.issues = [];
    c.links.filter((l) => l.infeasible).forEach((l) =>
      c.issues.push(`Szoros átkötés: ${l.a.label} → ${l.b.label} — ${l.short} perccel több idő kellene az üresjárathoz.`));
    if (c.driver && !driverAvailableFor(c.driver, weekday, c.start, c.end))
      c.issues.push(`${c.driver.name} nem érhető el a teljes ${minToTime(c.start)}–${minToTime(c.end)} sávban.`);
    if (c.vehicle && c.maxPax > c.vehicle.seats)
      c.issues.push(`A létszám (${c.maxPax} fő) meghaladja a(z) ${c.vehicle.plate} férőhelyét (${c.vehicle.seats}).`);
    /* A bus without a vignette can be assigned by hand, and one can survive in an
       older saved schedule where the venue only became vignette-only afterwards. We
       do not silently fix it, but we do say so. */
    if (c.vehicle && !c.vehicle.hasVignette && chainNeedsVignette(state, c))
      c.issues.push(`A(z) ${c.vehicle.plate} nincs országos matricával, de a lánc ide megy: ${vignetteVenues(state, c).join(", ")}.`);
    chains.push(c);
  }
  for (let i = 0; i < chains.length; i++)
    for (let j = i + 1; j < chains.length; j++) {
      const A = chains[i], B = chains[j];
      if (!(A.start < B.end && B.start < A.end)) continue;
      if (A.driverId && A.driverId === B.driverId) {
        const m = `Sofőrütközés: ${A.driver?.name || "?"} egyszerre két láncban van.`;
        A.issues.push(m); B.issues.push(m);
      }
      if (A.vehicleId && A.vehicleId === B.vehicleId) {
        const m = `Járműütközés: ${A.vehicle?.plate || "?"} egyszerre két láncban van.`;
        A.issues.push(m); B.issues.push(m);
      }
    }
  /* The same resource in two chains that do NOT overlap in time is still
     impossible when there is no room for the deadhead between them. Nothing used to
     flag that. */
  for (let i = 0; i < chains.length; i++)
    for (let j = 0; j < chains.length; j++) {
      if (i === j) continue;
      const A = chains[i], B = chains[j];
      if (A.end > B.start) continue;                       // csak A → B sorrendre
      if (!((A.driverId && A.driverId === B.driverId) || (A.vehicleId && A.vehicleId === B.vehicleId))) continue;
      const dead = legMin(state, chainTo(A), chainFrom(B));
      if (A.end + dead <= B.start) continue;
      const who = A.driverId === B.driverId ? (A.driver?.name || "A sofőr") : (A.vehicle?.plate || "A jármű");
      const m = `Nem érhető át: ${who} ${minToTime(A.end)}-kor végez itt: ${locName(state, chainTo(A))}, `
        + `de ${minToTime(B.start)}-kor már itt kellene lennie: ${locName(state, chainFrom(B))} `
        + `(${dead} p üresjárat, ${B.start - A.end} p áll rendelkezésre).`;
      A.issues.push(m); B.issues.push(m);
    }
  chains.sort((a, b) => a.start - b.start);
  const notes = droppedChains
    ? [...skipped, `${droppedChains} korábban mentett lánc feladatai már nem léteznek ebben a formában (valószínűleg megváltoztak a megállók vagy a létszámok), ezért kikerültek a beosztásból. Futtasd újra az optimalizálást.`]
    : skipped;
  return { tasks, chains, unassigned: tasks.filter((t) => !assigned.has(t.id)), skipped: notes };
}

export function dayStats(state, chains) {
  let paid = 0, cost = 0, dead = 0, idle = 0;
  const ds = new Set();
  /* Totalled per driver, not per chain: paid time is the depot-to-depot shift, and
     two chains can fall inside one shift. Summing per chain dropped the waiting time
     in between and counted the call-out fee twice. */
  const byDriver = new Map();
  for (const c of chains) {
    for (const l of c.links) idle += l.idle;
    // A call-out fee is only due when somebody actually turns out. A chain with no
    // driver used to carry one anyway, inflating the "before" column of the proposal.
    if (!c.driverId) {
      paid += Math.max(c.end - c.start, 0);
      for (const l of c.links) dead += l.dead;   // no shift to charge these to
      continue;
    }
    ds.add(c.driverId);
    if (!byDriver.has(c.driverId)) byDriver.set(c.driverId, []);
    byDriver.get(c.driverId).push(chainUse(c, c.driverId, c.vehicleId));
  }
  for (const [id, uses] of byDriver) {
    const r = driverPay(state, byId(state.drivers, id), uses);
    paid += r.paid; cost += r.cost;
    /* The whole empty run, depot legs included — which is what the club is now
       charged for, so it is what the stat has to show. Counting only the deadheads
       between two tasks hid exactly the trip this stat should expose: the bus going
       home in the middle of the afternoon. */
    dead += r.emptyMin;
    idle += onSiteWait(state, uses);
  }
  return { drivers: ds.size, chains: chains.length, paidMin: paid, dead, idle, cost: Math.round(cost) };
}

/* Turn the schedule's chains into actual rides: one ride per task, with the stop
   times taken from the task's own timetable. This is how the schedule shows up on
   the week and driver screens too. */
export function ridesFromChains(state, weekday, chains) {
  const out = [];
  for (const ch of chains || []) {
    for (const t of ch.tasks || []) {
      const tr = byId(state.trainings, t.trainingId);
      if (!tr) continue;
      out.push({
        id: uid(),
        trainingId: t.trainingId,
        day: tr.type === "weekly" ? weekday : null,
        date: tr.type === "once" ? tr.date : null,
        vehicleId: ch.vehicleId || "",
        driverId: ch.driverId || "",
        dir: t.dir,
        source: "schedule",
        /* Outbound, a stop's time is the DEPARTURE (after boarding); on the return
           leg it is the ARRIVAL (when they get off). Generation used to write the
           arrival in both directions, so the week screen's clash window was
           consistently `dwellMin` minutes out from the schedule, and the printed time
           did not mean what the ride editor's field sets. */
        stops: (t.plan || []).map((s) => ({
          id: uid(), stationId: s.stationId,
          time: minToTime(t.dir === "vissza" ? s.arr : s.dep),
          count: Number(s.count) > 0 ? s.count : "",
        })),
      });
    }
  }
  return out;
}

/* True when this ride belongs to the tasks affected on this weekday. These are the
   rides that generating from the schedule replaces. */
export function rideBelongsToDay(state, ride, weekday, affectedTrainingIds) {
  if (!affectedTrainingIds.has(ride.trainingId)) return false;
  const tr = byId(state.trainings, ride.trainingId);
  if (!tr) return false;
  return tr.type === "weekly" ? ride.day === weekday : true;
}

/* Replace every ride of the day's affected trainings with ones generated from the
   schedule's chains. The user opts into this: the schedule then owns the day's whole
   set of rides. */
export function withGeneratedRides(state, weekday, weekMon, chains) {
  const { tasks } = genDayTasks(state, weekday, weekMon);
  const affected = new Set(tasks.map((t) => t.trainingId));
  const kept = state.rides.filter((r) => !rideBelongsToDay(state, r, weekday, affected));
  return [...kept, ...ridesFromChains(state, weekday, chains)];
}

/* The entry point for optimising one day.

   `fairness` is optional and comes from optimizeWeek, which knows what each driver
   already has booked on the other six days. Called without it, the day still
   balances — just against itself, since one day is all it can see. */
export function optimizeDay(state, weekday, weekMon, fairness = null) {
  const cur = resolveDay(state, weekday, weekMon);
  const notes = [...cur.skipped];
  if (!cur.tasks.length) return { empty: true, notes };
  const maxSeats = Math.max(0, ...state.vehicles.map((v) => Number(v.seats) || 0));

  /* Locked work becomes skeleton chains carrying their driver and vehicle.

     Two kinds of lock feed this. A LOCKED TASK pins that one task. A LOCKED CHAIN
     pins all of its tasks at once, whatever their own flags say — that is the whole
     point of it: the run has been settled with the driver, and picking it apart task
     by task is exactly what the user asked us not to do.

     Neither kind seals the chain. The improvement loop may still append compatible
     work to a skeleton, and what it appends arrives UNLOCKED, so the next run is free
     to place it somewhere better. A lock holds what was locked, and no more. */
  const lockedGroups = new Map();
  for (const ch of cur.chains) {
    const lt = ch.locked ? ch.tasks : ch.tasks.filter((t) => t.locked);
    if (!lt.length) continue;
    /* Grouped by chain id, NOT by driver|vehicle. The latter fused two deliberately
       separate shifts (a morning and an evening one with the same driver and bus)
       into a single 07:00-20:00 chain with one call-out fee, making both the cost
       estimate and the printed schedule wrong. */
    const k = ch.id || `${ch.driverId}|${ch.vehicleId}`;
    if (!lockedGroups.has(k)) lockedGroups.set(k, { driverId: ch.driverId, vehicleId: ch.vehicleId, locked: !!ch.locked, tasks: [] });
    lockedGroups.get(k).tasks.push(...lt);
  }
  const lockedIds = new Set([...lockedGroups.values()].flatMap((g) => g.tasks.map((t) => t.id)));

  // Hard feasibility of the free tasks, so an impossible one gets a precise reason.
  const uncovered = [], free = [];
  for (const t of cur.tasks) {
    if (lockedIds.has(t.id)) continue;
    const reasons = [];
    if (t.pax > maxSeats)
      reasons.push(`Nincs jármű elegendő férőhellyel: ${t.pax} fő kellene, a legnagyobb jármű ${maxSeats} férőhelyes.`);
    if (taskNeedsVignette(state, t) && !state.vehicles.some((v) => v.hasVignette && v.seats >= t.pax))
      reasons.push(`Nincs országos matricás jármű ${t.pax} fővel: ${vignetteVenues(state, { tasks: [t] }).join(", ")} csak matricás autóval érhető el.`);
    if (!state.drivers.some((d) => driverAvailableFor(d, weekday, t.start, t.end)))
      reasons.push(`Egyik sofőr sem érhető el ${DAYS[weekday]} ${minToTime(t.start)}–${minToTime(t.end)} között.`);
    if (reasons.length) uncovered.push({ task: t, reasons });
    else free.push(t);
  }

  const skel = [...lockedGroups.values()].map((gp) =>
    mkChain(state, gp.tasks, { id: uid(), driverId: gp.driverId, vehicleId: gp.vehicleId, hasLocked: true, locked: gp.locked }));

  // Phase 1: chaining by minimum-cost flow, gaps weighted by the average wage.
  const wages = state.drivers.map((d) => d.wage || 0);
  const avgWpm = (wages.reduce((a, b) => a + b, 0) / (wages.length || 1)) / 60;
  const runRate = state.settings.runCostPerMin || 0;
  const edges = [];
  for (let a = 0; a < free.length; a++)
    for (let b = 0; b < free.length; b++) {
      if (a === b) continue;
      const A = free[a], B = free[b];
      const dead = legMin(state, A.to, B.from);
      if (A.end + dead <= B.start) {
        /* If the driver cannot get home during the gap, that waiting time is paid
           whether or not we chain. Chaining then purely saves one call-out fee, so
           the gap must not be charged against it. */
        const gap = B.start - A.end;
        const trip = homeTripMin(state, A, B);
        const forced = trip != null && gap < trip;
        /* Not chaining means the bus drives A.to → depot → B.from; chaining means it
           drives A.to → B.from. So chaining also saves the difference in empty
           running. When the driver is stuck there anyway (forced) no depot trip
           happens either way, and the two readings cost the same. */
        const runSave = forced || trip == null ? 0 : Math.max(0, trip - dead) * runRate;
        edges.push({ a, b, cost: (forced ? 0 : Math.round(gap * avgWpm))
          - (state.settings.calloutFee || 0) - Math.round(runSave) });
      }
    }
  let freeChains = minCostChains(free.length, edges).map((seq) => mkChain(state, seq.map((i) => free[i])));

  // Phase 2: assignment at true cost, plus a local-improvement loop that tries
  // merges. The flow only sees gap x average wage minus the call-out fee; minimum
  // shift lengths and differing wages are corrected here, against the real cost
  // function.
  /* Skeleton chains are priced with the same formula assignResources uses, the
     preferred-vehicle penalty included. Without that the improvement loop compared a
     biased cost against an unbiased one, so with the default preferredBias it saw a
     genuinely more expensive merge as an "improvement" — and the displayed daily cost
     went UP after optimising. */
  const skelCost = (c) => {
    const d = byId(state.drivers, c.driverId);
    const offPreferred = d?.preferredVehicleId && c.vehicleId !== d.preferredVehicleId;
    return driverPay(state, d, [chainUse(c, c.driverId, c.vehicleId)]).cost
      + (offPreferred ? (state.settings.preferredBias || 0) : 0);
  };
  const fixedUseOf = (sk) => sk.map((c) => chainUse(c, c.driverId, c.vehicleId));
  let anyCapped = false;
  /* With no week-level view, the day balances against itself: shares are worked out
     from this day's own chains, and nothing is carried in from elsewhere. */
  const fair = fairness || (state.settings?.fairnessBias
    ? { bias: state.settings.fairnessBias, baseline: new Map(),
        shares: fairShares(state,
          freeChains.map((c) => ({ weekday, start: c.start, end: c.end })),
          freeChains.reduce((a, c) => a + (c.end - c.start), 0)) }
    : null);
  const evalPlan = (skl, fre) => {
    const asg = assignResources(state, weekday, fre, fixedUseOf(skl), fair);
    if (asg.capped) anyCapped = true;
    return { asg, cost: skl.reduce((a, c) => a + skelCost(c), 0) + asg.cost };
  };
  let skl = skel, fre = freeChains, plan = evalPlan(skl, fre);
  // The optimizer's objective before the local-improvement loop. The loop never
  // accepts a trial that costs MORE, so this never increases.
  // (This is money + an uncovered-task penalty — the true monetary cost alone
  // can legitimately rise when improvement covers a previously uncovered task.)
  const objectiveBefore = plan.cost;
  /* A merge is taken when it is not more expensive, not only when it is cheaper.
     Two chains a driver runs in one unbroken shift cost exactly the same whether
     they are recorded as one chain or two, so on a strict test the split survived on
     a tie — and a split chain prints its own depot run at each end. Accepting the
     tie states the truth: it is one run. Every accepted merge removes a chain, so
     the loop still terminates. */
  const accept = (t) => t.cost <= plan.cost + 1e-9;
  for (let guard = 0; guard < 60; guard++) {
    let improved = false;
    outer:
    for (let i = 0; i < fre.length; i++)
      for (let j = 0; j < fre.length; j++) {
        if (i === j) continue;
        const A = fre[i], B = fre[j];
        if (A.end + legMin(state, A.tasks[A.tasks.length - 1].to, B.tasks[0].from) > B.start) continue;
        const trialF = fre.filter((_, k) => k !== i && k !== j);
        trialF.push(mkChain(state, [...A.tasks, ...B.tasks]));
        const t = evalPlan(skl, trialF);
        if (accept(t)) { fre = trialF; plan = t; improved = true; break outer; }
      }
    if (!improved) {
      skmerge:
      for (let i = 0; i < fre.length; i++)
        for (let k = 0; k < skl.length; k++) {
          const F = fre[i], K = skl[k];
          const d = byId(state.drivers, K.driverId), v = byId(state.vehicles, K.vehicleId);
          if (!d || !v) continue;
          const after = K.end + legMin(state, K.tasks[K.tasks.length - 1].to, F.tasks[0].from) <= F.start;
          const before = F.end + legMin(state, F.tasks[F.tasks.length - 1].to, K.tasks[0].from) <= K.start;
          if ((!after && !before) || Math.max(F.maxPax, K.maxPax) > v.seats) continue;
          if (!driverAvailableFor(d, weekday, Math.min(K.start, F.start), Math.max(K.end, F.end))) continue;
          /* A skeleton chain's vehicle is fixed, so it cannot acquire a vignette:
             a task that needs one may only be appended to a bus that has one. */
          if (chainNeedsVignette(state, F) && !v.hasVignette) continue;
          const trialS = skl.map((c, x) => (x === k ? mkChain(state, [...c.tasks, ...F.tasks], c) : c));
          const trialF = fre.filter((_, x) => x !== i);
          const t = evalPlan(trialS, trialF);
          if (accept(t)) { skl = trialS; fre = trialF; plan = t; improved = true; break skmerge; }
        }
    }
    if (!improved) break;
  }
  if (anyCapped) notes.push("A keresési tér nagy volt, a hozzárendelés a legjobb megtalált megoldás (heurisztikus).");
  const result = [...skl];
  for (const p of plan.asg.picks) {
    if (p.uncovered) p.chain.tasks.forEach((t) => uncovered.push({ task: t, reasons: contentionReasons(state, weekday, t) }));
    else result.push({ ...p.chain, driverId: p.driverId, vehicleId: p.vehicleId });
  }
  result.sort((a, b) => a.start - b.start);
  return { empty: false, chains: result, uncovered, notes, stats: dayStats(state, result),
    improve: { before: objectiveBefore, after: plan.cost } };
}

/* How many refinement passes the week is allowed before we stop and say so. In
   practice it settles in two or three; the cap is there so a pathological week
   cannot spin. */
export const WEEK_PASSES = 6;

const sumMaps = (maps) => {
  const out = new Map();
  for (const m of maps) for (const [k, v] of m) out.set(k, (out.get(k) || 0) + v);
  return out;
};

/* How far the worst-off driver is from their share, as a ratio. 0 is perfectly even;
   1 means somebody is carrying double. Drivers with no share (never available for
   any of the week's work) are left out — they cannot be balanced. */
export function imbalanceOf(minutes, shares) {
  let worst = 0;
  for (const [id, share] of shares) {
    if (share <= 0) continue;
    worst = Math.max(worst, Math.abs((minutes.get(id) || 0) / share - 1));
  }
  return worst;
}

/* The entry point for optimising a WHOLE WEEK.

   Chaining is untouched and stays per-day: a chain never crosses midnight, so the
   seven days really are independent there, and phase one needs no week-wide view.
   What the week adds is the fairness tally, which is the one thing a single day
   cannot see — a driver's share is only meaningful across all the work there is.

   The days are deliberately NOT planned in sequence. That would leave Monday
   choosing blind and Friday choosing with everything already fixed, so the result
   would depend on the order the days happened to be visited. Instead every pass
   re-plans each day against what the OTHER six looked like in the previous pass.
   No day has priority, and once the passes stop changing anything the answer is
   independent of where it started. */
export function optimizeWeek(state, weekMon) {
  const bias = state.settings?.fairnessBias || 0;
  const notes = [];
  let days = DAYS.map((_, d) => optimizeDay(state, d, weekMon));
  let passes = 0, converged = true;

  /* What the week looks like today, before any of this is applied — the "before"
     column, worked out from the saved schedule rather than from the proposal. */
  const beforeDays = DAYS.map((_, d) => resolveDay(state, d, weekMon));
  const beforeMin = sumMaps(beforeDays.map((r) => paidByDriver(state, r.chains)));
  const totalsBefore = beforeDays.reduce((a, r) => {
    const st = dayStats(state, r.chains);
    return { cost: a.cost + st.cost, paidMin: a.paidMin + st.paidMin,
      chains: a.chains + st.chains, uncovered: a.uncovered + r.unassigned.length };
  }, { cost: 0, paidMin: 0, chains: 0, uncovered: 0 });

  const entries = days.flatMap((r, d) => (r.chains || []).map((c) => ({ weekday: d, start: c.start, end: c.end })));
  const totalPaid = days.reduce((a, r) => a + (r.stats?.paidMin || 0), 0);
  const shares = fairShares(state, entries, totalPaid);

  if (bias && totalPaid > 0) {
    /* Two plans are "the same" when every chain has the same crew and the same
       tasks. Comparing that rather than cost stops the loop chasing rounding. */
    const sig = (r) => (r.chains || [])
      .map((c) => `${c.driverId}|${c.vehicleId}|${c.tasks.map((t) => t.id).join(",")}`)
      .sort().join(";");
    let prev = days.map(sig).join("#");
    converged = false;

    /* Each pass walks the days one at a time, re-planning a day against what every
       OTHER day currently holds — including days already revisited in this same pass.

       Re-planning all seven at once against a single frozen snapshot sounds fairer
       and is in fact unusable: every day then sees the same least-loaded driver and
       every day picks them, so the whole week lands on one person and flips to the
       next on the following pass, for ever. Reacting one at a time is what breaks
       that tie.

       The starting day rotates per pass so no weekday is permanently the one that
       chooses first, and a pass that changes nothing is a fixed point: stable no
       matter which day is asked next. */
    const perDay = days.map((r) => paidByDriver(state, r.chains));
    for (passes = 1; passes <= WEEK_PASSES; passes++) {
      for (let k = 0; k < DAYS.length; k++) {
        const d = (k + passes - 1) % DAYS.length;
        const baseline = sumMaps(perDay.filter((_, i) => i !== d));
        days[d] = optimizeDay(state, d, weekMon, { bias, shares, baseline });
        perDay[d] = paidByDriver(state, days[d].chains);
      }
      const now = days.map(sig).join("#");
      if (now === prev) { converged = true; break; }
      prev = now;
    }
    if (!converged)
      notes.push("A heti kiegyenlítés nem állt be teljesen a megengedett körök alatt — a látott beosztás a legjobb megtalált, de egy újabb futtatás még javíthat rajta.");
  }

  const afterMin = sumMaps(days.map((r) => paidByDriver(state, r.chains)));
  const totals = days.reduce((a, r) => ({
    cost: a.cost + (r.stats?.cost || 0),
    paidMin: a.paidMin + (r.stats?.paidMin || 0),
    chains: a.chains + (r.stats?.chains || 0),
    uncovered: a.uncovered + (r.uncovered?.length || 0),
  }), { cost: 0, paidMin: 0, chains: 0, uncovered: 0 });

  for (const r of days) for (const n of r.notes || []) if (!notes.includes(n)) notes.push(n);

  return {
    days, totals, totalsBefore, notes, passes, converged,
    uncovered: days.flatMap((r, d) => (r.uncovered || []).map((u) => ({ ...u, weekday: d }))),
    fairness: {
      bias, shares,
      before: beforeMin, after: afterMin,
      imbalanceBefore: imbalanceOf(beforeMin, shares),
      imbalanceAfter: imbalanceOf(afterMin, shares),
    },
  };
}
