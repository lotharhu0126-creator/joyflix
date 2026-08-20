/* eslint-disable @typescript-eslint/no-explicit-any */

import { AdminConfig } from './admin.types';
import { hashPassword, verifyPassword } from './password';
import { Favorite, IStorage, PlayRecord, SkipConfig } from './types';

const SEARCH_HISTORY_LIMIT = 20;

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...parameters: any[]): any;
    all(...parameters: any[]): any[];
    run(...parameters: any[]): void;
  };
  close(): void;
};

function getDatabasePath(): string {
  const nodeRequire = eval('require') as NodeRequire;
  const path = nodeRequire('node:path') as typeof import('node:path');
  const fs = nodeRequire('node:fs') as typeof import('node:fs');
  const databasePath =
    process.env.JOYFLIX_DB_PATH ||
    path.join(process.cwd(), 'data', 'joyflix.sqlite');

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  return databasePath;
}

function openDatabase(): SqliteDatabase {
  const nodeRequire = eval('require') as NodeRequire;
  const { DatabaseSync } = nodeRequire('node:sqlite') as {
    DatabaseSync: new (path: string) => SqliteDatabase;
  };
  return new DatabaseSync(getDatabasePath());
}

export class SqliteStorage implements IStorage {
  private database: SqliteDatabase;

  constructor() {
    this.database = openDatabase();
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS play_records (
        username TEXT NOT NULL,
        record_key TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (username, record_key)
      );
      CREATE TABLE IF NOT EXISTS favorites (
        username TEXT NOT NULL,
        favorite_key TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (username, favorite_key)
      );
      CREATE TABLE IF NOT EXISTS search_history (
        username TEXT NOT NULL,
        keyword TEXT NOT NULL,
        used_at INTEGER NOT NULL,
        PRIMARY KEY (username, keyword)
      );
      CREATE TABLE IF NOT EXISTS skip_configs (
        username TEXT NOT NULL,
        config_key TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (username, config_key)
      );
      CREATE TABLE IF NOT EXISTS app_config (
        config_key TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
    `);
  }

  async getPlayRecord(
    userName: string,
    key: string
  ): Promise<PlayRecord | null> {
    const row = this.database
      .prepare(
        'SELECT data FROM play_records WHERE username = ? AND record_key = ?'
      )
      .get(userName, key) as { data?: string } | undefined;
    return row?.data ? (JSON.parse(row.data) as PlayRecord) : null;
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO play_records (username, record_key, data)
         VALUES (?, ?, ?)
         ON CONFLICT(username, record_key) DO UPDATE SET data = excluded.data`
      )
      .run(userName, key, JSON.stringify(record));
  }

