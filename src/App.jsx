import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Layers,
  LogOut,
  MessageSquare,
  Moon,
  Palette,
  Sparkles,
  Sun,
  Users,
  Wand2,
  Check,
  Library,
  Plus,
  ArrowLeft,
  X,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import BookViewer from './components/BookViewer.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import { apiFetch } from './lib/api.js';
import './App.css';

const HASH_KEY = 'book';

const readHash = () => {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  return params.get(HASH_KEY);
};

const writeHash = bookId => {
  if (typeof window === 'undefined' || !bookId) return;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  params.set(HASH_KEY, bookId);
  const nextHash = params.toString();
  if (window.location.hash.replace(/^#/, '') !== nextHash) {
    window.location.hash = nextHash;
  }
};

/* ---------- Wizard ---------- */

const THEMES = [
  { label: 'Enchanted Forest', icon: '🌲', value: 'enchanted forest animals' },
  { label: 'Space Adventure', icon: '🚀', value: 'space adventure with aliens' },
  { label: 'Ocean World', icon: '🐙', value: 'underwater ocean creatures' },
  { label: 'Dinosaur Land', icon: '🦕', value: 'friendly dinosaurs' },
  { label: 'Fairy Tales', icon: '🏰', value: 'fairy tale characters' },
  { label: 'Farm Life', icon: '🐄', value: 'farm animals and tractors' },
];

const AUDIENCES = [
  { label: 'Toddlers (2-4)', value: 'toddlers', desc: 'Very simple shapes, big areas' },
  { label: 'Kids (5-8)', value: 'kids', desc: 'Fun details, moderate complexity' },
  { label: 'Tweens (9-12)', value: 'tweens', desc: 'More detail, patterns' },
  { label: 'Adults', value: 'adults', desc: 'Intricate, meditative designs' },
];

function WizardStep1({ theme, setTheme, audience, setAudience, customTheme, setCustomTheme, pageCount, setPageCount, onNext }) {
  return (
    <div className="wizard-content">
      <div className="wizard-section">
        <h3 className="wizard-section-title">
          <Palette size={18} />
          Choose a Theme
        </h3>
        <div className="theme-grid">
          {THEMES.map(t => (
            <button
              key={t.value}
              className={`theme-card ${theme === t.value ? 'is-selected' : ''}`}
              onClick={() => { setTheme(t.value); setCustomTheme(''); }}
            >
              <span className="theme-card__icon">{t.icon}</span>
              <span className="theme-card__label">{t.label}</span>
            </button>
          ))}
          <button
            className={`theme-card ${customTheme ? 'is-selected' : ''}`}
            onClick={() => { setTheme(''); setCustomTheme(customTheme || ' '); }}
          >
            <span className="theme-card__icon"><Wand2 size={20} /></span>
            <span className="theme-card__label">Custom</span>
          </button>
        </div>
        {customTheme !== '' && (
          <input
            className="wizard-input"
            type="text"
            placeholder="Describe your theme..."
            value={customTheme}
            onChange={e => { setCustomTheme(e.target.value); setTheme(''); }}
            autoFocus
          />
        )}
      </div>

      <div className="wizard-section">
        <h3 className="wizard-section-title">
          <Users size={18} />
          Target Audience
        </h3>
        <div className="audience-grid">
          {AUDIENCES.map(a => (
            <button
              key={a.value}
              className={`audience-card ${audience === a.value ? 'is-selected' : ''}`}
              onClick={() => setAudience(a.value)}
            >
              <span className="audience-card__label">{a.label}</span>
              <span className="audience-card__desc">{a.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="wizard-section">
        <h3 className="wizard-section-title">
          <Layers size={18} />
          Number of Pages
        </h3>
        <div className="page-count-picker">
          <button
            className="page-count-btn"
            onClick={() => setPageCount(c => Math.max(5, c - 1))}
            disabled={pageCount <= 5}
          >-</button>
          <input
            className="page-count-input"
            type="number"
            min={5}
            max={50}
            value={pageCount}
            onChange={e => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) setPageCount(Math.max(5, Math.min(50, v)));
            }}
          />
          <button
            className="page-count-btn"
            onClick={() => setPageCount(c => Math.min(50, c + 1))}
            disabled={pageCount >= 50}
          >+</button>
        </div>
      </div>

      <button
        className="btn primary wizard-next"
        disabled={!(theme || customTheme.trim()) || !audience}
        onClick={onNext}
      >
        Generate Concept
        <Sparkles size={16} />
      </button>
    </div>
  );
}

function WizardStep2({ concept, generating, error, onRetryPage, onRetryAll, retryingPages, retryingAll }) {
  if (generating) {
    return (
      <div className="wizard-content wizard-center">
        <div className="wizard-spinner" />
        <h3>Creating your book concept...</h3>
        <p className="wizard-muted">AI is brainstorming pages, characters, and scenes</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="wizard-content wizard-center">
        <p className="wizard-error">{error}</p>
      </div>
    );
  }
  if (!concept) return null;

  return (
    <div className="wizard-content">
      <div className="concept-preview">
        <div className="concept-header">
          <h2 className="concept-title">{concept.title}</h2>
          {concept.tagLine && <p className="concept-tagline">{concept.tagLine}</p>}
          {concept.concept && <p className="concept-desc">{concept.concept}</p>}
        </div>
        <div className="concept-pages">
          <h4 className="concept-pages-title">
            <Layers size={16} />
            {concept.pages?.length || 0} Pages
          </h4>
          <div className="concept-page-list">
            {(concept.pages || []).map((p, i) => (
              <div key={i} className="concept-page-item">
                <span className="concept-page-num">{i + 1}</span>
                <div className="concept-page-content">
                  <p className="concept-page-title">{p.title}</p>
                  <p className="concept-page-scene">{p.scene || p.prompt}</p>
                </div>
                <button
                  className="concept-page-retry"
                  onClick={() => onRetryPage(i)}
                  disabled={retryingPages?.[i] || retryingAll}
                  title="Regenerate this page"
                >
                  <RefreshCw size={14} className={retryingPages?.[i] ? 'spin' : ''} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="btn ghost concept-retry-all"
            onClick={onRetryAll}
            disabled={retryingAll || generating}
          >
            <RefreshCw size={14} className={retryingAll ? 'spin' : ''} />
            {retryingAll ? 'Regenerating...' : 'Regenerate All Pages'}
          </button>
        </div>
      </div>
    </div>
  );
}

function WizardStep3({ saving, saved, error }) {
  if (saving) {
    return (
      <div className="wizard-content wizard-center">
        <div className="wizard-spinner" />
        <h3>Saving to your library...</h3>
      </div>
    );
  }
  if (saved) {
    return (
      <div className="wizard-content wizard-center">
        <div className="wizard-success-icon">
          <Check size={32} />
        </div>
        <h3>Book saved!</h3>
        <p className="wizard-muted">You can now start generating coloring pages</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="wizard-content wizard-center">
        <p className="wizard-error">{error}</p>
      </div>
    );
  }
  return null;
}

function Wizard({ onBookCreated }) {
  const [step, setStep] = useState(1);
  const [theme, setTheme] = useState('');
  const [customTheme, setCustomTheme] = useState('');
  const [audience, setAudience] = useState('kids');
  const [pageCount, setPageCount] = useState(20);
  const [concept, setConcept] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const effectiveTheme = theme || customTheme.trim();

  const handleGenerate = async () => {
    setStep(2);
    setGenerating(true);
    setError(null);
    try {
      const res = await apiFetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: effectiveTheme, length: pageCount, audience }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to generate concept');
      setConcept(data.idea || data);
    } catch (e) {
      setError(e.message);
    }
    setGenerating(false);
  };

  const handleSave = async () => {
    if (!concept) return;
    setStep(3);
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(concept),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save book');
      setSaved(true);
      setTimeout(() => {
        onBookCreated(data.book?.id?.toString() || data.id?.toString());
      }, 1200);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (step === 2 && !generating) {
      setStep(1);
      setConcept(null);
      setError(null);
    }
  };

  const [retryingPages, setRetryingPages] = useState({});
  const [retryingAll, setRetryingAll] = useState(false);

  const handleRetryPage = async (pageIndex) => {
    if (!concept) return;
    setRetryingPages(prev => ({ ...prev, [pageIndex]: true }));
    try {
      const res = await apiFetch('/api/ideas/page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: effectiveTheme,
          audience,
          pageIndex,
          bookTitle: concept.title,
          concept: concept.concept,
          existingPages: concept.pages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to regenerate page');
      setConcept(prev => ({
        ...prev,
        pages: prev.pages.map((p, i) => i === pageIndex ? data.page : p),
      }));
    } catch (e) {
      setError(e.message);
    }
    setRetryingPages(prev => ({ ...prev, [pageIndex]: false }));
  };

  const handleRetryAll = async () => {
    setRetryingAll(true);
    setError(null);
    try {
      const res = await apiFetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: effectiveTheme, length: pageCount, audience }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to regenerate');
      const newIdea = data.idea || data;
      setConcept(prev => ({
        ...prev,
        pages: newIdea.pages || prev.pages,
      }));
    } catch (e) {
      setError(e.message);
    }
    setRetryingAll(false);
  };

  const steps = [
    { num: 1, label: 'Theme' },
    { num: 2, label: 'Concept' },
    { num: 3, label: 'Save' },
  ];

  return (
    <div className="wizard-overlay">
      <div className="wizard-card">
        <div className="wizard-top">
          <div className="wizard-brand">
            <BookOpen size={24} />
            <span>Coloring Book Studio</span>
          </div>
          <h2 className="wizard-heading">Create a New Book</h2>
          <p className="wizard-sub">
            Let AI help you design a beautiful coloring book in seconds
          </p>
        </div>

        <div className="wizard-steps">
          {steps.map(s => (
            <div
              key={s.num}
              className={`wizard-step-dot ${step >= s.num ? 'is-active' : ''} ${step > s.num ? 'is-done' : ''}`}
            >
              <span className="wizard-step-num">
                {step > s.num ? <Check size={14} /> : s.num}
              </span>
              <span className="wizard-step-label">{s.label}</span>
            </div>
          ))}
        </div>

        {step === 1 && (
          <WizardStep1
            theme={theme}
            setTheme={setTheme}
            audience={audience}
            setAudience={setAudience}
            customTheme={customTheme}
            setCustomTheme={setCustomTheme}
            pageCount={pageCount}
            setPageCount={setPageCount}
            onNext={handleGenerate}
          />
        )}
        {step === 2 && (
          <WizardStep2
            concept={concept}
            generating={generating}
            error={error}
            onRetryPage={handleRetryPage}
            onRetryAll={handleRetryAll}
            retryingPages={retryingPages}
            retryingAll={retryingAll}
          />
        )}
        {step === 3 && <WizardStep3 saving={saving} saved={saved} error={error} />}

        {step === 2 && !generating && concept && (
          <div className="wizard-footer">
            <button className="btn ghost" onClick={handleBack}>
              <ArrowLeft size={16} />
              Back
            </button>
            <button className="btn primary" onClick={handleSave}>
              Save to Library
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        {step === 2 && error && (
          <div className="wizard-footer">
            <button className="btn ghost" onClick={handleBack}>
              <ArrowLeft size={16} />
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Top Bar ---------- */

function TopBar({ books, activeId, setActiveId, user, signOut, onNewBook, onDeleteBook, theme, toggleTheme, chatOpen, toggleChat }) {
  const [showLibrary, setShowLibrary] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const activeBook = books.find(b => `${b.id}` === `${activeId}`) ?? null;

  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="topbar__brand">
          <BookOpen size={20} />
          <span className="topbar__name">Coloring Book Studio</span>
        </div>
        {activeBook && (
          <div className="topbar__active">
            <span className="topbar__divider">/</span>
            <span className="topbar__book-title">{activeBook.title}</span>
          </div>
        )}
      </div>

      <div className="topbar__right">
        <button
          className="btn topbar-btn"
          onClick={onNewBook}
          title="New book"
        >
          <Plus size={16} />
          <span className="topbar-btn__label">New Book</span>
        </button>

        <div className="topbar__library-wrap">
          <button
            className="btn topbar-btn"
            onClick={() => setShowLibrary(!showLibrary)}
          >
            <Library size={16} />
            <span className="topbar-btn__label">Library ({books.length})</span>
          </button>
          {showLibrary && (
            <>
              <div className="library-backdrop" onClick={() => setShowLibrary(false)} />
              <div className="library-dropdown">
                <div className="library-dropdown__title">Your Books</div>
                {books.length === 0 && (
                  <div className="library-dropdown__empty">No books yet</div>
                )}
                {books.map(book => (
                  <div key={book.id} className="library-item-wrap">
                    <button
                      className={`library-item ${`${activeId}` === `${book.id}` ? 'is-active' : ''}`}
                      onClick={() => { setActiveId(book.id); setShowLibrary(false); }}
                    >
                      <BookOpen size={14} />
                      <span>{book.title}</span>
                    </button>
                    {confirmDeleteId === book.id ? (
                      <div className="library-item__confirm">
                        <button className="btn-tiny danger" onClick={() => { onDeleteBook(book.id); setConfirmDeleteId(null); }}>Delete</button>
                        <button className="btn-tiny" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button
                        className="library-item__delete"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(book.id); }}
                        title="Delete book"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          className={`btn topbar-btn ${chatOpen ? 'is-active' : ''}`}
          onClick={toggleChat}
          title={chatOpen ? 'Close chat' : 'Open chat'}
        >
          <MessageSquare size={16} />
          <span className="topbar-btn__label">Chat</span>
        </button>

        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>

        <div className="topbar__user">
          <span className="topbar__email">{user?.signInDetails?.loginId || 'user'}</span>
          <button className="btn topbar-btn icon-only" onClick={signOut} title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

/* ---------- App ---------- */

export default function App({ signOut, user }) {
  const [books, setBooks] = useState([]);
  const [activeId, setActiveId] = useState(() => readHash());
  const [bookData, setBookData] = useState(null);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [, setLoadingBook] = useState(false);
  const [error, setError] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Theme: light as default (kids' coloring book tool)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('cbs-theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cbs-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

  const preparedPages = useMemo(
    () =>
      (bookData?.pages || []).map((p, idx) => ({
        ...p,
        title: p.title || `Page ${p.id ?? idx + 1}`,
        scene: p.scene || p.prompt || '',
        prompt: p.prompt || p.scene || '',
        caption: p.caption || '',
        notes: p.notes || '',
        characterStyle:
          p.character_style || p.characterStyle || bookData?.concept || '',
        includeCharacterGuide: true,
      })),
    [bookData]
  );

  const fetchBooks = async () => {
    setLoadingBooks(true);
    setError(null);
    try {
      const res = await apiFetch('/api/books');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load books');
      setBooks(data.books || []);
      if (!activeId && data.books?.length) {
        setActiveId(data.books[0].id?.toString());
      }
    } catch (e) {
      setError(e.message);
    }
    setLoadingBooks(false);
  };

  const fetchBook = async id => {
    if (!id) return;
    setLoadingBook(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/books/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load book');
      setBookData(data.book || null);
    } catch (e) {
      setError(e.message);
      setBookData(null);
    }
    setLoadingBook(false);
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const next = readHash();
      if (next) setActiveId(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [books]);

  useEffect(() => {
    if (activeId) writeHash(activeId);
  }, [activeId]);

  useEffect(() => {
    if (activeId) fetchBook(activeId);
  }, [activeId]);

  const activeBook = books.find(b => `${b.id}` === `${activeId}`) ?? null;

  const handleBookCreated = (newId) => {
    setShowWizard(false);
    if (newId) setActiveId(newId);
    fetchBooks();
  };

  const handleDeleteBook = async (bookId) => {
    try {
      const res = await apiFetch(`/api/books/${bookId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await res.json();
        throw new Error(data?.error || 'Failed to delete book');
      }
      setBooks(prev => prev.filter(b => `${b.id}` !== `${bookId}`));
      if (`${activeId}` === `${bookId}`) {
        const remaining = books.filter(b => `${b.id}` !== `${bookId}`);
        setActiveId(remaining[0]?.id?.toString() || null);
        setBookData(null);
      }
    } catch (e) {
      setError(e.message);
    }
  };

  // Show wizard if no books and done loading
  const shouldShowWizard = showWizard || (!loadingBooks && books.length === 0 && !error);

  return (
    <div className="app-shell">
      <TopBar
        books={books}
        activeId={activeId}
        setActiveId={setActiveId}
        user={user}
        signOut={signOut}
        onNewBook={() => setShowWizard(true)}
        onDeleteBook={handleDeleteBook}
        theme={theme}
        toggleTheme={toggleTheme}
        chatOpen={chatOpen}
        toggleChat={() => setChatOpen(o => !o)}
      />

      {shouldShowWizard && (
        <Wizard onBookCreated={handleBookCreated} />
      )}

      <div className="app-body">
        {error && <div className="app-error">{error}</div>}

        {loadingBooks && (
          <div className="app-loading">
            <div className="wizard-spinner" />
            <p>Loading your library...</p>
          </div>
        )}

        {!loadingBooks && !activeBook && !error && !shouldShowWizard && (
          <div className="app-empty">
            <BookOpen size={48} strokeWidth={1} />
            <h2>No book selected</h2>
            <p>Pick a book from the library or create a new one</p>
            <button className="btn primary" onClick={() => setShowWizard(true)}>
              <Plus size={16} />
              Create New Book
            </button>
          </div>
        )}

        {activeBook && !error && (
          <>
            <div className="workspace">
              <div className="workspace__viewer">
                <BookViewer
                  bookId={bookData?.id || activeBook.id}
                  coverUrl={bookData?.cover_url || ''}
                  characterGuide={bookData?.concept || ''}
                  storyPages={preparedPages}
                  bookTitle={bookData?.title || activeBook.title}
                  tagLine={bookData?.tagLine || ''}
                  bookNotes={bookData?.notes || ''}
                  onPagesChanged={() => fetchBook(activeId)}
                />
              </div>
            </div>

            {chatOpen && (
              <div className="flyout-backdrop" onClick={() => setChatOpen(false)} />
            )}
            <div className={`chat-flyout ${chatOpen ? 'is-open' : ''}`}>
              <div className="chat-flyout__header">
                <span className="chat-flyout__title">Chat</span>
                <button className="btn topbar-btn icon-only" onClick={() => setChatOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              <ChatPanel
                bookContext={
                  bookData
                    ? {
                        title: bookData.title,
                        concept: bookData.concept,
                        pages: preparedPages.map(p => ({
                          title: p.title,
                          scene: p.scene,
                        })),
                      }
                    : null
                }
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
