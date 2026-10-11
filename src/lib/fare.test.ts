import { describe, it, expect } from 'vitest';
import {
  haversine,
  estimateRoadDistanceKm,
  normaliseRouteKey,
  applySurcharges,
  computeBenchmarkRange,
  median,
  blendWithCommunityReports,
  findNearbyScams,
  buildWhatToSay,
  checkFare,
} from './fare';
import type {
  ServiceBenchmark,
  CityBenchmark,
  CommunityReport,
  Scam,
  PhraseTemplates,
} from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockService: ServiceBenchmark = {
  type: 'taxi',
  baseFare: 50,
  perKmRate: 15,
  source: 'test',
  surcharges: {
    night: { multiplier: 1.25, hours: [22, 6] },
    hill_road: { multiplier: 1.2 },
    luggage: { flatFee: 20, perBag: 10 },
    airport: { flatFee: 50 },
  },
  typicalRoutes: [
    {
      from: 'Airport',
      to: 'City Centre',
      fixedFare: 350,
      distanceKm: 22,
      source: 'test',
    },
  ],
};

const mockCity: CityBenchmark = {
  id: 'testcity',
  name: 'Test City',
  state: 'Test State',
  services: [mockService],
};

const mockPhrases: PhraseTemplates = {
  templates: {
    fair: {
      en: 'Fair: {low}-{high}, quoted {quoted}.',
      hi: 'उचित: {low}-{high}, उद्धृत {quoted}।',
      as: 'TODO_ASSAMESE: {low}-{high}, {quoted}।',
    },
    suspicious: {
      en: 'Suspicious: {low}-{high}, quoted {quoted}.',
      hi: 'संदिग्ध: {low}-{high}, उद्धृत {quoted}।',
      as: 'TODO_ASSAMESE: {low}-{high}, {quoted}।',
    },
    high_risk: {
      en: 'High Risk: {low}-{high}, quoted {quoted}.',
      hi: 'उच्च जोखिम: {low}-{high}, उद्धृत {quoted}।',
      as: 'TODO_ASSAMESE: {low}-{high}, {quoted}।',
    },
  },
};

const mockScam: Scam = {
  id: 'scam_test_001',
  city: 'testcity',
  location: 'Airport',
  lat: 26.1,
  lng: 91.5,
  title: 'Test Scam',
  category: 'overcharging',
  description: 'Test scam description',
  howToAvoid: 'Test avoidance',
  typicalLoss: '₹200–400',
  redFlags: ['Refuses meter', 'Quotes round number'],
  severity: 'high',
  serviceType: 'taxi',
  tags: ['airport'],
  source: 'seed',
};

// ─── haversine ────────────────────────────────────────────────────────────────

describe('haversine', () => {
  it('returns 0 for identical points', () => {
    expect(haversine(26.1, 91.5, 26.1, 91.5)).toBeCloseTo(0, 5);
  });

  it('computes roughly correct distance between Guwahati and Shillong (~92 km as the crow flies)', () => {
    const dist = haversine(26.1824, 91.7523, 25.5788, 91.8933);
    expect(dist).toBeGreaterThan(65);
    expect(dist).toBeLessThan(75);
  });

  it('is symmetric', () => {
    const d1 = haversine(26.1, 91.5, 27.3, 88.6);
    const d2 = haversine(27.3, 88.6, 26.1, 91.5);
    expect(d1).toBeCloseTo(d2, 5);
  });
});

// ─── estimateRoadDistanceKm ───────────────────────────────────────────────────

describe('estimateRoadDistanceKm', () => {
  it('applies 1.3× road factor', () => {
    const straight = haversine(26.1, 91.5, 26.2, 91.6);
    const road = estimateRoadDistanceKm(26.1, 91.5, 26.2, 91.6);
    expect(road).toBeCloseTo(straight * 1.3, 5);
  });
});

// ─── normaliseRouteKey ────────────────────────────────────────────────────────

describe('normaliseRouteKey', () => {
  it('lowercases and trims both parts', () => {
    expect(normaliseRouteKey('  Airport ', 'City Centre ')).toBe(
      'airport||city centre',
    );
  });
  it('is case-insensitive', () => {
    expect(normaliseRouteKey('AIRPORT', 'city centre')).toBe(
      'airport||city centre',
    );
  });
});

// ─── applySurcharges ──────────────────────────────────────────────────────────

