import Database from 'better-sqlite3';
import { encodeSlug } from './slug.js';

const MAX_SLUG_ATTEMPTS = 16;

export class SlugTakenError extends Error {
  constructor(slug) {
    super(`Slug already exists: ${slug}`);
    this.name = 'SlugTakenError';
  }
}

export function openDatabase(path) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS urls (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      slug       TEXT    NOT NULL UNIQUE,
      url        TEXT    NOT NULL,
      created_at INTEGER NOT NULL,
      hits       INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT    PRIMARY KEY,
      value INTEGER NOT NULL
    );
  `);
  return new UrlStore(db);
}

class UrlStore {
  #db;
  #insert;
  #bumpCounter;
  #resolveStmt;

  constructor(db) {
    this.#db = db;
    this.#insert = db.prepare(
      'INSERT INTO urls (slug, url, created_at) VALUES (@slug, @url, @createdAt)',
    );
    this.#bumpCounter = db.prepare(`
      INSERT INTO meta (key, value) VALUES ('slug_counter', 1)
      ON CONFLICT(key) DO UPDATE SET value = value + 1
      RETURNING value
    `);
    // Single atomic statement: increments the hit counter and returns the
    // target URL in one shot — no separate SELECT/UPDATE that could race or
    // diverge on a crash.
    this.#resolveStmt = db.prepare(
      'UPDATE urls SET hits = hits + 1 WHERE slug = ? RETURNING url',
    );

    // Atomic: the slug counter and the row are committed together, so a crash
    // can never desync them and concurrent calls cannot collide.
    this.createGenerated = db.transaction((url) => {
      const createdAt = Date.now();
      for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
        const slug = encodeSlug(this.#bumpCounter.get().value);
        try {
          this.#insert.run({ slug, url, createdAt });
          return slug;
        } catch (err) {
          if (isUniqueViolation(err)) continue;
          throw err;
        }
      }
      throw new Error('Could not allocate a unique slug');
    });
  }

  createCustom(url, slug) {
    try {
      this.#insert.run({ slug, url, createdAt: Date.now() });
      return slug;
    } catch (err) {
      if (isUniqueViolation(err)) throw new SlugTakenError(slug);
      throw err;
    }
  }

  // Returns the target URL for a slug and records the visit, or undefined.
  resolve(slug) {
    const row = this.#resolveStmt.get(slug);
    return row?.url;
  }

  close() {
    this.#db.close();
  }
}

function isUniqueViolation(err) {
  return err?.code === 'SQLITE_CONSTRAINT_UNIQUE';
}
