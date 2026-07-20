import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type L from "leaflet";
import {
  Maximize2, Crosshair, X, Plus, Minus, RefreshCw, Focus, Navigation,
  Search, Fuel, Wrench, Ship, ParkingCircle, Home, Warehouse, Filter,
} from "lucide-react";
import {
  type GameKey,
  gameCoordinatesToMapCoordinates,
  getAttribution,
  getMapProviderConfig,
  isGameMapEnabled,
  normalizeGame,
} from "@/lib/game-map";
import {
  nearestCity as findNearestCity,
  computeEta,
  formatEta,
  matchesFilter,
  headingToCompass,
  type DriverFilterState,
} from "@/lib/live-map-logic";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getLiveMapAssets, getDriverTrack } from "@/lib/telemetry.functions";

/** Fahrer-Datensatz aus dem Server (getLiveMap / öffentlicher Route). */
export type MapDriver = {
  driverId: string;
  displayName: string;
  avatarUrl?: string | null;
  vtcId: string;
  game: string;
  position: { x: number; y: number; z: number; heading: number } | null;
  city: string | null;
  speed: number;
  truck: string | null;
  truckPlate?: string | null;
  fuelPct?: number | null;
  damagePct?: number | null;
  cargoMassT?: number | null;
  status: string;
  job: { source: string | null; destination: string | null; cargo: string | null; startedAt?: string | null } | null;
  jobRemainingKm?: number | null;
  jobDistanceKm?: number | null;
  progress: number | null;
  shareTrack?: boolean;
  lastSeen: string;
  isSelf: boolean;
};

type GameMode = "auto" | GameKey;
type PoiKind = "fuel" | "service" | "garage" | "company" | "rest" | "ferry" | "train" | "dealer";
const TILE_ERROR_THRESHOLD = 8;

const POI_ICON: Record<PoiKind, ReactNode> = {
  fuel: <Fuel className="size-3" />, service: <Wrench className="size-3" />, garage: <Home className="size-3" />,
  company: <Warehouse className="size-3" />, rest: <ParkingCircle className="size-3" />, ferry: <Ship className="size-3" />,
  train: <Warehouse className="size-3" />, dealer: <Warehouse className="size-3" />,
};
const POI_LABEL: Record<PoiKind, string> = {
  fuel: "Tankstellen", service: "Werkstätten", garage: "Garagen", company: "Firmen",
  rest: "Rastplätze", ferry: "Fährhäfen", train: "Zugterminals", dealer: "Händler",
};

