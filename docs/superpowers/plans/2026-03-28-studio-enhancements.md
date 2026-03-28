# Studio Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add page count picker, retry descriptions, editable page titles, add/delete pages, delete books, and fix the download bundle button.

**Architecture:** All features build on existing REST endpoints and React state patterns. One new backend endpoint (`POST /api/ideas/page`) for single-page regeneration. Frontend changes are in App.jsx (wizard + library), BookViewer.jsx (studio orchestration), PromptPanel.jsx (title editing + AI generate), and PageList.jsx (add/delete pages). No new dependencies.

**Tech Stack:** React (JSX, no TypeScript), Lucide icons, Lambda/Turso backend, OpenRouter AI

---

## File Map

| File | Changes |
|---|---|
| `lambda/api/handler.js` | Update page count clamp (20->50), add `POST /api/ideas/page` endpoint |
| `lambda/ws/actions/generateIdeas.js` | Update page count clamp (20->50) |
| `src/App.jsx` | Page count picker in wizard, retry buttons in Step 2, delete books in library |
| `src/components/BookViewer.jsx` | Title editing state/handlers, add/delete page handlers, AI generate handler, refetch after mutations |
| `src/components/PromptPanel.jsx` | Editable title input, AI generate description button |
| `src/components/PageList.jsx` | Delete button per page, Add Page button |
| `src/App.css` | Styles for new UI elements |

---

### Task 1: Backend — Update Page Count Clamp & Add Single-Page Regeneration Endpoint

**Files:**
- Modify: `lambda/api/handler.js:54` (clamp change + new route)
- Modify: `lambda/ws/actions/generateIdeas.js:27` (clamp change)

- [ ] **Step 1: Update the page count clamp in the REST handler**

In `lambda/api/handler.js`, line 54, change:
```js
const sceneCount = Math.max(1, Math.min(20, Number(length) || 8));
```
to:
```js
const sceneCount = Math.max(1, Math.min(50, Number(length) || 20));
```

- [ ] **Step 2: Update the page count clamp in the WebSocket handler**

In `lambda/ws/actions/generateIdeas.js`, line 27, change:
```js
const sceneCount = Math.max(1, Math.min(20, Number(length) || 8));
```
to:
```js
const sceneCount = Math.max(1, Math.min(50, Number(length) || 20));
```

- [ ] **Step 3: Add the `POST /api/ideas/page` endpoint**

In `lambda/api/handler.js`, add this block right after the existing `/api/ideas` handler (after line 71, before the 404):

```js
    // POST /api/ideas/page — regenerate a single page description
    if (path === '/api/ideas/page' && method === 'POST') {
      const { chatCompletion } = await import('../lib/openrouter.js');
      const { theme = '', audience = 'kids', pageIndex = 0, bookTitle = '', concept = '', existingPages = [] } = body;

      const pageList = existingPages.map((p, i) => `${i + 1}. ${p.title}: ${p.scene}`).join('\n');
      const systemPrompt = `You are a coloring book planner. Given the book context below, regenerate ONLY page ${Number(pageIndex) + 1}. Return JSON: {"title": "...", "scene": "...", "prompt": "..."}. Keep it coloring-book friendly and consistent with the other pages.`;
      const userContent = [
        bookTitle ? `Book: ${bookTitle}` : '',
        concept ? `Concept: ${concept}` : '',
        theme ? `Theme: ${String(theme).slice(0, 500)}` : '',
        `Audience: ${String(audience).slice(0, 100)}`,
        pageList ? `Existing pages:\n${pageList}` : '',
        `Regenerate page ${Number(pageIndex) + 1}.`,
      ].filter(Boolean).join('\n');

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ];
      const text = await chatCompletion(messages);
      let parsed;
      try {
        const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { title: `Page ${Number(pageIndex) + 1}`, scene: text, prompt: text };
      }
      return json(200, { page: parsed }, origin);
    }
```

- [ ] **Step 4: Commit**

