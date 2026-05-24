import React, { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";
import { Activity, Clock, Zap, AlertCircle, TrendingUp, RefreshCw } from "lucide-react";
import { api } from "../lib/api.js";
import { format } from "date-fns";

const COLORS = ["#6ee7b7", "#60a5fa", "#a78bfa", "#fbbf24", "#f87171"];

const RANGES = [
  { label: "1h", ms: 3600000, bucket: "minute" },
  { label: "6h", ms: 6 * 3600000, bucket: "minute" },
  { label: "24h", ms: 24 * 3600000, bucket: "hour" },
  { label: "7d", ms: 7 * 24 * 3600000, bucket: "day" },
];

export default function DashboardPage() {
  const [range, setRange] = useState(RANGES[2]);
  const [overview, setOverview] = useState(null);
  const [latency, setLatency] = useState([]);
  const [throughput, setThroughput] = useState([]);
  const [errors, setErrors] = useState([]);
  const [providerStats, setProviderStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [liveCount, setLiveCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const now = Date.now();
    const from = now - range.ms;
    try {
      const [ov, lat, thru, err, prov] = await Promise.all([
        api.getOverview(from, now),
        api.getLatency(from, now, range.bucket),
        api.getThroughput(from, now, range.bucket),
        api.getErrors(from, now),
        api.getProviderStats(from, now),
      ]);
      setOverview(ov);
      setLatency(lat);
      setThroughput(thru);
      setErrors(err);
      setProviderStats(prov);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  // Live SSE counter
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = () => setLiveCount((c) => c + 1);
    return () => es.close();
  }, []);

  const formatTs = (ts) => {
    if (!ts) return "";
    return format(ts, range.bucket === "minute" ? "HH:mm" : range.bucket === "hour" ? "HH:mm" : "MM/dd");
  };

  const errorRate = overview
    ? ((overview.errors / (overview.total_requests || 1)) * 100).toFixed(1)
    : 0;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>Observatory Dashboard</h1>
          <div style={{ fontSize: 12, color: "var(--text3)", fontFamily: "var(--mono)" }}>
            {liveCount > 0 && <span style={{ color: "var(--accent)" }}>● {liveCount} live events · </span>}
            Real-time inference analytics
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r)}
              style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 12,
                background: range.label === r.label ? "var(--accent)" : "var(--surface2)",
                color: range.label === r.label ? "#000" : "var(--text2)",
                fontWeight: range.label === r.label ? 700 : 400,
              }}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={load}
            style={{ padding: "4px 10px", borderRadius: 6, background: "var(--surface2)", color: "var(--text2)", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
          >
            <RefreshCw size={12} className={loading ? "spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <KpiCard
          icon={<Activity size={16} />}
          label="Total Requests"
          value={overview?.total_requests ?? "—"}
          color="var(--accent)"
        />
        <KpiCard
          icon={<Clock size={16} />}
          label="Avg Latency"
          value={overview?.avg_success_latency_ms ? `${Math.round(overview.avg_success_latency_ms)}ms` : "—"}
          color="var(--blue)"
          sub={overview?.avg_ttft_ms ? `TTFT: ${Math.round(overview.avg_ttft_ms)}ms` : null}
        />
        <KpiCard
          icon={<Zap size={16} />}
          label="Total Tokens"
          value={overview?.total_tokens ? fmtNum(overview.total_tokens) : "—"}
          color="var(--purple)"
          sub={overview?.total_conversations ? `${overview.total_conversations} convs` : null}
        />
        <KpiCard
          icon={<AlertCircle size={16} />}
          label="Error Rate"
          value={`${errorRate}%`}
          color={Number(errorRate) > 5 ? "var(--red)" : "var(--accent)"}
          sub={overview?.errors ? `${overview.errors} errors` : "0 errors"}
        />
      </div>

      {/* Charts row 1: latency + throughput */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <ChartCard title="Latency over time (ms)">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={latency}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="bucket_ts" tickFormatter={formatTs} tick={{ fill: "var(--text3)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--text3)", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                labelFormatter={(v) => formatTs(v)}
              />
              <Line type="monotone" dataKey="avg_latency_ms" name="Avg (ms)" stroke="#6ee7b7" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="avg_ttft_ms" name="TTFT (ms)" stroke="#60a5fa" dot={false} strokeWidth={1.5} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Request Throughput">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={throughput}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="bucket_ts" tickFormatter={formatTs} tick={{ fill: "var(--text3)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--text3)", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                labelFormatter={(v) => formatTs(v)}
              />
              <Bar dataKey="success_count" name="Success" stackId="a" fill="#6ee7b7" />
              <Bar dataKey="error_count" name="Errors" stackId="a" fill="#f87171" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2: providers + errors */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <ChartCard title="Provider Breakdown">
          {providerStats.length === 0 ? (
            <EmptyChart />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={providerStats} dataKey="total" nameKey="provider" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                    {providerStats.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--surface2)", border: "1px solid var(--border)", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>
                {providerStats.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[i % COLORS.length] }} />
                      <span style={{ color: "var(--text2)" }}>{p.provider} / {p.model}</span>
                    </div>
                    <div style={{ color: "var(--text3)", fontFamily: "var(--mono)", fontSize: 11 }}>
                      {p.total} · {Math.round(p.avg_latency_ms)}ms
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Error Breakdown">
          {errors.length === 0 ? (
            <EmptyChart label="No errors in this period 🎉" />
          ) : (
            <div style={{ overflowY: "auto", maxHeight: 180 }}>
              {errors.map((e, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "6px 8px", borderRadius: 6, marginBottom: 4,
                  background: "rgba(248,113,113,0.06)",
                  border: "1px solid rgba(248,113,113,0.15)",
                  fontSize: 12,
                }}>
                  <div>
                    <span style={{ color: "var(--red)", fontFamily: "var(--mono)", fontSize: 11 }}>{e.error_code}</span>
                    <span style={{ color: "var(--text3)", marginLeft: 8 }}>{e.provider}/{e.model}</span>
                  </div>
                  <span style={{ color: "var(--text2)", fontWeight: 600 }}>×{e.count}</span>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Provider detail table */}
      {providerStats.length > 0 && (
        <ChartCard title="Provider Stats">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "var(--text3)" }}>
                {["Provider", "Model", "Requests", "Success", "Errors", "Avg Latency", "Avg Tokens"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 10px 8px", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {providerStats.map((p, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 10px", color: "var(--accent)" }}>{p.provider}</td>
                  <td style={{ padding: "6px 10px", fontFamily: "var(--mono)", fontSize: 11 }}>{p.model}</td>
                  <td style={{ padding: "6px 10px" }}>{p.total}</td>
                  <td style={{ padding: "6px 10px", color: "var(--accent2)" }}>{p.success}</td>
                  <td style={{ padding: "6px 10px", color: p.errors ? "var(--red)" : "var(--text3)" }}>{p.errors}</td>
                  <td style={{ padding: "6px 10px", fontFamily: "var(--mono)", fontSize: 11 }}>{Math.round(p.avg_latency_ms)}ms</td>
                  <td style={{ padding: "6px 10px" }}>{p.avg_tokens_per_req ? Math.round(p.avg_tokens_per_req) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, color, sub }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius2)",
      padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text3)", fontSize: 11, marginBottom: 8 }}>
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "var(--mono)", color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius2)",
      padding: "14px 16px",
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function EmptyChart({ label = "No data in this period" }) {
  return (
    <div style={{ height: 150, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)", fontSize: 12 }}>
      {label}
    </div>
  );
}

function fmtNum(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n;
}
