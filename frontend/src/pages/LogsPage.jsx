import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, CheckCircle, XCircle, Clock, Wifi } from "lucide-react";
import { api } from "../lib/api.js";
import { format } from "date-fns";

const STATUS_COLORS = {
  success: "var(--accent)",
  error: "var(--red)",
  cancelled: "var(--yellow)",
};

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filterProvider, setFilterProvider] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [liveLog, setLiveLog] = useState(null);
  const LIMIT = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: LIMIT, offset: page * LIMIT };
      if (filterProvider) params.provider = filterProvider;
      if (filterStatus) params.status = filterStatus;
      const data = await api.getLogs(params);
      setLogs(data.rows);
      setTotal(data.total);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [page, filterProvider, filterStatus]);

  useEffect(() => { load(); }, [load]);

  // Live SSE
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      try {
        const log = JSON.parse(e.data);
        setLiveLog(log);
        setLogs((prev) => [log, ...prev.slice(0, LIMIT - 1)]);
      } catch {}
    };
    return () => es.close();
  }, []);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>Inference Logs</h1>
            <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>
              {total.toLocaleString()} total records
              {liveLog && <span style={{ color: "var(--accent)", marginLeft: 8 }}>● live</span>}
            </div>
          </div>
          <button
            onClick={load}
            style={{ padding: "6px 12px", background: "var(--surface2)", borderRadius: 6, fontSize: 12, display: "flex", alignItems: "center", gap: 4, color: "var(--text2)" }}
          >
            <RefreshCw size={12} className={loading ? "spin" : ""} /> Refresh
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={filterProvider}
            onChange={(e) => { setFilterProvider(e.target.value); setPage(0); }}
            style={{ padding: "5px 8px", borderRadius: 6, fontSize: 12, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }}
          >
            <option value="">All providers</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
            style={{ padding: "5px 8px", borderRadius: 6, fontSize: 12, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }}
          >
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
            <tr style={{ color: "var(--text3)" }}>
              {["Status", "Provider / Model", "Latency", "Tokens", "Streaming", "Time", "Input Preview"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <LogRow key={log.id} log={log} highlight={i === 0 && !!liveLog} />
            ))}
            {logs.length === 0 && !loading && (
              <tr>
                <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "var(--text3)" }}>
                  No logs yet. Start chatting!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ padding: "10px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end", flexShrink: 0 }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ padding: "4px 10px", borderRadius: 6, background: "var(--surface2)", color: page === 0 ? "var(--text3)" : "var(--text)", fontSize: 12 }}
          >
            ← Prev
          </button>
          <span style={{ color: "var(--text3)", fontSize: 12 }}>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{ padding: "4px 10px", borderRadius: 6, background: "var(--surface2)", color: page >= totalPages - 1 ? "var(--text3)" : "var(--text)", fontSize: 12 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function LogRow({ log, highlight }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        onClick={() => setExpanded((v) => !v)}
        style={{
          cursor: "pointer",
          borderBottom: "1px solid var(--border)",
          background: highlight ? "rgba(110,231,183,0.04)" : "transparent",
          transition: "background 0.3s",
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface2)"}
        onMouseLeave={(e) => e.currentTarget.style.background = highlight ? "rgba(110,231,183,0.04)" : "transparent"}
      >
        <td style={{ padding: "8px 12px" }}>
          <StatusBadge status={log.status} />
        </td>
        <td style={{ padding: "8px 12px", fontFamily: "var(--mono)", fontSize: 11 }}>
          {log.provider}<br />
          <span style={{ color: "var(--text3)" }}>{log.model}</span>
        </td>
        <td style={{ padding: "8px 12px", fontFamily: "var(--mono)" }}>
          {log.latency_ms}ms
          {log.first_token_ms && <span style={{ color: "var(--text3)", fontSize: 10, display: "block" }}>TTFT: {log.first_token_ms}ms</span>}
        </td>
        <td style={{ padding: "8px 12px" }}>
          {log.total_tokens ?? "—"}
          {log.total_tokens && (
            <span style={{ color: "var(--text3)", fontSize: 10, display: "block" }}>
              {log.prompt_tokens}+{log.completion_tokens}
            </span>
          )}
        </td>
        <td style={{ padding: "8px 12px" }}>
          {log.is_streaming ? (
            <span style={{ color: "var(--blue)", fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
              <Wifi size={10} /> stream
            </span>
          ) : (
            <span style={{ color: "var(--text3)", fontSize: 11 }}>batch</span>
          )}
        </td>
        <td style={{ padding: "8px 12px", color: "var(--text3)", whiteSpace: "nowrap" }}>
          {format(log.request_at, "HH:mm:ss")}<br />
          <span style={{ fontSize: 10 }}>{format(log.request_at, "MM/dd")}</span>
        </td>
        <td style={{ padding: "8px 12px", color: "var(--text2)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {log.input_preview || "—"}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: "var(--surface2)" }}>
          <td colSpan={7} style={{ padding: "12px 16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 12 }}>
              <div>
                <div style={{ color: "var(--text3)", marginBottom: 4, fontWeight: 600 }}>Input Preview</div>
                <div style={{ color: "var(--text)", background: "var(--surface)", padding: 10, borderRadius: 6, whiteSpace: "pre-wrap", maxHeight: 100, overflowY: "auto" }}>
                  {log.input_preview || "—"}
                </div>
              </div>
              <div>
                <div style={{ color: "var(--text3)", marginBottom: 4, fontWeight: 600 }}>Output Preview</div>
                <div style={{ color: "var(--text)", background: "var(--surface)", padding: 10, borderRadius: 6, whiteSpace: "pre-wrap", maxHeight: 100, overflowY: "auto" }}>
                  {log.output_preview || "—"}
                </div>
              </div>
              {log.error_message && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ color: "var(--red)", marginBottom: 4, fontWeight: 600 }}>Error</div>
                  <div style={{ color: "var(--red)", background: "rgba(248,113,113,0.06)", padding: 10, borderRadius: 6, fontFamily: "var(--mono)", fontSize: 11 }}>
                    [{log.error_code}] {log.error_message}
                  </div>
                </div>
              )}
              <div style={{ color: "var(--text3)", fontSize: 11, fontFamily: "var(--mono)" }}>
                ID: {log.id}<br />
                Conv: {log.conversation_id}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function StatusBadge({ status }) {
  const icons = {
    success: <CheckCircle size={12} />,
    error: <XCircle size={12} />,
    cancelled: <Clock size={12} />,
  };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      color: STATUS_COLORS[status] || "var(--text3)",
      fontSize: 11, fontWeight: 600,
    }}>
      {icons[status]} {status}
    </span>
  );
}
