import { useEffect, useMemo, useState } from 'react';
import { StickyNote } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import PageList from './PageList.jsx';
import ImageCarousel from './ImageCarousel.jsx';
import PromptPanel from './PromptPanel.jsx';
import BundleConfirmModal from './BundleConfirmModal.jsx';

// Short style hint for diffusion models (Flux)
const STYLE_HINT_SHORT = 'Black and white coloring book page. Thick clean outlines, no shading, no filled colors, no gradients, pure white background. No text or words in the image.';

// Structured style hint for LLM-based models (Gemini)
const STYLE_HINT_STRUCTURED = `Professional black-and-white UNCOLORED coloring book illustration for children ages 4–10.
LINE WORK: Thick, confident outlines (2–3pt weight). Clean, fully closed shapes suitable for coloring with crayons or markers. No crosshatching, no stippling, no hatching, no shading, no gray fills, no gradients, no solid black filled areas.
COMPOSITION: Single centered scene with a clear foreground subject and a simple background. Leave generous white space between elements. Portrait orientation (taller than wide).
STYLE: Friendly, rounded, slightly cartoonish proportions. Large distinct areas to color in. Age-appropriate detail — enough to be interesting, not so much it overwhelms small hands.
BACKGROUND: Pure white. No colored fills anywhere in the image.
TEXT: Do NOT include any text, titles, labels, numbers, letters, captions, watermarks, or written words anywhere in the image.
OUTPUT: High-contrast black lines on white, print-ready at 8.5 × 11 inches.`;

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
  onPagesChanged,
  onPageNav,
}) {
  const pages = useMemo(
    () => (storyPages && storyPages.length ? storyPages : []),
    [storyPages]
  );

  const coverPromptTemplate = useMemo(() => {
    const titleText = bookTitle
      ? `Full color cover illustration for "${bookTitle}"`
      : 'Full color cover illustration for the book';
    const parts = [titleText];
    if (tagLine) parts.push(tagLine);
    parts.push('Vibrant full-color fantasy illustration. Detailed, eye-catching coloring book cover art. Ornate decorative border. Leave room for title text at the top and subtitle at the bottom. Rich colors, dynamic composition.');
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
  const [pageCharacters, setPageCharacters] = useState({});
  const [pagePrompts, setPagePrompts] = useState({});
  const [pageCaptions, setPageCaptions] = useState({});
  const [pageNotes, setPageNotes] = useState({});
  const [pageTitles, setPageTitles] = useState({});
  const [bookNotes, setBookNotes] = useState(initialBookNotes);
  const [bundleError, setBundleError] = useState('');
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleConfirm, setBundleConfirm] = useState(false);
  const [coverPrompt, setCoverPrompt] = useState(coverPromptTemplate);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [imageModelId, setImageModelId] = useState('gpt-image-1-mini');
  const [enabledModels, setEnabledModels] = useState([]);
  const [defaultCoverModel, setDefaultCoverModel] = useState('');
  const [defaultPageModel, setDefaultPageModel] = useState('');

  // --- Load settings (models) ---
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          const models = data.enabledModels || [];
          setEnabledModels(models);
          setDefaultCoverModel(data.defaultCoverModel || '');
          setDefaultPageModel(data.defaultPageModel || '');
          if (models.length && !models.find(m => m.id === imageModelId)) {
            setImageModelId(models[0].id);
          }
        }
      } catch { /* use defaults */ }
    })();
  }, []);

  // --- Init on book change ---
  useEffect(() => {
    const s = {}, ch = {}, pr = {}, c = {}, n = {}, t = {};
    pages.forEach(p => {
      s[p.id] = p.characterStyle ?? characterGuide ?? '';
      ch[p.id] = p.characterDesc ?? '';
      pr[p.id] = p.prompt || p.scene || '';
      c[p.id] = p.caption || '';
      n[p.id] = p.notes || '';
      t[p.id] = p.title || '';
    });
    setPageStyles(s);
    setPageCharacters(ch);
    setPagePrompts(pr);
    setPageCaptions(c);
    setPageNotes(n);
    setPageTitles(t);
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
  const effectiveModelId = (() => {
    const adminDefault = isCover ? defaultCoverModel : defaultPageModel;
    if (adminDefault && enabledModels.find(m => m.id === adminDefault)) return adminDefault;
    if (enabledModels.find(m => m.id === imageModelId)) return imageModelId;
    return enabledModels[0]?.id || imageModelId;
  })();

  const isLlmModel = (modelId) => modelId?.startsWith('gemini') || modelId?.startsWith('gpt-');

  const buildPrompt = page => {
    if (!page) return '';
    const title = pageTitles[page.id] ?? page.title ?? '';
    const styleText = pageStyles[page.id] ?? '';
    const characterText = pageCharacters[page.id] ?? '';
    const scenePrompt = pagePrompts[page.id] ?? '';
    const dedupedStyle = (styleText && styleText !== characterGuide) ? styleText : '';
    const styleGuide = [characterGuide, dedupedStyle].filter(Boolean).join(' ');

    if (isLlmModel(effectiveModelId)) {
      // Structured XML for LLM-based models (Gemini, GPT)
      const sections = [];
      sections.push(`<style>\n${STYLE_HINT_STRUCTURED}\n</style>`);
      if (styleGuide) sections.push(`<style-guide>\n${styleGuide}\n</style-guide>`);
      if (title) sections.push(`<title>\n${title}\n</title>`);
      if (characterText) sections.push(`<character>\n${characterText}\n</character>`);
      if (scenePrompt) sections.push(`<illustration>\n${scenePrompt}\n</illustration>`);
      return sections.join('\n');
    }

    // Flat prompt for diffusion models (Flux, etc.) — no book concept, just page-specific content
    const parts = [STYLE_HINT_SHORT];
    if (title) parts.push(title);
    if (characterText) parts.push(characterText);
    if (scenePrompt) parts.push(scenePrompt);
    return parts.join('. ');
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
  const handleCharacterChange = e => { if (activePage && !isCover) setPageCharacters(p => ({ ...p, [activePage.id]: e.target.value })); };
  const handleCharacterBlur = () => { if (activePage && !isCover) saveField('characterDesc', pageCharacters[activePage.id] ?? ''); };
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

  const handleTitleChange = e => { if (activePage && !isCover) setPageTitles(p => ({ ...p, [activePage.id]: e.target.value })); };
  const handleTitleBlur = () => { if (activePage && !isCover) saveField('title', pageTitles[activePage.id] ?? ''); };

  const [aiGenerating, setAiGenerating] = useState(false);
  const handleAiGenerate = async () => {
    if (!activePage || isCover || !bookId) return;
    setAiGenerating(true);
    try {
      const res = await apiFetch('/api/ideas/page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: characterGuide,
          audience: 'kids',
          pageIndex: pages.indexOf(activePage),
          bookTitle,
          concept: characterGuide,
          existingPages: pages.map(p => ({ title: pageTitles[p.id] || p.title, scene: pagePrompts[p.id] || p.scene })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to generate');
      const page = data.page;
      if (page.title) setPageTitles(p => ({ ...p, [activePage.id]: page.title }));
      if (page.scene || page.prompt) {
        const scene = page.scene || page.prompt;
        setPagePrompts(p => ({ ...p, [activePage.id]: scene }));
      }
      // Save to backend
      await apiFetch(`/api/pages/${activePage.id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: page.title, scene: page.scene || page.prompt, prompt: page.prompt || page.scene }),
      });
    } catch (e) {
      setPromptError(e.message);
    }
    setAiGenerating(false);
  };

  const handleAddPage = async () => {
    if (!bookId) return;
    try {
      const res = await apiFetch(`/api/books/${bookId}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: [{ title: 'New Page', scene: '', prompt: '' }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to add page');
      if (typeof onPagesChanged === 'function') onPagesChanged();
    } catch (e) {
      setPromptError(e.message);
    }
  };

  const [addPagesCount, setAddPagesCount] = useState(5);
  const [addingPages, setAddingPages] = useState(false);
  const [showAddPages, setShowAddPages] = useState(false);

  const handleAddAiPages = async () => {
    if (!bookId || addingPages) return;
    setAddingPages(true);
    setGenError(null);
    try {
      const existingPages = pages.map(p => ({ title: pageTitles[p.id] || p.title, scene: pagePrompts[p.id] || p.scene }));
      const res = await apiFetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: characterGuide,
          length: addPagesCount,
          audience: 'kids',
          existingPages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to generate ideas');
      const idea = data.idea || data;
      const newPages = (idea.pages || []).map(p => ({
        title: p.title || '',
        scene: p.scene || '',
        prompt: p.prompt || p.scene || '',
        caption: p.caption || '',
        characterStyle: characterGuide,
      }));
      if (!newPages.length) throw new Error('No pages generated');
      const addRes = await apiFetch(`/api/books/${bookId}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: newPages }),
      });
      if (!addRes.ok) throw new Error('Failed to add pages');
      setShowAddPages(false);
      if (typeof onPagesChanged === 'function') onPagesChanged();
    } catch (e) {
      setGenError(e.message);
    }
    setAddingPages(false);
  };

  const handleReorderPage = async (pageId, newIndex) => {
    const storyPages = pages.filter(p => !p.isCover);
    const oldIndex = storyPages.findIndex(p => p.id === pageId);
    if (oldIndex < 0 || oldIndex === newIndex) return;
    // Build new order
    const reordered = [...storyPages];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    // Update all sort_order values
    try {
      await Promise.all(reordered.map((p, i) =>
        apiFetch(`/api/pages/${p.id}`, { method: 'PUT', body: JSON.stringify({ sortOrder: i }) })
      ));
      if (typeof onPagesChanged === 'function') onPagesChanged();
    } catch (e) {
      setPromptError(e.message);
    }
  };

  const handleDeletePage = async (pageId) => {
    if (!pageId || !bookId) return;
    try {
      const res = await apiFetch(`/api/pages/${pageId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await res.json();
        throw new Error(data?.error || 'Failed to delete page');
      }
      if (typeof onPagesChanged === 'function') onPagesChanged();
    } catch (e) {
      setPromptError(e.message);
    }
  };

  // --- Image generation ---
  const [lastOptimizedPrompt, setLastOptimizedPrompt] = useState('');

  const generateImage = async (refinementFeedback) => {
    if (!prompt || !activePage) return;
    const feedback = typeof refinementFeedback === 'string' ? refinementFeedback : undefined;
    setGenerating(true);
    setGenError(null);
    const attempt = async (retry = 0) => {
      try {
        const reqBody = { prompt, modelId: effectiveModelId, isCover };
        if (feedback) reqBody.refinementFeedback = feedback;
        const res = await apiFetch('/api/generate-image', { method: 'POST', body: JSON.stringify(reqBody) });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Status ${res.status}`); }
        const data = await res.json();
        if (!data.dataUrl) throw new Error('No image returned');
        if (data.optimizedPrompt) setLastOptimizedPrompt(data.optimizedPrompt);
        await saveGeneratedImage(data.dataUrl);
      } catch (e) {
        if (retry < 3) return attempt(retry + 1);
        setGenError(`Generation failed. Please try again. ${e}`);
      }
    };
    await attempt();
    setGenerating(false);
  };

  const refineImage = (feedback) => generateImage(feedback);

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

  const fetchBundleFiles = async () => {
    const res = await apiFetch(`/api/books/${bookId}/download`);
    if (!res.ok) { let m = 'Download failed'; try { m = (await res.json())?.error || m; } catch { m = (await res.text()) || m; } throw new Error(m); }
    const data = await res.json();
    const imageBuffers = await Promise.all((data.files || []).map(async file => {
      const buf = file.url
        ? await (await fetch(file.url)).arrayBuffer()
        : (() => { const bin = atob(file.data); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes.buffer; })();
      return { name: file.name, buf, title: file.title || '', caption: file.caption || '' };
    }));
    return { files: imageBuffers, title: data.title };
  };

  const [bundleLoadingLabel, setBundleLoadingLabel] = useState('');

  const buildPdf = async (imageFiles, { bleedPages = false } = {}) => {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    // KDP 8.5x11" = 612x792 points (72pt/inch)
    const W = 612, H = 792;
    const MARGIN = 36; // 0.5" margins
    const TITLE_SIZE = 16;
    const CAPTION_SIZE = 11;
    const TEXT_GAP = 8;
    const pdf = PDFDocument.create ? await PDFDocument.create() : new PDFDocument();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    for (let fi = 0; fi < imageFiles.length; fi++) {
      const f = imageFiles[fi];
      const img = f.name.endsWith('.jpg') || f.name.endsWith('.jpeg')
        ? await pdf.embedJpg(f.buf)
        : await pdf.embedPng(f.buf);
      const page = pdf.addPage([W, H]);
      const { width: imgW, height: imgH } = img.scale(1);

      const isCoverFile = f.name.startsWith('00-cover');
      const hasTitle = f.title && !isCoverFile;
      const hasCaption = f.caption && !isCoverFile;
      const titleH = hasTitle ? TITLE_SIZE + TEXT_GAP : 0;
      const captionH = hasCaption ? CAPTION_SIZE + TEXT_GAP : 0;

      // Available area for the image
      const availW = W - MARGIN * 2;
      const availH = H - MARGIN * 2 - titleH - captionH;
      const scale = Math.min(availW / imgW, availH / imgH);
      const drawW = imgW * scale;
      const drawH = imgH * scale;

      const imgX = (W - drawW) / 2;
      const imgY = MARGIN + captionH + (availH - drawH) / 2;

      page.drawImage(img, { x: imgX, y: imgY, width: drawW, height: drawH });

      if (hasTitle) {
        const titleW = fontBold.widthOfTextAtSize(f.title, TITLE_SIZE);
        page.drawText(f.title, {
          x: (W - titleW) / 2,
          y: imgY + drawH + TEXT_GAP,
          size: TITLE_SIZE,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
      }

      if (hasCaption) {
        const capW = font.widthOfTextAtSize(f.caption, CAPTION_SIZE);
        page.drawText(f.caption, {
          x: (W - capW) / 2,
          y: MARGIN,
          size: CAPTION_SIZE,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
      }

      // Insert solid black bleed-through protection page (skip after last page)
      if (bleedPages && fi < imageFiles.length - 1) {
        const bleedPage = pdf.addPage([W, H]);
        bleedPage.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0, 0, 0) });
      }
    }
    return pdf.save();
  };

  const downloadApprovedBundle = async (mode = 'kdp', options = {}) => {
    if (!canDownloadBundle) return;
    setBundleError('');
    setBundleLoading(true);
    setBundleLoadingLabel(mode === 'kdp' ? 'Building KDP interior...' : mode === 'cover' ? 'Building cover...' : mode === 'full-pdf' ? 'Building complete book...' : 'Packing images...');
    try {
      const { files, title } = await fetchBundleFiles();
      const slug = (title || 'book').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
      const coverFile = files.find(f => f.name.startsWith('00-cover'));
      const interiorFiles = files.filter(f => !f.name.startsWith('00-cover'));

      if (mode === 'kdp') {
        // KDP Interior: pages only, no cover
        if (!interiorFiles.length) throw new Error('No interior pages found');
        const pdfBytes = await buildPdf(interiorFiles, { bleedPages: options.bleedPages });
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        downloadImage(URL.createObjectURL(pdfBlob), `${slug}-kdp-interior.pdf`);
      } else if (mode === 'cover') {
        // KDP Cover: single-page PDF with just the cover
        if (!coverFile) throw new Error('No cover image found');
        const pdfBytes = await buildPdf([coverFile]);
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        downloadImage(URL.createObjectURL(pdfBlob), `${slug}-kdp-cover.pdf`);
      } else if (mode === 'full-pdf') {
        // Complete book: cover + all pages in one PDF
        const allFiles = coverFile ? [coverFile, ...interiorFiles] : interiorFiles;
        if (!allFiles.length) throw new Error('No pages found');
        const pdfBytes = await buildPdf(allFiles, { bleedPages: options.bleedPages });
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        downloadImage(URL.createObjectURL(pdfBlob), `${slug}-complete.pdf`);
      } else {
        // ZIP of all images
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        files.forEach(f => zip.file(f.name, f.buf));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadImage(URL.createObjectURL(zipBlob), `${slug}-images.zip`);
      }

    } catch (err) { setBundleError(err.message); }
    finally { setBundleLoading(false); setBundleLoadingLabel(''); setBundleConfirm(false); }
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
                {pages.length < 24 && (
                  <p className="book-viewer__kdp-warn">
                    KDP requires 24+ interior pages. With bleed-through protection, your {pages.length} pages become {pages.length * 2 - 1} pages
                    {pages.length * 2 - 1 >= 24 ? ' — meets KDP minimum.' : ' — below the 24-page minimum.'}
                  </p>
                )}
              </div>
              <div className="book-viewer__actions">
                <button className="btn ghost" disabled>{approvedCount}/{pages.length + 1} selected</button>
                <button className="btn primary" onClick={() => canDownloadBundle && setBundleConfirm(true)} disabled={!canDownloadBundle || bundleLoading}>
                  {bundleLoading ? 'Preparing...' : 'Download'}
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

        {showAddPages && (
          <div className="add-pages-panel">
            <div className="add-pages-panel__header">
              <strong>Generate more pages</strong>
              <button className="btn-tiny" onClick={() => setShowAddPages(false)}>Cancel</button>
            </div>
            <p className="add-pages-panel__desc">AI will generate new pages consistent with your existing {pages.length} pages.</p>
            <div className="add-pages-panel__row">
              <label>How many?</label>
              <div className="page-count-picker page-count-picker--sm">
                <button className="page-count-btn" onClick={() => setAddPagesCount(c => Math.max(1, c - 1))} disabled={addPagesCount <= 1}>-</button>
                <input className="page-count-input" type="number" min={1} max={30} value={addPagesCount} onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setAddPagesCount(Math.max(1, Math.min(30, v))); }} />
                <button className="page-count-btn" onClick={() => setAddPagesCount(c => Math.min(30, c + 1))} disabled={addPagesCount >= 30}>+</button>
              </div>
            </div>
            <button className="btn primary" onClick={handleAddAiPages} disabled={addingPages} style={{ width: '100%' }}>
              {addingPages ? 'Generating...' : `Generate ${addPagesCount} page${addPagesCount === 1 ? '' : 's'}`}
            </button>
          </div>
        )}

        <PageList
          navPages={navPages}
          activePage={activePage}
          setActivePage={p => { setActivePage(p); onPageNav?.(); }}
          pageState={pageState}
          approvedUrlForPage={approvedUrlForPage}
          pageTitles={pageTitles}
          onAddPage={handleAddPage}
          onAddAiPages={() => setShowAddPages(s => !s)}
          onReorder={handleReorderPage}
          onDeletePage={handleDeletePage}
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
            characterGuide={characterGuide}
            onStyleChange={handleStyleChange}
            onStyleBlur={handleStyleBlur}
            onStyleReset={() => { if (activePage && characterGuide) { setPageStyles(p => ({ ...p, [activePage.id]: characterGuide })); saveField('style', characterGuide, { characterStyle: characterGuide }); } }}
            onStyleApplyAll={async () => {
              if (!activePage || isCover) return;
              const style = pageStyles[activePage.id] ?? '';
              if (!style) return;
              const updated = {};
              for (const p of pages) {
                updated[p.id] = style;
                try { await apiFetch(`/api/pages/${p.id}`, { method: 'PUT', body: JSON.stringify({ characterStyle: style }) }); } catch { /* best effort */ }
              }
              setPageStyles(prev => ({ ...prev, ...updated }));
            }}
            styleSaving={currentState.styleSaving}
            styleError={styleError}
            currentCharacter={activePage && !isCover ? pageCharacters[activePage.id] ?? '' : ''}
            onCharacterChange={handleCharacterChange}
            onCharacterBlur={handleCharacterBlur}
            characterSaving={currentState.characterDescSaving}
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
            currentTitle={activePage && !isCover ? pageTitles[activePage.id] ?? '' : ''}
            onTitleChange={handleTitleChange}
            onTitleBlur={handleTitleBlur}
            titleSaving={currentState.titleSaving}
            onAiGenerate={handleAiGenerate}
            aiGenerating={aiGenerating}
            assembledPrompt={prompt}
            lastOptimizedPrompt={lastOptimizedPrompt}
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
              onRefine={refineImage}
              onSelect={toggleApprove}
              onDelete={deleteAttempt}
              onDownload={downloadImage}
              activePage={activePage}
              modelId={effectiveModelId}
              onModelChange={setImageModelId}
              enabledModels={enabledModels}
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
          loadingLabel={bundleLoadingLabel}
          onConfirm={downloadApprovedBundle}
          onCancel={() => setBundleConfirm(false)}
        />
      )}
    </>
  );
}
