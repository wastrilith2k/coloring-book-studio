import { useEffect, useMemo, useState } from 'react';
import BookViewer from './components/BookViewer.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import './App.css';

const HASH_KEY = 'book';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8788';

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

export default function App({ apiKey }) {
  const [books, setBooks] = useState([]);
  const [activeId, setActiveId] = useState(() => readHash());
  const [bookData, setBookData] = useState(null);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [, setLoadingBook] = useState(false);
  const [error, setError] = useState(null);

  const preparedPages = useMemo(
    () =>
      (bookData?.pages || []).map((p, idx) => ({
        ...p,
        title: p.title || `Page ${p.id ?? idx + 1}`,
        scene: p.scene || p.prompt || '',
        prompt: p.prompt || p.scene || '',
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
      const res = await fetch(`${API_BASE}/api/books`);
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
      const res = await fetch(`${API_BASE}/api/books/${id}`);
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

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar__header">
          <div>
            <p className="eyebrow">Coloring Book Studio</p>
            <h1>Book Launcher</h1>
            <p className="helper">
              Books load from the SQLite API; use the chat generator to add
              more.
            </p>
          </div>
          <span className="pill">
            {books.length ? `${books.length} loaded` : 'No books yet'}
          </span>
        </div>

        <div className="book-switcher">
          <label htmlFor="book-select">Book</label>
          <div className="book-select">
            <select
              id="book-select"
              value={activeId ?? ''}
              onChange={e => setActiveId(e.target.value)}
              disabled={!books.length}
            >
              {books.length === 0 && <option value="">No books found</option>}
              {books.map(book => (
                <option key={book.id} value={book.id}>
                  {book.title}
                </option>
              ))}
            </select>
            <span className="book-select__chevron" aria-hidden="true">
              v
            </span>
          </div>
          {activeBook && (
            <div className="book-switcher__meta">
              <span className="pill subtle">{activeBook.title}</span>
              <span className="muted">Book #{activeBook.id}</span>
            </div>
          )}
        </div>

        {books.length === 0 && (
          <div className="empty-state">
            No books yet — generate in chat and save, or run the seed script.
          </div>
        )}

        {books.length > 1 && (
          <div className="book-chips" role="list">
            {books.map(book => (
              <button
                key={book.id}
                className={`book-chip ${
                  `${activeId}` === `${book.id}` ? 'is-active' : ''
                }`}
                onClick={() => setActiveId(book.id)}
                role="listitem"
              >
                <span>{book.title}</span>
                <small>#{book.id}</small>
              </button>
            ))}
          </div>
        )}
      </aside>

      <main className="viewer">
        <div className="workspace-grid">
          <div className="workspace-main">
            {error && <div className="empty-state">{error}</div>}
            {loadingBooks && (
              <div className="empty-state">Loading library…</div>
            )}
            {!loadingBooks && !activeBook && !error && (
              <div className="empty-state">No book selected.</div>
            )}
            {activeBook && !error && (
              <BookViewer
                apiKey={apiKey}
                apiBase={API_BASE}
                bookId={bookData?.id || activeBook.id}
                characterGuide={bookData?.concept || ''}
                storyPages={preparedPages}
                bookTitle={bookData?.title || activeBook.title}
                tagLine={bookData?.tagLine || ''}
              />
            )}
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
      </main>
    </div>
  );
}
