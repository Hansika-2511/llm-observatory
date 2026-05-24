import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH || "./observatory.db";

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    -- Conversations: top-level session container
    CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL DEFAULT 'New Conversation',
      provider    TEXT NOT NULL DEFAULT 'openai',
      model       TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled','archived')),
      created_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      metadata    TEXT  -- JSON blob for extra k/v
    );

    -- Messages: individual chat turns
    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
      content         TEXT NOT NULL,
      content_preview TEXT NOT NULL,   -- first 200 chars, pre-computed
      created_at      INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      token_count     INTEGER,
      is_redacted     INTEGER NOT NULL DEFAULT 0
    );

    -- Inference logs: one row per LLM API call
    CREATE TABLE IF NOT EXISTS inference_logs (
      id                TEXT PRIMARY KEY,
      conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      message_id        TEXT REFERENCES messages(id),
      provider          TEXT NOT NULL,
      model             TEXT NOT NULL,
      prompt_tokens     INTEGER,
      completion_tokens INTEGER,
      total_tokens      INTEGER,
      latency_ms        INTEGER NOT NULL,
      status            TEXT NOT NULL CHECK(status IN ('success','error','cancelled')),
      error_code        TEXT,
      error_message     TEXT,
      finish_reason     TEXT,
      is_streaming      INTEGER NOT NULL DEFAULT 0,
      first_token_ms    INTEGER,  -- time-to-first-token for streaming
      request_at        INTEGER NOT NULL,
      response_at       INTEGER NOT NULL,
      input_preview     TEXT,
      output_preview    TEXT
    );

    -- Indexes for common query patterns
    CREATE INDEX IF NOT EXISTS idx_messages_conv    ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_logs_conv        ON inference_logs(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_logs_provider    ON inference_logs(provider, request_at);
    CREATE INDEX IF NOT EXISTS idx_logs_status      ON inference_logs(status, request_at);
    CREATE INDEX IF NOT EXISTS idx_convs_updated    ON conversations(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_request_at  ON inference_logs(request_at DESC);
  `);
}

export default getDb;
