/* Unit-Tests für normalizeJob – abgesichert gegen wechselnde Feldnamen
 * verschiedener ETS2/ATS-Telemetrie-Server (Funbit v3/v4, SCS-SDK-Bindings,
 * ältere Skript-Mods). Läuft mit `node --test`, keine externen Deps.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeJob } = require("../renderer/normalize-job.js");

test("leerer / undefined Input liefert konsistentes Skelett", () => {
  const r = normalizeJob(undefined);
  assert.deepEqual(r, {
    src: null, dst: null, cargo: null, distanceKm: null,
    income: null, mass: null, finished: false, cancelled: false,
  });
  assert.deepEqual(normalizeJob(null), r);
  assert.deepEqual(normalizeJob({}), r);
});

test("Funbit v3 (Flat, string cargo) – ETS2", () => {
  // https://github.com/Funbit/ets2-telemetry-server – klassisches JSON
  const job = {
    sourceCity: "Berlin",
    destinationCity: "Hamburg",
    cargo: "Frozen Food",
    mass: 12345,                 // kg
    plannedDistanceKm: 289,
    income: 5400,
    finished: false,
    cancelled: false,
  };
  const r = normalizeJob(job);
  assert.equal(r.src, "Berlin");
  assert.equal(r.dst, "Hamburg");
  assert.equal(r.cargo, "Frozen Food");
  assert.equal(r.mass, 12345);
  assert.equal(r.distanceKm, 289);
  assert.equal(r.income, 5400);
  assert.equal(r.finished, false);
  assert.equal(r.cancelled, false);
});

test("Funbit v4 (nested source/destination + cargo-Objekt) – ATS", () => {
  const job = {
    source: { city: { name: "Los Angeles" }, company: { name: "SC Cargo" } },
    destination: { city: { name: "Phoenix" } },
    cargo: { name: "Steel Coils", mass: 22000, income: 8200 },
    plannedDistanceKm: 615,
  };
  const r = normalizeJob(job);
  assert.equal(r.src, "Los Angeles");
  assert.equal(r.dst, "Phoenix");
  assert.equal(r.cargo, "Steel Coils");
  assert.equal(r.mass, 22000);
  assert.equal(r.income, 8200);
  assert.equal(r.distanceKm, 615);
});

test("SCS-SDK-Binding (snake_case + cityDst)", () => {
  const job = {
    cityDstSrc: "Скопје",
    cityDst: "Тетово",
    cargo_id: "cement_bags",
    cargoMass: 18500,
    plannedDistance_km: 42,
    expectedIncome: 950,
  };
  const r = normalizeJob(job);
  assert.equal(r.src, "Скопје");
  assert.equal(r.dst, "Тетово");
  assert.equal(r.cargo, "cement_bags");
  assert.equal(r.mass, 18500);
  assert.equal(r.distanceKm, 42);
  assert.equal(r.income, 950);
});

test("Trailer-basiertes Cargo/Mass (ältere Mods)", () => {
  const job = {
    sourceCity: "Paris",
    destinationCity: "Lyon",
    trailer: { cargo: "Milk", mass: 15000 },
    jobIncome: 3300,
    remainingDistanceKm: 465,
  };
  const r = normalizeJob(job);
  assert.equal(r.cargo, "Milk");
  assert.equal(r.mass, 15000);
  assert.equal(r.income, 3300);
  assert.equal(r.distanceKm, 465);
});

test("plannedDistance in Metern wird zu km umgerechnet", () => {
  const job = { sourceCity: "A", destinationCity: "B", plannedDistance: 123456 };
  const r = normalizeJob(job);
  assert.equal(r.distanceKm, 123.456);
});

test("navigation.distance (Meter, verschachtelt) wird zu km umgerechnet", () => {
  const job = {
    sourceCity: "A", destinationCity: "B",
    navigation: { distance: 50000 },
  };
  const r = normalizeJob(job);
  assert.equal(r.distanceKm, 50);
});

test("navigation.plannedDistanceKm hat Vorrang vor navigation.distance", () => {
  const job = {
    sourceCity: "A", destinationCity: "B",
    navigation: { plannedDistanceKm: 77, distance: 999 },
  };
  assert.equal(normalizeJob(job).distanceKm, 77);
});

test("cargoValues.mass wird als Fallback erkannt", () => {
  const job = { cargoValues: { mass: 9999 } };
  assert.equal(normalizeJob(job).mass, 9999);
});

test("Leerer Cargo-String wird als null behandelt (Funbit-Idle)", () => {
  const job = { sourceCity: "A", destinationCity: "B", cargo: "" };
  assert.equal(normalizeJob(job).cargo, null);
});

test("Whitespace-only Cargo wird als null behandelt", () => {
  assert.equal(normalizeJob({ cargo: "   " }).cargo, null);
});

test("finished / delivered / completed setzen alle finished=true", () => {
  assert.equal(normalizeJob({ finished: true }).finished, true);
  assert.equal(normalizeJob({ delivered: true }).finished, true);
  assert.equal(normalizeJob({ completed: true }).finished, true);
});

test("cancelled / aborted / rejected / revoked setzen cancelled=true", () => {
  assert.equal(normalizeJob({ cancelled: true }).cancelled, true);
  assert.equal(normalizeJob({ aborted: true }).cancelled, true);
  assert.equal(normalizeJob({ rejected: true }).cancelled, true);
  assert.equal(normalizeJob({ revoked: true }).cancelled, true);
});

test("Priorität: sourceCity schlägt source.city.name", () => {
  const job = { sourceCity: "flat", source: { city: { name: "nested" } } };
  assert.equal(normalizeJob(job).src, "flat");
});

test("Priorität: income schlägt money/reward/expectedIncome", () => {
  const job = { income: 1, money: 2, reward: 3, expectedIncome: 4 };
  assert.equal(normalizeJob(job).income, 1);
});

test("Priorität: mass (Top-Level) schlägt cargo.mass / trailer.mass", () => {
  const job = { mass: 100, cargo: { mass: 200 }, trailer: { mass: 300 } };
  assert.equal(normalizeJob(job).mass, 100);
});

test("Income=0 wird durchgereicht (nicht als null behandelt) – Quick-Jobs mit 0€ existieren nicht, aber Bugs im Spiel schon", () => {
  const job = { income: 0 };
  // 0 ist ein gültiger Wert; ?? behandelt nur null/undefined
  assert.equal(normalizeJob(job).income, 0);
});

test("Distanz=0 wird durchgereicht (frisch angenommener Job, noch keine Route)", () => {
  const job = { plannedDistanceKm: 0 };
  assert.equal(normalizeJob(job).distanceKm, 0);
});

test("Realistischer 'idle'-Frame ohne Job liefert alles null/false", () => {
  const job = { cargo: "", sourceCity: "", destinationCity: "" };
  const r = normalizeJob(job);
  // sourceCity leerer String wird via || zu null (falsy) durchgereicht
  assert.equal(r.src, null);
  assert.equal(r.dst, null);
  assert.equal(r.cargo, null);
  assert.equal(r.finished, false);
  assert.equal(r.cancelled, false);
});

test("Beobachtetes Skopje-Payload aus User-Screenshot (income=600, sonst leer)", () => {
  // Reproduktion des Bugs: Spiel liefert income+cities, aber kein cargo/mass/distance.
  const job = {
    sourceCity: "Скопје",
    destinationCity: "Скопје",
    income: 600,
    cargo: "",
    mass: 0,
    plannedDistanceKm: 0,
  };
  const r = normalizeJob(job);
  assert.equal(r.src, "Скопје");
  assert.equal(r.dst, "Скопје");
  assert.equal(r.income, 600);
  assert.equal(r.cargo, null, "leerer Cargo-String muss null werden");
  // mass=0 und distanceKm=0 sind gültig (Widget zeigt trotzdem Warnung wegen n>0-Check)
  assert.equal(r.mass, 0);
  assert.equal(r.distanceKm, 0);
});
