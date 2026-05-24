import { Router } from "express";
import { randomUUID } from "crypto";
import { getDb } from "../db/index.js";

const router = Router();

// GET /api/conversations — list all, newest first
router.get("/", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
        (SELECT content_preview FROM messages m WHERE m.conversation_id = c.id AND m.role='assistant' ORDER BY created_at DESC LIMIT 1) AS last_reply
       FROM conversations c
       ORDER BY c.updated_at DESC
       LIMIT 100`
    )
    .all();
  res.json(rows);
});

// POST /api/conversations — create new conversation
router.post("/", (req, res) => {
  const { title, provider = "openai", model = "gpt-4.1-mini" } = req.body;
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO conversations (id, title, provider, model, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, title || "New Conversation", provider, model, now, now);

  const row = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id);
  res.status(201).json(row);
});

// GET /api/conversations/:id — get one with messages
router.get("/:id", (req, res) => {
  const db = getDb();
  const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(req.params.id);
  if (!conv) return res.status(404).json({ error: "Not found" });

  const messages = db
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .all(req.params.id);

  res.json({ ...conv, messages });
});

// PATCH /api/conversations/:id — update title or status
router.patch("/:id", (req, res) => {
  const db = getDb();
  const { title, status } = req.body;
  const allowed = {};
  if (title) allowed.title = title;
  if (status && ["active", "cancelled", "archived"].includes(status)) allowed.status = status;

  if (Object.keys(allowed).length === 0) return res.status(400).json({ error: "Nothing to update" });

  allowed.updated_at = Date.now();
  const sets = Object.keys(allowed).map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE conversations SET ${sets} WHERE id = @id`).run({ ...allowed, id: req.params.id });

  res.json(db.prepare("SELECT * FROM conversations WHERE id = ?").get(req.params.id));
});

// DELETE /api/conversations/:id — soft delete (cancel)
router.delete("/:id", (req, res) => {
  const db = getDb();
  db.prepare("UPDATE conversations SET status = 'cancelled', updated_at = ? WHERE id = ?").run(
    Date.now(),
    req.params.id
  );
  res.json({ ok: true });
});

// GET /api/conversations/:id/messages
router.get("/:id/messages", (req, res) => {
  const db = getDb();
  const msgs = db
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .all(req.params.id);
  res.json(msgs);
});

export default router;
