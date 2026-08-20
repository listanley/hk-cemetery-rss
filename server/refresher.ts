// Refresh scheduler — checks both configured sources every 6 hours (as
// requested), plus refreshes on-demand via ensureFresh() before serving any
// feed/status/articles route.
//
// Two mechanisms work together and BOTH are required:
//   1. `setInterval` — fires every REFRESH_INTERVAL_MS while the process is alive.
//   2. `ensureFresh()` — called at the top of every feed/status route, refreshes
//      on-demand if data is older than the interval.
//
// Why both: published pplx.app sandboxes auto-pause when idle and only resume
// on the next incoming request. A bare setInterval timer does NOT reliably
// fire across a pause/resume cycle, so a feed could silently go stale for
// hours between requests. `ensureFresh()` guarantees that whoever hits the
// feed next always gets data no older than REFRESH_INTERVAL_MS, regardless
// of whether the timer fired while the sandbox was paused.

import { SOURCES } from "./sources";
import { scrapeSource, fetchSummary, StructuralParseError } from "./scraper";
import { storage } from "./storage";

export const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours — matches <ttl> in rss.ts

let refreshing = false;
let lastFullRefreshAt = 0;

/** Refresh a single source: scrape, upsert new/linked articles, fetch
 * summaries only for genuinely new articles, and record health status.
 * Never throws — failures are recorded, not thrown, so one broken source
 * never blocks the other. */
async function refreshOne(source: { slug: "bmcpc" | "catholic"; label: string; url: string }) {
  storage.ensureStatusRow(source.slug, source.label, source.url);
  storage.recordRunStart(source.slug);
  try {
    const items = await scrapeSource(source.slug);
    let newCount = 0;

    for (const item of items) {
      const wasNew = !storage.getArticleById(item.articleId);
      let description = "";
      if (wasNew) {
        description = await fetchSummary(item.link, source.slug);
        newCount++;
      }
      storage.upsertArticle({
        articleId: item.articleId,
        source: source.slug,
        title: item.title,
        link: item.link,
        pubDate: item.pubDateMs,
        description,
        categoryLabel: item.categoryLabel,
      });
    }

    storage.recordRunSuccess(source.slug, items.length, newCount);
    console.log(`[refresh] ${source.slug}: ok, ${items.length} items on page, ${newCount} new`);
  } catch (err) {
    const structural = err instanceof StructuralParseError;
    const message = err instanceof Error ? err.message : String(err);
    storage.recordRunFailure(source.slug, message, structural);
    console.error(`[refresh] ${source.slug}: FAILED (${structural ? "structural" : "network"}) — ${message}`);
  }
}

/** Refreshes every configured source, sequentially with a small delay
 * between requests to stay polite to the source sites. */
export async function refreshAll(): Promise<void> {
  if (refreshing) {
    console.log("[refresh] skip — a refresh is already in progress");
    return;
  }
  refreshing = true;
  try {
    for (const source of SOURCES) {
      await refreshOne(source);
      await new Promise((r) => setTimeout(r, 300)); // stay polite to the source sites
    }
    lastFullRefreshAt = Date.now();
  } finally {
    refreshing = false;
  }
}

export function getLastFullRefreshAt(): number {
  return lastFullRefreshAt;
}

export function isRefreshing(): boolean {
  return refreshing;
}

/** Ensures the data being served is never older than the refresh interval.
 * Call this at the top of every feed/status/articles route — see module
 * docstring above for why this matters on the published platform. */
export async function ensureFresh(): Promise<void> {
  if (Date.now() - lastFullRefreshAt > REFRESH_INTERVAL_MS) {
    await refreshAll();
  }
}

let intervalHandle: NodeJS.Timeout | null = null;

/** Starts the background timer (belt-and-suspenders alongside ensureFresh)
 * and kicks off an immediate first refresh. Call once from registerRoutes(). */
export function startScheduler(): void {
  refreshAll();
  if (!intervalHandle) {
    intervalHandle = setInterval(refreshAll, REFRESH_INTERVAL_MS);
  }
}