  async getAllPlayRecords(
    userName: string
  ): Promise<Record<string, PlayRecord>> {
    const rows = this.database
      .prepare('SELECT record_key, data FROM play_records WHERE username = ?')
      .all(userName) as Array<{ record_key: string; data: string }>;
    return Object.fromEntries(
      rows.map((row) => [row.record_key, JSON.parse(row.data) as PlayRecord])
    );
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    this.database
      .prepare('DELETE FROM play_records WHERE username = ? AND record_key = ?')
      .run(userName, key);
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const row = this.database
      .prepare(
        'SELECT data FROM favorites WHERE username = ? AND favorite_key = ?'
      )
      .get(userName, key) as { data?: string } | undefined;
    return row?.data ? (JSON.parse(row.data) as Favorite) : null;
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite
  ): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO favorites (username, favorite_key, data)
         VALUES (?, ?, ?)
         ON CONFLICT(username, favorite_key) DO UPDATE SET data = excluded.data`
      )
      .run(userName, key, JSON.stringify(favorite));
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    const rows = this.database
      .prepare('SELECT favorite_key, data FROM favorites WHERE username = ?')
      .all(userName) as Array<{ favorite_key: string; data: string }>;
    return Object.fromEntries(
      rows.map((row) => [row.favorite_key, JSON.parse(row.data) as Favorite])
    );
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    this.database
      .prepare('DELETE FROM favorites WHERE username = ? AND favorite_key = ?')
      .run(userName, key);
  }

  async registerUser(userName: string, password: string): Promise<void> {
    this.database
      .prepare(
        'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)'
      )
      .run(userName, await hashPassword(password), Date.now());
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const row = this.database
      .prepare('SELECT password_hash FROM users WHERE username = ?')
      .get(userName) as { password_hash?: string } | undefined;
    return row?.password_hash
      ? verifyPassword(password, row.password_hash)
      : false;
  }

  async checkUserExist(userName: string): Promise<boolean> {
    return Boolean(
      this.database
        .prepare('SELECT 1 FROM users WHERE username = ?')
        .get(userName)
    );
  }

  async changePassword(userName: string, newPassword: string): Promise<void> {
    this.database
      .prepare('UPDATE users SET password_hash = ? WHERE username = ?')
      .run(await hashPassword(newPassword), userName);
  }

  async deleteUser(userName: string): Promise<void> {
    this.database.exec('BEGIN');
    try {
      for (const table of [
        'play_records',
        'favorites',
        'search_history',
        'skip_configs',
        'users',
      ]) {
        this.database
          .prepare(`DELETE FROM ${table} WHERE username = ?`)
          .run(userName);
      }
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    const rows = this.database
      .prepare(
        'SELECT keyword FROM search_history WHERE username = ? ORDER BY used_at DESC'
      )
      .all(userName) as Array<{ keyword: string }>;
    return rows.map((row) => row.keyword);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    this.database
      .prepare('DELETE FROM search_history WHERE username = ? AND keyword = ?')
      .run(userName, keyword);
    this.database
      .prepare(
        'INSERT INTO search_history (username, keyword, used_at) VALUES (?, ?, ?)'
      )
      .run(userName, keyword, Date.now());

    const staleRows = this.database
      .prepare(
        'SELECT keyword FROM search_history WHERE username = ? ORDER BY used_at DESC LIMIT -1 OFFSET ?'
      )
      .all(userName, SEARCH_HISTORY_LIMIT) as Array<{ keyword: string }>;
    for (const row of staleRows) {
      this.database
        .prepare(
          'DELETE FROM search_history WHERE username = ? AND keyword = ?'
        )
        .run(userName, row.keyword);
    }
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    if (keyword) {
      this.database
        .prepare(
          'DELETE FROM search_history WHERE username = ? AND keyword = ?'
        )
        .run(userName, keyword);
      return;
    }
    this.database
      .prepare('DELETE FROM search_history WHERE username = ?')
      .run(userName);
  }

  async getAllUsers(): Promise<string[]> {
    const rows = this.database
      .prepare('SELECT username FROM users ORDER BY username')
      .all() as Array<{ username: string }>;
    return rows.map((row) => row.username);
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    const row = this.database
      .prepare("SELECT data FROM app_config WHERE config_key = 'admin'")
      .get() as { data?: string } | undefined;
    return row?.data ? (JSON.parse(row.data) as AdminConfig) : null;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO app_config (config_key, data) VALUES ('admin', ?)
         ON CONFLICT(config_key) DO UPDATE SET data = excluded.data`
      )
      .run(JSON.stringify(config));
  }

  async getSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<SkipConfig | null> {
    const row = this.database
      .prepare(
        'SELECT data FROM skip_configs WHERE username = ? AND config_key = ?'
      )
      .get(userName, `${source}+${id}`) as { data?: string } | undefined;
    return row?.data ? (JSON.parse(row.data) as SkipConfig) : null;
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: SkipConfig
  ): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO skip_configs (username, config_key, data)
         VALUES (?, ?, ?)
         ON CONFLICT(username, config_key) DO UPDATE SET data = excluded.data`
      )
      .run(userName, `${source}+${id}`, JSON.stringify(config));
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    this.database
      .prepare('DELETE FROM skip_configs WHERE username = ? AND config_key = ?')
      .run(userName, `${source}+${id}`);
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<Record<string, SkipConfig>> {
    const rows = this.database
      .prepare('SELECT config_key, data FROM skip_configs WHERE username = ?')
      .all(userName) as Array<{ config_key: string; data: string }>;
    return Object.fromEntries(
      rows.map((row) => [row.config_key, JSON.parse(row.data) as SkipConfig])
    );
  }
}
