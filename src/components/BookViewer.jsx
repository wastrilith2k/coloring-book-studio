import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import ImageGenerator from './ImageGenerator.jsx';
import { apiFetch } from '../lib/api.js';

const STYLE_HINT = 'White background, thick clean lines, coloring book.';

const parseJsonSafe = async res => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      const match = text.match(/<pre>([^<]+)<\/pre>/i);
      return { error: match ? match[1] : `Server error (${res.status})` };
    }
    return { error: text || 'Unexpected response' };
  }
};

export default function BookViewer({
  bookId = null,
  coverUrl = '',
  characterGuide = '',
  storyPages = [],
  bookTitle = 'Book',
  tagLine = '',
}) {
  const pages = useMemo(
    () => (storyPages && storyPages.length ? storyPages : []),
    [storyPages]
  );

  const coverPromptTemplate = useMemo(() => {
    const titleText = bookTitle
      ? `Cover illustration for "${bookTitle}"`
      : 'Cover illustration for the book';
    const parts = [titleText];
    if (tagLine) parts.push(tagLine);
    parts.push(
      'White background, clean bold lines, coloring book cover, room for title text at top'
    );
    return parts.join('. ');
  }, [bookTitle, tagLine]);

  const coverPage = useMemo(
    () => ({
      id: 'cover',
      title: 'Cover',
      scene: 'Front cover illustration',
      includeCharacterGuide: false,
      isCover: true,
      image_url: coverUrl,
    }),
    [coverUrl]
  );

  const navPages = useMemo(() => [coverPage, ...pages], [coverPage, pages]);

  const [activePage, setActivePage] = useState(() => navPages[0] ?? null);
  const [pageState, setPageState] = useState({});
  const [imageError, setImageError] = useState('');
  const [styleError, setStyleError] = useState('');
  const [promptError, setPromptError] = useState('');
  const [pageStyles, setPageStyles] = useState({});
  const [pagePrompts, setPagePrompts] = useState({});
  const [bundleError, setBundleError] = useState('');
  const [bundleLoading, setBundleLoading] = useState(false);
  const [coverPromptVisible, setCoverPromptVisible] = useState(false);
  const [coverPrompt, setCoverPrompt] = useState(coverPromptTemplate);

  useEffect(() => {
    const initialStyles = {};
    const initialPrompts = {};
    pages.forEach(p => {
      initialStyles[p.id] = p.characterStyle ?? characterGuide ?? '';
      initialPrompts[p.id] = p.prompt || p.scene || '';
    });
    setPageStyles(initialStyles);
    setPagePrompts(initialPrompts);
    setActivePage(navPages[0] ?? null);
    setPageState({});
    setStyleError('');
    setPromptError('');
    setBundleError('');
    setBundleLoading(false);
    setCoverPromptVisible(false);
    setCoverPrompt(coverPromptTemplate);
  }, [pages, navPages, characterGuide, coverPromptTemplate]);

  const buildPrompt = page => {
    if (!page) return '';
    const parts = [];
    const styleText = pageStyles[page.id] ?? '';
    const scenePrompt = pagePrompts[page.id] ?? '';
    if (styleText && page.includeCharacterGuide !== false)
      parts.push(styleText);
    if (scenePrompt) parts.push(scenePrompt);
    parts.push(STYLE_HINT);
    return parts.join(' ');
  };

  const isCover = Boolean(activePage?.isCover);
  const prompt = isCover ? coverPrompt : buildPrompt(activePage);
  const hasStoryPages = pages.length > 0;
  const hasSelection = Boolean(activePage);

  const updatePageState = (pageId, updater) => {
    setPageState(prev => ({
      ...prev,
      [pageId]: {
        attempts: [],
        selectedId: null,
        preview: null,
        loading: false,
        saving: false,
        styleSaving: false,
        promptSaving: false,
        ...prev[pageId],
        ...updater(prev[pageId] || {}),
      },
    }));
  };

  const currentState = activePage ? pageState[activePage.id] || {} : {};
  const currentAttempts = currentState.attempts || [];
  const selectedAttempt = currentAttempts.find(
    a => a.id === currentState.selectedId
  );
  const currentImage =
    currentState.preview ||
    selectedAttempt?.url ||
    currentAttempts[0]?.url ||
    (isCover ? coverUrl : null);
  const currentStyle =
    activePage && !isCover ? pageStyles[activePage.id] ?? '' : '';
  const currentPrompt =
    activePage && !isCover ? pagePrompts[activePage.id] ?? '' : '';

  const approvedUrlForPage = page => {
    const state = pageState[page.id] || {};
    const approvedAttempt = (state.attempts || []).find(a => a.approved);
    if (approvedAttempt?.url) return approvedAttempt.url;
    if (page.isCover) return page.image_url || '';
    return page.image_url || null;
  };

  const approvalItems = useMemo(
    () => [...pages, coverPage],
    [pages, coverPage]
  );

  const { approvedCount, allApproved } = useMemo(() => {
    const count = approvalItems.reduce(
      (acc, page) => (approvedUrlForPage(page) ? acc + 1 : acc),
      0
    );
    const total = approvalItems.length;
    return {
      approvedCount: count,
      allApproved: total > 0 && count === total && hasStoryPages,
    };
  }, [approvalItems, pageState, hasStoryPages]);

  const canDownloadBundle = Boolean(bookId && allApproved);

  const loadImages = async page => {
    if (!page) return;
    if (page.isCover && !bookId) return;
    updatePageState(page.id, () => ({ loading: true }));
    setImageError('');
    try {
      const res = page.isCover
        ? await apiFetch(`/api/books/${bookId}/cover/images`)
        : await apiFetch(`/api/pages/${page.id}/images`);
      const data = await parseJsonSafe(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to load images');
      const attempts = (data.images || []).map(a => ({
        ...a,
        approved: !!a.approved,
      }));
      const approved = attempts.find(a => a.approved);
      const selectedId = approved?.id || attempts[0]?.id || null;
      updatePageState(page.id, () => ({
        attempts,
        selectedId,
        loading: false,
      }));
    } catch (e) {
      setImageError(e.message);
      updatePageState(page.id, () => ({ loading: false }));
    }
  };

  useEffect(() => {
    if (activePage) loadImages(activePage);
  }, [activePage]);

  const saveCharacterStyle = async value => {
    if (!activePage || activePage.isCover) return;
    setStyleError('');
    updatePageState(activePage.id, () => ({ styleSaving: true }));
    try {
      const res = await apiFetch(`/api/pages/${activePage.id}`, {
        method: 'PUT',
        body: JSON.stringify({ characterStyle: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed');
      updatePageState(activePage.id, () => ({ styleSaving: false }));
    } catch (e) {
      setStyleError(e.message);
      updatePageState(activePage.id, () => ({ styleSaving: false }));
    }
  };

  const handleStyleChange = e => {
    const value = e.target.value;
    setStyleError('');
    if (!activePage || activePage.isCover) return;
    setPageStyles(prev => ({ ...prev, [activePage.id]: value }));
  };

  const handleStyleBlur = () => {
    if (!activePage || activePage.isCover) return;
    const value = pageStyles[activePage.id] ?? '';
    saveCharacterStyle(value);
  };

  const savePrompt = async value => {
    if (!activePage || activePage.isCover) return;
    setPromptError('');
    updatePageState(activePage.id, () => ({ promptSaving: true }));
    try {
      const res = await apiFetch(`/api/pages/${activePage.id}`, {
        method: 'PUT',
        body: JSON.stringify({ prompt: value, scene: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed');
      updatePageState(activePage.id, () => ({ promptSaving: false }));
    } catch (e) {
      setPromptError(e.message);
      updatePageState(activePage.id, () => ({ promptSaving: false }));
    }
  };

  const handlePromptChange = e => {
    const value = e.target.value;
    setPromptError('');
    if (!activePage || activePage.isCover) return;
    setPagePrompts(prev => ({ ...prev, [activePage.id]: value }));
  };

  const handlePromptBlur = () => {
    if (!activePage || activePage.isCover) return;
    const value = pagePrompts[activePage.id] ?? '';
    savePrompt(value);
  };

  const handleCoverPromptChange = e => {
    setCoverPrompt(e.target.value);
  };

  const clearImage = () => {
    if (!activePage) return;
    updatePageState(activePage.id, () => ({ preview: null }));
  };

  const saveGeneratedImage = async dataUrl => {
    if (!activePage) return;
    if (activePage.isCover && !bookId) return;
    setImageError('');
    updatePageState(activePage.id, () => ({ preview: dataUrl, saving: true }));
    try {
      const res = activePage.isCover
        ? await apiFetch(`/api/books/${bookId}/cover/images`, {
            method: 'POST',
            body: JSON.stringify({ dataUrl }),
          })
        : await apiFetch(`/api/pages/${activePage.id}/images`, {
            method: 'POST',
            body: JSON.stringify({ dataUrl }),
          });
      const data = await parseJsonSafe(res);
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      const attempt = { ...data.image, approved: !!data.image?.approved };
      updatePageState(activePage.id, prev => ({
        attempts: [attempt, ...(prev.attempts || [])],
        selectedId: attempt.id,
        preview: null,
        saving: false,
      }));
    } catch (e) {
      setImageError(e.message);
      updatePageState(activePage.id, () => ({ saving: false }));
    }
  };

  const toggleApprove = async (attemptId, approved) => {
    if (!activePage) return;
    if (activePage.isCover && !bookId) return;
    setImageError('');
    try {
      const res = activePage.isCover
        ? await apiFetch(
            `/api/books/${bookId}/cover/images/${attemptId}/approve`,
            {
              method: 'POST',
              body: JSON.stringify({ approved }),
            }
          )
        : await apiFetch(
            `/api/pages/${activePage.id}/images/${attemptId}/approve`,
            {
              method: 'POST',
              body: JSON.stringify({ approved }),
            }
          );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Approve failed');
      const updated = { ...data.image, approved: !!data.image?.approved };
      updatePageState(activePage.id, prev => ({
        attempts: (prev.attempts || []).map(a =>
          a.id === updated.id ? { ...a, approved: updated.approved } : a
        ),
        selectedId: updated.id,
      }));
    } catch (e) {
      setImageError(e.message);
    }
  };

  const deleteAttempt = async attemptId => {
    if (!activePage) return;
    if (activePage.isCover && !bookId) return;
    const attempt = (pageState[activePage.id]?.attempts || []).find(
      a => a.id === attemptId
    );
    if (attempt?.approved) return;
    setImageError('');
    try {
      const res = activePage.isCover
        ? await apiFetch(
            `/api/books/${bookId}/cover/images/${attemptId}`,
            { method: 'DELETE' }
          )
        : await apiFetch(
            `/api/pages/${activePage.id}/images/${attemptId}`,
            { method: 'DELETE' }
          );
      if (!res.ok && res.status !== 204) {
        const data = await res.json();
        throw new Error(data?.error || 'Delete failed');
      }
      updatePageState(activePage.id, prev => {
        const remaining = (prev.attempts || []).filter(a => a.id !== attemptId);
        const selectedId =
          prev.selectedId === attemptId
            ? remaining[0]?.id || null
            : prev.selectedId;
        return { attempts: remaining, selectedId };
      });
    } catch (e) {
      setImageError(e.message);
    }
  };

  const downloadApprovedBundle = async () => {
    if (!canDownloadBundle) return;
    setBundleError('');
    setBundleLoading(true);
    try {
      const res = await apiFetch(`/api/books/${bookId}/download`);
      if (!res.ok) {
        let message = 'Download failed';
        try {
          const data = await res.json();
          message = data?.error || message;
        } catch {
          const text = await res.text();
          message = text || message;
        }
        throw new Error(message);
      }

      // Lambda returns JSON with presigned URLs instead of a ZIP stream
      const data = await res.json();
      const files = data.files || [];

      // Download all files and create ZIP client-side
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();

      await Promise.all(files.map(async (file) => {
        const response = await fetch(file.url);
        const blob = await response.blob();
        zip.file(file.name, blob);
      }));

      const blob = await zip.generateAsync({ type: 'blob' });
      const slug = (data.title || 'book').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
      const filename = `${slug}-approved-images.zip`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setCoverPromptVisible(true);
    } catch (err) {
      setBundleError(err.message);
    } finally {
      setBundleLoading(false);
    }
  };

  return (
    <div className="book-viewer">
      <div className="book-viewer__shell">
        <aside className="book-viewer__sidebar">
          <div className="book-viewer__badge">Studio</div>
          <div className="book-viewer__title-row">
            <div>
              <p className="book-viewer__eyebrow">Coloring book flow</p>
              <h1 className="book-viewer__title">{bookTitle}</h1>
              <p className="book-viewer__tagline">{tagLine}</p>
            </div>
            <div
              className={`book-viewer__chip ${hasStoryPages ? 'is-on' : ''}`}
            >
              <span className="dot" />
              {hasStoryPages ? 'Pages ready' : 'No pages'}
            </div>
          </div>

          {bookId && hasStoryPages && (
            <div className="book-viewer__bundle">
              <div>
                <p className="book-viewer__crumb">Approved pages</p>
                <h3>
                  {approvedCount}/{pages.length + 1} ready
                </h3>
                <p className="book-viewer__scene">
                  {allApproved
                    ? 'All pages are approved — download the print bundle.'
                    : 'Approve every page to enable the bundle download.'}
                </p>
              </div>
              <div className="book-viewer__actions">
                <button className="btn ghost" disabled>
                  {approvedCount}/{pages.length + 1} approved
                </button>
                <button
                  className="btn primary"
                  onClick={downloadApprovedBundle}
                  disabled={!canDownloadBundle || bundleLoading}
                >
                  {bundleLoading ? 'Preparing bundle...' : 'Download bundle'}
                </button>
              </div>
            </div>
          )}

          {bundleError && (
            <div className="book-viewer__alert">{bundleError}</div>
          )}

          <div className="book-viewer__list">
            {!navPages.length && (
              <div className="book-viewer__empty">
                Add storyPages to start generating.
              </div>
            )}
            {navPages.map(p => (
              <button
                key={p.id}
                onClick={() => setActivePage(p)}
                className={`book-viewer__item ${
                  activePage?.id === p.id ? 'is-active' : ''
                }`}
              >
                <div>
                  <p className="item__title">{p.title}</p>
                  <p className="item__meta">
                    {p.isCover ? 'Cover' : `Scene #${p.id}`}
                  </p>
                </div>
                {pageState[p.id]?.attempts?.some(a => a.approved) ||
                p.image_url ? (
                  <CheckCircle2 size={18} />
                ) : null}
              </button>
            ))}
          </div>
        </aside>

        <section className="book-viewer__main">
          <div className="book-viewer__header">
            <div>
              <p className="book-viewer__crumb">Workspace > {bookTitle}</p>
              <h2>{activePage?.title ?? 'Select a page'}</h2>
              <p className="book-viewer__scene">
                {activePage?.scene ??
                  'Choose a page to generate an illustration.'}
              </p>
            </div>
          </div>

          {isCover ? (
            <div className="prompt-panel">
              <div className="prompt-field">
                <label htmlFor="cover-text">Cover prompt</label>
                <textarea
                  id="cover-text"
                  value={coverPrompt}
                  onChange={handleCoverPromptChange}
                  placeholder="Describe the cover illustration."
                  rows={3}
                />
                <div className="prompt-hint">
                  Include title placement notes (e.g., "room for title at top").
                </div>
              </div>
            </div>
          ) : (
            <div className="prompt-panel">
              <div className="prompt-field">
                <label htmlFor="character-text">Character / style prompt</label>
                <textarea
                  id="character-text"
                  value={currentStyle}
                  onChange={handleStyleChange}
                  onBlur={handleStyleBlur}
                  placeholder="Describe the character or style (or leave blank)."
                  rows={3}
                />
                {currentState.styleSaving && (
                  <span className="pill subtle">Saving...</span>
                )}
                {styleError && (
                  <div className="book-viewer__alert">{styleError}</div>
                )}
              </div>
              <div className="prompt-field">
                <label htmlFor="scene-text">Scene prompt</label>
                <textarea
                  id="scene-text"
                  value={currentPrompt}
                  onChange={handlePromptChange}
                  onBlur={handlePromptBlur}
                  placeholder="Describe the scene to generate."
                  rows={3}
                />
                {currentState.promptSaving && (
                  <span className="pill subtle">Saving...</span>
                )}
                {promptError && (
                  <div className="book-viewer__alert">{promptError}</div>
                )}
                <div className="prompt-hint">
                  A style hint is auto-added: "{STYLE_HINT}"
                </div>
              </div>
            </div>
          )}

          <ImageGenerator
            prompt={prompt}
            hasSelection={Boolean(prompt)}
            image={currentImage}
            pageId={activePage?.id}
            onImage={url => {
              if (!activePage || !url) return;
              saveGeneratedImage(url);
            }}
            onClear={clearImage}
          />

          {imageError && <div className="book-viewer__alert">{imageError}</div>}

          {coverPromptVisible && !isCover && (
            <div className="book-viewer__callout">
              <p className="book-viewer__crumb">Next step</p>
              <h3>Ready to make the cover?</h3>
              <p className="book-viewer__scene">
                Bundle downloaded. Create a cover illustration that matches the
                approved page style and fits an 8.5x11 trim.
              </p>
              <div className="book-viewer__actions">
                <button
                  className="btn primary"
                  onClick={() => setCoverPromptVisible(false)}
                >
                  Got it
                </button>
              </div>
            </div>
          )}

          {hasSelection && (
            <div className="image-attempts">
              <div className="image-attempts__header">
                <div>
                  <p className="book-viewer__crumb">Saved attempts</p>
                  <h3>
                    {currentAttempts.length
                      ? `${currentAttempts.length} attempt${
                          currentAttempts.length === 1 ? '' : 's'
                        }`
                      : 'No saved images yet'}
                  </h3>
                </div>
                {currentState.saving && (
                  <span className="pill subtle">Uploading...</span>
                )}
              </div>

              {currentAttempts.length > 0 ? (
                <div className="image-attempts__grid">
                  {currentAttempts.map(attempt => (
                    <div
                      key={attempt.id}
                      className={`image-attempts__item ${
                        attempt.id === currentState.selectedId
                          ? 'is-active'
                          : ''
                      }`}
                    >
                      <button
                        className="image-attempts__thumb"
                        onClick={() =>
                          updatePageState(activePage.id, () => ({
                            selectedId: attempt.id,
                            preview: null,
                          }))
                        }
                      >
                        <img
                          src={attempt.url}
                          alt={`Attempt ${attempt.attempt_number}`}
                        />
                      </button>
                      <div className="image-attempts__meta">
                        <span className="pill subtle">
                          Try {attempt.attempt_number}
                        </span>
                        {attempt.approved ? (
                          <span className="pill good">Approved</span>
                        ) : (
                          <span className="pill muted">Draft</span>
                        )}
                      </div>
                      <div className="image-attempts__actions">
                        <button
                          className="btn ghost"
                          onClick={() =>
                            toggleApprove(attempt.id, !attempt.approved)
                          }
                        >
                          {attempt.approved ? 'Unapprove' : 'Approve'}
                        </button>
                        <button
                          className="btn ghost"
                          onClick={() => deleteAttempt(attempt.id)}
                          disabled={attempt.approved}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="book-viewer__empty">
                  Generate to save attempts here.
                </div>
              )}
            </div>
          )}

          <footer className="book-viewer__footer">
            <span>Ready for KDP 8.5x11</span>
            {currentImage && (
              <span className="good">Illustration finished</span>
            )}
          </footer>
        </section>
      </div>
    </div>
  );
}
