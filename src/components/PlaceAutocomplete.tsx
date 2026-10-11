/**
 * PlaceAutocomplete
 *
 * Live search backed by two sources, merged and de-duped:
 *   1. Static places.json  — instant, shown as soon as 2 chars typed
 *   2. Nominatim (OSM)     — debounced 350 ms, region-biased to NE India
 *
 * The component calls `onPlaceSelect` with a resolved lat/lng whenever the
 * user picks a result (static or geocoded), letting the parent infer the city.
 *
 * Freeform text is still accepted — the user can type anything and press Enter.
 *
 * Keyboard: ↑ ↓ Enter Escape
 * ARIA: combobox / listbox pattern
 */

import {
  useState, useRef, useEffect, useId, useCallback,
} from 'react';
import { MapPin, X, Loader2 } from 'lucide-react';
import placesRaw from '../data/places.json';
import type { Place, PlaceType } from '../types';

// ─── Static data ──────────────────────────────────────────────────────────────

const STATIC_PLACES = placesRaw.places as Place[];

const TYPE_ICON: Record<PlaceType, string> = {
  airport:     '✈',
  station:     '🚉',
  commercial:  '🛍',
  tourist_spot:'📍',
};

function scoreStatic(place: Place, q: string): number {
  const lq  = q.toLowerCase();
  const sn  = place.shortName.toLowerCase();
  const fn  = place.name.toLowerCase();
  if (sn === lq || fn === lq)              return 3;
  if (sn.startsWith(lq) || fn.startsWith(lq)) return 2;
  if (sn.includes(lq)   || fn.includes(lq))   return 1;
  return 0;
}

// ─── Nominatim types ──────────────────────────────────────────────────────────

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
}

// ─── Unified suggestion type ──────────────────────────────────────────────────

export interface Suggestion {
  id: string;
  label: string;          // Primary display text
  sublabel?: string;      // Secondary / address line
  lat: number;
  lng: number;
  source: 'static' | 'osm';
  cityId?: string;        // Only set for static places
}

// ─── City bounding boxes for NE India (for Nominatim viewbox bias) ────────────

const NE_INDIA_VIEWBOX = '87.5,25.0,97.5,29.5'; // lon_min,lat_min,lon_max,lat_max

// ─── Nominatim fetch (debounced by caller) ────────────────────────────────────