```bash
git add lambda/api/handler.js lambda/ws/actions/generateIdeas.js
git commit -m "feat: update page count clamp to 50 and add single-page regeneration endpoint"
```

---

### Task 2: Wizard — Page Count Picker

**Files:**
- Modify: `src/App.jsx` (WizardStep1, Wizard component)
- Modify: `src/App.css` (new styles)

- [ ] **Step 1: Add `pageCount` state to the Wizard component**

In `src/App.jsx`, in the `Wizard` function (around line 215), add state after `customTheme`:
```js
const [pageCount, setPageCount] = useState(20);
```

- [ ] **Step 2: Pass `pageCount` to WizardStep1 and use it in handleGenerate**

Update the `WizardStep1` render (around line 310) to pass the new props:
```jsx
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
```

Update `handleGenerate` (around line 233) to use `pageCount` instead of hardcoded 8:
```js
body: JSON.stringify({ theme: effectiveTheme, length: pageCount, audience }),
```

- [ ] **Step 3: Update WizardStep1 signature and add the page count picker UI**

Update the function signature:
```js
function WizardStep1({ theme, setTheme, audience, setAudience, customTheme, setCustomTheme, pageCount, setPageCount, onNext }) {
```

Add a new section after the audience section closing `</div>` (after line 118) and before the Generate button:

```jsx
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
```

Note: `Layers` is already imported at the top of App.jsx — no new import needed.

- [ ] **Step 4: Add CSS for the page count picker**

Add to the end of the wizard section in `src/App.css` (before the `/* --- Concept preview --- */` section):

```css
/* Page count picker */
.page-count-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

.page-count-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.page-count-btn:hover:not(:disabled) {
  background: var(--bg-hover);
}

.page-count-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-count-input {
  width: 64px;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 6px;
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.page-count-input::-webkit-inner-spin-button,
.page-count-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.page-count-input[type='number'] {
  -moz-appearance: textfield;
}
```

- [ ] **Step 5: Build and verify**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat: add page count picker to wizard (5-50, default 20)"
```

---

### Task 3: Wizard — Retry Page Descriptions

**Files:**
- Modify: `src/App.jsx` (WizardStep2, Wizard component)
- Modify: `src/App.css` (retry button styles)

- [ ] **Step 1: Add retry imports and update WizardStep2 signature**

Add `RefreshCw` to the Lucide import at the top of `src/App.jsx`:
```js
import {
  BookOpen, ChevronRight, Layers, LogOut, MessageSquare, Moon, Palette,
  Sparkles, Sun, Users, Wand2, Check, Library, Plus, ArrowLeft, X, RefreshCw,
} from 'lucide-react';
```

Update WizardStep2 signature to accept new props:
```js
function WizardStep2({ concept, generating, error, onRetryPage, onRetryAll, retryingPages, retryingAll }) {
```

- [ ] **Step 2: Add per-page retry button and Regenerate All button to WizardStep2**

Replace the existing concept-page-list mapping (lines 166-175) with:
```jsx
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
```

Add a "Regenerate All" button after the closing `</div>` of `concept-pages` (after the concept-page-list div, still inside concept-pages):
```jsx
          <button
            className="btn ghost concept-retry-all"
            onClick={onRetryAll}
            disabled={retryingAll || generating}
          >
            <RefreshCw size={14} className={retryingAll ? 'spin' : ''} />
            {retryingAll ? 'Regenerating...' : 'Regenerate All Pages'}
          </button>
```

- [ ] **Step 3: Add retry handlers to the Wizard component**

In the `Wizard` function, add state and handlers after `handleBack`:

```js
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
```

- [ ] **Step 4: Pass retry props to WizardStep2**

Update the WizardStep2 render (around line 321):
```jsx
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
```

- [ ] **Step 5: Add CSS for retry buttons and spin animation**

Add to `src/App.css`:

```css
/* Concept page retry */
.concept-page-content {
  flex: 1;
  min-width: 0;
}

.concept-page-retry {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, border-color 0.15s;
}

.concept-page-retry:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--text-primary);
}

