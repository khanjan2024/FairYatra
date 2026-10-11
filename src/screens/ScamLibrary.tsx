import { useState, useMemo, useEffect } from 'react';
import {
  Search, MapPin, ChevronDown, ChevronUp,
  Lightbulb, AlertOctagon, AlertTriangle, Info,
  Tag, Frown, IndianRupee, ShieldAlert, Eye,
  BadgeCheck,
} from 'lucide-react';
import benchmarksRaw from '../data/benchmarks.json';
import { loadCommunityScams } from '../lib/storage';
import type { Scam, CityBenchmark, ScamCategory } from '../types';

const benchmarks = benchmarksRaw.cities as CityBenchmark[];

// Load everything from Supabase — seed + community + admin-added entries
function useAllScams(): { scams: Scam[]; loading: boolean } {
  const [scams,   setScams]   = useState<Scam[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    loadCommunityScams()
      .then(setScams)
      .finally(() => setLoading(false));
  }, []);
  return { scams, loading };
}

// ── Config ────────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  high:   { Icon: AlertOctagon, iconColor: 'text-red-600',    bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-300',    label: 'High'   },
  medium: { Icon: AlertTriangle,iconColor: 'text-amber-500',  bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-300',  label: 'Medium' },
  low:    { Icon: Info,          iconColor: 'text-slate-500',  bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-300',  label: 'Low'    },
} as const;

const CATEGORY_CONFIG: Record<ScamCategory, { label: string; Icon: React.ElementType; color: string; bg: string }> = {
  overcharging:  { label: 'Overcharging',   Icon: IndianRupee, color: 'text-orange-600', bg: 'bg-orange-50'  },
  hidden_charge: { label: 'Hidden Charge',  Icon: Eye,         color: 'text-purple-600', bg: 'bg-purple-50'  },
  tourist_trap:  { label: 'Tourist Trap',   Icon: ShieldAlert, color: 'text-pink-600',   bg: 'bg-pink-50'    },
  fake_service:  { label: 'Fake Service',   Icon: AlertTriangle,color:'text-red-600',    bg: 'bg-red-50'     },
  scam:          { label: 'Scam / Fraud',   Icon: AlertOctagon,color: 'text-red-700',    bg: 'bg-red-50'     },
};

// ── ScamCard ──────────────────────────────────────────────────────────────────

function ScamCard({ scam }: { scam: Scam }) {
  const [open, setOpen] = useState(false);
  const sev  = SEVERITY_CONFIG[scam.severity];
  const cat  = CATEGORY_CONFIG[scam.category];
  const { Icon: SevIcon } = sev;
  const { Icon: CatIcon } = cat;
  const isCommunity = scam.source === 'community';

  return (
    <article
      className={`rounded-xl border ${sev.border} overflow-hidden bg-white shadow-sm`}
      aria-labelledby={`scam-${scam.id}-title`}
    >
      {/* ── Header (always visible) ── */}
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {/* Severity dot */}
        <span className={`shrink-0 w-7 h-7 rounded-full flex items-center
          justify-center mt-0.5 ${sev.bg}`}>
          <SevIcon size={14} className={sev.iconColor} strokeWidth={2} aria-hidden="true" />
        </span>

        <div className="flex-1 min-w-0">
          <h3 id={`scam-${scam.id}-title`}
            className="font-semibold text-slate-800 text-sm leading-snug">
            {scam.title}
          </h3>

          {/* Category + location row */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-xs font-medium
              px-2 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>
              <CatIcon size={10} aria-hidden="true" />
              {cat.label}
            </span>
            <span className="flex items-center gap-0.5 text-xs text-slate-400">
              <MapPin size={10} aria-hidden="true" />
              {scam.location}
            </span>
            {isCommunity && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold
                px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                <BadgeCheck size={10} aria-hidden="true" />
                Community
              </span>
            )}
          </div>
        </div>

        {/* Typical loss + chevron */}
        <div className="flex flex-col items-end gap-1 shrink-0 ml-1">
          {scam.typicalLoss && (
            <span className="text-xs font-semibold text-red-600 bg-red-50
              px-1.5 py-0.5 rounded whitespace-nowrap">
              {scam.typicalLoss}
            </span>
          )}
          {open
            ? <ChevronUp   size={15} className="text-slate-400" aria-hidden="true" />
            : <ChevronDown size={15} className="text-slate-400" aria-hidden="true" />}
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-slate-100 space-y-3">
          {/* Description */}
          <p className="text-sm text-slate-700 leading-relaxed">{scam.description}</p>

          {/* Red flags */}
          {scam.redFlags && scam.redFlags.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1.5">
                <AlertTriangle size={12} aria-hidden="true" />
                Watch out for:
              </p>
              <ul className="space-y-1">
                {scam.redFlags.map((flag, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-red-700">
                    <span className="mt-0.5 shrink-0">•</span>
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* How to avoid */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Lightbulb size={13} className="text-green-600 shrink-0" aria-hidden="true" />
              <p className="text-xs font-bold text-green-800">How to Avoid</p>
            </div>
            <p className="text-xs text-green-700 leading-relaxed">{scam.howToAvoid}</p>
          </div>

          {/* Tags */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tag size={11} className="text-slate-400" aria-hidden="true" />
            {scam.tags.map((tag) => (
              <span key={tag}
                className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

// ── ScamLibrary screen ────────────────────────────────────────────────────────

const ALL_CATEGORIES: { value: ScamCategory | ''; label: string }[] = [
  { value: '',             label: 'All types'      },
  { value: 'overcharging', label: 'Overcharging'   },
  { value: 'hidden_charge',label: 'Hidden Charges' },
  { value: 'tourist_trap', label: 'Tourist Traps'  },
  { value: 'fake_service', label: 'Fake Services'  },
  { value: 'scam',         label: 'Scams & Fraud'  },
];

export default function ScamLibrary() {
  const { scams, loading } = useAllScams();
  const [search,         setSearch]         = useState('');
  const [filterCity,     setFilterCity]     = useState('');
  const [filterCategory, setFilterCategory] = useState<ScamCategory | ''>('');
  const [filterSeverity, setFilterSeverity] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return scams.filter((s) => {
      const matchSearch =
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)) ||
        (s.redFlags ?? []).some((f) => f.toLowerCase().includes(q));
      const matchCity     = !filterCity     || s.city     === filterCity;
      const matchCategory = !filterCategory || s.category === filterCategory;
      const matchSeverity = !filterSeverity || s.severity === filterSeverity;
      return matchSearch && matchCity && matchCategory && matchSeverity;
    });
  }, [search, filterCity, filterCategory, filterSeverity]);

  // Category counts for filter badges
  const categoryCounts = useMemo(() =>
    Object.fromEntries(
      (['overcharging','hidden_charge','tourist_trap','fake_service','scam'] as ScamCategory[])
        .map((c) => [c, scams.filter((s) => s.category === c).length]),
    ), []);

  const selectClass =
    'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-blue-500';

  const hasFilters = !!(search || filterCity || filterCategory || filterSeverity);

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      {/* ── Header ── */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">Scam Library</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {loading ? 'Loading…' : (
            <>
              {scams.length} known incidents across North East India.
              {scams.filter((s) => s.source === 'community').length > 0 && (
                <> <span className="inline-flex items-center gap-0.5 text-teal-600 font-semibold">
                  <BadgeCheck size={12} aria-hidden="true" />
                  +{scams.filter((s) => s.source === 'community').length} community-verified
                </span></>
              )}
            </>
          )}
        </p>
      </div>

      {/* ── Category quick-filter pills ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide"
        aria-label="Filter by category">
        {ALL_CATEGORIES.map(({ value, label }) => {
          const active = filterCategory === value;
          const count  = value ? categoryCounts[value] : scams.length;
          return (
            <button key={value} onClick={() => setFilterCategory(value)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
                font-medium border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500
                ${active
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                }`}>
              {label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold
                ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <Search size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          aria-hidden="true" />
        <input
          type="search"
          placeholder="Search by title, location, red flag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3
            py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Search scams"
        />
      </div>

      {/* ── City + severity filters ── */}
      <div className="flex gap-2 flex-wrap">
        <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)}
          className={selectClass} aria-label="Filter by city">
          <option value="">All cities</option>
          {benchmarks.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}
          className={selectClass} aria-label="Filter by severity">
          <option value="">All severities</option>
          <option value="high">High risk</option>
          <option value="medium">Medium risk</option>
          <option value="low">Low risk</option>
        </select>

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setFilterCity(''); setFilterCategory(''); setFilterSeverity(''); }}
            className="px-3 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-100
              border border-slate-300 transition-colors">
            Clear all
          </button>
        )}
      </div>

      {/* ── Count ── */}
      <p className="text-xs text-slate-500" aria-live="polite">
        Showing {filtered.length} of {scams.length} entries
      </p>

      {/* ── Cards ── */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-3 animate-pulse">
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-slate-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-14 space-y-2">
          <Frown size={36} className="mx-auto text-slate-300" aria-hidden="true" />
          <p className="text-sm text-slate-400">No entries match your filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((scam) => (
            <ScamCard key={scam.id} scam={scam} />
          ))}
        </div>
      )}
    </div>
  );
}
