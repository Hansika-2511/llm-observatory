/**
 * LLM Inference SDK / Wrapper
 * Wraps any provider call and emits structured log events.
 *
 * Events are published to Redis pub/sub channel "inference:logs"
 * AND persisted directly to SQLite via the ingestion service.
 */

import { randomUUID } from "crypto";
import { getProvider } from "./providers.js";
import { ingest } from "./ingestion.js";
import { redact } from "../utils/redact.js";

const PREVIEW_LEN = 200;

function preview(text) {
  if (!text) return "";
  return String(text).slice(0, PREVIEW_LEN);
}

/**
 * Non-streaming LLM call with full metadata capture.
 */
export async function llmComplete({ messages, model, provider = "openai", conversationId, messageId, options = {} }) {
  const logId = randomUUID();
  const p = getProvider(provider);
  const requestAt = Date.now();
  let status = "success";
  let errorCode = null;
  let errorMessage = null;
  let result = null;

  try {
    result = await p.complete(messages, model, options);
  } catch (err) {
    status = "error";
    errorCode = err.status || err.code || "UNKNOWN";
    errorMessage = err.message;
    throw err;
  } finally {
    const responseAt = Date.now();
    const latencyMs = responseAt - requestAt;

    const logEntry = {
      id: logId,
      conversation_id: conversationId,
      message_id: messageId || null,
      provider,
      model: model || p.defaultModel,
      prompt_tokens: result?.usage?.prompt_tokens ?? null,
      completion_tokens: result?.usage?.completion_tokens ?? null,
      total_tokens: result?.usage?.total_tokens ?? null,
      latency_ms: latencyMs,
      status,
      error_code: errorCode,
      error_message: errorMessage,
      finish_reason: result?.finish_reason ?? null,
      is_streaming: 0,
      first_token_ms: null,
      request_at: requestAt,
      response_at: responseAt,
      input_preview: redact(preview(messages.at(-1)?.content)),
      output_preview: redact(preview(result?.content)),
    };

    // Fire-and-forget ingestion (don't block response)
    ingest(logEntry).catch(console.error);
  }

  return result;
}

/**
 * Streaming LLM call — yields text deltas and emits a log on completion.
 */
export async function* llmStream({ messages, model, provider = "openai", conversationId, messageId, options = {}, onAbort }) {
  const logId = randomUUID();
  const p = getProvider(provider);
  const requestAt = Date.now();
  let status = "success";
  let errorCode = null;
  let errorMessage = null;
  let fullContent = "";
  let usage = null;
  let finishReason = null;
  let firstTokenMs = null;

  try {
    const gen = p.stream(messages, model, options);
    for await (const { delta, usage: u, finish_reason } of gen) {
      if (delta) {
        if (firstTokenMs === null) firstTokenMs = Date.now() - requestAt;
        fullContent += delta;
        yield delta;
      }
      if (u) usage = u;
      if (finish_reason) finishReason = finish_reason;
    }
  } catch (err) {
    if (err.name === "AbortError" || err.message?.includes("cancel")) {
      status = "cancelled";
    } else {
      status = "error";
      errorCode = err.status || err.code || "UNKNOWN";
      errorMessage = err.message;
    }
    throw err;
  } finally {
    const responseAt = Date.now();
    const logEntry = {
      id: logId,
      conversation_id: conversationId,
      message_id: messageId || null,
      provider,
      model: model || p.defaultModel,
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      total_tokens: usage?.total_tokens ?? null,
      latency_ms: responseAt - requestAt,
      status,
      error_code: errorCode,
      error_message: errorMessage,
      finish_reason: finishReason,
      is_streaming: 1,
      first_token_ms: firstTokenMs,
      request_at: requestAt,
      response_at: responseAt,
      input_preview: redact(preview(messages.at(-1)?.content)),
      output_preview: redact(preview(fullContent)),
    };
    ingest(logEntry).catch(console.error);
  }
}
