import { users, articles, scrapeStatus } from '@shared/schema';
import type { User, InsertUser, Article, ScrapeStatus } from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Ensure tables exist (simple bootstrap, no migration framework needed here).
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS articles (
    article_id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    link TEXT NOT NULL,
    pub_date INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    categories TEXT NOT NULL DEFAULT '[]',
    first_seen_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scrape_status (
    source TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    source_url TEXT NOT NULL,
    last_run_at INTEGER,
    last_success_at INTEGER,
    last_error TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_item_count INTEGER NOT NULL DEFAULT 0,
    new_items_last_run INTEGER NOT NULL DEFAULT 0,
    structural_alert INTEGER NOT NULL DEFAULT 0
  );
`);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return db.insert(users).values(insertUser).returning().get();
  }

  // ---- Articles ----

  getArticleById(articleId: string): Article | undefined {
    return db.select().from(articles).where(eq(articles.articleId, articleId)).get();
  }

  /** Insert a new article, or if it already exists, append this tag/category
   * label without duplicating the row. */
  upsertArticle(a: {
    articleId: string;
    source: string;
    title: string;
    link: string;
    pubDate: number;
    description: string;
    categoryLabel?: string;
  }): "inserted" | "linked" | "unchanged" {
    const existing = this.getArticleById(a.articleId);
    if (!existing) {
      db.insert(articles)
        .values({
          articleId: a.articleId,
          source: a.source,
          title: a.title,
          link: a.link,
          pubDate: a.pubDate,
          description: a.description,
          categories: JSON.stringify(a.categoryLabel ? [a.categoryLabel] : []),
          firstSeenAt: Date.now(),
        })
        .run();
      return "inserted";
    }
    if (a.categoryLabel) {
      const cats: string[] = JSON.parse(existing.categories || "[]");
      if (!cats.includes(a.categoryLabel)) {
        cats.push(a.categoryLabel);
        db.update(articles)
          .set({ categories: JSON.stringify(cats) })
          .where(eq(articles.articleId, a.articleId))
          .run();
        return "linked";
      }
    }
    return "unchanged";
  }

  getArticlesBySource(source: string | null, limit = 50): Article[] {
    const q = db.select().from(articles).orderBy(desc(articles.pubDate)).limit(limit);
    const all = q.all();
    if (!source) return all;
    return all.filter((a) => a.source === source);
  }

  // ---- Scrape status ----

  getStatus(source: string): ScrapeStatus | undefined {
    return db.select().from(scrapeStatus).where(eq(scrapeStatus.source, source)).get();
  }

  getAllStatus(): ScrapeStatus[] {
    return db.select().from(scrapeStatus).all();
  }

  ensureStatusRow(source: string, label: string, sourceUrl: string): void {
    const existing = this.getStatus(source);
    if (!existing) {
      db.insert(scrapeStatus).values({ source, label, sourceUrl }).run();
    }
  }

  recordRunStart(source: string): void {
    db.update(scrapeStatus).set({ lastRunAt: Date.now() }).where(eq(scrapeStatus.source, source)).run();
  }

  recordRunSuccess(source: string, itemCount: number, newCount: number): void {
    db.update(scrapeStatus)
      .set({
        lastSuccessAt: Date.now(),
        consecutiveFailures: 0,
        lastItemCount: itemCount,
        newItemsLastRun: newCount,
        lastError: null,
        structuralAlert: 0,
      })
      .where(eq(scrapeStatus.source, source))
      .run();
  }

  recordRunFailure(source: string, errorMessage: string, structural: boolean): void {
    const current = this.getStatus(source);
    const failures = (current?.consecutiveFailures || 0) + 1;
    db.update(scrapeStatus)
      .set({
        lastError: errorMessage,
        consecutiveFailures: failures,
        structuralAlert: structural ? 1 : current?.structuralAlert || 0,
      })
      .where(eq(scrapeStatus.source, source))
      .run();
  }
}

export const storage = new DatabaseStorage();
