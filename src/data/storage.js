/* Fuvarterv — the persistence seam, and the defaults for every tunable setting.

   The app talks to storage only through window.storage, a four-method key-value
   contract (get / set / delete / list). AuthGate installs the Supabase-backed
   implementation at import time; tests install a stub. Swapping the backend means
   writing one new object, not touching the app.

   STORAGE_KEY must match workspace_id() in the database schema. If they disagree
   the app loads an empty workspace and every save is rejected by row level
   security. */

export const STORAGE_KEY = "fuvarterv:v1";

/* Defaults for every tunable setting — ONE source, so seedState() and
   ensureShape() cannot drift apart. Both read from here. */
export const DEFAULT_SETTINGS = {
  arriveEarlyMin: 10,   // min: how long before the training the bus should arrive
  departAfterMin: 10,   // min: how long after the training the return leg departs
  calloutFee: 1500,     // HUF: a driver's one-off call-out fee, per shift
  dwellMin: 2,          // min: dwell time at each stop
  estSpeedKmh: 50,      // km/h: used for straight-line travel time estimates
  fallbackLegMin: 12,   // min: deadhead when there is neither a matrix nor coordinates
  preferredBias: 1000,  // HUF: penalty when a driver is put on a bus other than their usual one (0 disables it)
  /* How hard the optimizer pushes work off an over-loaded driver and onto an
     under-loaded one. Measured in paid minutes against each driver's availability-
     weighted share, and priced in the same forint-ish units as preferredBias, so the
     two can be weighed against each other. 0 disables it and restores pure
     cost-minimising behaviour. */
  fairnessBias: 5000,
  /* HUF per minute of EMPTY running: fuel, tyres and wear on a bus carrying nobody.
     Depot runs and deadheads are charged with it (ADR-29).

     Without it empty driving was free, and the optimizer would send a bus 22 minutes
     home and 22 minutes back to avoid paying for 96 minutes of waiting, because only
     the waiting had a price. The default is calibrated so a long trip home stops
     paying for itself while a short one still does: at a 50 km/h average this is
     about 120 HUF per empty kilometre. 0 restores the old free-mileage behaviour. */
  runCostPerMin: 100,
  defaultBaseId: null,  // the club depot; a vehicle's own baseId overrides it
};

/* True when the error means "nothing has been saved yet" (an empty workspace).
   ONLY then may an empty workspace be created and written. Every other error is real
   (network, permissions), and writing over real data we merely failed to read would
   destroy it. */
export function isNotFound(err) {
  return !!(err && err.code === "NOT_FOUND");
}

/* Loads the saved state. No data throws NOT_FOUND, and the caller starts an empty
   workspace from there. Every other error is re-thrown so the caller can show a retry
   screen instead of an empty state that a later save would make permanent. */
export async function loadState() {
  const r = await window.storage.get(STORAGE_KEY);
  return r && r.value ? JSON.parse(r.value) : null;
}

export async function persistState(state) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.error("Save failed:", e); }
}
