import { Router } from "express";
import { getDb } from "../db/index.js";

const router = Router();

// GET /api/analytics/overview — key metrics for dashboard
router.get("/overview", (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  const fromMs = from ? Number(from) : Date.now() - 24 * 60 * 60 * 1000;
  const toMs = to ? Number(to) : Date.now();

  const overview = db
    .prepare(
      `SELECT
        COUNT(*)                                                    AS total_requests,
        COUNT(CASE WHEN status='success' THEN 1 END)               AS successful,
        COUNT(CASE WHEN status='error' THEN 1 END)                 AS errors,
        COUNT(CASE WHEN status='cancelled' THEN 1 END)             AS cancelled,
        ROUND(AVG(latency_ms), 1)                                   AS avg_latency_ms,
        ROUND(AVG(CASE WHEN status='success' THEN latency_ms END), 1) AS avg_success_latency_ms,
        MIN(CASE WHEN status='success' THEN latency_ms END)         AS min_latency_ms,
        MAX(CASE WHEN status='success' THEN latency_ms END)         AS max_latency_ms,
        SUM(total_tokens)                                           AS total_tokens,
        SUM(prompt_tokens)                                          AS total_prompt_tokens,
        SUM(completion_tokens)                                      AS total_completion_tokens,
        COUNT(CASE WHEN is_streaming=1 THEN 1 END)                  AS streaming_requests,
        ROUND(AVG(CASE WHEN is_streaming=1 THEN first_token_ms END), 1) AS avg_ttft_ms
       FROM inference_logs
       WHERE request_at BETWEEN ? AND ?`
    )
    .get(fromMs, toMs);

  const convStats = db
    .prepare(
      `SELECT
        COUNT(*) AS total_conversations,
        COUNT(CASE WHEN status='active' THEN 1 END) AS active_conversations,
        COUNT(CASE WHEN status='cancelled' THEN 1 END) AS cancelled_conversations
       FROM conversations`
    )
    .get();

  res.json({ ...overview, ...convStats, from: fromMs, to: toMs });
});

// GET /api/analytics/latency — latency over time (bucketed)
router.get("/latency", (req, res) => {
  const db = getDb();
  const { from, to, bucket = "hour", provider } = req.query;
  const fromMs = from ? Number(from) : Date.now() - 24 * 60 * 60 * 1000;
  const toMs = to ? Number(to) : Date.now();

  // SQLite bucket by epoch seconds
  const bucketSec = bucket === "minute" ? 60 : bucket === "day" ? 86400 : 3600;
  const providerFilter = provider ? "AND provider = ?" : "";
  const params = provider ? [fromMs, toMs, bucketSec * 1000, provider] : [fromMs, toMs, bucketSec * 1000];

  const rows = db
    .prepare(
      `SELECT
        (request_at / ?) * ? AS bucket_ts,
        provider,
        model,
        ROUND(AVG(latency_ms), 1)   AS avg_latency_ms,
        ROUND(AVG(CASE WHEN is_streaming=1 THEN first_token_ms END), 1) AS avg_ttft_ms,
        MIN(latency_ms)              AS min_latency_ms,
        MAX(latency_ms)              AS max_latency_ms,
        COUNT(*)                     AS request_count
       FROM inference_logs
       WHERE request_at BETWEEN ? AND ? ${providerFilter}
       GROUP BY bucket_ts, provider, model
       ORDER BY bucket_ts ASC`
    )
    // SQLite doesn't support named params mixed with positional easily here
    .all(bucketSec * 1000, bucketSec * 1000, fromMs, toMs, ...(provider ? [provider] : []));

  res.json(rows);
});

// GET /api/analytics/throughput — requests per bucket
router.get("/throughput", (req, res) => {
  const db = getDb();
  const { from, to, bucket = "hour" } = req.query;
  const fromMs = from ? Number(from) : Date.now() - 24 * 60 * 60 * 1000;
  const toMs = to ? Number(to) : Date.now();
  const bucketMs = bucket === "minute" ? 60000 : bucket === "day" ? 86400000 : 3600000;

  const rows = db
    .prepare(
      `SELECT
        (request_at / ?) * ? AS bucket_ts,
        provider,
        COUNT(*)              AS request_count,
        COUNT(CASE WHEN status='success' THEN 1 END) AS success_count,
        COUNT(CASE WHEN status='error' THEN 1 END)   AS error_count,
        SUM(total_tokens)     AS total_tokens
       FROM inference_logs
       WHERE request_at BETWEEN ? AND ?
       GROUP BY bucket_ts, provider
       ORDER BY bucket_ts ASC`
    )
    .all(bucketMs, bucketMs, fromMs, toMs);

  res.json(rows);
});

// GET /api/analytics/errors — error breakdown
router.get("/errors", (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  const fromMs = from ? Number(from) : Date.now() - 24 * 60 * 60 * 1000;
  const toMs = to ? Number(to) : Date.now();

  const rows = db
    .prepare(
      `SELECT
        error_code,
        provider,
        model,
        COUNT(*)        AS count,
        MAX(request_at) AS last_seen
       FROM inference_logs
       WHERE status = 'error' AND request_at BETWEEN ? AND ?
       GROUP BY error_code, provider, model
       ORDER BY count DESC`
    )
    .all(fromMs, toMs);

  res.json(rows);
});

// GET /api/analytics/providers — per-provider breakdown
router.get("/providers", (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  const fromMs = from ? Number(from) : Date.now() - 24 * 60 * 60 * 1000;
  const toMs = to ? Number(to) : Date.now();

  const rows = db
    .prepare(
      `SELECT
        provider,
        model,
        COUNT(*)                             AS total,
        COUNT(CASE WHEN status='success' THEN 1 END) AS success,
        COUNT(CASE WHEN status='error' THEN 1 END)   AS errors,
        ROUND(AVG(latency_ms), 1)            AS avg_latency_ms,
        SUM(total_tokens)                    AS total_tokens,
        ROUND(AVG(total_tokens), 1)          AS avg_tokens_per_req
       FROM inference_logs
       WHERE request_at BETWEEN ? AND ?
       GROUP BY provider, model
       ORDER BY total DESC`
    )
    .all(fromMs, toMs);

  res.json(rows);
});

// GET /api/analytics/logs — raw log feed, paginated
router.get("/logs", (req, res) => {
  const db = getDb();
  const { limit = 50, offset = 0, provider, status } = req.query;
  const filters = [];
  const params = [];
  if (provider) { filters.push("provider = ?"); params.push(provider); }
  if (status) { filters.push("status = ?"); params.push(status); }
  const where = filters.length ? "WHERE " + filters.join(" AND ") : "";

  const rows = db
    .prepare(`SELECT * FROM inference_logs ${where} ORDER BY request_at DESC LIMIT ? OFFSET ?`)
    .all(...params, Number(limit), Number(offset));

  const total = db.prepare(`SELECT COUNT(*) AS n FROM inference_logs ${where}`).get(...params).n;

  res.json({ rows, total, limit: Number(limit), offset: Number(offset) });
});

export default router;
