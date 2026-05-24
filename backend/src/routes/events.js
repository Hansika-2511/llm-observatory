/**
 * Server-Sent Events endpoint for real-time inference log streaming.
 * Subscribes to Redis "inference:logs" channel and pushes to connected clients.
 */

import { Router } from "express";
import { getSubRedis } from "../services/redis.js";

const router = Router();

// Keep track of active SSE clients
const clients = new Set();

// One shared Redis subscription
let subscribed = false;

function ensureSubscription() {
  if (subscribed) return;
  subscribed = true;

  const sub = getSubRedis();
  sub.subscribe("inference:logs", (err) => {
    if (err) console.error("[sse] Redis subscribe error:", err.message);
  });

  sub.on("message", (_channel, message) => {
    const data = `data: ${message}\n\n`;
    for (const client of clients) {
      try {
        client.write(data);
      } catch {
        clients.delete(client);
      }
    }
  });
}

// GET /api/events — SSE stream
router.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send a heartbeat every 15s so proxies don't close the connection
  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 15000);

  clients.add(res);
  ensureSubscription();

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
});

export default router;
