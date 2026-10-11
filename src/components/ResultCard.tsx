import { useState } from 'react';
import {
  CheckCircle2, AlertTriangle, ShieldAlert,
  Calculator, Users, TriangleAlert,
  TrendingUp, Lightbulb, MessageSquare,
  Copy, Check, Info,
} from 'lucide-react';
import type { FareCheckResult } from '../types';

interface Props {
  result: FareCheckResult;
}

const LEVEL_CONFIG = {
  fair: {
    bg: 'bg-green-50',
    border: 'border-green-400',
    badgeBg: 'bg-green-500',
    text: 'text-green-800',
    subtext: 'text-green-700',
    label: 'Fair Price',
    barColor: 'bg-green-500',
    description: "The quoted price is within the expected range. You're good to go.",
    Icon: CheckCircle2,
    iconColor: 'text-green-500',
  },
  suspicious: {
    bg: 'bg-amber-50',
    border: 'border-amber-400',
    badgeBg: 'bg-amber-500',
    text: 'text-amber-800',
    subtext: 'text-amber-700',
    label: 'Suspicious',
    barColor: 'bg-amber-500',
    description: "This price is higher than it should be. You can negotiate.",
    Icon: AlertTriangle,
    iconColor: 'text-amber-500',
  },
  high_risk: {
    bg: 'bg-red-50',
    border: 'border-red-500',
    badgeBg: 'bg-red-500',
    text: 'text-red-800',
    subtext: 'text-red-700',
    label: 'High Risk',
    barColor: 'bg-red-500',
    description: 'Significant overcharging detected. Stand firm or walk away.',
    Icon: ShieldAlert,
    iconColor: 'text-red-500',
  },
} as const;

const CONFIDENCE_CONFIG: Record<string, { label: string; color: string }> = {
  low:    { label: 'Seed data only',        color: 'text-slate-500' },
  medium: { label: 'Some community reports', color: 'text-amber-600' },
  high:   { label: 'Community-verified',     color: 'text-green-600' },
};

// ── Categorise reason strings by their content ────────────────────────────────
// The fare.ts functions now embed marker words we can key on.

interface CategorisedReason {
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  text: string;
}

