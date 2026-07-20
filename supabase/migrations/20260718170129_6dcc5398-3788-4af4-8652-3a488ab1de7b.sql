-- Live-Map Stufe 2: Städte, POIs, gefahrene Strecken, Track-Freigabe

-- 1. game_cities: Seed für nächste-Stadt-Zuordnung (CRS-Simple x/z Koordinaten)
CREATE TABLE public.game_cities (
  id serial PRIMARY KEY,
  game text NOT NULL CHECK (game IN ('ETS2','ATS')),
  name text NOT NULL,
  country text,
  x real NOT NULL,
  z real NOT NULL
);
CREATE INDEX ON public.game_cities (game);
GRANT SELECT ON public.game_cities TO anon, authenticated;
GRANT ALL ON public.game_cities TO service_role;
ALTER TABLE public.game_cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read cities" ON public.game_cities FOR SELECT USING (true);

-- 2. game_pois: Kartenpunkte (Tankstellen, Werkstätten etc.)
CREATE TABLE public.game_pois (
  id serial PRIMARY KEY,
  game text NOT NULL CHECK (game IN ('ETS2','ATS')),
  kind text NOT NULL CHECK (kind IN ('fuel','service','garage','company','rest','ferry','train','dealer')),
  name text NOT NULL,
  x real NOT NULL,
  z real NOT NULL
);
CREATE INDEX ON public.game_pois (game, kind);
GRANT SELECT ON public.game_pois TO anon, authenticated;
GRANT ALL ON public.game_pois TO service_role;
ALTER TABLE public.game_pois ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read pois" ON public.game_pois FOR SELECT USING (true);

-- 3. driver_tracks: gefahrene Strecke pro aktiver Sitzung
CREATE TABLE public.driver_tracks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  vtc_id uuid,
  game text,
  points jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  session_started_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.driver_tracks TO authenticated;
GRANT ALL ON public.driver_tracks TO service_role;
ALTER TABLE public.driver_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own track read" ON public.driver_tracks FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "vtc member track read" ON public.driver_tracks FOR SELECT TO authenticated
  USING (vtc_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = driver_tracks.vtc_id AND m.user_id = auth.uid()
  ));

-- 4. profiles.share_live_track: Fahrer kann Track-Anzeige deaktivieren
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS share_live_track boolean NOT NULL DEFAULT true;

