// ─── Benchmark Types ────────────────────────────────────────────────────────

export type ServiceType = 'taxi' | 'auto' | 'shared_cab' | 'guide' | 'restaurant';
export type RiskLevel = 'fair' | 'suspicious' | 'high_risk';
export type Confidence = 'low' | 'medium' | 'high';
export type Severity = 'low' | 'medium' | 'high';

// ─── Auth Types ───────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;   // SHA-256 hex of salt+password
  salt: string;           // random hex string
  role: UserRole;
  createdAt: number;      // epoch ms
  banned?: boolean;
}

export interface Session {
  userId: string;
  token: string;          // random session token
  expiresAt: number;      // epoch ms
}

export interface SurchargeNight {
  multiplier: number;
  hours: [number, number]; // [startHour, endHour]
}
export interface SurchargeLuggage {
  flatFee: number;
  perBag: number;
}
export interface SurchargeHillRoad {
  multiplier: number;
}
export interface SurchargeAirport {
  flatFee: number;
}

export interface Surcharges {
  night?: SurchargeNight;
  hill_road?: SurchargeHillRoad;
  luggage?: SurchargeLuggage;
  airport?: SurchargeAirport;
}

export interface TypicalRoute {
  from: string;
  to: string;
  fixedFare: number;
  distanceKm: number;
  source: string;
}

export interface ServiceBenchmark {
  type: ServiceType;
  baseFare: number;
  perKmRate: number;
  unit?: string;
  source: string;
  surcharges: Surcharges;
  typicalRoutes: TypicalRoute[];
}

export interface CityBenchmark {
  id: string;
  name: string;
  state: string;
  services: ServiceBenchmark[];
}

// ─── Scam Types ──────────────────────────────────────────────────────────────

export type ScamCategory =
  | 'overcharging'
  | 'hidden_charge'
  | 'tourist_trap'
  | 'fake_service'
  | 'scam';

export type ScamSource = 'seed' | 'community';

export interface Scam {
  id: string;
  city: string;
  location: string;
  lat: number;
  lng: number;
  title: string;
  category: ScamCategory;
  description: string;
  howToAvoid: string;
  typicalLoss?: string;      // e.g. "₹200–500 extra"
  redFlags?: string[];       // short warning signs
  severity: Severity;
  serviceType: ServiceType;
  tags: string[];
  source: ScamSource;        // 'seed' = built-in, 'community' = approved by admin
  approvedAt?: number;       // epoch ms, set when admin approves
  reportId?: string;         // originating CommunityReport id
  submittedBy?: string;      // display name of submitter
}

// ─── Place Types ─────────────────────────────────────────────────────────────

export type PlaceType = 'airport' | 'station' | 'commercial' | 'tourist_spot';

export interface Place {
  id: string;
  city: string;
  name: string;
  shortName: string;
  type: PlaceType;
  lat: number;
  lng: number;
}

// ─── Community Report Types ───────────────────────────────────────────────────

export type ReportType = 'fare' | 'complaint' | 'review' | 'scam_tip';
export type ReportStatus = 'pending' | 'verified' | 'disputed';

export interface EvidencePhoto {
  dataUrl: string;   // base64 data URL stored locally
  caption?: string;
}

export interface CommunityReport {
  id: string;
  type: ReportType;
  city: string;
  serviceType: ServiceType;
  fromPlace: string;
  toPlace: string;
  routeKey: string;          // normalised "from||to"
  timestamp: number;         // epoch ms

  // Fare report fields
  quotedFare: number;
  paidFare: number;
  isOvercharged: boolean;

  // Enriched fields
  rating?: number;           // 1–5 stars (for reviews)
  complaintType?: string;    // 'rude_driver' | 'unsafe' | 'detour' | 'hidden_charge' | 'other'
  title?: string;            // short headline
  note?: string;             // free-text description
  driverDetails?: string;    // vehicle number / description
  evidence?: EvidencePhoto[];// up to 3 photos
  helpful?: number;          // upvote count
  status: ReportStatus;
}

// ─── Fare Check Input / Output ────────────────────────────────────────────────

export interface SurchargeFlags {
  isNight?: boolean;
  isHillRoad?: boolean;
  luggageCount?: number; // number of bags
  isAirport?: boolean;
}

export interface FareCheckInput {
  city: string;
  serviceType: ServiceType;
  quotedFare: number;
  fromPlace?: string;
  toPlace?: string;
  distanceKm?: number; // manual override
  surchargeFlags?: SurchargeFlags;
}

export interface FareCheckResult {
  level: RiskLevel;
  fairLow: number;
  fairHigh: number;
  quotedFare: number;
  confidence: Confidence;
  reasons: string[];
  nearbyScams: Scam[];
  whatToSay: { en: string; hi: string; as: string };
}

// ─── Phrase Template Types ────────────────────────────────────────────────────

export interface PhraseVariant {
  en: string;
  hi: string;
  as: string;
}

export interface PhraseTemplates {
  templates: {
    fair: PhraseVariant;
    suspicious: PhraseVariant;
    high_risk: PhraseVariant;
  };
}