function categorise(reason: string): CategorisedReason {
  const low = reason.toLowerCase();

  if (low.includes('night') || low.includes('hill road') || low.includes('airport') || low.includes('luggage')) {
    return { icon: Calculator,    iconColor: 'text-indigo-500', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200', text: reason };
  }
  if (low.includes('traveller') || low.includes('reported') || low.includes('community') || low.includes('benchmark')) {
    return { icon: Users,         iconColor: 'text-blue-500',   bgColor: 'bg-blue-50',   borderColor: 'border-blue-200',   text: reason };
  }
  if (low.includes('known scam') || low.includes('history of scam') || low.includes('stay alert')) {
    return { icon: TriangleAlert, iconColor: 'text-orange-500', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', text: reason };
  }
  if (low.includes('overcharge') || low.includes('above') || low.includes('extra') || low.includes('decline') || low.includes('walk away')) {
    return { icon: TrendingUp,    iconColor: 'text-red-500',    bgColor: 'bg-red-50',    borderColor: 'border-red-200',    text: reason };
  }
  if (low.includes('within 10%') || low.includes('not a red flag') || low.includes('standard')) {
    return { icon: CheckCircle2,  iconColor: 'text-green-600',  bgColor: 'bg-green-50',  borderColor: 'border-green-200',  text: reason };
  }
  // Fare calculation (route matched, estimated, etc.)
  return   { icon: Calculator,    iconColor: 'text-slate-500',  bgColor: 'bg-slate-50',  borderColor: 'border-slate-200',  text: reason };
}

// ── Fare bar ──────────────────────────────────────────────────────────────────

function FareBar({ fairLow, fairHigh, quoted, barColor }: {
  fairLow: number; fairHigh: number; quoted: number; barColor: string;
}) {
  const maxVal    = Math.max(quoted, fairHigh) * 1.1;
  const lowPct    = (fairLow  / maxVal) * 100;
  const highPct   = (fairHigh / maxVal) * 100;
  const quotedPct = Math.min((quoted / maxVal) * 100, 100);

  return (
    <div aria-label={`Fare range ₹${fairLow}–₹${fairHigh}, quoted ₹${quoted}`}>
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>₹0</span>
        <span>₹{Math.round(maxVal)}</span>
      </div>
      <div className="relative h-5 bg-slate-200 rounded-full overflow-visible">
        <div className="absolute h-full bg-green-200 rounded-full"
          style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
          aria-hidden="true" />
        <div className={`absolute top-0 h-full w-1.5 ${barColor} rounded-full shadow-sm`}
          style={{ left: `calc(${quotedPct}% - 3px)` }}
          aria-hidden="true" />
        <div className="absolute -top-5 text-xs font-bold whitespace-nowrap"
          style={{ left: `calc(${quotedPct}% - 18px)` }}
          aria-hidden="true">
          ₹{quoted}
        </div>
      </div>
      <div className="flex justify-between text-xs mt-1.5">
        <span className="text-green-700 font-medium">₹{fairLow} fair low</span>
        <span className="text-green-700 font-medium">₹{fairHigh} fair high</span>
      </div>
    </div>
  );
}

const LANG_LABELS = [
  { lang: 'en' as const, label: 'English' },
  { lang: 'hi' as const, label: 'हिंदी' },
  { lang: 'as' as const, label: 'অসমীয়া' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ResultCard({ result }: Props) {
  const cfg   = LEVEL_CONFIG[result.level];
  const { Icon } = cfg;
  const conf  = CONFIDENCE_CONFIG[result.confidence];
  const [copiedLang, setCopiedLang] = useState<string | null>(null);

  const copyPhrase = async (lang: 'en' | 'hi' | 'as') => {
    try {
      await navigator.clipboard.writeText(result.whatToSay[lang]);
      setCopiedLang(lang);
      setTimeout(() => setCopiedLang(null), 2000);
    } catch { /* silent */ }
  };

  const categorised = result.reasons.map(categorise);

  return (
    <section
      className={`rounded-2xl border-2 ${cfg.border} ${cfg.bg} p-4 space-y-5`}
      aria-label="Fare check result"
    >
      {/* ── Verdict header ── */}
      <div className="flex items-start gap-3">
        <Icon size={38} className={`${cfg.iconColor} shrink-0`}
          strokeWidth={1.75} aria-hidden="true" />
        <div className="flex-1">
          <span className={`inline-block px-3 py-0.5 rounded-full text-sm font-bold
            text-white ${cfg.badgeBg}`}>
            {cfg.label}
          </span>
          <p className={`mt-1.5 text-sm font-medium ${cfg.text}`}>{cfg.description}</p>
        </div>
        <div className="text-right shrink-0 pl-2">
          <p className="text-xs text-slate-400">Data quality</p>
          <p className={`text-xs font-semibold mt-0.5 ${conf.color}`}>{conf.label}</p>
        </div>
      </div>

      {/* ── Fare bar ── */}
      <FareBar fairLow={result.fairLow} fairHigh={result.fairHigh}
        quoted={result.quotedFare} barColor={cfg.barColor} />

      {/* ── Explanation cards ── */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <Info size={14} className="text-slate-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-700">Why this verdict?</h3>
        </div>

        <ol className="space-y-2" aria-label="Explanation">
          {categorised.map(({ icon: ReasonIcon, iconColor, bgColor, borderColor, text }, i) => (
            <li key={i}
              className={`flex gap-3 rounded-xl border ${borderColor} ${bgColor} px-3 py-2.5`}>
              <ReasonIcon size={15} className={`${iconColor} shrink-0 mt-0.5`}
                aria-hidden="true" />
              <p className="text-xs text-slate-700 leading-relaxed">{text}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* ── Nearby scam alerts ── */}
      {result.nearbyScams.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-orange-600 shrink-0"
              aria-hidden="true" />
            <h3 className="text-sm font-semibold text-orange-800">
              Scam Alert at This Location
            </h3>
          </div>
          <ul className="space-y-3">
            {result.nearbyScams.map((scam) => (
              <li key={scam.id}
                className="bg-white border border-orange-200 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-bold text-orange-900">{scam.title}</p>
                <p className="text-xs text-slate-600 leading-relaxed">{scam.description}</p>
                <div className="flex gap-2 items-start pt-1 border-t border-orange-100">
                  <Lightbulb size={12} className="text-green-600 shrink-0 mt-0.5"
                    aria-hidden="true" />
                  <p className="text-xs text-green-700 font-medium leading-relaxed">
                    {scam.howToAvoid}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── What to say ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
        <div className="flex items-center gap-1.5">
          <MessageSquare size={14} className="text-slate-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-700">What to Say to the Driver</h3>
        </div>
        {LANG_LABELS.map(({ lang, label }) => (
          <div key={lang}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500">{label}</span>
              <button onClick={() => copyPhrase(lang)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800
                  focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-0.5
                  transition-colors border border-transparent hover:border-blue-200"
                aria-label={`Copy ${label} phrase`}>
                {copiedLang === lang
                  ? <><Check size={11} aria-hidden="true" /> Copied</>
                  : <><Copy size={11} aria-hidden="true" /> Copy</>}
              </button>
            </div>
            <p className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5
              text-slate-700 leading-relaxed">
              {result.whatToSay[lang]}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
