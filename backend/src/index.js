import "dotenv/config";
import express from "express";
import cors from "cors";

import { getDb } from "./db/index.js";
import conversationsRouter from "./routes/conversations.js";
import chatRouter from "./routes/chat.js";
import analyticsRouter from "./routes/analytics.js";
import eventsRouter from "./routes/events.js";
import ingestRouter from "./routes/ingest.js";
import { listProviders } from "./services/providers.js";

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));

// Request logger (lightweight)
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  const db = getDb();
  const stats = db.prepare("SELECT COUNT(*) AS logs FROM inference_logs").get();
  res.json({ status: "ok", logs: stats.logs, ts: Date.now() });
});

app.get("/api/providers", (_req, res) => {
  res.json(listProviders());
});

app.use("/api/conversations", conversationsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/ingest", ingestRouter);

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(500).json({ error: err.message });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  // Eagerly init DB
  getDb();
  console.log(`🚀 LLM Observatory backend running on http://localhost:${PORT}`);
  console.log(`   Providers: ${listProviders().map(p => `${p.id}(${p.available ? '✓' : '✗'})`).join(', ')}`);
});
