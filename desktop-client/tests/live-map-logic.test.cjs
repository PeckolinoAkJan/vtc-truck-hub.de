/* Tests für die Live-Map Stufe-2 Shared Logic. Läuft mit `node --test`. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  nearestCity,
  headingToCompass,
  computeEta,
  matchesFilter,
  fieldsVisibleTo,
  simplifyTrack,
} = require('../renderer/live-map-logic.js');

const cities = [
  { name: 'Berlin', country: 'DE', x: 5460, z: -9270 },
  { name: 'Hamburg', country: 'DE', x: 3960, z: -10770 },
  { name: 'München', country: 'DE', x: 5030, z: -6770 },
];

test('nearestCity findet nächste Stadt', () => {
  const r = nearestCity({ x: 5400, z: -9200 }, cities);
  assert.equal(r.name, 'Berlin');
  assert.ok(r.distanceKm < 1);
});

test('nearestCity gibt null bei fehlender Position', () => {
  assert.equal(nearestCity(null, cities), null);
  assert.equal(nearestCity({ x: NaN, z: 0 }, cities), null);
});

test('nearestCity gibt null bei leerer Städteliste', () => {
  assert.equal(nearestCity({ x: 0, z: 0 }, []), null);
});

test('headingToCompass akzeptiert Fraktion und Grad', () => {
  assert.equal(headingToCompass(0), 'N');
  assert.equal(headingToCompass(0.25), 'O');
  assert.equal(headingToCompass(90), 'O');
  assert.equal(headingToCompass(180), 'S');
  assert.equal(headingToCompass(null), null);
});

test('computeEta bei ausreichenden Daten', () => {
  const eta = computeEta({ remainingKm: 60, speedKmh: 60 });
  assert.ok(eta);
  assert.equal(eta.minutes, 60);
  assert.equal(eta.method, 'current-speed');
});

test('computeEta bevorzugt Durchschnittsgeschwindigkeit', () => {
  const eta = computeEta({ remainingKm: 100, speedKmh: 20, avgKmh: 50 });
  assert.equal(eta.method, 'avg-speed');
});

test('computeEta gibt null bei zu geringer Geschwindigkeit', () => {
  assert.equal(computeEta({ remainingKm: 100, speedKmh: 10 }), null);
});

test('computeEta gibt null bei Pause', () => {
  assert.equal(computeEta({ remainingKm: 100, speedKmh: 80, paused: true }), null);
});

test('computeEta gibt null ohne Reststrecke', () => {
  assert.equal(computeEta({ remainingKm: 0, speedKmh: 80 }), null);
  assert.equal(computeEta({ remainingKm: null, speedKmh: 80 }), null);
});

test('matchesFilter kombiniert Bedingungen', () => {
  const d = { displayName: 'Anna', game: 'ETS2', status: 'driving', job: { any: true } };
  assert.equal(matchesFilter(d, { search: '', onlyOnline: true, game: 'all', jobState: 'all' }), true);
  assert.equal(matchesFilter(d, { search: 'anna', onlyOnline: false, game: 'ETS2', jobState: 'with-job' }), true);
  assert.equal(matchesFilter(d, { search: 'anna', onlyOnline: false, game: 'ATS', jobState: 'all' }), false);
  assert.equal(matchesFilter(d, { search: '', onlyOnline: false, game: 'all', jobState: 'no-job' }), false);
});

test('matchesFilter blockt offline mit onlyOnline', () => {
  const d = { displayName: 'Bob', game: 'ETS2', status: 'offline', job: null };
  assert.equal(matchesFilter(d, { search: '', onlyOnline: true, game: 'all', jobState: 'all' }), false);
});

test('fieldsVisibleTo respektiert Rollen', () => {
  assert.deepEqual(fieldsVisibleTo('owner', false), {
    telemetry: true, jobDetails: true, vehicleDetails: true, contact: true,
  });
  assert.deepEqual(fieldsVisibleTo('driver', false), {
    telemetry: true, jobDetails: false, vehicleDetails: true, contact: false,
  });
  assert.deepEqual(fieldsVisibleTo(null, false), {
    telemetry: false, jobDetails: false, vehicleDetails: false, contact: false,
  });
  const self = fieldsVisibleTo('driver', true);
  assert.equal(self.jobDetails, true);
});

test('simplifyTrack reduziert kollineare Punkte', () => {
  const pts = [
    { x: 0, z: 0, t: 0 },
    { x: 10, z: 0, t: 1 },
    { x: 20, z: 0, t: 2 },
    { x: 30, z: 0, t: 3 },
    { x: 30, z: 100, t: 4 },
  ];
  const s = simplifyTrack(pts, 5);
  assert.ok(s.length < pts.length);
  assert.equal(s[0].x, 0);
  assert.equal(s[s.length - 1].z, 100);
});

test('simplifyTrack behält alle Punkte ohne Kollinearität', () => {
  const pts = [
    { x: 0, z: 0, t: 0 },
    { x: 100, z: 100, t: 1 },
    { x: 0, z: 200, t: 2 },
  ];
  const s = simplifyTrack(pts, 5);
  assert.equal(s.length, 3);
});
