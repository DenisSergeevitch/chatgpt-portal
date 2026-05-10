import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { PageSnapshot, SearchResult } from "./types.js";

export class SnapshotStore {
  private readonly db: Database.Database;
  private readonly ftsReady: boolean;

  constructor(databasePath: string) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        text TEXT NOT NULL,
        headings TEXT NOT NULL,
        links TEXT NOT NULL
      );
    `);

    this.ftsReady = this.createFts();
  }

  upsert(snapshot: PageSnapshot): void {
    const row = this.db
      .prepare(
        `
          INSERT INTO snapshots (url, title, captured_at, text, headings, links)
          VALUES (@url, @title, @capturedAt, @visibleText, @headings, @links)
          ON CONFLICT(url) DO UPDATE SET
            title = excluded.title,
            captured_at = excluded.captured_at,
            text = excluded.text,
            headings = excluded.headings,
            links = excluded.links
          RETURNING id
        `
      )
      .get({
        url: snapshot.url,
        title: snapshot.title,
        capturedAt: snapshot.capturedAt,
        visibleText: snapshot.visibleText,
        headings: JSON.stringify(snapshot.headings),
        links: JSON.stringify(snapshot.links),
      }) as { id: number };

    if (this.ftsReady) {
      this.db
        .prepare(
          `
            INSERT OR REPLACE INTO snapshots_fts (rowid, url, title, headings, text)
            VALUES (?, ?, ?, ?, ?)
          `
        )
        .run(row.id, snapshot.url, snapshot.title, snapshot.headings.join("\n"), snapshot.visibleText);
    }
  }

  search(query: string, limit: number): SearchResult[] {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    if (this.ftsReady) {
      try {
        return this.db
          .prepare(
            `
              SELECT
                s.url,
                s.title,
                s.captured_at AS capturedAt,
                snippet(snapshots_fts, 4, X'01', X'02', '...', 32) AS snippet
              FROM snapshots_fts
              JOIN snapshots s ON s.id = snapshots_fts.rowid
              WHERE snapshots_fts MATCH ?
              ORDER BY rank
              LIMIT ?
            `
          )
          .all(toFtsQuery(trimmed), limit) as SearchResult[];
      } catch (error) {
        return this.likeSearch(trimmed, limit);
      }
    }

    return this.likeSearch(trimmed, limit);
  }

  private likeSearch(query: string, limit: number): SearchResult[] {
    const like = `%${query}%`;
    return this.db
      .prepare(
        `
          SELECT url, title, captured_at AS capturedAt, substr(text, 1, 420) AS snippet
          FROM snapshots
          WHERE title LIKE ? OR text LIKE ? OR headings LIKE ? OR url LIKE ?
          ORDER BY captured_at DESC
          LIMIT ?
        `
      )
      .all(like, like, like, like, limit) as SearchResult[];
  }

  private createFts(): boolean {
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS snapshots_fts
        USING fts5(url, title, headings, text);
      `);
      return true;
    } catch (error) {
      return false;
    }
  }
}

function toFtsQuery(query: string): string {
  const tokens = query
    .split(/\s+/)
    .map((token) => token.replace(/"/g, '""').trim())
    .filter(Boolean)
    .slice(0, 12);

  if (!tokens.length) {
    return '""';
  }

  return tokens.map((token) => `"${token}"`).join(" AND ");
}
