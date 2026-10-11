import { useState, useMemo, useEffect } from 'react';
import {
  Car, Bike, Bus, UserCheck, UtensilsCrossed,
  ArrowRight, Moon, Mountain, PlaneLanding, Luggage,
  ChevronDown, ChevronUp, Search, RotateCcw,
  Minus, Plus, AlertCircle, IndianRupee,
} from 'lucide-react';
import type { FareCheckInput, FareCheckResult, ServiceType } from '../types';
import { checkFare, haversine } from '../lib/fare';
import { loadReports, loadCommunityScams } from '../lib/storage';
import { getCachedReports } from '../lib/cache';
import ResultCard from '../components/ResultCard';
import { CheckFareSkeleton } from '../components/Skeleton';
import PlaceAutocomplete, { type SelectedPlace } from '../components/PlaceAutocomplete';
import benchmarksRaw from '../data/benchmarks.json';
import phrasesRaw from '../data/phrases.json';
import type { CityBenchmark, Scam, PhraseTemplates } from '../types';

const benchmarks = benchmarksRaw.cities as CityBenchmark[];
const phrases    = phrasesRaw          as PhraseTemplates;

// City centre coordinates for proximity matching
const CITY_CENTRES: { id: string; name: string; lat: number; lng: number }[] = [
  { id: 'guwahati',  name: 'Guwahati',  lat: 26.1445, lng: 91.7362 },
  { id: 'shillong',  name: 'Shillong',  lat: 25.5788, lng: 91.8933 },
  { id: 'gangtok',   name: 'Gangtok',   lat: 27.3314, lng: 88.6138 },
  { id: 'tawang',    name: 'Tawang',    lat: 27.5860, lng: 91.8594 },
  { id: 'kaziranga', name: 'Kaziranga', lat: 26.5775, lng: 93.1711 },
];

const MAX_CITY_RADIUS_KM = 120; // beyond this we still pick the nearest

