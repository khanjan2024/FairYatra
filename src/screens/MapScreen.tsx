import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker, Circle } from 'leaflet';
import { loadReports } from '../lib/storage';
import scamsRaw from '../data/scams.json';
import placesRaw from '../data/places.json';
import type { Scam, Place, CommunityReport } from '../types';

const scams = scamsRaw.scams as Scam[];
const places = placesRaw.places as Place[];

const SEVERITY_COLOR: Record<string, string> = {
  high: '#ef4444',
  medium: '#f97316',
  low: '#eab308',
};

type LayerMode = 'scams' | 'reports' | 'both';

export default function MapScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<(Marker | Circle)[]>([]);
  const [layerMode, setLayerMode] = useState<LayerMode>('both');
  const [reports, setReports] = useState<CommunityReport[]>([]);

  // Load community reports on mount
  useEffect(() => {
    loadReports().then(setReports);
  }, []);

  // Initialise Leaflet map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const initMap = async () => {
      const L = (await import('leaflet')).default;

      // Fix default marker icon paths that Vite breaks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(containerRef.current!, {
        center: [26.2, 91.7],
        zoom: 7,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      mapRef.current = map;
    };

    initMap();
  }, []);

  // Render markers whenever layer mode or reports change
  useEffect(() => {
    const renderMarkers = async () => {
      if (!mapRef.current) return;
      const L = (await import('leaflet')).default;
      const map = mapRef.current;

      // Clear previous markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // Scam markers
      if (layerMode === 'scams' || layerMode === 'both') {
        scams.forEach((scam) => {
          const colour = SEVERITY_COLOR[scam.severity] ?? '#6b7280';

          const icon = L.divIcon({
            className: '',
            html: `<div style="
              width:28px;height:28px;border-radius:50%;
              background:${colour};border:2px solid white;
              display:flex;align-items:center;justify-content:center;
              font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,0.4)">⚠️</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });

          const marker = L.marker([scam.lat, scam.lng], { icon }).addTo(map);
          marker.bindPopup(
            `<div style="min-width:200px">
              <strong style="color:${colour}">${scam.title}</strong><br/>
              <small>${scam.location}</small><br/><br/>
              ${scam.description}<br/><br/>
              <em>💡 ${scam.howToAvoid}</em>
            </div>`,
          );
          markersRef.current.push(marker);

          // Risk hotspot circle
          const circle = L.circle([scam.lat, scam.lng], {
            radius: 800,
            color: colour,
            fillColor: colour,
            fillOpacity: 0.1,
            weight: 1,
          }).addTo(map);
          markersRef.current.push(circle);
        });
      }

      // Community report markers
      if (layerMode === 'reports' || layerMode === 'both') {
        // Group reports by city
        const reportsByCityService: Record<string, CommunityReport[]> = {};
        reports.forEach((r) => {
          const key = `${r.city}||${r.serviceType}`;
          if (!reportsByCityService[key]) reportsByCityService[key] = [];
          reportsByCityService[key].push(r);
        });

        Object.entries(reportsByCityService).forEach(([, cityReports]) => {
          const overchargedCount = cityReports.filter((r) => r.isOvercharged).length;
          const ratio = overchargedCount / cityReports.length;
          const colour =
            ratio > 0.6 ? '#ef4444' : ratio > 0.3 ? '#f97316' : '#22c55e';

          // Find a place that matches the report city to anchor the pin
          const anchorPlace = places.find(
            (p) =>
              p.city === cityReports[0].city &&
              p.type === 'commercial',
          );
          if (!anchorPlace) return;

          // Jitter slightly so pins don't overlap perfectly
          const jitter = () => (Math.random() - 0.5) * 0.02;
          const lat = anchorPlace.lat + jitter();
          const lng = anchorPlace.lng + jitter();

          const icon = L.divIcon({
            className: '',
            html: `<div style="
              width:26px;height:26px;border-radius:4px;
              background:${colour};border:2px solid white;
              display:flex;align-items:center;justify-content:center;
              font-size:11px;font-weight:bold;color:white;
              box-shadow:0 1px 4px rgba(0,0,0,0.4)">${cityReports.length}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          });

          const marker = L.marker([lat, lng], { icon }).addTo(map);
          marker.bindPopup(
            `<div>
              <strong>${cityReports.length} community report(s)</strong><br/>
              Overcharged: ${overchargedCount}/${cityReports.length}<br/>
              Service: ${cityReports[0].serviceType}
            </div>`,
          );
          markersRef.current.push(marker);
        });
      }

      // Place labels (airports/stations as small dots)
      places.forEach((p) => {
        if (p.type !== 'airport' && p.type !== 'station') return;
        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width:10px;height:10px;border-radius:50%;
            background:#1e3a5f;border:2px solid white;
            box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        });
        const m = L.marker([p.lat, p.lng], { icon }).addTo(map);
        m.bindTooltip(p.shortName, { permanent: false, direction: 'top' });
        markersRef.current.push(m);
      });
    };

    renderMarkers();
  }, [layerMode, reports]);

  return (
    <div className="flex flex-col h-[calc(100vh-112px)]">
      {/* Controls */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-slate-700">Show:</span>
        {(['both', 'scams', 'reports'] as LayerMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setLayerMode(mode)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              layerMode === mode
                ? 'bg-blue-700 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {mode === 'both' ? '⚠️ + 📊 Both' : mode === 'scams' ? '⚠️ Scams' : '📊 Reports'}
          </button>
        ))}
        <span className="text-xs text-slate-400 ml-auto">
          {reports.length} community report(s)
        </span>
      </div>

      {/* Legend */}
      <div className="bg-white border-b border-slate-100 px-4 py-1.5 flex gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> High risk scam
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> Medium risk
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Low / fair
        </span>
      </div>

      {/* Map */}
      <div ref={containerRef} className="flex-1 z-0" aria-label="Map of North East India showing scam hotspots and community reports" />
    </div>
  );
}