describe('applySurcharges', () => {
  it('returns base fare unchanged when no flags set', () => {
    const { amount } = applySurcharges(200, mockService, {});
    expect(amount).toBe(200);
  });

  it('applies night multiplier', () => {
    const { amount, reasons } = applySurcharges(200, mockService, {
      isNight: true,
    });
    expect(amount).toBe(250); // 200 × 1.25
    expect(reasons.some((r) => r.includes('Night'))).toBe(true);
  });

  it('applies hill road multiplier', () => {
    const { amount } = applySurcharges(200, mockService, { isHillRoad: true });
    expect(amount).toBe(240); // 200 × 1.2
  });

  it('stacks night and hill road multipliers', () => {
    const { amount } = applySurcharges(200, mockService, {
      isNight: true,
      isHillRoad: true,
    });
    // 200 × 1.25 = 250, then × 1.2 = 300
    expect(amount).toBe(300);
  });

  it('adds airport flat fee', () => {
    const { amount } = applySurcharges(200, mockService, { isAirport: true });
    expect(amount).toBe(250); // 200 + 50
  });

  it('adds luggage fee correctly', () => {
    const { amount } = applySurcharges(200, mockService, {
      luggageCount: 2,
    });
    // flatFee 20 + 2 bags × 10 = 40; 200 + 40 = 240
    expect(amount).toBe(240);
  });
});

// ─── computeBenchmarkRange ────────────────────────────────────────────────────

describe('computeBenchmarkRange', () => {
  it('uses a matching typical route when found', () => {
    const { low, high, usedRoute } = computeBenchmarkRange(
      mockService,
      22,
      'Airport',
      'City Centre',
      {},
    );
    // fixedFare 350 ± 10%
    expect(usedRoute).toBe(true);
    expect(low).toBe(315);
    expect(high).toBe(385);
  });

  it('falls back to distance formula when no route matches', () => {
    const { usedRoute, low, high } = computeBenchmarkRange(
      mockService,
      10,
      'Unknown A',
      'Unknown B',
      {},
    );
    // baseFare 50 + 15/km × 10 = 200; ±15% → [170, 230]
    expect(usedRoute).toBe(false);
    expect(low).toBe(170);
    expect(high).toBe(230);
  });

  it('applies night surcharge on top of route fare', () => {
    const { high } = computeBenchmarkRange(
      mockService,
      22,
      'Airport',
      'City Centre',
      { isNight: true },
    );
    // 350 × 1.25 = 437.5 + 10% margin → ~481
    expect(high).toBeGreaterThan(385);
  });
});

// ─── median ───────────────────────────────────────────────────────────────────

describe('median', () => {
  it('handles empty array', () => {
    expect(median([])).toBe(0);
  });
  it('handles single element', () => {
    expect(median([42])).toBe(42);
  });
  it('handles odd count', () => {
    expect(median([10, 30, 20])).toBe(20);
  });
  it('handles even count', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });
});

// ─── blendWithCommunityReports ────────────────────────────────────────────────

