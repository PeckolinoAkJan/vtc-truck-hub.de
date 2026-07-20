/* MPL Logistik — Job-Normalisierung
 *
 * Übersetzt Job-Objekte aus verschiedenen ETS2/ATS-Telemetrie-Servern
 * (Funbit, SCS-SDK-Bindings, Skript-Mods) in ein einheitliches Schema:
 *   { src, dst, cargo, distanceKm, income, mass, finished, cancelled }
 *
 * UMD-Export: Browser -> window.normalizeJob, Node -> module.exports.
 */
(function (root, factory) {
  const impl = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = impl;
  } else {
    root.normalizeJob = impl.normalizeJob;
  }
})(typeof self !== "undefined" ? self : this, function () {
  function firstDistance(candidates) {
    let zero = null;
    for (const value of candidates) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
      if (value > 0) return value;
      zero = 0;
    }
    return zero;
  }

  function normalizeJob(raw, ctx) {
    const j = raw || {};
    // Zusätzliche Fallback-Quellen aus dem Top-Level-Telemetrie-Frame
    // (SCS-SDK-Bindings legen Fracht/Trailer/Navigation je nach Version außerhalb von .job ab).
    const c = ctx || {};
    const tTrailer = c.trailer || {};
    const tCargo = c.cargo || {};
    const tNav = c.navigation || {};
    const src =
      j.sourceCity || j.source_city ||
      (j.source && (j.source.city?.name || j.source.city || j.source.cityName || j.source.name)) ||
      j.sourceCityName || j.cityDstSrc || null;
    const dst =
      j.destinationCity || j.dest_city || j.destCity ||
      (j.destination && (j.destination.city?.name || j.destination.city || j.destination.cityName || j.destination.name)) ||
      j.destinationCityName || j.cityDst || null;
    // Funbit-Server liefert oft nur einen leeren String "" wenn keine Fracht geladen ist – als "kein Wert" behandeln.
    // Priorität: SCS-Plugin liefert Fracht/Gewicht/Distanz auf Top-Level unter
    // trailer.name, trailer.mass und navigation.estimatedDistance – job.* bleibt Fallback.
    const cargoRaw =
      tTrailer.name ||
      tTrailer.cargo?.name || tTrailer.cargoName || (typeof tTrailer.cargo === "string" ? tTrailer.cargo : null) ||
      j.cargo?.name || (typeof j.cargo === "string" ? j.cargo : null) ||
      j.cargoName || j.cargoId || j.cargo_id ||
      (j.trailer && (j.trailer.cargo?.name || j.trailer.cargoName || j.trailer.cargo)) ||
      tCargo.name || (typeof tCargo === "string" ? tCargo : null) ||
      null;
    const cargo = (typeof cargoRaw === "string" && cargoRaw.trim() === "") ? null : cargoRaw;
    // Manche Telemetrie-Frames liefern zuerst 0 und erst nach der GPS-Berechnung
    // einen echten Wert. Deshalb gewinnt die erste positive Distanz; 0 bleibt
    // nur erhalten, wenn wirklich keine positive Quelle existiert.
    const distanceKm = firstDistance([
      tNav.plannedDistanceKm,
      tNav.distanceKm,
      tNav.estimatedDistanceKm,
      tNav.routeDistanceKm,
      tNav.remainingDistanceKm,
      typeof tNav.estimatedDistance === "number" ? tNav.estimatedDistance / 1000 : null,
      typeof tNav.distance === "number" ? tNav.distance / 1000 : null,
      typeof tNav.routeDistance === "number" ? tNav.routeDistance / 1000 : null,
      typeof tNav.remainingDistance === "number" ? tNav.remainingDistance / 1000 : null,
      j.plannedDistanceKm,
      j.plannedDistance_km,
      j.remainingDistanceKm,
      j.navigation_distance,
      j.navigationDistance,
      j.navigation?.plannedDistanceKm,
      j.navigation?.distanceKm,
      j.navigation?.estimatedDistanceKm,
      typeof j.navigation?.estimatedDistance === "number" ? j.navigation.estimatedDistance / 1000 : null,
      typeof j.navigation?.distance === "number" ? j.navigation.distance / 1000 : null,
      typeof j.plannedDistance === "number" ? j.plannedDistance / 1000 : null,
    ]);
    const income =
      j.income ?? j.money ?? j.reward ?? j.expectedIncome ?? j.jobIncome ??
      j.cargo?.income ?? j.cargo?.reward ?? tCargo.income ?? tCargo.reward ?? null;
    // Gewicht: Priorität trailer.mass (SCS-Plugin), dann job.mass etc.
    const mass =
      tTrailer.mass ?? tTrailer.cargo?.mass ?? tTrailer.cargoMass ??
      j.mass ?? j.cargo?.mass ?? j.cargoMass ?? j.cargo_mass ?? j.cargoMassKg ??
      (j.cargoValues && (j.cargoValues.mass ?? j.cargoValues.cargoMass)) ??
      (j.trailer && (j.trailer.cargo?.mass ?? j.trailer.mass ?? j.trailer.cargoMass)) ??
      tCargo.mass ??
      null;


    const finished = !!(j.finished || j.delivered || j.completed);
    const cancelled = !!(j.cancelled || j.aborted || j.rejected || j.revoked);
    return { src, dst, cargo, distanceKm, income, mass, finished, cancelled };
  }
  return { normalizeJob };
});
