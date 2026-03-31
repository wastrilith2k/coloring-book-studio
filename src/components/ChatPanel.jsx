import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  Sparkles,
  Save,
  Loader2,
  BookOpenText,
  MessageSquare,
  PlusCircle,
} from 'lucide-react';
import { apiFetch, chatWs } from '../lib/api.js';
import readmeText from '../../README.md?raw';

const STORAGE_KEY = 'chat:messages:v1';

/** Try to extract a JSON array of pages from a chat message */
const extractPages = (content) => {
  if (!content) return null;
  // Look for ```json [...] ``` blocks
  const match = content.match(/```(?:json)?\s*\n?(\[[\s\S]*?\])\n?```/);
  if (!match) return null;
  try {
    const arr = JSON.parse(match[1]);
    if (!Array.isArray(arr) || !arr.length) return null;
    if (!arr[0].title && !arr[0].prompt) return null;
    return arr;
  } catch { return null; }
};

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

export default function ChatPanel({ onSaved, bookContext, onAddPages }) {
  const initialMessages = useMemo(() => loadInitialMessages(), []);

  const systemContext = useMemo(() => {
    const appInfo = `You are the AI assistant for Coloring Book Studio. Here is the full app documentation:

${readmeText}

IMPORTANT INSTRUCTIONS:
- When the user asks you to suggest or generate new pages, respond with a JSON code block containing an array of page objects: \`\`\`json [{"title": "...", "scene": "...", "prompt": "...", "caption": "..."}] \`\`\`
- "scene" = short 1-sentence description. "prompt" = detailed illustration prompt. "caption" = fun activity text for PDF.
- The user will see an "Add these pages" button to add them directly to their book.
- Avoid copyrighted characters (use "fantasy tabletop RPG" not "D&D").
- Be concise and practical.`;

    if (!bookContext) return appInfo;
    const pageList = (bookContext.pages || [])
      .map((p, i) => `  ${i + 1}. ${p.title}: ${p.scene}`)
      .join('\n');
    return `${appInfo}

CURRENT BOOK:
Title: "${bookContext.title}"
Concept: ${bookContext.concept || 'Not specified'}
Pages:
${pageList}

Help the user refine prompts, suggest new scenes, improve page ideas, or answer questions about the coloring book workflow.`;
  }, [bookContext]);

  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState('Bakery witches in autumn');
  const [length, setLength] = useState(8);
  const [audience, setAudience] = useState('kids');
  const [idea, setIdea] = useState(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const assistantBufferRef = useRef('');

  // Connect WebSocket on mount
  useEffect(() => {
    const connectWs = async () => {
      try {
        await chatWs.connect();
        setWsConnected(true);
      } catch {
        setWsConnected(false);
      }
    };
    connectWs();

    return () => {
      // Don't disconnect on unmount — keep connection alive across renders
    };
  }, []);

  // Handle WebSocket messages
  useEffect(() => {
    const offDelta = chatWs.on('delta', (data) => {
      assistantBufferRef.current += data.content;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last._streaming) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: assistantBufferRef.current },
          ];
        }
        return prev;
      });
    });

    const offDone = chatWs.on('done', () => {
      setIsLoading(false);
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last._streaming) {
          const { _streaming, ...clean } = last;
          return [...prev.slice(0, -1), clean];
        }
        return prev;
      });
    });

    const offError = chatWs.on('error', (data) => {
      setIsLoading(false);
      setError({ message: data.content || 'Stream error' });
    });

    return () => {
      offDelta();
      offDone();
      offError();
    };
  }, []);

  // Persist messages to sessionStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!messages.length) {
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

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = {
      id: crypto.randomUUID?.() || String(Math.random()),
      role: 'user',
      content: input.trim(),
    };
    const assistantMsg = {
      id: crypto.randomUUID?.() || String(Math.random()),
      role: 'assistant',
      content: '',
      _streaming: true,
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsLoading(true);
    setError(null);
    assistantBufferRef.current = '';

    try {
      if (wsConnected) {
        // Use WebSocket for streaming
        const allMessages = [...messages, userMsg].map(m => ({
          role: m.role,
          content: m.content,
        }));
        chatWs.send('sendMessage', {
          messages: allMessages,
          systemContext,
        });
      } else {
        // Fallback to HTTP API (non-streaming)
        const allMessages = [...messages, userMsg].map(m => ({
          role: m.role,
          content: m.content,
        }));
        const res = await apiFetch('/api/chat', {
          method: 'POST',
          body: JSON.stringify({
            messages: allMessages,
            systemContext,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Chat failed (${res.status})`);
        }
        const data = await res.json();
        const text = data.content || '';
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last._streaming) {
            return [...prev.slice(0, -1), { ...last, content: text, _streaming: undefined }];
          }
          return prev;
        });
        setIsLoading(false);
      }
    } catch (err) {
      setError({ message: err.message });
      setIsLoading(false);
    }
  }, [input, isLoading, messages, systemContext, wsConnected]);

  const runIdea = async () => {
    setStatus('');
    try {
      const res = await apiFetch('/api/ideas', {
        method: 'POST',
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
      const res = await apiFetch('/api/books', {
        method: 'POST',
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
          <h3>Brainstorm</h3>
          <p className="helper">
            Streamed replies via OpenRouter; craft a concept, then save it.
          </p>
        </div>
        <span className="pill subtle">
          {wsConnected ? 'WS connected' : 'HTTP fallback'}
        </span>
      </div>

      <div className="chat-panel__body">
        <div className="chat-log">
          {messages.length === 0 && (
            <div className="chat-empty">
              <MessageSquare size={18} />
              <span>Ask for book ideas or scene prompts.</span>
            </div>
          )}
          {messages.map(msg => {
            const pages = msg.role === 'assistant' ? extractPages(msg.content) : null;
            return (
              <div
                key={msg.id}
                className={`chat-bubble ${
                  msg.role === 'assistant' ? 'is-assistant' : 'is-user'
                }`}
              >
                <span className="chat-role">{msg.role}</span>
                <p>
                  {msg.content ||
                    (isLoading && msg.role === 'assistant' ? 'Thinking...' : '')}
                </p>
                {pages && onAddPages && (
                  <button
                    className="btn primary chat-add-pages-btn"
                    onClick={() => onAddPages(pages)}
                  >
                    <PlusCircle size={14} />
                    Add {pages.length} page{pages.length === 1 ? '' : 's'} to book
                  </button>
                )}
              </div>
            );
          })}
          {isLoading &&
            !messages.find(m => m.role === 'assistant' && !m.content) && (
              <div className="chat-bubble is-assistant">
                <span className="chat-role">assistant</span>
                <p>Thinking...</p>
              </div>
            )}
        </div>

        <form className="chat-form" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask for a coloring book idea or page prompt..."
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
