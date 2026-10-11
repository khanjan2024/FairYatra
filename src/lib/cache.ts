/**
 * Simple in-memory cache for Supabase query results.
 * Data is shared across all components for the lifetime of the page.
 * Stale-while-revalidate: return cached data instantly, refresh in background.
 */

import type { CommunityReport } from '../types';

interface Cache {
  reports:    { data: CommunityReport[]; ts: number } | null;
}

const cache: Cache = { reports: null };

const TTL_MS = 30_000; // 30 seconds before background refresh

export function getCachedReports(): CommunityReport[] | null {
  if (!cache.reports) return null;
  return cache.reports.data;
}

export function setCachedReports(data: CommunityReport[]): void {
  cache.reports = { data, ts: Date.now() };
}

export function isCacheStale(): boolean {
  if (!cache.reports) return true;
  return Date.now() - cache.reports.ts > TTL_MS;
}

export function invalidateReports(): void {
  cache.reports = null;
}