/** Given a lat/lng, return the nearest city id from our benchmark set */
function cityFromCoords(lat: number, lng: number): string {
  let best = CITY_CENTRES[0];
  let bestDist = Infinity;
  for (const c of CITY_CENTRES) {
    const d = haversine(lat, lng, c.lat, c.lng);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return bestDist <= MAX_CITY_RADIUS_KM ? best.id : '';
}

const SERVICE_OPTIONS: { type: ServiceType; label: string; Icon: React.ElementType }[] = [
  { type: 'taxi',       label: 'Taxi',       Icon: Car             },
  { type: 'auto',       label: 'Auto',       Icon: Bike            },
  { type: 'shared_cab', label: 'Shared Cab', Icon: Bus             },
  { type: 'guide',      label: 'Guide',      Icon: UserCheck       },
  { type: 'restaurant', label: 'Restaurant', Icon: UtensilsCrossed },
];

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function CheckFare() {
  const [serviceType,  setServiceType]  = useState<ServiceType | ''>('');
  const [quotedFare,   setQuotedFare]   = useState('');
  const [fromText,     setFromText]     = useState('');
  const [toText,       setToText]       = useState('');
  const [fromCoords,   setFromCoords]   = useState<{ lat: number; lng: number } | null>(null);
  const [toCoords,     setToCoords]     = useState<{ lat: number; lng: number } | null>(null);
  const [isNight,      setIsNight]      = useState(false);
  const [isHillRoad,   setIsHillRoad]   = useState(false);
  const [isAirport,    setIsAirport]    = useState(false);
  const [luggageCount, setLuggageCount] = useState(0);
  const [result,       setResult]       = useState<FareCheckResult | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [checking,     setChecking]     = useState(false);
  const [scams,        setScams]        = useState<Scam[]>([]);

  // Load scams from Supabase on mount
  useEffect(() => { loadCommunityScams().then(setScams); }, []);

  // Derive city from whichever coords we have (prefer pickup)
  const city = useMemo(() => {
    if (fromCoords) return cityFromCoords(fromCoords.lat, fromCoords.lng);
    if (toCoords)   return cityFromCoords(toCoords.lat,   toCoords.lng);
    return '';
  }, [fromCoords, toCoords]);

  // Derive road distance from coords when both are known
  const coordsDistanceKm = useMemo(() => {
    if (fromCoords && toCoords)
      return haversine(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng) * 1.3;
    return undefined;
  }, [fromCoords, toCoords]);

  const isHillyCity = ['shillong', 'gangtok', 'tawang'].includes(city);

  const cityServices = useMemo(() => {
    if (!city) return SERVICE_OPTIONS.map((o) => o.type);
    const found = benchmarks.find((c) => c.id === city);
    return found ? found.services.map((s) => s.type) : SERVICE_OPTIONS.map((o) => o.type);
  }, [city]);

  const showRouteFields =
    serviceType === 'taxi' || serviceType === 'auto' || serviceType === 'shared_cab';

  const handleFromSelect = (p: SelectedPlace) => {
    setFromCoords({ lat: p.lat, lng: p.lng });
  };
  const handleToSelect = (p: SelectedPlace) => {
    setToCoords({ lat: p.lat, lng: p.lng });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setChecking(true);

    if (!serviceType || !quotedFare) {
      setError('Please select a Service Type and enter the Quoted Price.');
      return;
    }
    if (!fromText && !toText) {
      setError('Enter at least a pickup or destination so we can estimate the fare.');
      return;
    }
    if (!city) {
      setError(
        "We couldn't place that location within NE India. " +
        'Try picking a suggestion from the dropdown.',
      );
      return;
    }
    const quoted = parseFloat(quotedFare);
    if (isNaN(quoted) || quoted <= 0) {
      setError('Quoted price must be a positive number.');
      return;
    }

    try {
      const input: FareCheckInput = {
        city,
        serviceType: serviceType as ServiceType,
        quotedFare:  quoted,
        fromPlace:   fromText || undefined,
        toPlace:     toText   || undefined,
        distanceKm:  coordsDistanceKm,
        surchargeFlags: {
          isNight,
          isHillRoad: isHillRoad || isHillyCity,
          isAirport,
          luggageCount,
        },
      };
      // Use cached reports for instant result, refresh in background
      const reports = getCachedReports() ?? await loadReports();
      const res = checkFare(input, benchmarks, scams, reports, phrases);
      setResult(res);
      // Also kick off a background refresh so next check has fresh data
      if (!getCachedReports()) loadReports();
      setTimeout(() => {
        document.getElementById('result-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setChecking(false);
    }
  };

  const handleReset = () => {
    setResult(null); setError(null); setServiceType('');
    setQuotedFare('');
    setFromText(''); setToText('');
    setFromCoords(null); setToCoords(null);
    setIsNight(false); setIsHillRoad(false); setIsAirport(false); setLuggageCount(0);
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Check a Fare</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Enter your pickup, destination, and the price you were quoted.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>

        {/* ── Pickup & Destination / Location ── */}
        {serviceType === 'guide' || serviceType === 'restaurant' ? (
          <PlaceAutocomplete
            id="from"
            label="Location"
            value={fromText}
            onChange={(v) => { setFromText(v); if (!v) setFromCoords(null); }}
            onPlaceSelect={handleFromSelect}
            placeholder="Temple, market, restaurant area…"
          />
        ) : (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <PlaceAutocomplete
                id="from"
                label="Pickup"
                value={fromText}
                onChange={(v) => { setFromText(v); if (!v) setFromCoords(null); }}
                onPlaceSelect={handleFromSelect}
                placeholder="Airport, station, hotel…"
              />
            </div>
            <ArrowRight size={16} className="text-slate-400 mb-3 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <PlaceAutocomplete
                id="to"
                label="Destination"
                value={toText}
                onChange={(v) => { setToText(v); if (!v) setToCoords(null); }}
                onPlaceSelect={handleToSelect}
                placeholder="Market, temple, resort…"
              />
            </div>
          </div>
        )}

        {/* ── Detected city + distance chip ── */}
        {(city || coordsDistanceKm) && (
          <div className="flex items-center gap-2 flex-wrap -mt-2">
            {city && (
              <span className="flex items-center gap-1 text-xs font-semibold text-blue-700
                bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                📍 {benchmarks.find((c) => c.id === city)?.name ?? city}
              </span>
            )}
            {coordsDistanceKm && (
              <span className="flex items-center gap-1 text-xs text-slate-500
                bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                ~{Math.round(coordsDistanceKm)} km (road est.)
              </span>
            )}
          </div>
        )}

        {/* ── Service type pills ── */}
        <div>
          <p className="block text-sm font-medium text-slate-700 mb-2">Service Type</p>
          <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Service type">
            {SERVICE_OPTIONS
              .filter((o) => cityServices.includes(o.type))
              .map(({ type, label, Icon }) => {
                const active = serviceType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => { setServiceType(type); setResult(null);
                        // clear destination for single-location services
                        if (type === 'guide' || type === 'restaurant') {
                          setToText(''); setToCoords(null);
                        }
                      }}
                    className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border-2
                      text-xs font-medium transition-all focus:outline-none focus:ring-2
                      focus:ring-blue-500
                      ${active
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                  >
                    <Icon size={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
                    <span className="leading-tight text-center">{label}</span>
                  </button>
                );
              })}
          </div>
        </div>

        {/* ── Quoted fare ── */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="quoted">
            Quoted Price (₹)
          </label>
          <div className="relative">
            <IndianRupee
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="quoted"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              placeholder="e.g. 500"
              value={quotedFare}
              onChange={(e) => { setQuotedFare(e.target.value); setResult(null); }}
              className={`${inputClass} pl-8`}
              required
            />
          </div>
        </div>

        {/* ── Surcharge options ── */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800
              font-medium focus:outline-none"
            aria-expanded={showAdvanced}
          >
            {showAdvanced
              ? <ChevronUp   size={15} aria-hidden="true" />
              : <ChevronDown size={15} aria-hidden="true" />}
            Surcharge options
          </button>

          {showAdvanced && (
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={isNight}
                  onChange={(e) => setIsNight(e.target.checked)}
                  className="rounded accent-blue-600 w-4 h-4" />
                <Moon size={15} className="text-indigo-400 shrink-0" aria-hidden="true" />
                Night trip (late evening / early morning)
              </label>

              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={isHillRoad || isHillyCity}
                  onChange={(e) => setIsHillRoad(e.target.checked)}
                  disabled={isHillyCity}
                  className="rounded accent-blue-600 w-4 h-4" />
                <Mountain size={15} className="text-emerald-500 shrink-0" aria-hidden="true" />
                Hill road route
                {isHillyCity && <span className="text-xs text-slate-400 ml-1">(auto-applied)</span>}
              </label>

              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={isAirport}
                  onChange={(e) => setIsAirport(e.target.checked)}
                  className="rounded accent-blue-600 w-4 h-4" />
                <PlaneLanding size={15} className="text-sky-500 shrink-0" aria-hidden="true" />
                Airport pickup / drop
              </label>

              <div className="flex items-center gap-3">
                <Luggage size={15} className="text-slate-400 shrink-0" aria-hidden="true" />
                <span className="text-sm text-slate-700">Luggage bags:</span>
                <div className="flex items-center gap-2 ml-auto">
                  <button type="button"
                    onClick={() => setLuggageCount((v) => Math.max(0, v - 1))}
                    className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center
                      hover:bg-slate-300 transition-colors focus:outline-none focus:ring-1
                      focus:ring-blue-500"
                    aria-label="Decrease luggage count">
                    <Minus size={13} aria-hidden="true" />
                  </button>
                  <span className="w-6 text-center font-semibold text-sm tabular-nums">
                    {luggageCount}
                  </span>
                  <button type="button"
                    onClick={() => setLuggageCount((v) => v + 1)}
                    className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center
                      hover:bg-slate-300 transition-colors focus:outline-none focus:ring-1
                      focus:ring-blue-500"
                    aria-label="Increase luggage count">
                    <Plus size={13} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div role="alert"
            className="flex items-start gap-2 text-sm text-red-700 bg-red-50
              border border-red-200 rounded-xl px-3 py-2.5">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-500" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex gap-3">
          <button type="submit"
            className="flex-1 flex items-center justify-center gap-2 bg-blue-700
              hover:bg-blue-800 active:bg-blue-900 text-white font-semibold py-3 rounded-xl
              transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            <Search size={16} aria-hidden="true" />
            Check Fare
          </button>
          {result && (
            <button type="button" onClick={handleReset}
              className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-slate-300
                text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none
                focus:ring-2 focus:ring-slate-400">
              <RotateCcw size={14} aria-hidden="true" />
              Reset
            </button>
          )}
        </div>

        {serviceType && !showRouteFields && (
          <p className="text-xs text-slate-400 text-center">
            Pickup / destination not used for {serviceType} fare estimates.
          </p>
        )}
      </form>

      {checking && <CheckFareSkeleton />}

      {result && !checking && (
        <div id="result-section">
          <ResultCard result={result} />
        </div>
      )}
    </div>
  );
}
