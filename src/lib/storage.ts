/**
 * storage.ts — all data operations via Supabase.
 * Replaces the localStorage implementation.
 */

import { supabase } from './supabase';
import { getCachedReports, setCachedReports, isCacheStale, invalidateReports } from './cache';
import type {
  CommunityReport, ServiceType, ReportType, Scam, ScamCategory,
} from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toReport(row: Record<string, unknown>): CommunityReport {
  return {
    id:            row.id             as string,
    type:          row.type           as ReportType,
    city:          row.city           as string,
    serviceType:   row.service_type   as ServiceType,
    fromPlace:     row.from_place     as string,
    toPlace:       row.to_place       as string,
    routeKey:      row.route_key      as string,
    quotedFare:    Number(row.quoted_fare),
    paidFare:      Number(row.paid_fare),
    isOvercharged: row.is_overcharged as boolean,
    rating:        row.rating         as number | undefined,
    complaintType: row.complaint_type as string | undefined,
    title:         row.title          as string | undefined,
    note:          row.note           as string | undefined,
    driverDetails: row.driver_details as string | undefined,
    evidence:      row.evidence       as CommunityReport['evidence'],
    helpful:       Number(row.helpful ?? 0),
    status:        row.status         as CommunityReport['status'],
    timestamp:     new Date(row.created_at as string).getTime(),
  };
}

function toScam(row: Record<string, unknown>): Scam {
  return {
    id:          row.id           as string,
    city:        row.city         as string,
    location:    row.location     as string,
    lat:         Number(row.lat),
    lng:         Number(row.lng),
    title:       row.title        as string,
    category:    row.category     as ScamCategory,
    description: row.description  as string,
    howToAvoid:  row.how_to_avoid as string,
    typicalLoss: row.typical_loss as string | undefined,
    redFlags:    (row.red_flags   as string[] | undefined),
    severity:    row.severity     as Scam['severity'],
    serviceType: row.service_type as ServiceType,
    tags:        (row.tags        as string[]) ?? [],
    source:      'community',
    approvedAt:  new Date(row.approved_at as string).getTime(),
    reportId:    row.report_id    as string | undefined,
    submittedBy: row.submitted_by as string | undefined,
  };
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function loadReports(): Promise<CommunityReport[]> {
  // Return cached data immediately if available
  const cached = getCachedReports();
  if (cached && !isCacheStale()) return cached;

  // Fetch fresh data (in background if cache exists)
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('loadReports:', error);
    return cached ?? []; // fall back to stale cache on error
  }
  const reports = (data ?? []).map(toReport);
  setCachedReports(reports);
  return reports;
}

export async function saveReport(
  report: Omit<CommunityReport, 'id' | 'timestamp' | 'routeKey' | 'helpful' | 'status'>,
): Promise<CommunityReport> {
  const { data: { user } } = await supabase.auth.getUser();
  const id = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const routeKey = [report.fromPlace, report.toPlace]
    .map((s) => s.trim().toLowerCase()).join('||');

  const row = {
    id,
    user_id:        user?.id ?? null,
    type:           report.type,
    city:           report.city,
    service_type:   report.serviceType,
    from_place:     report.fromPlace,
    to_place:       report.toPlace,
    route_key:      routeKey,
    quoted_fare:    report.quotedFare,
    paid_fare:      report.paidFare,
    is_overcharged: report.isOvercharged,
    rating:         report.rating ?? null,
    complaint_type: report.complaintType ?? null,
    title:          report.title ?? null,
    note:           report.note ?? null,
    driver_details: report.driverDetails ?? null,
    evidence:       report.evidence ?? null,
    helpful:        0,
    status:         'pending',
  };

  const { data, error } = await supabase.from('reports').insert(row).select().single();
  if (error) throw new Error(error.message);
  invalidateReports(); // bust cache so next load fetches fresh
  return toReport(data);
}

export async function deleteReport(id: string): Promise<void> {
  await supabase.from('reports').delete().eq('id', id);
  invalidateReports();
}

export async function updateReportStatus(
  id: string,
  status: CommunityReport['status'],
): Promise<void> {
  await supabase.from('reports').update({ status }).eq('id', id);
}

// ─── Helpful votes ────────────────────────────────────────────────────────────

