import { useEffect, useMemo, useState } from 'react';
import { useChat } from 'ai/react';
import {
  Send,
  Sparkles,
  Save,
  Loader2,
  BookOpenText,
  MessageSquare,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8788';
const STORAGE_KEY = 'chat:messages:v1';

const loadInitialMessages = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-100).map(m => ({
      id: m.id || crypto.randomUUID?.() || String(Math.random()),
      role: m.role || 'user',
      content: m.content || '',
    }));
  } catch {
    return [];
  }
};

export default function ChatPanel({ onSaved, bookContext }) {
  const chatApi = useMemo(() => `${API_BASE}/api/chat`, []);
  const ideaApi = useMemo(() => `${API_BASE}/api/ideas`, []);
  const saveApi = useMemo(() => `${API_BASE}/api/books`, []);
  const initialMessages = useMemo(() => loadInitialMessages(), []);

  const systemContext = useMemo(() => {
    if (!bookContext) return null;
    const pageList = (bookContext.pages || [])
      .map((p, i) => `  ${i + 1}. ${p.title}: ${p.scene}`)
      .join('\n');
    return `You are helping with a coloring book titled "${
      bookContext.title
    }".\nConcept: ${
      bookContext.concept || 'Not specified'
    }\nPages:\n${pageList}\n\nProvide helpful suggestions for scenes, prompts, or improvements.`;
  }, [bookContext]);

  const [theme, setTheme] = useState('Bakery witches in autumn');
  const [length, setLength] = useState(8);
  const [audience, setAudience] = useState('kids');
  const [idea, setIdea] = useState(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({
      api: chatApi,
      initialMessages,
      streamProtocol: 'text',
      body: systemContext ? { systemContext } : undefined,
    });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!messages || messages.length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const trimmed = messages.slice(-100).map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
    }));
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // ignore quota errors
    }
  }, [messages]);

  const runIdea = async () => {
    setStatus('');
    try {
      const res = await fetch(ideaApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme,
          audience,
          length: Number(length) || 8,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Idea request failed');
      setIdea(data.idea || data);
      setStatus('Idea generated');
    } catch (e) {
      setStatus(e.message);
    }
  };

  const saveIdea = async () => {
    if (!idea?.title) {
      setStatus('No idea to save yet.');
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch(saveApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: idea.title,
          tagLine: idea.tagLine || idea.tagline || '',
          concept: idea.concept || '',
          pages: idea.pages || [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed');
      setStatus(`Saved as book #${data.book?.id ?? ''}`.trim());
      onSaved?.(data.book);
    } catch (e) {
      setStatus(e.message);
    }
    setSaving(false);
  };

  return (
    <div className="chat-panel">
      <div className="chat-panel__header">
        <div>
          <p className="eyebrow">AI planner</p>
          <h3>Brainstorm with Gemini</h3>
          <p className="helper">
            Streamed replies via free-tier Gemini; craft a concept, then save
            it.
          </p>
        </div>
        <span className="pill subtle">Streaming on</span>
      </div>

      <div className="chat-panel__body">
        <div className="chat-log">
          {messages.length === 0 && (
            <div className="chat-empty">
              <MessageSquare size={18} />
              <span>Ask for book ideas or scene prompts.</span>
            </div>
          )}
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`chat-bubble ${
                msg.role === 'assistant' ? 'is-assistant' : 'is-user'
              }`}
            >
              <span className="chat-role">{msg.role}</span>
              <p>
                {msg.content ||
                  (isLoading && msg.role === 'assistant' ? 'Thinking…' : '')}
              </p>
            </div>
          ))}
          {isLoading &&
            !messages.find(m => m.role === 'assistant' && !m.content) && (
              <div className="chat-bubble is-assistant">
                <span className="chat-role">assistant</span>
                <p>Thinking…</p>
              </div>
            )}
        </div>

        <form className="chat-form" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={handleInputChange}
            placeholder="Ask for a coloring book idea or page prompt…"
            rows={3}
          />
          <button
            type="submit"
            className="btn primary"
            disabled={isLoading || !input.trim()}
          >
            {isLoading ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <Send size={16} />
            )}
            Send
          </button>
        </form>

        {error && <div className="chat-status bad">{error.message}</div>}
      </div>

      <div className="idea-panel">
        <div className="idea-controls">
          <div className="field">
            <label>Theme</label>
            <input value={theme} onChange={e => setTheme(e.target.value)} />
          </div>
          <div className="field">
            <label>Audience</label>
            <input
              value={audience}
              onChange={e => setAudience(e.target.value)}
            />
          </div>
          <div className="field short">
            <label>Scenes</label>
            <input
              type="number"
              min={1}
              max={20}
              value={length}
              onChange={e => setLength(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={runIdea}
            disabled={isLoading}
          >
            <Sparkles size={16} /> Generate concept
          </button>
        </div>

        {idea && (
          <div className="idea-card">
            <div className="idea-head">
              <div>
                <p className="eyebrow">Suggested book</p>
                <h4>{idea.title}</h4>
                <p className="helper">
                  {idea.tagLine || idea.tagline || 'No tagline'}
                </p>
              </div>
              <button
                type="button"
                className="btn pill"
                onClick={saveIdea}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="spin" size={14} />
                ) : (
                  <Save size={14} />
                )}
                Save to library
              </button>
            </div>
            <p className="idea-concept">{idea.concept}</p>
            <div className="idea-pages">
              {(idea.pages || []).map((p, idx) => (
                <div key={`${p.title}-${idx}`} className="idea-page">
                  <div className="idea-page__title">
                    <BookOpenText size={16} />
                    <strong>{p.title || `Page ${idx + 1}`}</strong>
                  </div>
                  {p.scene && <p className="idea-page__scene">{p.scene}</p>}
                  {p.prompt && (
                    <p className="idea-page__prompt">Prompt: {p.prompt}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {status && <div className="chat-status">{status}</div>}
      </div>
    </div>
  );
}
