import type { Express, Request } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { storage } from "./storage";
import { SOURCES } from "./sources";
import { buildRssFeed } from "./rss";
import { ensureFresh, startScheduler, getLastFullRefreshAt, isRefreshing, REFRESH_INTERVAL_MS } from "./refresher";
import type { Article } from "@shared/schema";

// See references/pplx-app-publishing.md — never trust req.protocol/req.get("host")
// for the feed's own externally-reachable <atom:link>; that gives the internal
// sandbox hostname once proxied behind the pplx.app /port/<PORT>/ prefix.
function baseUrlFrom(req: Request): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const host = req.get("x-forwarded-host") || req.get("host");
  const proto = req.get("x-forwarded-proto") || req.protocol;
  return `${proto}://${host}`;
}

function toFeedItem(a: Article) {
  const cats: string[] = JSON.parse(a.categories || "[]");
  return {
    ...a,
    categoryLabel: cats.length ? cats.join(", ") : undefined,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  startScheduler();

  // ---- RSS feeds ----

  app.get("/feed/all.xml", async (req, res) => {
    await ensureFresh();
    const base = baseUrlFrom(req);
    const articles = storage.getArticlesBySource(null, 100).map(toFeedItem);
    const xml = buildRssFeed(
      {
        title: "香港墳場最新消息（合併）",
        link: "https://www.bmcpc.org.hk/whats_new/",
        description: "華人永遠墳場管理委員會及天主教墳場最新消息合併feed",
        selfUrl: `${base}/feed/all.xml`,
        language: "zh-hk",
        ttlMinutes: REFRESH_INTERVAL_MS / 60000,
      },
      articles,
    );
    res.set("Content-Type", "application/rss+xml; charset=utf-8");
    res.set("Cache-Control", "no-cache");
    res.send(xml);
  });

  for (const source of SOURCES) {
    app.get(`/feed/${source.slug}.xml`, async (req, res) => {
      await ensureFresh();
      const base = baseUrlFrom(req);
      const articles = storage.getArticlesBySource(source.slug, 100).map(toFeedItem);
      const xml = buildRssFeed(
        {
          title: source.label,
          link: source.url,
          description: `${source.label} — auto-generated RSS feed`,
          selfUrl: `${base}/feed/${source.slug}.xml`,
          language: source.language,
          ttlMinutes: REFRESH_INTERVAL_MS / 60000,
        },
        articles,
      );
      res.set("Content-Type", "application/rss+xml; charset=utf-8");
      res.set("Cache-Control", "no-cache");
      res.send(xml);
    });
  }

  // ---- JSON API for the dashboard, monitoring, and n8n ----

  app.get("/api/status", async (_req, res) => {
    await ensureFresh();
    res.set("Cache-Control", "no-cache");
    res.json({
      sources: storage.getAllStatus(),
      lastFullRefreshAt: getLastFullRefreshAt(),
      refreshing: isRefreshing(),
      refreshIntervalMs: REFRESH_INTERVAL_MS,
    });
  });

  app.get("/api/articles", async (req, res) => {
    await ensureFresh();
    const source = typeof req.query.source === "string" ? req.query.source : null;
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    res.set("Cache-Control", "no-cache");
    res.json(storage.getArticlesBySource(source, limit));
  });

  return httpServer;
}
