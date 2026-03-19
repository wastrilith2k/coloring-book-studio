import { useEffect, useMemo, useState } from 'react';
import { StickyNote } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import PageList from './PageList.jsx';
import ImageCarousel from './ImageCarousel.jsx';
import PromptPanel from './PromptPanel.jsx';
import BundleConfirmModal from './BundleConfirmModal.jsx';

const STYLE_HINT = 'Black and white UNCOLORED coloring book page. Thick clean outlines only, no shading, no filled colors, no gradients. Pure white background. Leave all areas blank for a child to color in.';

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
  bookNotes: initialBookNotes = '',
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
    parts.push('White background, clean bold lines, coloring book cover, room for title text at top');
    return parts.join('. ');
  }, [bookTitle, tagLine]);

  const coverPage = useMemo(
    () => ({ id: 'cover', title: 'Cover', scene: 'Front cover illustration', includeCharacterGuide: false, isCover: true, image_url: coverUrl }),
    [coverUrl]
  );

  const navPages = useMemo(() => [coverPage, ...pages], [coverPage, pages]);

  // --- State ---
  const [activePage, setActivePage] = useState(() => navPages[0] ?? null);
  const [pageState, setPageState] = useState({});
  const [imageError, setImageError] = useState('');
  const [styleError, setStyleError] = useState('');
  const [promptError, setPromptError] = useState('');
  const [pageStyles, setPageStyles] = useState({});
  const [pagePrompts, setPagePrompts] = useState({});
  const [pageCaptions, setPageCaptions] = useState({});
  const [pageNotes, setPageNotes] = useState({});
  const [bookNotes, setBookNotes] = useState(initialBookNotes);
  const [bundleError, setBundleError] = useState('');
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleConfirm, setBundleConfirm] = useState(false);
  const [coverPrompt, setCoverPrompt] = useState(coverPromptTemplate);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);

  // --- Init on book change ---
  useEffect(() => {
    const s = {}, pr = {}, c = {}, n = {};
    pages.forEach(p => {
      s[p.id] = p.characterStyle ?? characterGuide ?? '';
      pr[p.id] = p.prompt || p.scene || '';
      c[p.id] = p.caption || '';
      n[p.id] = p.notes || '';
    });
    setPageStyles(s);
    setPagePrompts(pr);
    setPageCaptions(c);
    setPageNotes(n);
    setBookNotes(initialBookNotes);
    setActivePage(navPages[0] ?? null);
    setPageState({});
    setStyleError('');
    setPromptError('');
    setBundleError('');
    setBundleLoading(false);
    setBundleConfirm(false);
    setCoverPrompt(coverPromptTemplate);
    setCarouselIdx(0);
    setGenerating(false);
    setGenError(null);
  }, [pages, navPages, characterGuide, coverPromptTemplate, initialBookNotes]);

  // --- Derived ---
  const isCover = Boolean(activePage?.isCover);
  const buildPrompt = page => {
    if (!page) return '';
    const parts = [];
    const styleText = pageStyles[page.id] ?? '';
    const scenePrompt = pagePrompts[page.id] ?? '';
    if (styleText && page.includeCharacterGuide !== false) parts.push(styleText);
    if (scenePrompt) parts.push(scenePrompt);
    parts.push(STYLE_HINT);
    return parts.join(' ');
  };
  const prompt = isCover ? coverPrompt : buildPrompt(activePage);
  const hasStoryPages = pages.length > 0;

  const updatePageState = (pageId, updater) => {
    setPageState(prev => ({
      ...prev,
      [pageId]: { attempts: [], selectedId: null, preview: null, loading: false, saving: false, styleSaving: false, promptSaving: false, ...prev[pageId], ...updater(prev[pageId] || {}) },
    }));
  };

  const currentState = activePage ? pageState[activePage.id] || {} : {};
  const currentAttempts = currentState.attempts || [];

  const approvedUrlForPage = page => {
    const state = pageState[page.id] || {};
    const approved = (state.attempts || []).find(a => a.approved);
    if (approved?.url) return approved.url;
    if (page.isCover) return page.image_url || '';
    return page.image_url || null;
  };

  const approvalItems = useMemo(() => [...pages, coverPage], [pages, coverPage]);
  const { approvedCount, allApproved } = useMemo(() => {
    const count = approvalItems.reduce((acc, p) => (approvedUrlForPage(p) ? acc + 1 : acc), 0);
    const total = approvalItems.length;
    return { approvedCount: count, allApproved: total > 0 && count === total && hasStoryPages };
  }, [approvalItems, pageState, hasStoryPages]);
  const canDownloadBundle = Boolean(bookId && allApproved);

  // --- Load images for active page ---
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
      const attempts = (data.images || []).map(a => ({ ...a, approved: !!a.approved }));
      const approved = attempts.find(a => a.approved);
      updatePageState(page.id, () => ({ attempts, selectedId: approved?.id || attempts[0]?.id || null, loading: false }));
      const reversed = [...attempts].reverse();
      const idx = approved ? reversed.findIndex(a => a.id === approved.id) : 0;
      setCarouselIdx(idx >= 0 ? idx : 0);
    } catch (e) {
      setImageError(e.message);
      updatePageState(page.id, () => ({ loading: false }));
    }
  };

  useEffect(() => {
    if (activePage) { loadImages(activePage); setCarouselIdx(0); }
  }, [activePage]);

  // --- Save handlers ---
  const saveField = async (field, value, body) => {
    if (!activePage || activePage.isCover) return;
    const savingKey = `${field}Saving`;
    updatePageState(activePage.id, () => ({ [savingKey]: true }));
    try {
      const res = await apiFetch(`/api/pages/${activePage.id}`, { method: 'PUT', body: JSON.stringify(body || { [field]: value }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed');
    } catch (e) {
      if (field === 'style') setStyleError(e.message);
      else if (field === 'prompt') setPromptError(e.message);
    }
    updatePageState(activePage.id, () => ({ [savingKey]: false }));
  };

  const handleStyleChange = e => { setStyleError(''); if (activePage && !isCover) setPageStyles(p => ({ ...p, [activePage.id]: e.target.value })); };
  const handleStyleBlur = () => { if (activePage && !isCover) saveField('style', pageStyles[activePage.id] ?? '', { characterStyle: pageStyles[activePage.id] ?? '' }); };
  const handlePromptChange = e => { setPromptError(''); if (activePage && !isCover) setPagePrompts(p => ({ ...p, [activePage.id]: e.target.value })); };
  const handlePromptBlur = () => { if (activePage && !isCover) { const v = pagePrompts[activePage.id] ?? ''; saveField('prompt', v, { prompt: v, scene: v }); } };
  const handleCaptionChange = e => { if (activePage && !isCover) setPageCaptions(p => ({ ...p, [activePage.id]: e.target.value })); };
  const handleCaptionBlur = () => { if (activePage && !isCover) saveField('caption', pageCaptions[activePage.id] ?? ''); };
  const handlePageNotesChange = e => { if (activePage && !isCover) setPageNotes(p => ({ ...p, [activePage.id]: e.target.value })); };
  const handlePageNotesBlur = () => { if (activePage && !isCover) saveField('notes', pageNotes[activePage.id] ?? ''); };

  const saveBookNotes = async value => { if (!bookId) return; try { await apiFetch(`/api/books/${bookId}`, { method: 'PUT', body: JSON.stringify({ notes: value }) }); } catch { /* silent */ } };
  const handleBookNotesChange = e => setBookNotes(e.target.value);
  const handleBookNotesBlur = () => saveBookNotes(bookNotes);
  const handleCoverPromptChange = e => setCoverPrompt(e.target.value);

  // --- Image generation ---
  const generateImage = async () => {
    if (!prompt || !activePage) return;
    setGenerating(true);
    setGenError(null);
    const attempt = async (retry = 0) => {
      try {
        const res = await apiFetch('/api/generate-image', { method: 'POST', body: JSON.stringify({ prompt }) });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Status ${res.status}`); }
        const data = await res.json();
        if (!data.dataUrl) throw new Error('No image returned');
        await saveGeneratedImage(data.dataUrl);
      } catch (e) {
        if (retry < 3) return attempt(retry + 1);
        setGenError(`Generation failed. Please try again. ${e}`);
      }
    };
    await attempt();
    setGenerating(false);
  };

  const saveGeneratedImage = async dataUrl => {
    if (!activePage || (activePage.isCover && !bookId)) return;
    setImageError('');
    updatePageState(activePage.id, () => ({ preview: dataUrl, saving: true }));
    setCarouselIdx([...currentAttempts].length);
    try {
      const res = activePage.isCover
        ? await apiFetch(`/api/books/${bookId}/cover/images`, { method: 'POST', body: JSON.stringify({ dataUrl }) })
        : await apiFetch(`/api/pages/${activePage.id}/images`, { method: 'POST', body: JSON.stringify({ dataUrl }) });
      const data = await parseJsonSafe(res);
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      const newAttempt = { ...data.image, approved: !!data.image?.approved };
      updatePageState(activePage.id, prev => ({ attempts: [newAttempt, ...(prev.attempts || [])], selectedId: newAttempt.id, preview: null, saving: false }));
      setCarouselIdx(currentAttempts.length);
    } catch (e) {
      setImageError(e.message);
      updatePageState(activePage.id, () => ({ saving: false }));
    }
  };

  const toggleApprove = async (attemptId, approved) => {
    if (!activePage || (activePage.isCover && !bookId)) return;
    setImageError('');
    try {
      const res = activePage.isCover
        ? await apiFetch(`/api/books/${bookId}/cover/images/${attemptId}/approve`, { method: 'POST', body: JSON.stringify({ approved }) })
        : await apiFetch(`/api/pages/${activePage.id}/images/${attemptId}/approve`, { method: 'POST', body: JSON.stringify({ approved }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed');
      const updated = { ...data.image, approved: !!data.image?.approved };
      updatePageState(activePage.id, prev => ({ attempts: (prev.attempts || []).map(a => a.id === updated.id ? { ...a, approved: updated.approved } : a), selectedId: updated.id }));
    } catch (e) { setImageError(e.message); }
  };

  const deleteAttempt = async attemptId => {
    if (!activePage || (activePage.isCover && !bookId)) return;
    if ((pageState[activePage.id]?.attempts || []).find(a => a.id === attemptId)?.approved) return;
    setImageError('');
    try {
      const res = activePage.isCover
        ? await apiFetch(`/api/books/${bookId}/cover/images/${attemptId}`, { method: 'DELETE' })
        : await apiFetch(`/api/pages/${activePage.id}/images/${attemptId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) { const d = await res.json(); throw new Error(d?.error || 'Delete failed'); }
      updatePageState(activePage.id, prev => {
        const remaining = (prev.attempts || []).filter(a => a.id !== attemptId);
        return { attempts: remaining, selectedId: prev.selectedId === attemptId ? remaining[0]?.id || null : prev.selectedId };
      });
    } catch (e) { setImageError(e.message); }
  };

  const downloadImage = (url, name) => { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); };

  const downloadApprovedBundle = async () => {
    if (!canDownloadBundle) return;
    setBundleError('');
    setBundleLoading(true);
    try {
      const res = await apiFetch(`/api/books/${bookId}/download`);
      if (!res.ok) { let m = 'Download failed'; try { m = (await res.json())?.error || m; } catch { m = (await res.text()) || m; } throw new Error(m); }
      const data = await res.json();
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      await Promise.all((data.files || []).map(async file => {
        if (file.data) {
          const bin = atob(file.data);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          zip.file(file.name, bytes);
        } else if (file.url) {
          zip.file(file.name, await (await fetch(file.url)).blob());
        }
      }));
      const blob = await zip.generateAsync({ type: 'blob' });
      const slug = (data.title || 'book').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
      downloadImage(URL.createObjectURL(blob), `${slug}-approved-images.zip`);
    } catch (err) { setBundleError(err.message); }
    finally { setBundleLoading(false); setBundleConfirm(false); }
  };

  // --- Render ---
  return (
    <>
      <aside className="book-viewer__sidebar">
        <div className="sidebar__fixed">
          <div className="book-viewer__badge">Studio</div>
          <div className="book-viewer__title-row">
            <div>
              <p className="book-viewer__eyebrow">Coloring book flow</p>
              <h1 className="book-viewer__title">{bookTitle}</h1>
              <p className="book-viewer__tagline">{tagLine}</p>
            </div>
            <div className={`book-viewer__chip ${hasStoryPages ? 'is-on' : ''}`}>
              <span className="dot" />
              {hasStoryPages ? 'Pages ready' : 'No pages'}
            </div>
          </div>

          {bookId && hasStoryPages && (
            <div className="book-viewer__bundle">
              <div>
                <p className="book-viewer__crumb">Selected pages</p>
                <h3>{approvedCount}/{pages.length + 1} ready</h3>
                <p className="book-viewer__scene">
                  {allApproved ? 'All pages selected — ready to download.' : 'Select an image for every page to enable download.'}
                </p>
              </div>
              <div className="book-viewer__actions">
                <button className="btn ghost" disabled>{approvedCount}/{pages.length + 1} selected</button>
                <button className="btn primary" onClick={() => canDownloadBundle && setBundleConfirm(true)} disabled={!canDownloadBundle || bundleLoading}>
                  {bundleLoading ? 'Preparing...' : 'Download bundle'}
                </button>
              </div>
            </div>
          )}

          {bundleError && <div className="book-viewer__alert">{bundleError}</div>}

          {bookId && (
            <div className="notes-section">
              <label className="notes-section__label"><StickyNote size={12} /> Book notes</label>
              <textarea className="notes-section__input" value={bookNotes} onChange={handleBookNotesChange} onBlur={handleBookNotesBlur} placeholder="General notes for this book..." rows={2} />
            </div>
          )}
        </div>

        <PageList
          navPages={navPages}
          activePage={activePage}
          setActivePage={setActivePage}
          pageState={pageState}
          approvedUrlForPage={approvedUrlForPage}
        />
      </aside>

      <section className="book-viewer__main">
        <div className="main-layout">
          <PromptPanel
            activePage={activePage}
            isCover={isCover}
            bookTitle={bookTitle}
            coverPrompt={coverPrompt}
            onCoverPromptChange={handleCoverPromptChange}
            currentStyle={activePage && !isCover ? pageStyles[activePage.id] ?? '' : ''}
            onStyleChange={handleStyleChange}
            onStyleBlur={handleStyleBlur}
            styleSaving={currentState.styleSaving}
            styleError={styleError}
            currentPrompt={activePage && !isCover ? pagePrompts[activePage.id] ?? '' : ''}
            onPromptChange={handlePromptChange}
            onPromptBlur={handlePromptBlur}
            promptSaving={currentState.promptSaving}
            promptError={promptError}
            currentCaption={activePage && !isCover ? pageCaptions[activePage.id] ?? '' : ''}
            onCaptionChange={handleCaptionChange}
            onCaptionBlur={handleCaptionBlur}
            captionSaving={currentState.captionSaving}
            currentPageNotes={activePage && !isCover ? pageNotes[activePage.id] ?? '' : ''}
            onPageNotesChange={handlePageNotesChange}
            onPageNotesBlur={handlePageNotesBlur}
            imageError={imageError}
            genError={genError}
          />

          <div className="main-layout__gallery">
            <ImageCarousel
              attempts={currentAttempts}
              preview={currentState.preview}
              saving={currentState.saving}
              generating={generating}
              prompt={prompt}
              carouselIdx={carouselIdx}
              setCarouselIdx={setCarouselIdx}
              onGenerate={generateImage}
              onSelect={toggleApprove}
              onDelete={deleteAttempt}
              onDownload={downloadImage}
              activePage={activePage}
            />
          </div>
        </div>

        <footer className="book-viewer__footer">
          <span>Ready for KDP 8.5x11</span>
        </footer>
      </section>

      {bundleConfirm && (
        <BundleConfirmModal
          loading={bundleLoading}
          onConfirm={downloadApprovedBundle}
          onCancel={() => setBundleConfirm(false)}
        />
      )}
    </>
  );
}
