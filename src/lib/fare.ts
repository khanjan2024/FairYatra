/**
 * fare.ts – core fare estimation and verdict logic.
 * Pure functions only; no side-effects, no I/O.
 */

import type {
  CityBenchmark,
  ServiceBenchmark,
  FareCheckInput,
  FareCheckResult,
  RiskLevel,
  Confidence,
  Scam,
  CommunityReport,
  SurchargeFlags,
  PhraseTemplates,
  PhraseVariant,
} from '../types';

// ─── Haversine distance ───────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Straight-line distance between two lat/lng points in km. */
export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/** Road distance estimate: straight-line × 1.3 road factor. */
export function estimateRoadDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  return haversine(lat1, lng1, lat2, lng2) * 1.3;
}

// ─── Route key normalisation ──────────────────────────────────────────────────

export function normaliseRouteKey(from: string, to: string): string {
  return [from, to].map((s) => s.trim().toLowerCase()).join('||');
}

// ─── Surcharge calculation ────────────────────────────────────────────────────

export function applySurcharges(
  baseFare: number,
  service: ServiceBenchmark,
  flags: SurchargeFlags,
): { amount: number; reasons: string[] } {
  let amount = baseFare;
  const reasons: string[] = [];

  const { surcharges } = service;

  if (flags.isNight && surcharges.night) {
    amount *= surcharges.night.multiplier;
    const pct = Math.round((surcharges.night.multiplier - 1) * 100);
    reasons.push(
      `Night travel adds ${pct}% — drivers charge more after dark because demand is higher and roads are less safe.`,
    );
  }

  if (flags.isHillRoad && surcharges.hill_road) {
    amount *= surcharges.hill_road.multiplier;
    const pct = Math.round((surcharges.hill_road.multiplier - 1) * 100);
    reasons.push(
      `Hill road routes add ${pct}% — steep gradients, hairpin bends, and slower speeds increase fuel use and wear on the vehicle.`,
    );
  }

  if (flags.isAirport && surcharges.airport) {
    amount += surcharges.airport.flatFee;
    reasons.push(
      `Airport trips carry a flat ₹${surcharges.airport.flatFee} surcharge for entry fees and waiting time at the terminal.`,
    );
  }

  if (flags.luggageCount && flags.luggageCount > 0 && surcharges.luggage) {
    const extra =
      surcharges.luggage.flatFee +
      surcharges.luggage.perBag * flags.luggageCount;
    amount += extra;
    reasons.push(
      `Luggage adds ₹${extra} (base ₹${surcharges.luggage.flatFee} + ${flags.luggageCount} bag${flags.luggageCount > 1 ? 's' : ''} × ₹${surcharges.luggage.perBag} each) — this is standard and fair to pay.`,
    );
  }

  return { amount: Math.round(amount), reasons };
}

// ─── Base fare from benchmark ─────────────────────────────────────────────────

/**
 * Compute a [low, high] range from the benchmark.
 * – If a matching typical route exists, use its fixed fare ± 10%.
 * – Otherwise use baseFare + perKmRate × distance ± 15%.
 */
export function computeBenchmarkRange(
  service: ServiceBenchmark,
  distanceKm: number,
  fromPlace: string | undefined,
  toPlace: string | undefined,
  flags: SurchargeFlags,
): { low: number; high: number; reasons: string[]; usedRoute: boolean } {
  const reasons: string[] = [];
  let base: number;
  let usedRoute = false;

  // Try matching a typical route
  if (fromPlace && toPlace) {
    const key = normaliseRouteKey(fromPlace, toPlace);
    const match = service.typicalRoutes.find(
      (r) =>
        normaliseRouteKey(r.from, r.to) === key ||
        normaliseRouteKey(r.to, r.from) === key,
    );
    if (match) {
      base = match.fixedFare;
      usedRoute = true;
      reasons.push(
        `This is a well-known route (${match.from} → ${match.to}). The standard fixed fare is ₹${match.fixedFare}.`,
      );
    } else {
      base = service.baseFare + service.perKmRate * distanceKm;
      reasons.push(
        `No fixed rate exists for this exact route, so the fare was estimated: ₹${service.baseFare} base + ₹${service.perKmRate}/km × ${distanceKm.toFixed(1)} km = ₹${Math.round(base)}.`,
      );
    }
  } else {
    base = service.baseFare + service.perKmRate * distanceKm;
    reasons.push(
      `Fare estimated from the standard rate: ₹${service.baseFare} base + ₹${service.perKmRate}/km × ${distanceKm.toFixed(1)} km = ₹${Math.round(base)}.`,
    );
  }

  // Apply surcharges
  const { amount: withSurcharges, reasons: surchargeReasons } = applySurcharges(
    base,
    service,
    flags,
  );
  reasons.push(...surchargeReasons);

  const margin = usedRoute ? 0.1 : 0.15;
  const low = Math.round(withSurcharges * (1 - margin));
  const high = Math.round(withSurcharges * (1 + margin));

  return { low, high, reasons, usedRoute };
}