export function LiveMap({
  drivers, updatedAt, onExpand, focusDriverId, role,
}: {
  drivers: MapDriver[];
  updatedAt?: string;
  onExpand?: () => void;
  focusDriverId?: string | null;
  role?: string | null;
}) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const poiLayerRef = useRef<L.LayerGroup | null>(null);
  const trackLayerRef = useRef<L.Polyline | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const tileErrorCountRef = useRef<number>(0);
  const currentGameRef = useRef<GameKey | null>(null);
  const centeredRef = useRef<boolean>(false);
  const [ready, setReady] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>("auto");
  const [followSelf, setFollowSelf] = useState(true);
  const [attribution, setAttribution] = useState<string>(getAttribution());
  const [tileFallback, setTileFallback] = useState<boolean>(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterState, setFilterState] = useState<DriverFilterState>({
    search: "", onlyOnline: false, game: "all", jobState: "all",
  });
  const [poiToggles, setPoiToggles] = useState<Record<PoiKind, boolean>>({
    fuel: false, service: false, garage: false, company: false,
    rest: false, ferry: false, train: false, dealer: false,
  });
  const [showTrack, setShowTrack] = useState(false);

  const fetchAssets = useServerFn(getLiveMapAssets);
  const { data: assets } = useQuery({
    queryKey: ["live-map-assets"],
    queryFn: () => fetchAssets(),
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
  });
  const cities = assets?.cities ?? [];
  const pois = assets?.pois ?? [];

  const activeGame: GameKey = useMemo(() => {
    if (gameMode !== "auto") return gameMode;
    const self = drivers.find((d) => d.isSelf && d.game);
    if (self) return normalizeGame(self.game);
    const counts: Record<GameKey, number> = { ETS2: 0, ATS: 0 };
    for (const d of drivers) counts[normalizeGame(d.game)] += 1;
    return counts.ATS > counts.ETS2 ? "ATS" : "ETS2";
  }, [gameMode, drivers]);

  // Leaflet + Grid-Style laden
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !holderRef.current || mapRef.current) return;
      const map = leaflet.map(holderRef.current, {
        crs: leaflet.CRS.Simple, minZoom: 0, maxZoom: 7,
        zoomControl: false, attributionControl: false, preferCanvas: true,
      } as L.MapOptions);
      map.setView([2048, 2048], 2);
      const gridStyle = document.createElement("style");
      gridStyle.textContent = `.leaflet-container{background:
        radial-gradient(ellipse at center, #0f1f18 0%, #050a08 70%),
        repeating-linear-gradient(0deg, rgba(34,197,94,.06) 0 1px, transparent 1px 80px),
        repeating-linear-gradient(90deg, rgba(34,197,94,.06) 0 1px, transparent 1px 80px);}`;
      document.head.appendChild(gridStyle);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
      tileLayerRef.current = null;
      poiLayerRef.current = null;
      trackLayerRef.current = null;
    };
  }, []);

  // Tile-Layer je Spiel + Fallback
  useEffect(() => {
    (async () => {
      if (!ready || !mapRef.current) return;
      if (currentGameRef.current === activeGame && tileLayerRef.current && !tileFallback) return;
      const leaflet = await import("leaflet");
      const map = mapRef.current;
      if (tileLayerRef.current) { map.removeLayer(tileLayerRef.current); tileLayerRef.current = null; }
      tileErrorCountRef.current = 0;
      currentGameRef.current = activeGame;
      if (!isGameMapEnabled()) {
        setAttribution("Einfache Kartenansicht (Spielkarte deaktiviert)"); setTileFallback(true); return;
      }
      const cfg = getMapProviderConfig(activeGame);
      const layer = leaflet.tileLayer(cfg.tileUrl, {
        minZoom: cfg.minZoom, maxZoom: cfg.maxZoom, tileSize: 256, noWrap: true,
        bounds: leaflet.latLngBounds([0, 0], [cfg.mapExtent, cfg.mapExtent]),
      });
      layer.on("tileerror", () => {
        tileErrorCountRef.current += 1;
        if (tileErrorCountRef.current > TILE_ERROR_THRESHOLD) {
          if (tileLayerRef.current) { map.removeLayer(tileLayerRef.current); tileLayerRef.current = null; }
          setTileFallback(true);
          setAttribution("Die detaillierte Spielkarte konnte nicht geladen werden. Die einfache Kartenansicht wird verwendet.");
        }
      });
      layer.addTo(map);
      tileLayerRef.current = layer;
      map.setMaxBounds(leaflet.latLngBounds([-256, -256], [cfg.mapExtent + 256, cfg.mapExtent + 256]));
      setTileFallback(false);
      setAttribution(getAttribution() + " · " + activeGame);
    })();
  }, [ready, activeGame, tileFallback]);

  // Filter angewendet
  const filtered = useMemo(
    () => drivers.filter((d) => matchesFilter(d, filterState) && d.position != null),
    [drivers, filterState],
  );

  // Marker synchronisieren
  useEffect(() => {
    (async () => {
      if (!ready || !mapRef.current) return;
      const leaflet = await import("leaflet");
      const map = mapRef.current;
      const seen = new Set<string>();
      let selfLatLng: L.LatLngExpression | null = null;
      const allLL: L.LatLngExpression[] = [];
      for (const d of filtered) {
        if (!d.position) continue;
        seen.add(d.driverId);
        const g = normalizeGame(d.game);
        const ll = gameCoordinatesToMapCoordinates(g, d.position);
        allLL.push(ll);
        if (d.isSelf) selfLatLng = ll;
        const rot = d.position.heading * 360;
        const html = `<div class="lm-marker ${d.isSelf ? "lm-self" : ""}" style="transform:rotate(${rot}deg)">
          <div class="lm-arrow"></div>
          <div class="lm-label">${escapeHtml(d.displayName)}<span class="lm-badge">${escapeHtml(d.game)}</span></div>
        </div>`;
        const icon = leaflet.divIcon({ className: "lm-marker-wrap", html, iconSize: [30, 30], iconAnchor: [15, 15] });
        let m = markersRef.current.get(d.driverId);
        if (!m) {
          m = leaflet.marker(ll, { icon }).addTo(map);
          m.on("click", () => setSelectedDriverId(d.driverId));
          markersRef.current.set(d.driverId, m);
        } else {
          m.setLatLng(ll);
          m.setIcon(icon);
        }
      }
      for (const [id, m] of markersRef.current) {
        if (!seen.has(id)) { map.removeLayer(m); markersRef.current.delete(id); }
      }
      if (focusDriverId) {
        const target = filtered.find((d) => d.driverId === focusDriverId);
        if (target?.position)
          map.setView(gameCoordinatesToMapCoordinates(normalizeGame(target.game), target.position),
            Math.max(map.getZoom(), 3), { animate: true });
      } else if (selfLatLng && followSelf) {
        if (!centeredRef.current) { map.setView(selfLatLng, 3); centeredRef.current = true; }
        else if (!map.getBounds().contains(selfLatLng)) map.panTo(selfLatLng, { animate: true });
      } else if (!centeredRef.current && allLL.length > 0) {
        map.setView(allLL[0], 3); centeredRef.current = true;
      }
    })();
  }, [filtered, ready, focusDriverId, followSelf]);

  // POI-Layer
  useEffect(() => {
    (async () => {
      if (!ready || !mapRef.current) return;
      const leaflet = await import("leaflet");
      const map = mapRef.current;
      if (poiLayerRef.current) { map.removeLayer(poiLayerRef.current); poiLayerRef.current = null; }
      const active = (Object.keys(poiToggles) as PoiKind[]).filter((k) => poiToggles[k]);
      if (!active.length || !pois.length) return;
      const layer = leaflet.layerGroup();
      for (const p of pois) {
        const kind = p.kind as PoiKind;
        if (!active.includes(kind)) continue;
        if (normalizeGame(p.game) !== activeGame) continue;
        const ll = gameCoordinatesToMapCoordinates(activeGame, { x: p.x, z: p.z });
        const html = `<div class="lm-poi lm-poi-${kind}" title="${escapeHtml(p.name)}"></div>`;
        const icon = leaflet.divIcon({ className: "lm-poi-wrap", html, iconSize: [14, 14], iconAnchor: [7, 7] });
        leaflet.marker(ll, { icon }).bindTooltip(p.name).addTo(layer);
      }
      layer.addTo(map);
      poiLayerRef.current = layer;
    })();
  }, [pois, poiToggles, activeGame, ready]);

  // Gefahrene Strecke (Track) für ausgewählten Fahrer
  const fetchTrack = useServerFn(getDriverTrack);
  const { data: track } = useQuery({
    queryKey: ["live-track", selectedDriverId],
    queryFn: () => (selectedDriverId ? fetchTrack({ data: { userId: selectedDriverId } }) : Promise.resolve({ points: [], game: null })),
    enabled: Boolean(selectedDriverId && showTrack),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  useEffect(() => {
    (async () => {
      if (!ready || !mapRef.current) return;
      const leaflet = await import("leaflet");
      const map = mapRef.current;
      if (trackLayerRef.current) { map.removeLayer(trackLayerRef.current); trackLayerRef.current = null; }
      if (!showTrack || !track?.points?.length) return;
      const g = (track.game ? normalizeGame(track.game) : activeGame);
      const pts = track.points.map((p) => gameCoordinatesToMapCoordinates(g, { x: p.x, z: p.z }));
      trackLayerRef.current = leaflet.polyline(pts, {
        color: "#22c55e", weight: 3, opacity: 0.75, dashArray: "6 6",
      }).addTo(map);
    })();
  }, [track, showTrack, ready, activeGame]);

  const selectedDriver = drivers.find((d) => d.driverId === selectedDriverId) ?? null;
  const nearest = selectedDriver && selectedDriver.position
    ? findNearestCity(selectedDriver.position, cities.filter((c) => normalizeGame(c.game) === normalizeGame(selectedDriver.game)))
    : null;
  const eta = selectedDriver && selectedDriver.jobRemainingKm != null
    ? computeEta({ remainingKm: selectedDriver.jobRemainingKm, speedKmh: selectedDriver.speed })
    : null;

  const centerSelf = () => {
    const self = drivers.find((d) => d.isSelf && d.position);
    if (self?.position && mapRef.current)
      mapRef.current.setView(gameCoordinatesToMapCoordinates(normalizeGame(self.game), self.position), 4, { animate: true });
  };
  const fitAll = () => {
    if (!mapRef.current) return;
    const pts: L.LatLngExpression[] = [];
    for (const [, m] of markersRef.current) pts.push(m.getLatLng());
    if (pts.length === 0) return;
    import("leaflet").then((leaflet) => {
      mapRef.current!.fitBounds(leaflet.latLngBounds(pts as L.LatLngTuple[]).pad(0.2));
    });
  };
  const reloadTiles = () => {
    if (!mapRef.current) return;
    if (tileLayerRef.current) { mapRef.current.removeLayer(tileLayerRef.current); tileLayerRef.current = null; }
    currentGameRef.current = null; tileErrorCountRef.current = 0; setTileFallback(false);
  };

  return (
    <div className="lm-holder">
      <div ref={holderRef} className="lm-canvas" />
      <div className="lm-topbar">
        <div className="lm-seg" role="group" aria-label="Spiel wählen">
          {(["auto", "ETS2", "ATS"] as GameMode[]).map((m) => (
            <button key={m} className={`lm-seg-btn ${gameMode === m ? "active" : ""}`} onClick={() => setGameMode(m)}>
              {m === "auto" ? "Auto" : m}
            </button>
          ))}
        </div>
        <div className="lm-spacer" />
        <button className={`lm-btn ${showFilters ? "active" : ""}`} onClick={() => setShowFilters((v) => !v)} title="Filter">
          <Filter className="size-4" />
        </button>
        <button className="lm-btn" onClick={fitAll} title="Alle Fahrer"><Focus className="size-4" /></button>
        <button className={`lm-btn ${followSelf ? "active" : ""}`} onClick={() => setFollowSelf((v) => !v)} title="Folgen">
          <Navigation className="size-4" />
        </button>
        <button className="lm-btn" onClick={reloadTiles} title="Neu laden"><RefreshCw className="size-4" /></button>
      </div>

      {showFilters && (
        <div className="lm-filters-panel">
          <div className="lm-filters-row">
            <div className="lm-search-wrap">
              <Search className="size-3" />
              <input placeholder="Fahrer suchen…" value={filterState.search}
                onChange={(e) => setFilterState((s) => ({ ...s, search: e.target.value }))} />
            </div>
            <label><input type="checkbox" checked={filterState.onlyOnline}
              onChange={(e) => setFilterState((s) => ({ ...s, onlyOnline: e.target.checked }))} /> nur online</label>
            <select value={filterState.game} onChange={(e) => setFilterState((s) => ({ ...s, game: e.target.value as "all" | GameKey }))}>
              <option value="all">Alle Spiele</option><option value="ETS2">ETS2</option><option value="ATS">ATS</option>
            </select>
            <select value={filterState.jobState} onChange={(e) => setFilterState((s) => ({ ...s, jobState: e.target.value as "all" | "with-job" | "no-job" }))}>
              <option value="all">Alle</option><option value="with-job">mit Auftrag</option><option value="no-job">ohne Auftrag</option>
            </select>
          </div>
          <div className="lm-poi-row">
            {(Object.keys(POI_LABEL) as PoiKind[]).map((k) => (
              <button key={k} className={`lm-poi-btn ${poiToggles[k] ? "active" : ""}`}
                onClick={() => setPoiToggles((p) => ({ ...p, [k]: !p[k] }))} title={POI_LABEL[k]}>
                {POI_ICON[k]}<span>{POI_LABEL[k]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedDriver && (
        <DriverPanel driver={selectedDriver} nearest={nearest} eta={eta}
          onClose={() => setSelectedDriverId(null)}
          showTrack={showTrack} onToggleTrack={() => setShowTrack((v) => !v)}
          role={role ?? null} />
      )}

      {filtered.length === 0 && <div className="lm-empty">Noch keine Positionsdaten</div>}

      <div className="lm-controls">
        <button className="lm-btn" onClick={() => mapRef.current?.zoomIn()} aria-label="Vergrößern"><Plus className="size-4" /></button>
        <button className="lm-btn" onClick={() => mapRef.current?.zoomOut()} aria-label="Verkleinern"><Minus className="size-4" /></button>
        <button className="lm-btn" onClick={centerSelf} aria-label="Auf mich"><Crosshair className="size-4" /></button>
        {onExpand && <button className="lm-btn" onClick={onExpand} aria-label="Vergrößern"><Maximize2 className="size-4" /></button>}
      </div>
      <div className="lm-attribution">{attribution}</div>
      <div className="lm-filters">
        {updatedAt && <span className="lm-updated">Live · {new Date(updatedAt).toLocaleTimeString("de-DE")}</span>}
      </div>
    </div>
  );
}

function DriverPanel({
  driver, nearest, eta, onClose, showTrack, onToggleTrack, role,
}: {
  driver: MapDriver;
  nearest: ReturnType<typeof findNearestCity>;
  eta: ReturnType<typeof computeEta>;
  onClose: () => void;
  showTrack: boolean;
  onToggleTrack: () => void;
  role: string | null;
}) {
  const compass = driver.position ? headingToCompass(driver.position.heading) : null;
  const ageSec = Math.round((Date.now() - new Date(driver.lastSeen).getTime()) / 1000);
  const isStaff = role === "owner" || role === "admin" || role === "dispatcher";
  return (
    <div className="lm-driver-panel">
      <div className="lm-dp-head">
        <div className="lm-dp-avatar">
          {driver.avatarUrl ? <img src={driver.avatarUrl} alt="" /> : <span>{initials(driver.displayName)}</span>}
        </div>
        <div>
          <div className="lm-dp-name">{driver.displayName}</div>
          <div className="lm-dp-sub">{driver.game} · {driver.status}{driver.isSelf ? " · du" : ""}</div>
        </div>
        <button className="lm-btn" onClick={onClose} aria-label="Schließen"><X className="size-4" /></button>
      </div>
      <div className="lm-dp-grid">
        <Field label="Straße" value={"Straße nicht eindeutig erkannt"} muted />
        <Field label="Nächste Stadt" value={nearest ? `${nearest.name}${nearest.country ? " · " + nearest.country : ""}` : "—"} />
        <Field label="Entfernung" value={nearest ? `${nearest.distanceKm} km` : "—"} />
        <Field label="Fahrtrichtung" value={compass ?? "—"} />
        <Field label="Geschwindigkeit" value={`${Math.round(driver.speed)} km/h`} />
        <Field label="Truck" value={driver.truck ?? "—"} />
        {driver.truckPlate && <Field label="Kennzeichen" value={driver.truckPlate} />}
        {driver.cargoMassT != null && <Field label="Frachtgewicht" value={`${driver.cargoMassT} t`} />}
        {driver.fuelPct != null && <Field label="Tank" value={`${Math.round(driver.fuelPct * 100)}%`} />}
        {driver.damagePct != null && <Field label="Motorschaden" value={`${Math.round(driver.damagePct * 100)}%`} />}
      </div>
      {(driver.isSelf || isStaff) && driver.job && (
        <div className="lm-dp-job">
          <div className="lm-dp-job-title">Aktueller Auftrag</div>
          <div className="lm-dp-job-route">{driver.job.source ?? "?"} → {driver.job.destination ?? "?"}</div>
          {driver.job.cargo && <div className="lm-dp-job-cargo">Ladung: {driver.job.cargo}</div>}
          {driver.jobRemainingKm != null && <div className="lm-dp-job-cargo">Reststrecke: {Math.round(driver.jobRemainingKm)} km</div>}
          {eta ? <div className="lm-dp-eta">{formatEta(eta)} <span className="lm-dp-hint">(Schätzung)</span></div>
            : <div className="lm-dp-hint">ETA: nicht genügend Daten</div>}
        </div>
      )}
      <div className="lm-dp-actions">
        <label className="lm-dp-toggle">
          <input type="checkbox" checked={showTrack} onChange={onToggleTrack} disabled={driver.shareTrack === false} />
          Gefahrene Strecke {driver.shareTrack === false ? "(deaktiviert)" : ""}
        </label>
        <span className="lm-dp-hint">Geplante Route nicht verfügbar</span>
      </div>
      <div className="lm-dp-foot">Letzte Aktualisierung: vor {ageSec}s</div>
    </div>
  );
}

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="lm-dp-field">
      <div className="lm-dp-label">{label}</div>
      <div className={`lm-dp-value ${muted ? "muted" : ""}`}>{value}</div>
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

export function LiveMapModal({
  drivers, updatedAt, onClose, role,
}: {
  drivers: MapDriver[];
  updatedAt?: string;
  onClose: () => void;
  role?: string | null;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const list = drivers.filter((d) => d.displayName.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="lm-modal">
      <div className="lm-modal-head">
        <h3>Live-Karte · {drivers.length} Fahrer</h3>
        <button className="lm-btn" onClick={onClose} aria-label="Schließen"><X className="size-4" /></button>
      </div>
      <div className="lm-modal-body">
        <aside className="lm-modal-list">
          <input className="lm-search" placeholder="Fahrer suchen…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {list.map((d) => (
            <button key={d.driverId} className={`lm-list-item ${focus === d.driverId ? "active" : ""}`} onClick={() => setFocus(d.driverId)}>
              <span className={`lm-dot ${d.isSelf ? "self" : ""}`} />
              <div className="lm-list-txt">
                <div className="lm-list-name">{d.displayName}</div>
                <div className="lm-list-sub">{d.game} · {d.city ?? "—"} · {Math.round(d.speed)} km/h</div>
              </div>
            </button>
          ))}
        </aside>
        <div className="lm-modal-map">
          <LiveMap drivers={drivers} updatedAt={updatedAt} focusDriverId={focus} role={role} />
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? "").replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