describe('blendWithCommunityReports', () => {
  it('returns benchmark values and low confidence with 0 reports', () => {
    const { blendedLow, blendedHigh, confidence } = blendWithCommunityReports(
      300,
      400,
      [],
    );
    expect(blendedLow).toBe(300);
    expect(blendedHigh).toBe(400);
    expect(confidence).toBe('low');
  });

  it('confidence is medium with 4 reports', () => {
    const reports: CommunityReport[] = Array.from({ length: 4 }, (_, i) => ({
      id: `r${i}`,
      type: 'fare' as const,
      city: 'testcity',
      serviceType: 'taxi' as const,
      fromPlace: 'A',
      toPlace: 'B',
      quotedFare: 500,
      paidFare: 350,
      isOvercharged: true,
      timestamp: Date.now(),
      routeKey: 'a||b',
      helpful: 0,
      status: 'pending' as const,
    }));
    const { confidence } = blendWithCommunityReports(300, 400, reports);
    expect(confidence).toBe('medium');
  });

  it('confidence is high with 10+ reports', () => {
    const reports: CommunityReport[] = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      type: 'fare' as const,
      city: 'testcity',
      serviceType: 'taxi' as const,
      fromPlace: 'A',
      toPlace: 'B',
      quotedFare: 500,
      paidFare: 350,
      isOvercharged: true,
      timestamp: Date.now(),
      routeKey: 'a||b',
      helpful: 0,
      status: 'pending' as const,
    }));
    const { confidence } = blendWithCommunityReports(300, 400, reports);
    expect(confidence).toBe('high');
  });

  it('blends community median into range', () => {
    const reports: CommunityReport[] = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`,
      type: 'fare' as const,
      city: 'testcity',
      serviceType: 'taxi' as const,
      fromPlace: 'A',
      toPlace: 'B',
      quotedFare: 400,
      paidFare: 280,
      isOvercharged: false,
      timestamp: Date.now(),
      routeKey: 'a||b',
      helpful: 0,
      status: 'pending' as const,
    }));
    const { blendedHigh } = blendWithCommunityReports(300, 400, reports);
    // community pulls the high down toward 280×1.1=308
    expect(blendedHigh).toBeLessThan(400);
    expect(blendedHigh).toBeGreaterThan(300);
  });
});

// ─── findNearbyScams ──────────────────────────────────────────────────────────

describe('findNearbyScams', () => {
  it('returns scams matching city and service', () => {
    const result = findNearbyScams(
      [mockScam],
      'testcity',
      'taxi',
      'Airport',
      'City Centre',
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('scam_test_001');
  });

  it('returns empty array for non-matching city', () => {
    const result = findNearbyScams(
      [mockScam],
      'othercity',
      'taxi',
      'Airport',
      undefined,
    );
    expect(result).toHaveLength(0);
  });
});

// ─── buildWhatToSay ───────────────────────────────────────────────────────────

describe('buildWhatToSay', () => {
  it('fills in all template variables', () => {
    const result = buildWhatToSay(mockPhrases, 'fair', 300, 400, 380);
    expect(result.en).toContain('300');
    expect(result.en).toContain('400');
    expect(result.en).toContain('380');
  });

  it('uses the correct template for high_risk', () => {
    const result = buildWhatToSay(mockPhrases, 'high_risk', 300, 400, 800);
    expect(result.en).toContain('High Risk');
  });

  it('Assamese template contains TODO placeholder', () => {
    const result = buildWhatToSay(mockPhrases, 'suspicious', 300, 400, 600);
    expect(result.as).toContain('TODO_ASSAMESE');
  });
});

// ─── checkFare (integration) ──────────────────────────────────────────────────

describe('checkFare integration', () => {
  it('marks a fare at 1.05× fair ceiling as "fair"', () => {
    // fair high ~385 for Airport→City Centre; quoted 400 ≈ 1.04× → fair
    const result = checkFare(
      {
        city: 'testcity',
        serviceType: 'taxi',
        quotedFare: 400,
        fromPlace: 'Airport',
        toPlace: 'City Centre',
      },
      [mockCity],
      [],
      [],
      mockPhrases,
    );
    expect(result.level).toBe('fair');
  });

  it('marks a fare at 1.4× fair ceiling as "suspicious"', () => {
    const result = checkFare(
      {
        city: 'testcity',
        serviceType: 'taxi',
        quotedFare: 550,
        fromPlace: 'Airport',
        toPlace: 'City Centre',
      },
      [mockCity],
      [],
      [],
      mockPhrases,
    );
    expect(result.level).toBe('suspicious');
  });

  it('marks a fare at 2× fair ceiling as "high_risk"', () => {
    const result = checkFare(
      {
        city: 'testcity',
        serviceType: 'taxi',
        quotedFare: 800,
        fromPlace: 'Airport',
        toPlace: 'City Centre',
      },
      [mockCity],
      [],
      [],
      mockPhrases,
    );
    expect(result.level).toBe('high_risk');
  });

  it('escalates level by 1 step when matching scam exists', () => {
    // Without scam: 500 / 385 ≈ 1.3 → suspicious
    // With scam at Airport → high_risk
    const result = checkFare(
      {
        city: 'testcity',
        serviceType: 'taxi',
        quotedFare: 500,
        fromPlace: 'Airport',
        toPlace: 'City Centre',
      },
      [mockCity],
      [mockScam],
      [],
      mockPhrases,
    );
    expect(result.level).toBe('high_risk');
    expect(result.nearbyScams).toHaveLength(1);
  });

  it('throws when city is not found', () => {
    expect(() =>
      checkFare(
        { city: 'nonexistent', serviceType: 'taxi', quotedFare: 100 },
        [mockCity],
        [],
        [],
        mockPhrases,
      ),
    ).toThrow(/No benchmark data/);
  });

  it('returns a whatToSay object with en, hi, as keys', () => {
    const result = checkFare(
      { city: 'testcity', serviceType: 'taxi', quotedFare: 350, distanceKm: 10 },
      [mockCity],
      [],
      [],
      mockPhrases,
    );
    expect(result.whatToSay).toHaveProperty('en');
    expect(result.whatToSay).toHaveProperty('hi');
    expect(result.whatToSay).toHaveProperty('as');
  });
});
