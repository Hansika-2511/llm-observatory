import OpenAI from "openai";

/**
 * Provider registry — add new providers here.
 * Each provider must implement:
 *   complete(messages, model, options) -> { content, usage, finish_reason }
 *   stream(messages, model, options)   -> AsyncGenerator<chunk>
 */

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ── OpenAI ────────────────────────────────────────────────────────────────────
const openaiProvider = {
  name: "openai",
  defaultModel: "gpt-4.1-mini",
  models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],

  async complete(messages, model, options = {}) {
    const resp = await openaiClient.chat.completions.create({
      model: model || this.defaultModel,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 1024,
    });
    const choice = resp.choices[0];
    return {
      content: choice.message.content,
      usage: resp.usage,
      finish_reason: choice.finish_reason,
    };
  },

  async *stream(messages, model, options = {}) {
    const stream = await openaiClient.chat.completions.create({
      model: model || this.defaultModel,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 1024,
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      const usage = chunk.usage; // only present on last chunk with include_usage
      const finish_reason = chunk.choices[0]?.finish_reason;
      yield { delta, usage, finish_reason, chunk };
    }
  },
};

// ── Anthropic stub (swap in real SDK if key present) ─────────────────────────
const anthropicProvider = {
  name: "anthropic",
  defaultModel: "claude-sonnet-4-20250514",
  models: ["claude-opus-4-20250514", "claude-sonnet-4-20250514", "claude-haiku-4-20250514"],

  async complete(messages, model) {
    // If Anthropic SDK is available and key set, use it; else throw
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }
    // Dynamic import to avoid hard dependency
    const { default: Anthropic } = await import("@anthropic-ai/sdk").catch(() => {
      throw new Error("@anthropic-ai/sdk not installed");
    });
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const systemMsg = messages.find((m) => m.role === "system");
    const userMsgs = messages.filter((m) => m.role !== "system");
    const resp = await client.messages.create({
      model: model || this.defaultModel,
      max_tokens: 1024,
      system: systemMsg?.content,
      messages: userMsgs,
    });
    return {
      content: resp.content[0].text,
      usage: { prompt_tokens: resp.usage.input_tokens, completion_tokens: resp.usage.output_tokens, total_tokens: resp.usage.input_tokens + resp.usage.output_tokens },
      finish_reason: resp.stop_reason,
    };
  },

  async *stream(messages, model) {
    throw new Error("Anthropic streaming not yet implemented in this build");
  },
};

// ── Gemini stub ───────────────────────────────────────────────────────────────
const geminiProvider = {
  name: "gemini",
  defaultModel: "gemini-1.5-flash",
  models: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],

  async complete() {
    throw new Error("GEMINI_API_KEY not configured or SDK not installed");
  },
  async *stream() {
    throw new Error("Gemini streaming not yet implemented");
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────
const PROVIDERS = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
};

export function getProvider(name = "openai") {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Unknown provider: ${name}`);
  return p;
}

export function listProviders() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id,
    name: p.name,
    defaultModel: p.defaultModel,
    models: p.models,
    available: id === "openai"
      ? !!process.env.OPENAI_API_KEY
      : id === "anthropic"
      ? !!process.env.ANTHROPIC_API_KEY
      : !!process.env.GEMINI_API_KEY,
  }));
}
