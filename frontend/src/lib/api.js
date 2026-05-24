const BASE = import.meta.env.VITE_API_URL || "";

async function req(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Conversations
  listConversations: () => req("GET", "/conversations"),
  createConversation: (data) => req("POST", "/conversations", data),
  getConversation: (id) => req("GET", `/conversations/${id}`),
  updateConversation: (id, data) => req("PATCH", `/conversations/${id}`, data),
  cancelConversation: (id) => req("DELETE", `/conversations/${id}`),

  // Chat
  sendMessage: (conversationId, content) =>
    req("POST", `/chat/${conversationId}`, { content, stream: false }),

  // Analytics
  getOverview: (from, to) => req("GET", `/analytics/overview?from=${from}&to=${to}`),
  getLatency: (from, to, bucket) => req("GET", `/analytics/latency?from=${from}&to=${to}&bucket=${bucket}`),
  getThroughput: (from, to, bucket) => req("GET", `/analytics/throughput?from=${from}&to=${to}&bucket=${bucket}`),
  getErrors: (from, to) => req("GET", `/analytics/errors?from=${from}&to=${to}`),
  getProviderStats: (from, to) => req("GET", `/analytics/providers?from=${from}&to=${to}`),
  getLogs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req("GET", `/analytics/logs?${qs}`);
  },

  // Providers
  listProviders: () => req("GET", "/providers"),

  // Streaming — returns an EventSource-like approach via fetch
  streamMessage: (conversationId, content, { onDelta, onDone, onError, signal }) => {
    return fetch(`${BASE}/api/chat/${conversationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, stream: true }),
      signal,
    }).then(async (res) => {
      if (!res.ok) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop(); // keep incomplete chunk

        for (const part of parts) {
          if (!part.trim()) continue;
          const lines = part.split("\n");
          let event = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7);
            if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (!data) continue;
          const parsed = JSON.parse(data);
          if (event === "delta") onDelta?.(parsed.delta);
          if (event === "done") onDone?.(parsed.message);
          if (event === "error") onError?.(new Error(parsed.error));
        }
      }
    });
  },
};
