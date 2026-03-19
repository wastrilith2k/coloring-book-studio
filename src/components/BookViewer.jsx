import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  AlertCircle,
  StickyNote,
} from 'lucide-react';
import { apiFetch } from '../lib/api.js';

const STYLE_HINT = 'Black and white UNCOLORED coloring book page. Thick clean outlines only, no shading, no filled colors, no gradients. Pure white background. Leave all areas blank for a child to color in.';

const PROMPT_TIPS = {
  style: [
    'Describe recurring characters, art style, or line weight.',
    'e.g. "Cartoon cat with big eyes, thick outlines, simple shapes"',
    'This is prepended to every generation for consistency.',
  ],
  scene: [
    'Describe what happens on this specific page.',
    'Say "no text" if you don\'t want words in the image.',
    'Be specific about composition: foreground, background, borders.',
    'A coloring-book style hint is automatically appended.',
  ],
  caption: [
    'Text printed below the image in the final book.',
    'Not sent to the image generator — purely for print layout.',
    'e.g. "Color the dragon\'s scales any color you like!"',
  ],
  cover: [
    'Describe the cover illustration for the book.',
    'Mention where the title should go (e.g. "room for title at top").',
    'Say "no text" unless you want the AI to render lettering.',
  ],
};

const PROMPT_GUIDE = [
  {
    title: 'Character / Style prompt',
    items: [
      'This prompt is shared across ALL pages. Use it for anything you want consistent on every page.',
      'Put recurring elements here: character descriptions, art style, line weight, borders, or decorative frames.',
      'Example: "A friendly cartoon owl with big round eyes. Thick black outlines. Decorative vine border around the edge of each page."',
      'Changes here affect future generations for every page in the book.',
    ],
  },
  {
    title: 'Scene prompt',
    items: [
      'This prompt is unique to each page. Describe what happens in this specific scene.',
      'Be specific about composition: what\'s in the foreground vs. background, left vs. right.',
      'Say "no text" or "do not include any words or letters" to prevent the AI from rendering text.',
      'If you DO want text, spell it out exactly: \'The text should read "Hello World"\'.',
      'A coloring-book style hint (black & white outlines, no shading) is automatically appended.',
    ],
  },
  {
    title: 'Print caption',
    items: [
      'This text appears below the image in the printed book only.',
      'It is NOT sent to the image generator \u2014 the AI never sees it.',
      'Great for instructions like "Color the dragon\'s scales!" or educational content.',
    ],
  },
  {
    title: 'General tips',
    items: [
      'Simpler prompts often produce cleaner coloring pages. Avoid over-describing.',
      'If results have unwanted shading or color, add "absolutely no shading, no gray areas" to the scene prompt.',
      'Generate multiple attempts and use "Select" to pick the best one for each page.',
      'You can download any individual image before finalizing the book.',
    ],
  },
];

function PromptTip({ tips }) {
  return (
    <span className="prompt-tip">
      <Info size={14} className="prompt-tip__icon" />
      <span className="prompt-tip__popup">
        {tips.map((t, i) => <span key={i} className="prompt-tip__line">{t}</span>)}
      </span>
    </span>
  );
}

function PromptGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className={`prompt-guide ${open ? 'is-open' : ''}`}>
      <button className="prompt-guide__toggle" onClick={() => setOpen(o => !o)}>
        <Info size={14} />
        <span>Prompt writing guide</span>
        <ChevronDown size={14} className={`prompt-guide__chevron ${open ? 'is-open' : ''}`} />
      </button>
      {open && (
        <div className="prompt-guide__body">
          {PROMPT_GUIDE.map((section, i) => (
            <div key={i} className="prompt-guide__section">
              <h4 className="prompt-guide__heading">{section.title}</h4>
              <ul className="prompt-guide__list">
                {section.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

  useEffect(() => {
    const initialStyles = {};
    const initialPrompts = {};
    const initialCaptions = {};
    const initialNotes = {};
    pages.forEach(p => {
      initialStyles[p.id] = p.characterStyle ?? characterGuide ?? '';
      initialPrompts[p.id] = p.prompt || p.scene || '';
      initialCaptions[p.id] = p.caption || '';
      initialNotes[p.id] = p.notes || '';
    });
    setPageStyles(initialStyles);
    setPagePrompts(initialPrompts);
    setPageCaptions(initialCaptions);
    setPageNotes(initialNotes);
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
  const currentStyle =
    activePage && !isCover ? pageStyles[activePage.id] ?? '' : '';
  const currentPrompt =
    activePage && !isCover ? pagePrompts[activePage.id] ?? '' : '';
  const currentCaption =
    activePage && !isCover ? pageCaptions[activePage.id] ?? '' : '';
  const currentPageNotes =
    activePage && !isCover ? pageNotes[activePage.id] ?? '' : '';

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

  // --- Carousel slides ---
  const displayAttempts = useMemo(
    () => [...currentAttempts].reverse(),
    [currentAttempts]
  );
  const carouselSlides = useMemo(() => {
    const slides = displayAttempts.map(a => ({ type: 'attempt', attempt: a }));
    if (currentState.preview) {
      slides.push({ type: 'preview', url: currentState.preview });
    }
    slides.push({ type: 'generate' });
    return slides;
  }, [displayAttempts, currentState.preview]);

  // Clamp carousel index
  useEffect(() => {
    if (carouselIdx >= carouselSlides.length) {
      setCarouselIdx(Math.max(0, carouselSlides.length - 1));
    }
  }, [carouselSlides.length]);

  const currentSlide = carouselSlides[carouselIdx] || carouselSlides[0];
  const canPrev = carouselIdx > 0;
  const canNext = carouselIdx < carouselSlides.length - 1;

  // --- API calls ---
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
      // Move carousel to selected/approved attempt
      const reversed = [...attempts].reverse();
      const idx = approved
        ? reversed.findIndex(a => a.id === approved.id)
        : 0;
      setCarouselIdx(idx >= 0 ? idx : 0);
    } catch (e) {
      setImageError(e.message);
      updatePageState(page.id, () => ({ loading: false }));
    }
  };

  useEffect(() => {
    if (activePage) {
      loadImages(activePage);
      setCarouselIdx(0);
    }
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
    } catch (e) {
      setStyleError(e.message);
    }
    updatePageState(activePage.id, () => ({ styleSaving: false }));
  };

  const handleStyleChange = e => {
    setStyleError('');
    if (!activePage || activePage.isCover) return;
    setPageStyles(prev => ({ ...prev, [activePage.id]: e.target.value }));
  };

  const handleStyleBlur = () => {
    if (!activePage || activePage.isCover) return;
    saveCharacterStyle(pageStyles[activePage.id] ?? '');
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
    } catch (e) {
      setPromptError(e.message);
    }
    updatePageState(activePage.id, () => ({ promptSaving: false }));
  };

  const handlePromptChange = e => {
    setPromptError('');
    if (!activePage || activePage.isCover) return;
    setPagePrompts(prev => ({ ...prev, [activePage.id]: e.target.value }));
  };

  const handlePromptBlur = () => {
    if (!activePage || activePage.isCover) return;
    savePrompt(pagePrompts[activePage.id] ?? '');
  };

  const saveCaption = async value => {
    if (!activePage || activePage.isCover) return;
    updatePageState(activePage.id, () => ({ captionSaving: true }));
    try {
      const res = await apiFetch(`/api/pages/${activePage.id}`, {
        method: 'PUT',
        body: JSON.stringify({ caption: value }),
      });
      await res.json();
    } catch { /* silent */ }
    updatePageState(activePage.id, () => ({ captionSaving: false }));
  };

  const handleCaptionChange = e => {
    if (!activePage || activePage.isCover) return;
    setPageCaptions(prev => ({ ...prev, [activePage.id]: e.target.value }));
  };

  const handleCaptionBlur = () => {
    if (!activePage || activePage.isCover) return;
    saveCaption(pageCaptions[activePage.id] ?? '');
  };

  const savePageNotes = async value => {
    if (!activePage || activePage.isCover) return;
    try {
      await apiFetch(`/api/pages/${activePage.id}`, {
        method: 'PUT',
        body: JSON.stringify({ notes: value }),
      });
    } catch { /* silent */ }
  };

  const handlePageNotesChange = e => {
    if (!activePage || activePage.isCover) return;
    setPageNotes(prev => ({ ...prev, [activePage.id]: e.target.value }));
  };

  const handlePageNotesBlur = () => {
    if (!activePage || activePage.isCover) return;
    savePageNotes(pageNotes[activePage.id] ?? '');
  };

  const saveBookNotes = async value => {
    if (!bookId) return;
    try {
      await apiFetch(`/api/books/${bookId}`, {
        method: 'PUT',
        body: JSON.stringify({ notes: value }),
      });
    } catch { /* silent */ }
  };

  const handleBookNotesChange = e => setBookNotes(e.target.value);
  const handleBookNotesBlur = () => saveBookNotes(bookNotes);

  const handleCoverPromptChange = e => setCoverPrompt(e.target.value);

  // --- Image generation (inlined from ImageGenerator) ---
  const generateImage = async () => {
    if (!prompt || !activePage) return;
    setGenerating(true);
    setGenError(null);

    const attempt = async (retry = 0) => {
      try {
        const res = await apiFetch('/api/generate-image', {
          method: 'POST',
          body: JSON.stringify({ prompt }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Status ${res.status}`);
        }
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
    if (!activePage) return;
    if (activePage.isCover && !bookId) return;
    setImageError('');
    updatePageState(activePage.id, () => ({ preview: dataUrl, saving: true }));
    // Move carousel to the preview slide
    setCarouselIdx(displayAttempts.length); // preview is right after attempts
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
      const newAttempt = { ...data.image, approved: !!data.image?.approved };
      updatePageState(activePage.id, prev => {
        const newAttempts = [newAttempt, ...(prev.attempts || [])];
        return {
          attempts: newAttempts,
          selectedId: newAttempt.id,
          preview: null,
          saving: false,
        };
      });
      // Move carousel to the new attempt (last in reversed order)
      setCarouselIdx(currentAttempts.length); // after save, it's the newest = last in reversed
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
            { method: 'POST', body: JSON.stringify({ approved }) }
          )
        : await apiFetch(
            `/api/pages/${activePage.id}/images/${attemptId}/approve`,
            { method: 'POST', body: JSON.stringify({ approved }) }
          );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed');
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
    const att = (pageState[activePage.id]?.attempts || []).find(a => a.id === attemptId);
    if (att?.approved) return;
    setImageError('');
    try {
      const res = activePage.isCover
        ? await apiFetch(`/api/books/${bookId}/cover/images/${attemptId}`, { method: 'DELETE' })
        : await apiFetch(`/api/pages/${activePage.id}/images/${attemptId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await res.json();
        throw new Error(data?.error || 'Delete failed');
      }
      updatePageState(activePage.id, prev => {
        const remaining = (prev.attempts || []).filter(a => a.id !== attemptId);
        const selectedId =
          prev.selectedId === attemptId ? remaining[0]?.id || null : prev.selectedId;
        return { attempts: remaining, selectedId };
      });
    } catch (e) {
      setImageError(e.message);
    }
  };

  const downloadImage = (url, name) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
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
      const data = await res.json();
      const files = data.files || [];
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      await Promise.all(files.map(async (file) => {
        const response = await fetch(file.url);
        const blob = await response.blob();
        zip.file(file.name, blob);
      }));
      const blob = await zip.generateAsync({ type: 'blob' });
      const slug = (data.title || 'book').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
      downloadImage(URL.createObjectURL(blob), `${slug}-approved-images.zip`);
    } catch (err) {
      setBundleError(err.message);
    } finally {
      setBundleLoading(false);
      setBundleConfirm(false);
    }
  };

  // --- Render ---
  return (
    <>
      <aside className="book-viewer__sidebar">
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
                {allApproved
                  ? 'All pages selected — ready to download.'
                  : 'Select an image for every page to enable download.'}
              </p>
            </div>
            <div className="book-viewer__actions">
              <button className="btn ghost" disabled>
                {approvedCount}/{pages.length + 1} selected
              </button>
              <button
                className="btn primary"
                onClick={() => canDownloadBundle && setBundleConfirm(true)}
                disabled={!canDownloadBundle || bundleLoading}
              >
                {bundleLoading ? 'Preparing...' : 'Download bundle'}
              </button>
            </div>
          </div>
        )}

        {bundleError && <div className="book-viewer__alert">{bundleError}</div>}

        {/* Book-level notes */}
        {bookId && (
          <div className="notes-section">
            <label className="notes-section__label">
              <StickyNote size={12} />
              Book notes
            </label>
            <textarea
              className="notes-section__input"
              value={bookNotes}
              onChange={handleBookNotesChange}
              onBlur={handleBookNotesBlur}
              placeholder="General notes for this book..."
              rows={2}
            />
          </div>
        )}

        <div className="book-viewer__list">
          {!navPages.length && (
            <div className="book-viewer__empty">
              Add storyPages to start generating.
            </div>
          )}
          {navPages.map(p => {
            const thumbUrl = approvedUrlForPage(p);
            const isApproved = pageState[p.id]?.attempts?.some(a => a.approved) || !!p.image_url;
            return (
              <button
                key={p.id}
                onClick={() => setActivePage(p)}
                className={`page-card ${activePage?.id === p.id ? 'is-active' : ''}`}
              >
                <p className="page-card__title">{p.title}</p>
                <p className="page-card__meta">{p.isCover ? 'Cover' : `Scene #${p.id}`}</p>
                <div className="page-card__thumb-wrap">
                  {thumbUrl ? (
                    <img
                      className="page-card__thumb"
                      src={thumbUrl}
                      alt={p.title}
                      loading="lazy"
                    />
                  ) : (
                    <span className="page-card__thumb-blank" />
                  )}
                  {isApproved && (
                    <CheckCircle2 className="page-card__check" size={20} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="book-viewer__main">
        <div className="main-layout">
          {/* Left column: prompts + notes */}
          <div className="main-layout__prompts">
            <div className="book-viewer__header">
              <p className="book-viewer__crumb">Workspace &gt; {bookTitle}</p>
              <h2>{activePage?.title ?? 'Select a page'}</h2>
              <p className="book-viewer__scene">
                {activePage?.scene ?? 'Choose a page to generate an illustration.'}
              </p>
            </div>

            <PromptGuide />

            {isCover ? (
              <div className="prompt-stack">
                <div className="prompt-field">
                  <label htmlFor="cover-text">Cover prompt <PromptTip tips={PROMPT_TIPS.cover} /></label>
                  <textarea
                    id="cover-text"
                    value={coverPrompt}
                    onChange={handleCoverPromptChange}
                    placeholder="Describe the cover illustration."
                    rows={3}
                  />
                </div>
              </div>
            ) : (
              <div className="prompt-stack">
                <div className="prompt-field">
                  <label htmlFor="character-text">Character / style prompt <PromptTip tips={PROMPT_TIPS.style} /></label>
                  <textarea
                    id="character-text"
                    value={currentStyle}
                    onChange={handleStyleChange}
                    onBlur={handleStyleBlur}
                    placeholder="Describe the character or style."
                    rows={3}
                  />
                  {currentState.styleSaving && <span className="pill subtle">Saving...</span>}
                  {styleError && <div className="book-viewer__alert">{styleError}</div>}
                </div>
                <div className="prompt-field">
                  <label htmlFor="scene-text">Scene prompt <PromptTip tips={PROMPT_TIPS.scene} /></label>
                  <textarea
                    id="scene-text"
                    value={currentPrompt}
                    onChange={handlePromptChange}
                    onBlur={handlePromptBlur}
                    placeholder="Describe the scene to generate."
                    rows={3}
                  />
                  {currentState.promptSaving && <span className="pill subtle">Saving...</span>}
                  {promptError && <div className="book-viewer__alert">{promptError}</div>}
                </div>
                <div className="prompt-field">
                  <label htmlFor="caption-text">Print caption <PromptTip tips={PROMPT_TIPS.caption} /></label>
                  <textarea
                    id="caption-text"
                    value={currentCaption}
                    onChange={handleCaptionChange}
                    onBlur={handleCaptionBlur}
                    placeholder="Caption printed below the image (not used for generation)."
                    rows={2}
                  />
                  {currentState.captionSaving && <span className="pill subtle">Saving...</span>}
                </div>
                <div className="prompt-field">
                  <label htmlFor="page-notes">
                    <StickyNote size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
                    Page notes
                  </label>
                  <textarea
                    id="page-notes"
                    value={currentPageNotes}
                    onChange={handlePageNotesChange}
                    onBlur={handlePageNotesBlur}
                    placeholder="Internal notes for this page..."
                    rows={2}
                  />
                </div>
              </div>
            )}

            {imageError && <div className="book-viewer__alert"><AlertCircle size={14} /> {imageError}</div>}
            {genError && <div className="book-viewer__alert"><AlertCircle size={14} /> {genError}</div>}
          </div>

          {/* Right column: carousel + thumbnails */}
          <div className="main-layout__gallery">
            <div className="carousel">
              <button
                className="carousel__arrow carousel__arrow--prev"
                onClick={() => setCarouselIdx(i => Math.max(0, i - 1))}
                disabled={!canPrev}
              >
                <ChevronLeft size={24} />
              </button>

              <div className="carousel__viewport">
                {currentSlide?.type === 'generate' ? (
                  <div className="carousel__generate">
                    {generating ? (
                      <div className="carousel__loading">
                        <Sparkles size={48} />
                        <p>Mixing the ink...</p>
                      </div>
                    ) : (
                      <>
                        <button
                          className="btn primary carousel__gen-btn"
                          onClick={generateImage}
                          disabled={generating || !prompt}
                        >
                          <Wand2 size={20} />
                          Generate page
                        </button>
                        <p className="carousel__gen-hint">
                          {displayAttempts.length
                            ? `${displayAttempts.length} image${displayAttempts.length === 1 ? '' : 's'} generated`
                            : 'No images yet'}
                        </p>
                      </>
                    )}
                  </div>
                ) : currentSlide?.type === 'preview' ? (
                  <div className="carousel__image-wrap">
                    <img src={currentSlide.url} alt="Preview" className="carousel__image" />
                    {currentState.saving && (
                      <div className="carousel__saving">
                        <Loader2 className="spin" size={24} />
                        Saving...
                      </div>
                    )}
                  </div>
                ) : currentSlide?.type === 'attempt' ? (
                  <div className="carousel__image-wrap">
                    <img
                      src={currentSlide.attempt.url}
                      alt={`Attempt ${currentSlide.attempt.attempt_number}`}
                      className="carousel__image"
                    />
                  </div>
                ) : null}
              </div>

              <button
                className="carousel__arrow carousel__arrow--next"
                onClick={() => setCarouselIdx(i => Math.min(carouselSlides.length - 1, i + 1))}
                disabled={!canNext}
              >
                <ChevronRight size={24} />
              </button>
            </div>

            {/* Actions for current slide */}
            {currentSlide?.type === 'attempt' && (
              <div className="carousel__actions">
                <button
                  className={`btn ${currentSlide.attempt.approved ? 'primary' : 'ghost'}`}
                  onClick={() => toggleApprove(currentSlide.attempt.id, !currentSlide.attempt.approved)}
                >
                  {currentSlide.attempt.approved ? 'Selected' : 'Select'}
                </button>
                <button
                  className="btn ghost"
                  onClick={() => downloadImage(
                    currentSlide.attempt.url,
                    `${activePage?.title || 'image'}-attempt-${currentSlide.attempt.attempt_number}.png`
                  )}
                >
                  <Download size={14} /> Download
                </button>
                <button
                  className="btn ghost"
                  onClick={() => deleteAttempt(currentSlide.attempt.id)}
                  disabled={currentSlide.attempt.approved}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            )}

            {/* Thumbnail strip */}
            <div className="carousel__thumbs">
              {carouselSlides.map((slide, i) => (
                <button
                  key={slide.type === 'attempt' ? slide.attempt.id : slide.type}
                  className={`carousel__thumb-btn ${i === carouselIdx ? 'is-active' : ''} ${
                    slide.type === 'attempt' && slide.attempt.approved ? 'is-selected' : ''
                  }`}
                  onClick={() => setCarouselIdx(i)}
                >
                  {slide.type === 'attempt' ? (
                    <img src={slide.attempt.url} alt="" className="carousel__thumb-img" />
                  ) : slide.type === 'preview' ? (
                    <img src={slide.url} alt="" className="carousel__thumb-img" />
                  ) : (
                    <Plus size={16} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="book-viewer__footer">
          <span>Ready for KDP 8.5x11</span>
        </footer>
      </section>

      {/* Bundle confirmation modal */}
      {bundleConfirm && (
        <div className="bundle-confirm-overlay">
          <div className="bundle-confirm-card">
            <h3>Download Print Bundle</h3>
            <p>
              This will download all selected images as a ZIP file.
            </p>
            <p className="bundle-confirm-warn">
              <AlertCircle size={16} />
              All non-selected images will be deleted after download. If you want to keep any, download them individually first.
            </p>
            <div className="bundle-confirm-actions">
              <button className="btn ghost" onClick={() => setBundleConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={downloadApprovedBundle}
                disabled={bundleLoading}
              >
                {bundleLoading ? 'Preparing...' : 'Download & Finalize'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