async function fetchNominatim(query: string): Promise<Suggestion[]> {
  const params = new URLSearchParams({
    q:            query,
    format:       'json',
    addressdetails: '1',
    limit:        '6',
    viewbox:      NE_INDIA_VIEWBOX,
    bounded:      '0',           // bias but don't restrict
    countrycodes: 'in',
  });

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      // Nominatim usage policy requires a descriptive User-Agent
      'Accept-Language': 'en',
    },
  });
  if (!res.ok) return [];

  const data: NominatimResult[] = await res.json();

  return data.map((item) => {
    // Build a short primary label from the first part of display_name
    const parts  = item.display_name.split(',').map((s) => s.trim());
    const label  = parts[0];
    const sublabel = parts.slice(1, 4).join(', ');

    return {
      id:       `osm_${item.place_id}`,
      label,
      sublabel,
      lat:      parseFloat(item.lat),
      lng:      parseFloat(item.lon),
      source:   'osm' as const,
    };
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SelectedPlace {
  name: string;
  lat: number;
  lng: number;
  cityId?: string;   // present when picked from static list
}

interface Props {
  id:              string;
  label:           string;
  value:           string;
  onChange:        (value: string) => void;
  onPlaceSelect?:  (place: SelectedPlace) => void;
  /** When set, static suggestions are pre-filtered to this city */
  cityFilter?:     string;
  placeholder?:    string;
  required?:       boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlaceAutocomplete({
  id,
  label,
  value,
  onChange,
  onPlaceSelect,
  cityFilter,
  placeholder = 'Type a location…',
  required,
}: Props) {
  const [inputText,   setInputText]   = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [open,        setOpen]        = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef    = useRef<HTMLInputElement>(null);
  const listRef     = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const uid         = useId();
  const listId      = `${uid}-list`;

  // Sync if parent resets value
  useEffect(() => { setInputText(value); }, [value]);

  // Build merged suggestions whenever input changes
  const buildSuggestions = useCallback((q: string) => {
    // 1. Static results (instant)
    const pool = cityFilter
      ? STATIC_PLACES.filter((p) => p.city === cityFilter)
      : STATIC_PLACES;

    const staticSuggestions: Suggestion[] = pool
      .map((p) => ({ place: p, s: scoreStatic(p, q) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map(({ place }) => ({
        id:       place.id,
        label:    place.shortName,
        sublabel: place.shortName !== place.name ? place.name : undefined,
        lat:      place.lat,
        lng:      place.lng,
        source:   'static' as const,
        cityId:   place.city,
        typeIcon: TYPE_ICON[place.type],
      }));

    // Show static immediately
    setSuggestions(staticSuggestions);

    // 2. Nominatim (debounced 350 ms)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current)    abortRef.current.abort();

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const osmResults = await fetchNominatim(q);

        // De-dupe: drop OSM results whose label is very similar to a static one
        const staticLabels = new Set(staticSuggestions.map((s) => s.label.toLowerCase()));
        const filtered = osmResults.filter(
          (r) => !staticLabels.has(r.label.toLowerCase()),
        );

        setSuggestions([...staticSuggestions, ...filtered].slice(0, 8));
      } catch {
        // network error or aborted — keep static results
      } finally {
        setLoading(false);
      }
    }, 350);
  }, [cityFilter]);

  // Trigger on every keystroke (2+ chars)
  useEffect(() => {
    const q = inputText.trim();
    if (q.length >= 2) {
      buildSuggestions(q);
      setOpen(true);
    } else {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText, cityFilter]);

  const selectSuggestion = useCallback((s: Suggestion) => {
    setInputText(s.label);
    onChange(s.label);
    onPlaceSelect?.({ name: s.label, lat: s.lat, lng: s.lng, cityId: s.cityId });
    setOpen(false);
    setActiveIndex(-1);
    setSuggestions([]);
    inputRef.current?.blur();
  }, [onChange, onPlaceSelect]);

  const commitFreeform = useCallback(() => {
    onChange(inputText.trim());
    setOpen(false);
    setActiveIndex(-1);
  }, [inputText, onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputText(text);
    onChange(text);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (e.key === 'Enter') { e.preventDefault(); commitFreeform(); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0) selectSuggestion(suggestions[activeIndex]);
        else commitFreeform();
        break;
      case 'Escape':
        setOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const clear = () => {
    setInputText('');
    onChange('');
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const showDropdown = open && (suggestions.length > 0 || loading);

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor={id}>
        {label}
      </label>

      {/* ── Input ── */}
      <div className="relative">
        <MapPin
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined}
          autoComplete="off"
          spellCheck={false}
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (inputText.length >= 2 && suggestions.length > 0) setOpen(true); }}
          onBlur={() => setTimeout(() => { setOpen(false); setActiveIndex(-1); }, 180)}
          placeholder={placeholder}
          required={required}
          className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-8 py-2.5 text-sm
            focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Right-side indicator: spinner while loading, × to clear otherwise */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {loading && inputText.length >= 2 ? (
            <Loader2
              size={14}
              className="text-slate-400 animate-spin"
              aria-label="Searching…"
            />
          ) : inputText ? (
            <button
              type="button"
              onClick={clear}
              className="text-slate-400 hover:text-slate-600 focus:outline-none"
              aria-label="Clear location"
              tabIndex={-1}
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Dropdown ── */}
      {showDropdown && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={`Suggestions for ${label}`}
          className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl
            shadow-xl max-h-64 overflow-y-auto"
        >
          {/* Section header when both static + OSM results present */}
          {suggestions.some((s) => s.source === 'static') && (
            <li
              role="presentation"
              className="px-3 pt-2 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wide"
            >
              Known places
            </li>
          )}

          {suggestions.map((s, i) => {
            const prevSource = i > 0 ? suggestions[i - 1].source : s.source;
            const showOsmHeader = s.source === 'osm' && prevSource === 'static';

            return (
              <li key={s.id}>
                {showOsmHeader && (
                  <div
                    role="presentation"
                    className="px-3 pt-2 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wide border-t border-slate-100"
                  >
                    From map (OpenStreetMap)
                  </div>
                )}
                <div
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer text-sm
                    transition-colors
                    ${i === activeIndex
                      ? 'bg-blue-50 text-blue-800'
                      : 'text-slate-700 hover:bg-slate-50'
                    }`}
                >
                  {/* Icon */}
                  <span className="text-base leading-none shrink-0 w-5 text-center" aria-hidden="true">
                    {s.source === 'static'
                      ? (TYPE_ICON[(STATIC_PLACES.find((p) => p.id === s.id)?.type ?? 'commercial')])
                      : '📌'}
                  </span>

                  {/* Text */}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate leading-snug">{s.label}</p>
                    {s.sublabel && (
                      <p className="text-xs text-slate-400 truncate leading-snug">{s.sublabel}</p>
                    )}
                  </div>

                  {/* City badge for static results when no cityFilter */}
                  {s.source === 'static' && !cityFilter && s.cityId && (
                    <span className="ml-auto shrink-0 text-xs text-slate-400 capitalize">
                      {s.cityId}
                    </span>
                  )}
                </div>
              </li>
            );
          })}

          {/* Loading skeleton row */}
          {loading && suggestions.filter((s) => s.source === 'osm').length === 0 && (
            <li
              role="presentation"
              className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-400"
            >
              <Loader2 size={12} className="animate-spin shrink-0" aria-hidden="true" />
              Searching map…
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