export async function markHelpful(reportId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  // Insert vote — fails if already voted (PK constraint)
  const { error: voteErr } = await supabase
    .from('helpful_votes')
    .insert({ report_id: reportId, user_id: user.id });
  if (voteErr) return false; // already voted

  // Atomic increment via SQL function
  await supabase.rpc('increment_helpful', { report_id: reportId });
  return true;
}

export async function hasVoted(reportId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('helpful_votes')
    .select('report_id')
    .eq('report_id', reportId)
    .eq('user_id', user.id)
    .maybeSingle();
  return !!data;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getReportsForRoute(
  city: string,
  serviceType: ServiceType,
  fromPlace: string,
  toPlace: string,
): Promise<CommunityReport[]> {
  const routeKey = [fromPlace, toPlace].map((s) => s.trim().toLowerCase()).join('||');
  const { data } = await supabase.from('reports')
    .select('*')
    .eq('city', city)
    .eq('service_type', serviceType)
    .eq('route_key', routeKey);
  return (data ?? []).map(toReport);
}

export async function getRecentReports(limit = 50): Promise<CommunityReport[]> {
  const { data } = await supabase.from('reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map(toReport);
}

export async function getReportsByType(type: ReportType): Promise<CommunityReport[]> {
  const { data } = await supabase.from('reports')
    .select('*')
    .eq('type', type)
    .order('created_at', { ascending: false });
  return (data ?? []).map(toReport);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface ReportStats {
  total: number;
  overchargedCount: number;
  overchargedPct: number;
  avgOverpayPct: number;
  topCity: string;
}

export async function getStats(): Promise<ReportStats> {
  const { data } = await supabase.from('reports').select('city,is_overcharged,quoted_fare,paid_fare');
  const all = data ?? [];
  if (all.length === 0)
    return { total: 0, overchargedCount: 0, overchargedPct: 0, avgOverpayPct: 0, topCity: '—' };
  const overcharged = all.filter((r) => r.is_overcharged);
  const overpayPcts = all
    .filter((r) => Number(r.paid_fare) > 0 && Number(r.quoted_fare) > 0)
    .map((r) => ((Number(r.quoted_fare) - Number(r.paid_fare)) / Number(r.paid_fare)) * 100);
  const cityCount: Record<string, number> = {};
  all.forEach((r) => { cityCount[r.city] = (cityCount[r.city] ?? 0) + 1; });
  const topCity = Object.entries(cityCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  return {
    total:            all.length,
    overchargedCount: overcharged.length,
    overchargedPct:   Math.round((overcharged.length / all.length) * 100),
    avgOverpayPct:    overpayPcts.length
      ? Math.round(overpayPcts.reduce((a, b) => a + b, 0) / overpayPcts.length) : 0,
    topCity,
  };
}

// ─── Community Scams ──────────────────────────────────────────────────────────

export async function loadCommunityScams(): Promise<Scam[]> {
  const { data, error } = await supabase.from('community_scams').select('*');
  if (error) return [];
  return (data ?? []).map(toScam);
}

export async function approveScamTip(
  report: CommunityReport,
  opts: {
    severity: Scam['severity'];
    category: ScamCategory;
    howToAvoid: string;
    typicalLoss?: string;
    redFlags?: string[];
    submittedBy?: string;
  },
): Promise<Scam> {
  const id = `cscam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const row = {
    id,
    city:          report.city,
    location:      report.fromPlace || report.toPlace || report.city,
    lat:           0,
    lng:           0,
    title:         report.title ?? 'Community reported scam',
    category:      opts.category,
    description:   report.note ?? '',
    how_to_avoid:  opts.howToAvoid,
    typical_loss:  opts.typicalLoss ?? null,
    red_flags:     opts.redFlags ?? null,
    severity:      opts.severity,
    service_type:  report.serviceType,
    tags:          ['community', report.city, report.serviceType],
    report_id:     report.id,
    submitted_by:  opts.submittedBy ?? null,
  };
  const { data, error } = await supabase.from('community_scams').insert(row).select().single();
  if (error) throw new Error(error.message);

  // Mark originating report as verified
  await updateReportStatus(report.id, 'verified');

  return toScam(data);
}

export async function removeCommunityScam(scamId: string): Promise<void> {
  await supabase.from('community_scams').delete().eq('id', scamId);
}

export async function isAlreadyApproved(reportId: string): Promise<boolean> {
  const { data } = await supabase.from('community_scams')
    .select('id').eq('report_id', reportId).maybeSingle();
  return !!data;
}
