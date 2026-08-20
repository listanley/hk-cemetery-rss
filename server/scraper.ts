import * as cheerio from "cheerio";
import { SOURCES } from "./sources";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export class StructuralParseError extends Error {}

export interface ScrapedItem {
  articleId: string; // stable dedup key, e.g. "bmcpc:11081"
  title: string;
  link: string;
  pubDateMs: number;
  categoryLabel?: string;
}

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

// HK is always UTC+8, no DST — safe to hardcode the offset for date-only
// timestamps published on these two sites.
function hkDateToMs(dateStr: string): number {
  const t = new Date(`${dateStr}T00:00:00+08:00`).getTime();
  return Number.isNaN(t) ? Date.now() : t;
}

const BMCPC_NEWSTYPE_LABELS: Record<string, string> = {
  placingnews: "配售消息",
  cemeterynews: "墳場消息",
  othernews: "其他事項",
  tendernews: "招標公告",
};

/** BMCPC (華人永遠墳場管理委員會) "whats_new" page — WordPress/Elementor loop-grid.
 * Each article is a `div[data-elementor-type="loop-item"]` whose class list
 * carries `post-<id>` (stable dedup key) and `newstype-<code>` (category).
 * The same post can legitimately appear in more than one loop-grid section
 * on the page (e.g. both "cemeterynews" and "othernews") — duplicates by
 * post id are expected and merged at storage time, not filtered here. */
export async function scrapeBmcpc(): Promise<ScrapedItem[]> {
  const source = SOURCES.find((s) => s.slug === "bmcpc")!;
  const html = await withRetry(() => fetchWithTimeout(source.url));
  const $ = cheerio.load(html);
  const items: ScrapedItem[] = [];

  $('div[data-elementor-type="loop-item"]').each((_, el) => {
    const classAttr = $(el).attr("class") || "";
    const idMatch = classAttr.match(/\bpost-(\d+)\b/);
    if (!idMatch) return;
    const postId = idMatch[1];
    const typeMatch = classAttr.match(/\bnewstype-([a-z]+)\b/);
    const categoryLabel = typeMatch ? BMCPC_NEWSTYPE_LABELS[typeMatch[1]] || typeMatch[1] : undefined;

    const anchor = $(el).find("h1.elementor-heading-title a, .elementor-widget-theme-post-title a").first();
    const title = anchor.text().trim();
    const link = anchor.attr("href") || "";
    const dateText = $(el).find("time").first().text().trim(); // "YYYY-MM-DD"
    if (!title || !link || !dateText) return;

    items.push({
      articleId: `bmcpc:${postId}`,
      title,
      link,
      pubDateMs: hkDateToMs(dateText),
      categoryLabel,
    });
  });

  if (items.length === 0) {
    throw new StructuralParseError(
      "No items matched selectors on bmcpc.org.hk/whats_new/ — page markup may have changed",
    );
  }
  return items;
}

const CATHOLIC_TAG_TO_LABEL: Record<string, string> = {
  "road-closure-news": "封路消息",
  "cemetery-notice": "墳場通告",
  "other-news": "其他事項",
};

/** Catholic Diocese cemeteries "news" listing page — custom CMS, plain
 * `<li><a href="/news/<category-slug>/<id>">` items. The category slug +
 * numeric id form a stable dedup key. This site posts rarely (the full
 * history is a handful of items going back years), so the single listing
 * page already covers everything — no pagination handling needed. */
export async function scrapeCatholic(): Promise<ScrapedItem[]> {
  const source = SOURCES.find((s) => s.slug === "catholic")!;
  const html = await withRetry(() => fetchWithTimeout(source.url));
  const $ = cheerio.load(html);
  const items: ScrapedItem[] = [];

  $('div.news ul li a[href^="/news/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/^\/news\/([a-z0-9-]+)\/(\d+)$/);
    if (!m) return;
    const [, categorySlug, id] = m;
    const title = $(el).find("p.title").first().text().trim();
    const dateText = $(el).find("span.date").first().text().trim().replace(/\./g, "-"); // "2026.08.01" -> "2026-08-01"
    if (!title || !dateText) return;

    items.push({
      articleId: `catholic:${categorySlug}:${id}`,
      title,
      link: source.baseUrl + href,
      pubDateMs: hkDateToMs(dateText),
      categoryLabel: CATHOLIC_TAG_TO_LABEL[categorySlug] || categorySlug,
    });
  });

  if (items.length === 0) {
    throw new StructuralParseError(
      "No items matched selectors on cemeteries.catholic.org.hk/news — page markup may have changed",
    );
  }
  return items;
}

export async function scrapeSource(slug: "bmcpc" | "catholic"): Promise<ScrapedItem[]> {
  return slug === "bmcpc" ? scrapeBmcpc() : scrapeCatholic();
}

/** Best-effort article-body summary. Only implemented for the Catholic
 * source, whose article pages consistently render body text in
 * `div.article p`. BMCPC's article pages are individually page-built in
 * Elementor with no consistent body container, so a generic extraction
 * there would be unreliable — those items fall back to title-only
 * descriptions (see server/refresher.ts). Never throws; a failed summary
 * fetch should never break the item. */
export async function fetchSummary(articleUrl: string, source: "bmcpc" | "catholic"): Promise<string> {
  if (source !== "catholic") return "";
  try {
    const html = await withRetry(() => fetchWithTimeout(articleUrl), 2);
    const $ = cheerio.load(html);
    const raw = $("div.article p").first().text() || "";
    const collapsed = raw.replace(/\s+/g, " ").trim();
    return collapsed.length > 400 ? collapsed.slice(0, 400) + "…" : collapsed;
  } catch {
    return "";
  }
}
