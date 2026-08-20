import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import type * as z from "zod/mini";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// One row per unique underlying article, keyed by a stable ID derived from
// the source ("bmcpc" or "catholic") + the article's own path/post ID.
// `categories` stores a JSON-encoded list of tag labels the article carries
// (e.g. 封路消息, 墳場通告 for the Catholic source; newstype for BMCPC).
export const articles = sqliteTable("articles", {
  articleId: text("article_id").primaryKey(), // e.g. "bmcpc:11081" or "catholic:road-closure-news:3234"
  source: text("source").notNull(), // "bmcpc" | "catholic"
  title: text("title").notNull(),
  link: text("link").notNull(),
  pubDate: integer("pub_date").notNull(), // unix ms
  description: text("description").notNull().default(""),
  categories: text("categories").notNull().default("[]"), // JSON string[]
  firstSeenAt: integer("first_seen_at").notNull(),
});

export const insertArticleSchema = createInsertSchema(articles);
export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type Article = typeof articles.$inferSelect;

// One row per configured source, tracking scrape health so failures are
// surfaced instead of silently swallowed.
export const scrapeStatus = sqliteTable("scrape_status", {
  source: text("source").primaryKey(), // "bmcpc" | "catholic"
  label: text("label").notNull(),
  sourceUrl: text("source_url").notNull(),
  lastRunAt: integer("last_run_at"),
  lastSuccessAt: integer("last_success_at"),
  lastError: text("last_error"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastItemCount: integer("last_item_count").notNull().default(0),
  newItemsLastRun: integer("new_items_last_run").notNull().default(0),
  structuralAlert: integer("structural_alert").notNull().default(0), // 0/1 boolean
});

export const insertScrapeStatusSchema = createInsertSchema(scrapeStatus);
export type InsertScrapeStatus = z.infer<typeof insertScrapeStatusSchema>;
export type ScrapeStatus = typeof scrapeStatus.$inferSelect;