// ─── Community report blending ────────────────────────────────────────────────

/** Return the median of an array of numbers. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Blend the benchmark fair range with community-reported paid fares.
 * Weight of community data grows from 0 at 0 reports to 0.5 at 10+ reports.
 */
export function blendWithCommunityReports(
  benchmarkLow: number,
  benchmarkHigh: number,
  reports: CommunityReport[],
): { blendedLow: number; blendedHigh: number; confidence: Confidence; reasons: string[] } {
  const reasons: string[] = [];

  if (reports.length === 0) {
    return {
      blendedLow: benchmarkLow,
      blendedHigh: benchmarkHigh,
      confidence: 'low',
      reasons: ['No community reports yet for this route — estimate is based on official benchmarks only. Treat the fair range as a guide, not a guarantee.'],
    };
  }

  const paidFares = reports.map((r) => r.paidFare);
  const medianPaid = median(paidFares);
  const overchargedCount = reports.filter((r) => r.isOvercharged).length;

  // Weight: 0 → 0.5 as report count goes 0 → 10
  const weight = Math.min(reports.length / 10, 0.5);
  const blendedLow = Math.round(
    benchmarkLow * (1 - weight) + medianPaid * 0.9 * weight,
  );
  const blendedHigh = Math.round(
    benchmarkHigh * (1 - weight) + medianPaid * 1.1 * weight,
  );

  const confidence: Confidence =
    reports.length >= 10 ? 'high' : reports.length >= 4 ? 'medium' : 'low';

  const overchargedPct = Math.round((overchargedCount / reports.length) * 100);
  reasons.push(
    `${reports.length} traveller${reports.length > 1 ? 's' : ''} reported fares on this route — the typical amount paid was ₹${Math.round(medianPaid)}.` +
    (overchargedCount > 0
      ? ` ${overchargedPct}% of them felt they were overcharged.`
      : ' None reported being overcharged.'),
  );

  return { blendedLow, blendedHigh, confidence, reasons };
}

// ─── Scam proximity check ─────────────────────────────────────────────────────

export function findNearbyScams(
  scams: Scam[],
  city: string,
  serviceType: string,
  fromPlace?: string,
  toPlace?: string,
): Scam[] {
  return scams.filter((scam) => {
    const sameCity = scam.city === city;
    const matchesService =
      scam.serviceType === serviceType ||
      scam.category === 'tourist_trap' ||
      scam.category === 'hidden_charge';
    const matchesPlace =
      (fromPlace && scam.location.toLowerCase().includes(fromPlace.toLowerCase())) ||
      (toPlace   && scam.location.toLowerCase().includes(toPlace.toLowerCase()))   ||
      (!fromPlace && !toPlace);
    return sameCity && matchesService && matchesPlace;
  }).slice(0, 3);
}

// ─── Verdict computation ──────────────────────────────────────────────────────

function computeLevel(
  quotedFare: number,
  fairHigh: number,
  hasNearbyScam: boolean,
): RiskLevel {
  const ratio = quotedFare / fairHigh;
  let level: RiskLevel;

  if (ratio <= 1.1) {
    level = 'fair';
  } else if (ratio <= 1.6) {
    level = 'suspicious';
  } else {
    level = 'high_risk';
  }

  // Escalate one step if scam entries match this location
  if (hasNearbyScam) {
    if (level === 'fair') level = 'suspicious';
    else if (level === 'suspicious') level = 'high_risk';
  }

  return level;
}

// ─── Phrase template rendering ────────────────────────────────────────────────

function fillTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}

