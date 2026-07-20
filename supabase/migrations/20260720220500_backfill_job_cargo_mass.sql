UPDATE public.jobs AS j
SET cargo_mass_kg = weights.cargo_mass_kg
FROM (
  SELECT
    job_id,
    MAX((payload->>'cargo_mass_kg')::numeric) AS cargo_mass_kg
  FROM public.telemetry_events
  WHERE
    job_id IS NOT NULL
    AND payload ? 'cargo_mass_kg'
    AND (payload->>'cargo_mass_kg') ~ '^[0-9]+([.][0-9]+)?$'
    AND (payload->>'cargo_mass_kg')::numeric > 0
  GROUP BY job_id
) AS weights
WHERE
  j.id = weights.job_id
  AND (j.cargo_mass_kg IS NULL OR j.cargo_mass_kg = 0);
