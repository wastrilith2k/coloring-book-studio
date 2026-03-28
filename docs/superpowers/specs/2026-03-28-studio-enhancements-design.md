# Studio Enhancements Design

Five features to improve the wizard, studio, and library workflows.

---

## Feature 1: Page Count Picker (Wizard Step 1)

**Goal:** Let users choose how many pages the AI generates instead of hardcoding 8.

**UI:** A number input with +/- stepper buttons in a new "Page Count" section below the audience picker. Range 5-50, default 20.

**Data flow:** The chosen value is passed as the `length` parameter to `POST /api/ideas`, which already accepts and clamps it (1-20). The backend clamp needs updating to allow up to 50.

**Changes:**
- `src/App.jsx` — WizardStep1: add `pageCount` state (default 20), render a labeled number input, pass to `onNext`
- `src/App.jsx` — Wizard: thread `pageCount` into `handleGenerate`, send as `length` in the API call
- `lambda/api/handler.js` — Update clamp from `Math.min(20, ...)` to `Math.min(50, ...)`
- `lambda/ws/actions/generateIdeas.js` — Same clamp update for the WebSocket path

---

## Feature 2: Retry Page Descriptions (Wizard Step 2)

**Goal:** Let users regenerate page descriptions before saving — either one at a time or all at once.

### Per-page retry

A small refresh icon button next to each page in the concept preview. Clicking it calls a new `POST /api/ideas/page` endpoint that returns a single `{title, scene, prompt}` for a given page slot, using the book's theme, audience, and surrounding page context.

**New endpoint — `POST /api/ideas/page`:**
```
Request:  { theme, audience, pageIndex, existingPages: [{title, scene}], bookTitle, concept }
Response: { page: { title, scene, prompt } }
```

Uses a focused system prompt: "Given this coloring book concept, regenerate page N. Return JSON: {title, scene, prompt}."

### Regenerate all

A "Regenerate All Pages" button below the page list. Calls the existing `POST /api/ideas` endpoint with the same theme/audience/length. Replaces all pages in the concept state but preserves any manual title/concept edits.

**Changes:**
- `lambda/api/handler.js` — Add `POST /api/ideas/page` route
- `src/App.jsx` — WizardStep2: add per-page retry button, "Regenerate All" button, loading states per page, callbacks to update concept.pages

---

## Feature 3: Editable Page Title (Studio PromptPanel)

**Goal:** Make the page title editable inline in the PromptPanel header.

**UI:** Replace the static `<h2>{activePage?.title}</h2>` with an `<input>` field styled to look like a heading. Saves on blur via `PUT /api/pages/:id` with `{ title: value }`.

**Changes:**
- `src/components/PromptPanel.jsx` — Replace `<h2>` with controlled input, add `onTitleChange` and `onTitleBlur` props
- `src/components/BookViewer.jsx` — Add `pageTitles` state (same pattern as `pagePrompts`), wire up change/blur handlers that call `saveField('title', ...)`
- After saving, the page title in the sidebar (PageList) should reflect the update. This means BookViewer needs to update `storyPages` or the parent needs to refetch. Simplest: update the local `pageTitles` state and pass it through to PageList.

---

## Feature 4: Add/Delete Pages (Studio)

**Goal:** Add and remove pages from a book in the studio.

### Delete page

A small trash icon on each page card in the sidebar PageList (not on cover). Clicking it shows an inline confirmation, then calls `DELETE /api/pages/:id` (already exists). Removes the page from local state.

### Add page

An "Add Page" button at the bottom of the PageList sidebar. Creates a blank page via `POST /api/books/:id/pages` with `{ pages: [{ title: "New Page", scene: "", prompt: "" }] }` (endpoint already exists). Appends the new page to local state and selects it.

### AI generate description (optional)

A small sparkle/wand button in the PromptPanel when the scene prompt is empty. Calls `POST /api/ideas/page` (same endpoint from Feature 2) with the book's context. Fills in the title, scene, and prompt fields for that page,

**Changes:**
- `src/components/PageList.jsx` — Add delete button per page (with confirmation), "Add Page" button at bottom
- `src/components/BookViewer.jsx` — Add handlers: `handleAddPage` (POST, update state), `handleDeletePage` (DELETE, update state, select adjacent page)
- `src/components/PromptPanel.jsx` — Add optional "Generate description" button when scene is empty
- Props threaded from BookViewer through to PageList and PromptPanel

---

## Feature 5: Delete Books (Library — Low Priority)

**Goal:** Delete books from the library dropdown.

**UI:** A small trash icon on each book item in the library dropdown. Clicking it shows inline confirmation text ("Delete?" with confirm/cancel). Confirmed delete calls `DELETE /api/books/:id` (already exists), removes from local state, and if the deleted book was active, selects the next available book or shows empty state.

**Changes:**
- `src/App.jsx` — TopBar library dropdown: add delete button per book, confirmation state, `handleDeleteBook` callback
- `src/App.jsx` — App: add `deleteBook` handler that calls API, updates `books` state, clears `activeId` if needed

---

## Backend Summary

| Endpoint | Status | Changes needed |
|---|---|---|
| `POST /api/ideas` | Exists | Update max clamp 20 -> 50 |
| `POST /api/ideas/page` | **New** | Single-page regeneration |
| `POST /api/books/:id/pages` | Exists | None |
| `DELETE /api/pages/:id` | Exists | None |
| `DELETE /api/books/:id` | Exists | None |
| `PUT /api/pages/:id` | Exists | None (title already updatable) |

## Frontend File Impact

| File | Features |
|---|---|
| `src/App.jsx` | 1 (page count), 2 (retry), 5 (delete books) |
| `src/components/BookViewer.jsx` | 3 (title edit), 4 (add/delete pages) |
| `src/components/PromptPanel.jsx` | 3 (title edit), 4 (AI generate button) |
| `src/components/PageList.jsx` | 4 (add/delete pages) |
| `lambda/api/handler.js` | 1 (clamp), 2 (new endpoint) |
| `lambda/ws/actions/generateIdeas.js` | 1 (clamp) |