export function buildWhatToSay(
  phrases: PhraseTemplates,
  level: RiskLevel,
  fairLow: number,
  fairHigh: number,
  quotedFare: number,
): { en: string; hi: string; as: string } {
  const tpl: PhraseVariant = phrases.templates[level];
  const vars = { low: fairLow, high: fairHigh, quoted: quotedFare };
  return {
    en: fillTemplate(tpl.en, vars),
    hi: fillTemplate(tpl.hi, vars),
    as: fillTemplate(tpl.as, vars),
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function checkFare(
  input: FareCheckInput,
  benchmarks: CityBenchmark[],
  scams: Scam[],
  communityReports: CommunityReport[],
  phrases: PhraseTemplates,
): FareCheckResult {
  const reasons: string[] = [];

  // 1. Find city benchmark
  const cityData = benchmarks.find(
    (c) => c.id === input.city || c.name.toLowerCase() === input.city.toLowerCase(),
  );
  if (!cityData) {
    throw new Error(`No benchmark data for city: ${input.city}`);
  }

  // 2. Find service benchmark
  const service = cityData.services.find((s) => s.type === input.serviceType);
  if (!service) {
    throw new Error(
      `No benchmark for service type "${input.serviceType}" in ${cityData.name}`,
    );
  }

  const distanceKm = input.distanceKm ?? 5; // fallback if no distance given
  const flags = input.surchargeFlags ?? {};

  // 3. Compute benchmark fair range
  const {
    low: benchLow,
    high: benchHigh,
    reasons: benchReasons,
  } = computeBenchmarkRange(
    service,
    distanceKm,
    input.fromPlace,
    input.toPlace,
    flags,
  );
  reasons.push(...benchReasons);

  // 4. Filter community reports for this route
  const routeKey = normaliseRouteKey(
    input.fromPlace ?? '',
    input.toPlace ?? '',
  );
  const relevantReports = communityReports.filter(
    (r) =>
      r.city === input.city &&
      r.serviceType === input.serviceType &&
      (r.routeKey === routeKey || routeKey === '||'),
  );

  // 5. Blend with community reports
  const {
    blendedLow,
    blendedHigh,
    confidence,
    reasons: blendReasons,
  } = blendWithCommunityReports(benchLow, benchHigh, relevantReports);
  reasons.push(...blendReasons);

  // 6. Find nearby scams
  const nearbyScams = findNearbyScams(
    scams,
    input.city,
    input.serviceType,
    input.fromPlace,
    input.toPlace,
  );
  if (nearbyScams.length > 0) {
    reasons.push(
      `This location has ${nearbyScams.length} known scam${nearbyScams.length > 1 ? 's' : ''} involving ${input.serviceType}s — see the alerts below for details.`,
    );
  }

  // 7. Compute verdict
  const level = computeLevel(
    input.quotedFare,
    blendedHigh,
    nearbyScams.length > 0,
  );

  // 8. Explain the price gap in plain language
  const overpayAmount = input.quotedFare - blendedHigh;
  const overpayPct    = Math.round(((input.quotedFare / blendedHigh) - 1) * 100);
  const ratio         = input.quotedFare / blendedHigh;

  if (ratio <= 1.1) {
    reasons.push(
      `The quoted ₹${input.quotedFare} is within 10% of the fair ceiling (₹${blendedHigh}) — this is normal variation and not a red flag.`,
    );
  } else if (ratio <= 1.6) {
    reasons.push(
      `The quoted ₹${input.quotedFare} is ${overpayPct}% above the fair ceiling of ₹${blendedHigh} — that's ₹${overpayAmount} extra. ` +
      `This level of markup is common when vendors spot a tourist. A firm counter-offer of ₹${blendedHigh} usually works.`,
    );
  } else {
    reasons.push(
      `The quoted ₹${input.quotedFare} is ${overpayPct}% above the fair ceiling of ₹${blendedHigh} — ₹${overpayAmount} more than you should pay. ` +
      `This is a significant overcharge. Decline, walk away, and try a different driver or use the app-based options if available.`,
    );
  }

  if (nearbyScams.length > 0 && ratio <= 1.1) {
    reasons.push(
      `Even though the price looks fair numerically, this spot has a history of scams. Stay alert for pressure tactics or detours.`,
    );
  }

  // 9. Build "what to say"
  const whatToSay = buildWhatToSay(
    phrases,
    level,
    blendedLow,
    blendedHigh,
    input.quotedFare,
  );

  return {
    level,
    fairLow: blendedLow,
    fairHigh: blendedHigh,
    quotedFare: input.quotedFare,
    confidence,
    reasons,
    nearbyScams,
    whatToSay,
  };
}
