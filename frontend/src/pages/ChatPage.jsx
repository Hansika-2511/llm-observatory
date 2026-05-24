import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Plus, Send, StopCircle, Trash2, RotateCcw, ChevronRight,
  Bot, User, Loader, MessageSquare, Zap,
} from "lucide-react";
import { api } from "../lib/api.js";
import { formatDistanceToNow } from "date-fns";

export default function ChatPage() {
  const { id: activeId } = useParams();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState([]);
  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [providers, setProviders] = useState([]);
  const [newConvForm, setNewConvForm] = useState({ provider: "openai", model: "gpt-4.1-mini" });
  const [showNewForm, setShowNewForm] = useState(false);

  const abortRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  // Load providers
  useEffect(() => {
    api.listProviders().then(setProviders).catch(console.error);
  }, []);

  // Load conversations list
  const loadConvs = useCallback(() => {
    api.listConversations().then(setConversations).catch(console.error);
  }, []);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  // Load active conversation
  useEffect(() => {
    if (!activeId) { setConv(null); setMessages([]); return; }
    api.getConversation(activeId).then((c) => {
      setConv(c);
      setMessages(c.messages || []);
    }).catch(console.error);
  }, [activeId]);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const createConversation = async () => {
    const c = await api.createConversation({
      title: "New Chat",
      provider: newConvForm.provider,
      model: newConvForm.model,
    });
    loadConvs();
    navigate(`/chat/${c.id}`);
    setShowNewForm(false);
  };

  const cancelConversation = async (id, e) => {
    e?.stopPropagation();
    await api.cancelConversation(id);
    loadConvs();
    if (activeId === id) navigate("/chat");
  };

  const resumeConversation = async (id, e) => {
    e?.stopPropagation();
    await api.updateConversation(id, { status: "active" });
    loadConvs();
    navigate(`/chat/${id}`);
  };

  const stopStream = () => {
    abortRef.current?.abort();
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeId || sending) return;
    if (conv?.status === "cancelled") return;

    const content = input.trim();
    setInput("");
    setSending(true);

    // Optimistic user message
    const tempId = `temp-${Date.now()}`;
    const tempMsg = { id: tempId, role: "user", content, created_at: Date.now() };
    setMessages((m) => [...m, tempMsg]);

    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming("");

    try {
      await api.streamMessage(activeId, content, {
        signal: controller.signal,
        onDelta: (delta) => setStreaming((s) => s + delta),
        onDone: (msg) => {
          setStreaming("");
          setMessages((m) => [...m, msg]);
          setSending(false);
          loadConvs();
        },
        onError: (err) => {
          console.error(err);
          setStreaming("");
          setSending(false);
        },
      });
    } catch (err) {
      if (err.name !== "AbortError") console.error(err);
      setStreaming("");
      setSending(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const activeProvider = providers.find((p) => p.id === newConvForm.provider);
  const isCancelled = conv?.status === "cancelled";

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden" }}>
      {/* Conversation list sidebar */}
      <div style={{
        width: 260,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0,
      }}>
        <div style={{ padding: "12px 12px 8px", borderBottom: "1px solid var(--border)" }}>
          <button
            onClick={() => setShowNewForm((v) => !v)}
            style={{
              width: "100%", padding: "8px 12px",
              background: "var(--accent)", color: "#000",
              borderRadius: "var(--radius)", fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 13,
            }}
          >
            <Plus size={14} /> New Chat
          </button>

          {showNewForm && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }} className="fade-in">
              <select
                value={newConvForm.provider}
                onChange={(e) => setNewConvForm({ provider: e.target.value, model: providers.find(p => p.id === e.target.value)?.defaultModel || "" })}
                style={{ padding: "6px 8px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }}
              >
                {providers.filter(p => p.available).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                value={newConvForm.model}
                onChange={(e) => setNewConvForm((f) => ({ ...f, model: e.target.value }))}
                style={{ padding: "6px 8px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }}
              >
                {(activeProvider?.models || []).map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <button
                onClick={createConversation}
                style={{
                  padding: "6px 10px", background: "var(--accent2)",
                  color: "#000", borderRadius: "var(--radius)", fontWeight: 600, fontSize: 12,
                }}
              >
                Create
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
          {conversations.length === 0 && (
            <div style={{ color: "var(--text3)", fontSize: 12, padding: "20px 8px", textAlign: "center" }}>
              No conversations yet
            </div>
          )}
          {conversations.map((c) => (
            <ConvItem
              key={c.id}
              conv={c}
              active={c.id === activeId}
              onClick={() => navigate(`/chat/${c.id}`)}
              onCancel={cancelConversation}
              onResume={resumeConversation}
            />
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        {conv && (
          <div style={{
            padding: "12px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{conv.title || "Chat"}</div>
              <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>
                {conv.provider} / {conv.model}
                {isCancelled && <span style={{ color: "var(--red)", marginLeft: 8 }}>● cancelled</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {isCancelled ? (
                <button
                  onClick={() => resumeConversation(conv.id)}
                  style={{
                    padding: "5px 12px", borderRadius: "var(--radius)",
                    background: "rgba(110,231,183,0.1)", color: "var(--accent)",
                    fontSize: 12, display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  <RotateCcw size={12} /> Resume
                </button>
              ) : (
                <button
                  onClick={() => cancelConversation(conv.id)}
                  style={{
                    padding: "5px 12px", borderRadius: "var(--radius)",
                    background: "rgba(248,113,113,0.1)", color: "var(--red)",
                    fontSize: 12, display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  <Trash2 size={12} /> Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {!conv && (
            <EmptyState onNew={() => { setShowNewForm(true); }} />
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}

          {/* Streaming bubble */}
          {streaming && (
            <MessageBubble msg={{ role: "assistant", content: streaming, streaming: true }} />
          )}

          {sending && !streaming && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text3)", fontSize: 12, marginTop: 8 }}>
              <Loader size={12} className="spin" /> Thinking…
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        {conv && !isCancelled && (
          <div style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex", gap: 8,
            flexShrink: 0,
          }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Message… (Enter to send, Shift+Enter for newline)"
              rows={1}
              style={{
                flex: 1, padding: "10px 14px",
                resize: "none", maxHeight: 120,
                borderRadius: "var(--radius)",
              }}
            />
            {sending ? (
              <button
                onClick={stopStream}
                style={{
                  padding: "0 16px",
                  background: "rgba(248,113,113,0.15)",
                  color: "var(--red)",
                  borderRadius: "var(--radius)",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <StopCircle size={16} />
              </button>
            ) : (
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                style={{
                  padding: "0 16px",
                  background: input.trim() ? "var(--accent)" : "var(--surface2)",
                  color: input.trim() ? "#000" : "var(--text3)",
                  borderRadius: "var(--radius)",
                  display: "flex", alignItems: "center", gap: 6,
                  transition: "all 0.15s",
                }}
              >
                <Send size={16} />
              </button>
            )}
          </div>
        )}

        {conv && isCancelled && (
          <div style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            textAlign: "center",
            color: "var(--text3)", fontSize: 13,
            flexShrink: 0,
          }}>
            This conversation was cancelled.{" "}
            <button
              onClick={() => resumeConversation(conv.id)}
              style={{ color: "var(--accent)", fontWeight: 600 }}
            >
              Resume it
            </button>{" "}
            to continue.
          </div>
        )}
      </div>
    </div>
  );
}

function ConvItem({ conv, active, onClick, onCancel, onResume }) {
  const isCancelled = conv.status === "cancelled";
  return (
    <div
      onClick={onClick}
      style={{
        padding: "8px 10px",
        borderRadius: "var(--radius)",
        background: active ? "rgba(110,231,183,0.07)" : "transparent",
        border: active ? "1px solid rgba(110,231,183,0.2)" : "1px solid transparent",
        cursor: "pointer",
        display: "flex", alignItems: "flex-start", gap: 8,
        opacity: isCancelled ? 0.6 : 1,
        transition: "all 0.1s",
      }}
    >
      <MessageSquare size={14} style={{ marginTop: 3, color: active ? "var(--accent)" : "var(--text3)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {conv.title}
          {isCancelled && <span style={{ fontSize: 10, color: "var(--red)", marginLeft: 4 }}>cancelled</span>}
        </div>
        <div style={{ fontSize: 10, color: "var(--text3)" }}>
          {formatDistanceToNow(conv.updated_at, { addSuffix: true })} · {conv.message_count || 0} msgs
        </div>
      </div>
      {isCancelled ? (
        <button
          onClick={(e) => onResume(conv.id, e)}
          style={{ color: "var(--accent)", padding: 2 }}
          title="Resume"
        >
          <RotateCcw size={11} />
        </button>
      ) : (
        <button
          onClick={(e) => onCancel(conv.id, e)}
          style={{ color: "var(--text3)", padding: 2 }}
          title="Cancel"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div
      className="fade-in"
      style={{
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        gap: 10,
        marginBottom: 16,
        alignItems: "flex-start",
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: isUser ? "var(--blue)" : "var(--accent)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {isUser ? <User size={13} color="#000" /> : <Bot size={13} color="#000" />}
      </div>
      <div
        style={{
          maxWidth: "70%",
          padding: "10px 14px",
          borderRadius: 10,
          background: isUser ? "rgba(96,165,250,0.12)" : "var(--surface2)",
          border: `1px solid ${isUser ? "rgba(96,165,250,0.2)" : "var(--border)"}`,
          fontSize: 14,
          lineHeight: 1.65,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {msg.content}
        {msg.streaming && (
          <span style={{
            display: "inline-block",
            width: 2, height: 14,
            background: "var(--accent)",
            marginLeft: 2,
            verticalAlign: "middle",
            animation: "blink 1s step-end infinite",
          }} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ onNew }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      height: "100%", gap: 16, color: "var(--text3)",
    }}>
      <Zap size={40} style={{ color: "var(--accent)", opacity: 0.5 }} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>
          LLM Observatory
        </div>
        <div style={{ fontSize: 13 }}>Select a conversation or create a new one</div>
      </div>
    </div>
  );
}