-- 5. Seed einer kompakten ETS2/ATS-Stadtmenge (zentrale Karten-Koordinaten)
INSERT INTO public.game_cities (game, name, country, x, z) VALUES
-- ETS2 (Kernauswahl Base-Map + DLCs)
('ETS2','Berlin','Deutschland',5460,-9270),
('ETS2','Hamburg','Deutschland',3960,-10770),
('ETS2','München','Deutschland',5030,-6770),
('ETS2','Frankfurt','Deutschland',2540,-8180),
('ETS2','Köln','Deutschland',1150,-8570),
('ETS2','Hannover','Deutschland',3810,-9550),
('ETS2','Dortmund','Deutschland',1780,-8720),
('ETS2','Stuttgart','Deutschland',3200,-6570),
('ETS2','Leipzig','Deutschland',5000,-8830),
('ETS2','Amsterdam','Niederlande',330,-9560),
('ETS2','Rotterdam','Niederlande',-70,-9070),
('ETS2','Brüssel','Belgien',-260,-8400),
('ETS2','Antwerpen','Belgien',-160,-8780),
('ETS2','Luxemburg','Luxemburg',960,-7920),
('ETS2','Paris','Frankreich',-1440,-7770),
('ETS2','Lyon','Frankreich',-190,-6070),
('ETS2','Marseille','Frankreich',730,-4900),
('ETS2','Calais','Frankreich',-1500,-9500),
('ETS2','Wien','Österreich',6520,-6960),
('ETS2','Zürich','Schweiz',2600,-5900),
('ETS2','Prag','Tschechien',6410,-8460),
('ETS2','Warschau','Polen',9330,-9780),
('ETS2','Krakau','Polen',9070,-8300),
('ETS2','Danzig','Polen',8280,-11400),
('ETS2','Kopenhagen','Dänemark',3990,-12140),
('ETS2','Stockholm','Schweden',6250,-14830),
('ETS2','Oslo','Norwegen',3020,-14570),
('ETS2','Mailand','Italien',2610,-4470),
('ETS2','Rom','Italien',4790,-1990),
('ETS2','Venedig','Italien',4650,-4340),
('ETS2','Madrid','Spanien',-4650,-3660),
('ETS2','Barcelona','Spanien',-2410,-4020),
('ETS2','Lissabon','Portugal',-7360,-3210),
('ETS2','London','Vereinigtes Königreich',-2570,-9370),
('ETS2','Manchester','Vereinigtes Königreich',-2810,-10480),
('ETS2','Edinburgh','Schottland',-3220,-11780),
('ETS2','Budapest','Ungarn',8010,-6500),
('ETS2','Bukarest','Rumänien',11290,-4880),
('ETS2','Sofia','Bulgarien',11430,-3040),
('ETS2','Istanbul','Türkei',13720,-3140),
-- ATS (Base-Map + DLCs)
('ATS','Los Angeles','Kalifornien',-104650,17070),
('ATS','San Francisco','Kalifornien',-108690,10770),
('ATS','Sacramento','Kalifornien',-108900,7770),
('ATS','San Diego','Kalifornien',-101400,20200),
('ATS','Bakersfield','Kalifornien',-101500,15080),
('ATS','Fresno','Kalifornien',-104900,12130),
('ATS','Las Vegas','Nevada',-96500,17370),
('ATS','Reno','Nevada',-104570,8930),
('ATS','Carson City','Nevada',-105400,8500),
('ATS','Phoenix','Arizona',-89330,20460),
('ATS','Tucson','Arizona',-86870,21740),
('ATS','Flagstaff','Arizona',-90310,17570),
('ATS','Portland','Oregon',-110480,-1470),
('ATS','Salem','Oregon',-110720,900),
('ATS','Bend','Oregon',-107000,3080),
('ATS','Seattle','Washington',-108430,-6800),
('ATS','Tacoma','Washington',-108900,-5480),
('ATS','Spokane','Washington',-102640,-6660),
('ATS','Salt Lake City','Utah',-84070,10460),
('ATS','Ogden','Utah',-84520,9100),
('ATS','Provo','Utah',-83570,11640),
('ATS','Moab','Utah',-79290,14320),
('ATS','Denver','Colorado',-72240,13520),
('ATS','Colorado Springs','Colorado',-70890,15450),
('ATS','Pueblo','Colorado',-70720,16510),
('ATS','Albuquerque','New Mexico',-77930,20400),
('ATS','Santa Fe','New Mexico',-77020,18950),
('ATS','Las Cruces','New Mexico',-80270,22240),
('ATS','Amarillo','Texas',-65700,20500),
('ATS','El Paso','Texas',-79900,23400),
('ATS','Dallas','Texas',-56200,23400),
('ATS','Houston','Texas',-52400,25920),
('ATS','San Antonio','Texas',-58100,25680),
('ATS','Oklahoma City','Oklahoma',-55890,19200),
('ATS','Tulsa','Oklahoma',-52440,18820),
('ATS','Kansas City','Kansas',-52000,15450),
('ATS','Wichita','Kansas',-56110,17800),
('ATS','Billings','Montana',-83220,-3960),
('ATS','Helena','Montana',-88180,-6100),
('ATS','Missoula','Montana',-92500,-5600),
('ATS','Great Falls','Montana',-86200,-6970);

-- 6. Seed kompakte POI-Menge (nur Standort-Ankerpunkte pro Region)
-- Bewusst reduziert; erweiterbar über spätere Migrationen ohne Schemaänderung.
INSERT INTO public.game_pois (game, kind, name, x, z) VALUES
('ETS2','fuel','Tanke Berlin Ost',5530,-9200),
('ETS2','fuel','Tanke Hamburg Süd',3980,-10620),
('ETS2','fuel','Tanke Paris Est',-1350,-7700),
('ETS2','service','Werkstatt Berlin',5440,-9310),
('ETS2','service','Werkstatt München',5010,-6750),
('ETS2','rest','Rastplatz Autobahn A2',2500,-9300),
('ETS2','ferry','Fähre Calais',-1520,-9540),
('ETS2','ferry','Fähre Kopenhagen',4010,-12180),
('ATS','fuel','Truck Stop LA',-104580,17200),
('ATS','fuel','Truck Stop Phoenix',-89290,20520),
('ATS','service','Werkstatt Denver',-72200,13560),
('ATS','service','Werkstatt Dallas',-56150,23450),
('ATS','rest','Rest Area I-40',-80000,20000),
('ATS','rest','Rest Area I-80',-95000,10000);
