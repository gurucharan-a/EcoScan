import { useState } from "react";
import { useDB } from "@/services/store";
import { ASSISTANT_SUGGESTIONS, answerAssistant } from "@/services/ai/assistant";

/**
 * ✦ Ask ServiceGrid — conversational read-only queries over the live store.
 * Mock provider: deterministic local answers, staged UX, never invents data.
 */
export default function AIAssistant() {
  const db = useDB();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<{ q: string; a: string }[]>([]);

  const ask = (text: string) => {
    const query = text.trim();
    if (!query || busy) return;
    setBusy(true);
    setQ("");
    window.setTimeout(() => {
      try {
        const a = answerAssistant(query, db);
        setTurns((t) => [...t, { q: query, a }].slice(-8));
      } catch {
        setTurns((t) => [...t, { q: query, a: "AI analysis unavailable. Existing SERVICEGRID operations remain fully functional." }].slice(-8));
      } finally {
        setBusy(false);
      }
    }, 600);
  };

  return (
    <div className="so-panel">
      <div className="so-panel-head">
        <span className="so-panel-title">✦ Ask ServiceGrid</span>
        <span className="so-panel-meta">mock assistant · live data only</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {ASSISTANT_SUGGESTIONS.map((s) => (
          <button key={s} className="so-chip" onClick={() => ask(s)} disabled={busy}>{s}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="so-input" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder='Ask about techs, requests, machines, stock… (e.g. "status of SR-1042")'
          onKeyDown={(e) => { if (e.key === "Enter") ask(q); }}
        />
        <button className="so-ghost-btn solid" onClick={() => ask(q)} disabled={busy || !q.trim()}>
          {busy ? "…" : "Ask ✦"}
        </button>
      </div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflow: "auto" }}>
        {turns.length === 0 && !busy && (
          <div style={{ fontSize: 12.5, color: "#5d6b84" }}>Answers come only from current workspace records — nothing is invented.</div>
        )}
        {busy && <div style={{ fontSize: 12.5, color: "#8b99b0" }}>✦ Consulting workspace data…</div>}
        {[...turns].reverse().map((t, i) => (
          <div key={i} style={{ border: "1px solid #1d2940", borderRadius: 8, padding: "9px 12px" }}>
            <div style={{ fontSize: 12, color: "#5d6b84" }}>Q: {t.q}</div>
            <div style={{ fontSize: 12.5, color: "#e6edf8", marginTop: 4 }}>✦ {t.a}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
