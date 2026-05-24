import { Router } from "express";
import { randomUUID } from "crypto";
import { getDb } from "../db/index.js";
import { llmComplete, llmStream } from "../services/sdk.js";
import { redact } from "../utils/redact.js";

const router = Router();

const PREVIEW_LEN = 200;
const MAX_CONTEXT_MESSAGES = 20; // rolling context window

function saveMessage(db, { id, conversation_id, role, content, token_count = null }) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, content_preview, created_at, token_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, conversation_id, role, content, content.slice(0, PREVIEW_LEN), now, token_count);

  db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(now, conversation_id);
  return db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
}

function buildContextMessages(db, conversationId) {
  const msgs = db
    .prepare(
      `SELECT role, content FROM messages
       WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(conversationId, MAX_CONTEXT_MESSAGES)
    .reverse();

  // Add system prompt
  return [
    { role: "system", content: "You are a helpful assistant. Be concise and accurate." },
    ...msgs,
  ];
}

// POST /api/chat/:conversationId — non-streaming
router.post("/:conversationId", async (req, res) => {
  const { conversationId } = req.params;
  const { content, stream = false } = req.body;

  if (!content?.trim()) return res.status(400).json({ error: "content required" });

  const db = getDb();
  const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId);
  if (!conv) return res.status(404).json({ error: "Conversation not found" });
  if (conv.status === "cancelled") return res.status(400).json({ error: "Conversation is cancelled" });

  // Save user message
  const userMsgId = randomUUID();
  saveMessage(db, { id: userMsgId, conversation_id: conversationId, role: "user", content: redact(content) });

  // Build context
  const messages = buildContextMessages(db, conversationId);

  const assistantMsgId = randomUUID();

  if (stream) {
    // ── Streaming path ─────────────────────────────────────────────────────
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    let fullContent = "";
    let completionTokens = null;

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const gen = llmStream({
        messages,
        model: conv.model,
        provider: conv.provider,
        conversationId,
        messageId: assistantMsgId,
      });

      for await (const delta of gen) {
        fullContent += delta;
        sendEvent("delta", { delta });
      }

      // Save complete assistant message
      const saved = saveMessage(db, {
        id: assistantMsgId,
        conversation_id: conversationId,
        role: "assistant",
        content: fullContent,
        token_count: completionTokens,
      });

      sendEvent("done", { message: saved });
      res.end();
    } catch (err) {
      sendEvent("error", { error: err.message });
      res.end();
    }
  } else {
    // ── Non-streaming path ─────────────────────────────────────────────────
    try {
      const result = await llmComplete({
        messages,
        model: conv.model,
        provider: conv.provider,
        conversationId,
        messageId: assistantMsgId,
      });

      const saved = saveMessage(db, {
        id: assistantMsgId,
        conversation_id: conversationId,
        role: "assistant",
        content: result.content,
        token_count: result.usage?.completion_tokens,
      });

      res.json({
        message: saved,
        usage: result.usage,
        finish_reason: result.finish_reason,
      });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  }
});

export default router;
