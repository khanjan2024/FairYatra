import { useState, useMemo, useEffect } from 'react';
import {
  IndianRupee, AlertTriangle, Star, Lightbulb,
  MapPin, ThumbsUp, Filter, Users,
  TrendingUp, ShieldCheck, BarChart3,
} from 'lucide-react';
import {
  loadReports, markHelpful, hasVoted, getStats,
} from '../lib/storage';
import { getCachedReports } from '../lib/cache';
import type { CommunityReport, ReportType } from '../types';
import benchmarksRaw from '../data/benchmarks.json';
import type { CityBenchmark } from '../types';
import { ReportCardSkeleton, StatCardSkeleton } from '../components/Skeleton';

const benchmarks = benchmarksRaw.cities as CityBenchmark[];

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function cityName(id: string): string {
  return benchmarks.find((c) => c.id === id)?.name ?? id;
}

const TYPE_CONFIG: Record<ReportType, { label: string; Icon: React.ElementType; color: string; bg: string; border: string }> = {
  fare:      { label: 'Fare Report', Icon: IndianRupee,   color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200'   },
  complaint: { label: 'Complaint',   Icon: AlertTriangle, color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'    },
  review:    { label: 'Review',      Icon: Star,          color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
  scam_tip:  { label: 'Scam Tip',    Icon: Lightbulb,     color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
};

const COMPLAINT_LABELS: Record<string, string> = {
  rude_driver:   'Rude / aggressive driver',
  unsafe:        'Unsafe driving',
  detour:        'Unnecessary detour',
  hidden_charge: 'Hidden charges',
  refused_meter: 'Refused meter',
  overcharge:    'Overcharged',
  other:         'Other issue',
};

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar() {
  const [stats, setStats] = useState<{ total: number; overchargedPct: number; topCity: string } | null>(null);
  useEffect(() => { getStats().then(setStats); }, []);
  if (!stats) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[1,2,3].map((i) => <StatCardSkeleton key={i} />)}
      </div>
    );
  }
  if (stats.total === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { Icon: Users,       label: 'Reports',    value: String(stats.total),              color: 'text-blue-600'  },
        { Icon: TrendingUp,  label: 'Overcharged',value: `${stats.overchargedPct}%`,        color: 'text-red-600'   },
        { Icon: ShieldCheck, label: 'Most reports',value: cityName(stats.topCity),          color: 'text-green-600' },
      ].map(({ Icon, label, value, color }) => (
        <div key={label}
          className="bg-white border border-slate-200 rounded-xl p-2.5 text-center">
          <Icon size={16} className={`${color} mx-auto mb-1`} aria-hidden="true" />
          <p className={`text-sm font-bold ${color}`}>{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Report card ───────────────────────────────────────────────────────────────

function ReportCard({
  report,
  onHelpful,
}: {
  report: CommunityReport;
  onHelpful: (id: string) => Promise<boolean>;
}) {
  const cfg    = TYPE_CONFIG[report.type];
  const { Icon } = cfg;
  const [voted,        setVoted]        = useState(false);
  const [helpfulCount, setHelpfulCount] = useState(report.helpful ?? 0);
  const [showPhotos,   setShowPhotos]   = useState(false);

  useEffect(() => {
    hasVoted(report.id).then(setVoted);
  }, [report.id]);

  // Keep count in sync if parent re-fetches the list
  useEffect(() => {
    setHelpfulCount(report.helpful ?? 0);
  }, [report.helpful]);

  const handleHelpfulClick = async () => {
    if (voted) return;
    // Optimistic update — show immediately
    setVoted(true);
    setHelpfulCount((c) => c + 1);
    const succeeded = await onHelpful(report.id);
    if (!succeeded) {
      // Roll back if vote was rejected (already voted server-side)
      setVoted(true); // keep disabled
      setHelpfulCount((c) => Math.max(0, c - 1));
    }
  };

  const overpayPct = report.quotedFare > 0 && report.paidFare > 0
    ? Math.round(((report.quotedFare / report.paidFare) - 1) * 100)
    : null;

  return (
    <article
      className={`bg-white rounded-xl border ${cfg.border} shadow-sm overflow-hidden`}
      aria-label={`${cfg.label} report`}
    >
      {/* ── Header ── */}
      <div className={`flex items-center gap-2 px-3 py-2 ${cfg.bg}`}>
        <Icon size={13} className={`${cfg.color} shrink-0`} aria-hidden="true" />
        <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
        <span className="ml-auto text-xs text-slate-400">{timeAgo(report.timestamp)}</span>
      </div>

      <div className="px-3 py-3 space-y-2">
        {/* Route */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
          <MapPin size={11} className="shrink-0" aria-hidden="true" />
          <span className="font-medium text-slate-700">{cityName(report.city)}</span>
          {(report.fromPlace || report.toPlace) && (
            <>
              <span>·</span>
              <span>{report.fromPlace || '?'}</span>
              {report.toPlace && <><span>→</span><span>{report.toPlace}</span></>}
            </>
          )}
          <span>·</span>
          <span className="capitalize">{report.serviceType.replace('_', ' ')}</span>
        </div>

        {/* Title */}
        {report.title && (
          <p className="text-sm font-semibold text-slate-800">{report.title}</p>
        )}

        {/* Type-specific content */}
        {report.type === 'fare' && report.quotedFare > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs bg-slate-100 rounded-lg px-2 py-1">
              Quoted: <strong>₹{report.quotedFare}</strong>
            </span>
            <span className="text-xs bg-slate-100 rounded-lg px-2 py-1">
              Paid: <strong>₹{report.paidFare}</strong>
            </span>
            {overpayPct !== null && overpayPct > 0 && (
              <span className="text-xs bg-red-100 text-red-700 rounded-lg px-2 py-1 font-semibold">
                +{overpayPct}% over
              </span>
            )}
            {report.isOvercharged && (
              <span className="text-xs bg-red-100 text-red-700 rounded-lg px-2 py-1">
                Felt overcharged
              </span>
            )}
          </div>
        )}

        {report.type === 'complaint' && report.complaintType && (
          <span className="inline-block text-xs bg-red-100 text-red-700
            rounded-full px-2 py-0.5 font-medium">
            {COMPLAINT_LABELS[report.complaintType] ?? report.complaintType}
          </span>
        )}

        {report.type === 'review' && report.rating && (
          <div className="flex items-center gap-1">
            {[1,2,3,4,5].map((n) => (
              <Star key={n} size={14}
                className={n <= report.rating! ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}
                aria-hidden="true" />
            ))}
            <span className="text-xs text-slate-500 ml-1">
              {['','Very bad','Poor','Okay','Good','Excellent'][report.rating]}
            </span>
          </div>
        )}

        {/* Note */}
        {report.note && (
          <p className="text-xs text-slate-600 leading-relaxed">{report.note}</p>
        )}

        {/* Driver details */}
        {report.driverDetails && (
          <p className="text-xs text-slate-500 bg-slate-50 rounded px-2 py-1">
            🚗 {report.driverDetails}
          </p>
        )}

        {/* Photos */}
        {report.evidence && report.evidence.length > 0 && (
          <div>
            <button type="button"
              onClick={() => setShowPhotos((v) => !v)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium
                focus:outline-none">
              {showPhotos ? '▲ Hide' : '▼ Show'} {report.evidence.length} photo{report.evidence.length > 1 ? 's' : ''}
            </button>
            {showPhotos && (
              <div className="flex gap-2 flex-wrap mt-2">
                {report.evidence.map((ev, i) => (
                  <img key={i} src={ev.dataUrl} alt={`Evidence ${i + 1}`}
                    className="w-24 h-24 object-cover rounded-lg border border-slate-200" />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
          <button
            type="button"
            onClick={handleHelpfulClick}
            disabled={voted}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5
              rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-blue-400
              ${voted
                ? 'bg-blue-100 text-blue-700 cursor-default'
                : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700'
              }`}
            aria-label="Mark as helpful"
          >
            <ThumbsUp size={12} aria-hidden="true" />
            Helpful{helpfulCount > 0 ? ` (${helpfulCount})` : ''}
          </button>
        </div>
      </div>
    </article>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CommunityFeed() {
  // Populate from cache immediately — no flash of empty state
  const [reports,     setReports]     = useState<CommunityReport[]>(() => getCachedReports() ?? []);
  const [loading,     setLoading]     = useState(!getCachedReports());
  const [filterType,  setFilterType]  = useState<ReportType | ''>('');
  const [filterCity,  setFilterCity]  = useState('');
  const [sortBy,      setSortBy]      = useState<'newest' | 'helpful'>('newest');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadReports().then((r) => { setReports(r); setLoading(false); });
  }, []);

  const handleHelpful = async (id: string): Promise<boolean> => {
    return await markHelpful(id);
  };

  const filtered = useMemo(() => {
    let list = [...reports];
    if (filterType) list = list.filter((r) => r.type === filterType);
    if (filterCity) list = list.filter((r) => r.city === filterCity);
    list.sort((a, b) =>
      sortBy === 'newest'
        ? b.timestamp - a.timestamp
        : (b.helpful ?? 0) - (a.helpful ?? 0),
    );
    return list;
  }, [reports, filterType, filterCity, sortBy]);

  const selectClass =
    'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      {/* ── Header ── */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">Community Reports</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Real experiences from travellers in NE India.
        </p>
      </div>

      {/* ── Stats ── */}
      <StatsBar />

      {/* ── Type filter pills ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {([{ value: '', label: 'All' }, ...Object.entries(TYPE_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))] as { value: string; label: string }[])
          .map(({ value, label }) => (
            <button key={value}
              onClick={() => setFilterType(value as ReportType | '')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border
                transition-all focus:outline-none focus:ring-2 focus:ring-blue-500
                ${filterType === value
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                }`}>
              {label}
            </button>
          ))}
      </div>

      {/* ── Sort + filter toggle ── */}
      <div className="flex items-center gap-2">
        <select value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'newest' | 'helpful')}
          className={`${selectClass} flex-1`} aria-label="Sort by">
          <option value="newest">Newest first</option>
          <option value="helpful">Most helpful</option>
        </select>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm
            font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500
            ${showFilters
              ? 'bg-blue-700 text-white border-blue-700'
              : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
            }`}>
          <Filter size={14} aria-hidden="true" />
          Filter
        </button>
      </div>

      {showFilters && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
          <select value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
            className={`${selectClass} w-full`} aria-label="Filter by city">
            <option value="">All cities</option>
            {benchmarks.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Count ── */}
      <p className="text-xs text-slate-500" aria-live="polite">
        {filtered.length} report{filtered.length !== 1 ? 's' : ''}
        {filterType || filterCity ? ' (filtered)' : ''}
      </p>

      {/* ── Feed ── */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => <ReportCardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <BarChart3 size={40} className="mx-auto text-slate-200" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-500">No reports yet</p>
          <p className="text-xs text-slate-400">
            Be the first — submit a fare report, review, or scam tip using the Report tab.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <ReportCard key={r.id} report={r} onHelpful={handleHelpful} />
          ))}
        </div>
      )}
    </div>
  );
}