.concept-page-retry:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.concept-retry-all {
  margin-top: 8px;
  width: 100%;
  justify-content: center;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spin {
  animation: spin 0.8s linear infinite;
}
```

- [ ] **Step 6: Build and verify**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat: add per-page and full retry for wizard page descriptions"
```

---

### Task 4: Studio — Editable Page Title in PromptPanel

**Files:**
- Modify: `src/components/PromptPanel.jsx`
- Modify: `src/components/BookViewer.jsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add title props to PromptPanel**

In `src/components/PromptPanel.jsx`, update the props to include title editing:

```js
export default function PromptPanel({
  activePage,
  isCover,
  bookTitle,
  // Cover
  coverPrompt,
  onCoverPromptChange,
  // Title
  currentTitle,
  onTitleChange,
  onTitleBlur,
  titleSaving,
  // Style
  currentStyle,
  onStyleChange,
  onStyleBlur,
  styleSaving,
  styleError,
  // Scene
  currentPrompt,
  onPromptChange,
  onPromptBlur,
  promptSaving,
  promptError,
  // Caption
  currentCaption,
  onCaptionChange,
  onCaptionBlur,
  captionSaving,
  // Notes
  currentPageNotes,
  onPageNotesChange,
  onPageNotesBlur,
  // Errors
  imageError,
  genError,
  // AI generate (optional)
  onAiGenerate,
  aiGenerating,
}) {
```

- [ ] **Step 2: Replace the static h2 title with an editable input**

In `src/components/PromptPanel.jsx`, replace lines 40-44:
```jsx
      <div className="book-viewer__header">
        <p className="book-viewer__crumb">Workspace &gt; {bookTitle}</p>
        <h2>{activePage?.title ?? 'Select a page'}</h2>
        <p className="book-viewer__scene">
          {activePage?.scene ?? 'Choose a page to generate an illustration.'}
        </p>
      </div>
```

with:
```jsx
      <div className="book-viewer__header">
        <p className="book-viewer__crumb">Workspace &gt; {bookTitle}</p>
        {activePage && !isCover ? (
          <input
            className="page-title-input"
            type="text"
            value={currentTitle ?? activePage?.title ?? ''}
            onChange={onTitleChange}
            onBlur={onTitleBlur}
            placeholder="Page title..."
          />
        ) : (
          <h2>{activePage?.title ?? 'Select a page'}</h2>
        )}
        {titleSaving && <span className="pill subtle">Saving...</span>}
        <p className="book-viewer__scene">
          {activePage?.scene ?? 'Choose a page to generate an illustration.'}
        </p>
      </div>
```

- [ ] **Step 3: Add AI generate button for empty scenes**

In `src/components/PromptPanel.jsx`, add `Sparkles` to the import:
```js
import { AlertCircle, Sparkles, StickyNote } from 'lucide-react';
```

After the scene prompt textarea (after the `promptError` alert, around line 89), add:
```jsx
            {onAiGenerate && !currentPrompt?.trim() && (
              <button className="btn ghost ai-gen-btn" onClick={onAiGenerate} disabled={aiGenerating}>
                <Sparkles size={14} />
                {aiGenerating ? 'Generating...' : 'AI Generate Description'}
              </button>
            )}
```

- [ ] **Step 4: Add pageTitles state and handlers in BookViewer**

In `src/components/BookViewer.jsx`, add `pageTitles` state alongside the other page-field states (after `pageNotes` declaration, around line 64):
```js
const [pageTitles, setPageTitles] = useState({});
```

In the `useEffect` that initializes on book change (around line 76), add to the init block:
```js
const t = {};
```
And inside the `pages.forEach` loop, add:
```js
t[p.id] = p.title || '';
```
And after the loop, add:
```js
setPageTitles(t);
```

Add handlers after `handleCoverPromptChange` (around line 198):
```js
const handleTitleChange = e => { if (activePage && !isCover) setPageTitles(p => ({ ...p, [activePage.id]: e.target.value })); };
const handleTitleBlur = () => { if (activePage && !isCover) saveField('title', pageTitles[activePage.id] ?? ''); };
```

- [ ] **Step 5: Add AI generate handler in BookViewer**

Add after the title handlers:
```js
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
```

- [ ] **Step 6: Wire the new props into the PromptPanel render**

In the `<PromptPanel>` JSX in BookViewer, add these props:
```jsx
currentTitle={activePage && !isCover ? pageTitles[activePage.id] ?? '' : ''}
onTitleChange={handleTitleChange}
onTitleBlur={handleTitleBlur}
titleSaving={currentState.titleSaving}
onAiGenerate={handleAiGenerate}
aiGenerating={aiGenerating}
```

- [ ] **Step 7: Update PageList to use live titles from pageTitles**

In `src/components/BookViewer.jsx`, pass `pageTitles` to PageList:
```jsx
<PageList
  navPages={navPages}
  activePage={activePage}
  setActivePage={setActivePage}
  pageState={pageState}
  approvedUrlForPage={approvedUrlForPage}
  pageTitles={pageTitles}
/>
```

In `src/components/PageList.jsx`, update the signature and use live titles:
```js
export default function PageList({ navPages, activePage, setActivePage, pageState, approvedUrlForPage, pageTitles }) {
```

Update the title display (line 20):
```jsx
<p className="page-card__title">{pageTitles?.[p.id] ?? p.title}</p>
```

- [ ] **Step 8: Add CSS for the page title input**

Add to `src/App.css`:
```css
/* Editable page title */
.page-title-input {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-primary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 4px 8px;
  margin: 0 -8px;
  width: calc(100% + 16px);
  transition: border-color 0.15s;
}

.page-title-input:hover {
  border-color: var(--border-default);
}

.page-title-input:focus {
  border-color: var(--accent);
  outline: none;
}

/* AI generate button */
.ai-gen-btn {
  margin-top: 4px;
  font-size: 12px;
  gap: 4px;
}
```

- [ ] **Step 9: Build and verify**

```bash
npm run build
```

- [ ] **Step 10: Commit**

```bash
git add src/components/PromptPanel.jsx src/components/BookViewer.jsx src/components/PageList.jsx src/App.css
git commit -m "feat: editable page titles in studio and AI generate description button"
```

---

### Task 5: Studio — Add and Delete Pages

**Files:**
- Modify: `src/components/PageList.jsx`
- Modify: `src/components/BookViewer.jsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add delete and add handlers in BookViewer**

In `src/components/BookViewer.jsx`, add imports for the `apiFetch` call (already imported). Add these handlers after the AI generate handler:

```js
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
    // Trigger a refetch of the book to get updated pages
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
```

- [ ] **Step 2: Add `onPagesChanged` prop to BookViewer**

Update the BookViewer function signature to include `onPagesChanged`:
```js
export default function BookViewer({
  bookId = null,
  coverUrl = '',
  characterGuide = '',
  storyPages = [],
  bookTitle = 'Book',
  tagLine = '',
  bookNotes: initialBookNotes = '',
  onPagesChanged,
}) {
```

- [ ] **Step 3: Pass handlers to PageList**

Update the `<PageList>` render in BookViewer:
```jsx
<PageList
  navPages={navPages}
  activePage={activePage}
  setActivePage={setActivePage}
  pageState={pageState}
  approvedUrlForPage={approvedUrlForPage}
  pageTitles={pageTitles}
  onAddPage={handleAddPage}
  onDeletePage={handleDeletePage}
/>
```

- [ ] **Step 4: Update PageList with add/delete UI**

Replace the entire `src/components/PageList.jsx`:

```jsx
import { useState } from 'react';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';

export default function PageList({ navPages, activePage, setActivePage, pageState, approvedUrlForPage, pageTitles, onAddPage, onDeletePage }) {
  const [confirmDelete, setConfirmDelete] = useState(null);

  return (
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
          <div key={p.id} className="page-card-wrap">
            <button
              onClick={() => setActivePage(p)}
              className={`page-card ${activePage?.id === p.id ? 'is-active' : ''}`}
            >
              <p className="page-card__title">{pageTitles?.[p.id] ?? p.title}</p>
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
            {!p.isCover && onDeletePage && (
              confirmDelete === p.id ? (
                <div className="page-card__confirm-delete">
                  <span>Delete?</span>
                  <button className="btn-tiny danger" onClick={() => { onDeletePage(p.id); setConfirmDelete(null); }}>Yes</button>
                  <button className="btn-tiny" onClick={() => setConfirmDelete(null)}>No</button>
                </div>
              ) : (
                <button
                  className="page-card__delete"
                  onClick={() => setConfirmDelete(p.id)}
                  title="Delete page"
                >
                  <Trash2 size={14} />
                </button>
              )
            )}
          </div>
        );
      })}
      {onAddPage && (
        <button className="page-card page-card--add" onClick={onAddPage}>
          <Plus size={18} />
          <span>Add Page</span>
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wire `onPagesChanged` in App.jsx**

In `src/App.jsx`, update the `<BookViewer>` render (around line 591) to pass `onPagesChanged`:
```jsx
<BookViewer
  bookId={bookData?.id || activeBook.id}
  characterGuide={bookData?.concept || ''}
  storyPages={preparedPages}
  bookTitle={bookData?.title || activeBook.title}
  tagLine={bookData?.tagLine || ''}
  bookNotes={bookData?.notes || ''}
  onPagesChanged={() => fetchBook(activeId)}
/>
```

- [ ] **Step 6: Add CSS for delete and add page UI**

Add to `src/App.css`:

```css
/* Page card wrap for delete button */
.page-card-wrap {
  position: relative;
}

.page-card__delete {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}

.page-card-wrap:hover .page-card__delete {
  opacity: 1;
}

.page-card__delete:hover {
  color: var(--danger, #e53e3e);
}

.page-card__confirm-delete {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.btn-tiny {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  color: var(--text-primary);
  cursor: pointer;
}

.btn-tiny.danger {
  color: #fff;
  background: var(--danger, #e53e3e);
  border-color: var(--danger, #e53e3e);
}

/* Add page button */
.page-card--add {
  border: 2px dashed var(--border-default);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 16px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  background: transparent;
}

.page-card--add:hover {
  color: var(--text-primary);
  border-color: var(--text-primary);
}
```

- [ ] **Step 7: Build and verify**

```bash
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/components/PageList.jsx src/components/BookViewer.jsx src/App.jsx src/App.css
git commit -m "feat: add and delete pages in studio sidebar"
```

---

### Task 6: Library — Delete Books

**Files:**
- Modify: `src/App.jsx` (TopBar component, App component)
- Modify: `src/App.css`

- [ ] **Step 1: Add `Trash2` to the Lucide imports in App.jsx**

Add `Trash2` to the import (it may already be there after Task 5 if PageList was handled — but App.jsx doesn't import from PageList directly, so add it here):

```js
import {
  BookOpen, ChevronRight, Layers, LogOut, MessageSquare, Moon, Palette,
  Sparkles, Sun, Users, Wand2, Check, Library, Plus, ArrowLeft, X, RefreshCw, Trash2,
} from 'lucide-react';
```

- [ ] **Step 2: Add delete handler in the App component**

In the `App` component, add a `handleDeleteBook` function after `handleBookCreated`:

```js
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
```

- [ ] **Step 3: Pass `onDeleteBook` to TopBar**

Update the TopBar render:
```jsx
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
```

- [ ] **Step 4: Update TopBar to accept `onDeleteBook` and render delete UI**

Update TopBar signature:
```js
function TopBar({ books, activeId, setActiveId, user, signOut, onNewBook, onDeleteBook, theme, toggleTheme, chatOpen, toggleChat }) {
```

Add confirmation state inside TopBar:
```js
const [confirmDeleteId, setConfirmDeleteId] = useState(null);
```

Replace the library item button (around lines 397-406) with:
```jsx
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
```

- [ ] **Step 5: Add CSS for library delete UI**

Add to `src/App.css`:

```css
/* Library item delete */
.library-item-wrap {
  display: flex;
  align-items: center;
  position: relative;
}

.library-item-wrap .library-item {
  flex: 1;
  min-width: 0;
}

.library-item__delete {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}

.library-item-wrap:hover .library-item__delete {
  opacity: 1;
}

.library-item__delete:hover {
  color: var(--danger, #e53e3e);
}

.library-item__confirm {
  display: flex;
  gap: 4px;
  padding-right: 4px;
}
```

- [ ] **Step 6: Build and verify**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat: delete books from library dropdown"
```

---

### Task 7: Fix Download Bundle Button

**Files:**
- Modify: `src/components/BookViewer.jsx` (investigate and fix)

- [ ] **Step 1: Investigate the download button behavior**

The download bundle button is at `src/components/BookViewer.jsx:329`. It calls `downloadApprovedBundle` which:
1. Fetches `GET /api/books/${bookId}/download`
2. Builds a zip with JSZip
3. Triggers download via `URL.createObjectURL`

Potential issues to check:
- The `canDownloadBundle` guard requires `allApproved` — which requires ALL pages AND cover to have an approved image. Check if this is too strict.
- The `approvedUrlForPage` function checks `pageState[page.id]` which is local carousel state — it may not have loaded attempts for pages the user hasn't visited yet, causing `allApproved` to be false even when pages have `image_url` set.

Look at `approvedUrlForPage` (line 126-132):
```js
const approvedUrlForPage = page => {
  const state = pageState[page.id] || {};
  const approved = (state.attempts || []).find(a => a.approved);
  if (approved?.url) return approved.url;
  if (page.isCover) return page.image_url || '';
  return page.image_url || null;
};
```

This falls through to `page.image_url` when no attempts are loaded, which is correct. But the `allApproved` check:
```js
const count = approvalItems.reduce((acc, p) => (approvedUrlForPage(p) ? acc + 1 : acc), 0);
```
This should count pages with `image_url` even if their attempts aren't loaded. The real issue is likely that `image_url` is empty on pages that haven't had images explicitly set via the approve flow.

Check the cover page object:
```js
const coverPage = useMemo(
  () => ({ id: 'cover', title: 'Cover', scene: 'Front cover illustration', includeCharacterGuide: false, isCover: true, image_url: coverUrl }),
  [coverUrl]
);
```

The `coverUrl` prop is hardcoded to `''` in App.jsx line 592 — it's never passed! BookViewer receives `coverUrl = ''` always, so the cover is never considered approved unless the user visits it and approves an image in the current session.

- [ ] **Step 2: Fix the coverUrl prop**

In `src/App.jsx`, update the BookViewer render to pass the actual cover URL:
```jsx
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
```

Note: `coverUrl` is already in the BookViewer signature with default `''`. We just need to pass `bookData?.cover_url`.

- [ ] **Step 3: Verify the download endpoint returns correct data**

The backend at `lambda/api/routes/books.js:134-172` checks `!p.image_url` for each page and requires `book.cover_url`. This matches the frontend logic. The fix above should ensure the cover URL is properly tracked.

If the download still fails, there may also be an issue with presigned URLs expiring in the zip fetch. But the backend already returns base64 data for S3 keys, so this should work.

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "fix: pass coverUrl to BookViewer so download bundle tracks cover approval"
```

---

### Task 8: Deploy

- [ ] **Step 1: Final build**

```bash
npm run build
```

- [ ] **Step 2: Push to deploy**

```bash
git push origin main
```

- [ ] **Step 3: Verify deployment**

```bash
gh run list --limit 1
```
