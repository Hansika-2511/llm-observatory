/**
 * PII Redaction Utility
 * Strips common PII patterns from text before storage.
 * Patterns: email, phone, SSN, credit card, IP address.
 */

const PATTERNS = [
  // Email
  { regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, replacement: "[EMAIL]" },
  // US Phone
  { regex: /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g, replacement: "[PHONE]" },
  // SSN
  { regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[SSN]" },
  // Credit card (Luhn-ish patterns)
  { regex: /\b(?:\d[ -]?){13,16}\b/g, replacement: "[CARD]" },
  // IPv4
  { regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: "[IP]" },
  // API keys (common patterns: sk-, pk-, Bearer tokens)
  { regex: /\b(sk|pk|api|bearer)[-_][a-zA-Z0-9\-_]{16,}\b/gi, replacement: "[API_KEY]" },
];

export function redact(text) {
  if (!text || typeof text !== "string") return text;
  let out = text;
  for (const { regex, replacement } of PATTERNS) {
    out = out.replace(regex, replacement);
  }
  return out;
}

export function redactMessages(messages) {
  return messages.map((m) => ({
    ...m,
    content: typeof m.content === "string" ? redact(m.content) : m.content,
  }));
}
