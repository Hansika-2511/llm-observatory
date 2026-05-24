/**
 * Ingestion Pipeline
 *
 * Receives structured log payloads, validates them with Zod,
 * writes to SQLite, and publishes to Redis for real-time consumers.
 *
 * Architecture: event-based — producers call ingest() which
 * persists + publishes. Dashboard uses SSE to consume Redis events.
 */

import { z } from "zod";
import { getDb } from "../db/index.js";
import { getRedis } from "./redis.js";

// ── Validation schema ─────────────────────────────────────────────────────────
const LogSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string(),
  message_id: z.string().nullable().optional(),
  provider: z.string(),
  model: z.string(),
  prompt_tokens: z.number().int().nullable().optional(),
  completion_tokens: z.number().int().nullable().optional(),
  total_tokens: z.number().int().nullable().optional(),
  latency_ms: z.number().int().nonnegative(),
  status: z.enum(["success", "error", "cancelled"]),
  error_code: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  finish_reason: z.string().nullable().optional(),
  is_streaming: z.number().int().min(0).max(1).default(0),
  first_token_ms: z.number().int().nullable().optional(),
  request_at: z.number().int(),
  response_at: z.number().int(),
  input_preview: z.string().nullable().optional(),
  output_preview: z.string().nullable().optional(),
});

const insertLog = (db) =>
  db.prepare(`
    INSERT INTO inference_logs (
      id, conversation_id, message_id, provider, model,
      prompt_tokens, completion_tokens, total_tokens,
      latency_ms, status, error_code, error_message, finish_reason,
      is_streaming, first_token_ms, request_at, response_at,
      input_preview, output_preview
    ) VALUES (
      @id, @conversation_id, @message_id, @provider, @model,
      @prompt_tokens, @completion_tokens, @total_tokens,
      @latency_ms, @status, @error_code, @error_message, @finish_reason,
      @is_streaming, @first_token_ms, @request_at, @response_at,
      @input_preview, @output_preview
    )
  `);

/**
 * Main ingestion entry point.
 * Called by SDK after every inference (fire-and-forget safe).
 */
export async function ingest(raw) {
  // 1. Validate
  const parsed = LogSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn("[ingestion] Invalid log payload:", parsed.error.flatten());
    return;
  }

  const log = parsed.data;

  // 2. Persist to SQLite
  try {
    const db = getDb();
    insertLog(db).run(log);
  } catch (err) {
    console.error("[ingestion] DB write failed:", err.message);
  }

  // 3. Publish event to Redis pub/sub (non-blocking)
  try {
    const redis = getRedis();
    await redis.publish("inference:logs", JSON.stringify(log));
  } catch (err) {
    // Redis unavailable — degrade gracefully, log still in SQLite
    console.warn("[ingestion] Redis publish failed (non-fatal):", err.message);
  }
}

/**
 * Expose ingestion as an HTTP endpoint so external SDKs can push logs.
 * POST /api/ingest
 */
export function ingestHandler(req, res) {
  const payload = req.body;
  ingest(payload)
    .then(() => res.status(202).json({ ok: true }))
    .catch((err) => res.status(500).json({ error: err.message }));
}
