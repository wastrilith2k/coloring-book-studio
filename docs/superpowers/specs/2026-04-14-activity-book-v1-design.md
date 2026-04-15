# Activity Book v1 — Design Spec

**Status:** Design approved, awaiting implementation plan
**Date:** 2026-04-14
**Author:** Brainstormed with Claude

## Goal

Extend Coloring Book Studio to support a second book type — **Activity Book** — while simultaneously overhauling the prompt pipeline for stronger style consistency.

An Activity Book is the current coloring-book experience plus a per-page **layout** system: pages can be full images (the existing coloring page) or image + text-field compositions like writing prompts, checklists, Q&A, draw-your-own, and fill-in-the-blank.

The same release introduces book-level **Style DNA** and structured **recurring characters**, plus reference-image conditioning on models that support it (Gemini), so art direction is a first-class, editable property of the book rather than a per-page concern.

## Non-Goals (v1)

- **Puzzle layouts** (mazes, word searches, crosswords, logic puzzles, word ladders, connect-the-dots, color-by-number) — deferred to a separate project. Those require either a shared Python puzzle library extracted from `../kdp-pipeline` or JS ports, and are out of scope here.
- **Spot-the-difference layouts** — require image variation, deferred to v2.
- **Tracing layouts** — require a dotted/outline font asset dependency, deferred to v2.
- **Rebranding** — UI stays "Coloring Book Studio"; Activity Book is a second book type inside it. A full rebrand is a future decision once adoption data exists.
- **Per-page regeneration at the old aspect ratio** — when switching layouts on an existing page, the user gets a warning and a regenerate button, not an automatic re-crop.
- **Snapshot-based PDF visual regression tests** — too fragile; unit tests at the renderer level cover the assertions that matter.

## High-level Summary

1. `books` gains `book_type`, `style_guide`, `style_anchor_image_url`, `style_anchor_locked`.
2. New `book_characters` table — row-per-recurring-character with optional anchor image.
3. `pages` gains `layout` (enum in JS, TEXT in SQL) and `layout_data` (JSON blob).
4. New `shared/layouts.json` is the single source of truth for layout metadata, consumed by frontend and backend.
5. Prompt builder becomes a layered assembler: Style DNA → relevant characters → per-page override → scene → layout hint → model-specific formatting.
6. New `generateLayoutCopy` LLM call populates layout-specific copy (checklist items, Q&A questions, fill-in sentences, writing-prompt question) on demand.
7. Image generation picks dimensions per layout (per-layout aspect ratio), the 300 DPI upscaler matches, renderers draw at declared aspect.
8. On Gemini, `style_anchor_image_url` and per-character anchors are passed as reference images; on Flux, silently fall back to text-only.
9. PDF export extracts out of `BookViewer.jsx` into `src/lib/pdf-export.js` + `src/lib/layout-renderers.js`, dispatcher-per-layout.
10. Wizard gains book-type selector; activity books get varied layouts auto-assigned by the concept LLM call. New Book Settings panel manages style + characters. PromptPanel gets a layout picker and dynamic `layout_data` editor. PageList gets emoji layout badges.
11. Migration is pure additive; existing coloring books render and export identically.

## Data Model

### `books` — ALTER TABLE additions

```sql
ALTER TABLE books ADD COLUMN book_type TEXT DEFAULT 'coloring';
ALTER TABLE books ADD COLUMN style_guide TEXT DEFAULT '';
ALTER TABLE books ADD COLUMN style_anchor_image_url TEXT DEFAULT '';
ALTER TABLE books ADD COLUMN style_anchor_locked INTEGER DEFAULT 0;
```

- `book_type`: `'coloring'` or `'activity'`. Existing books default to `'coloring'`.
- `style_guide`: 4–6 lines of visual art direction (linework, shading, character proportions, background density, mood). Prepended to every page image prompt. Wizard generates once, user can edit or regenerate from Book Settings.
- `style_anchor_image_url`: optional reference image for Gemini conditioning. Empty = no anchor.
- `style_anchor_locked`: `0` by default. When `0`, the anchor auto-updates to the first approved image on the book if it is currently empty. When `1`, the anchor is frozen. UI exposes a lock/unlock toggle.

### New `book_characters` table

```sql
CREATE TABLE IF NOT EXISTS book_characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  anchor_image_url TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_book_characters_book_id ON book_characters(book_id);
```

Each row is a recurring character: `name`, short visual `description`, optional `anchor_image_url` for per-character Gemini conditioning.

### `pages` — ALTER TABLE additions

```sql
ALTER TABLE pages ADD COLUMN layout TEXT DEFAULT 'full_image';
ALTER TABLE pages ADD COLUMN layout_data TEXT DEFAULT '{}';
```

- `layout`: one of the 7 v1 layout ids. Enum enforced in application code, not DB.
- `layout_data`: JSON blob whose shape is determined by the layout's `dataSchema`. Populated lazily when a page switches to a non-default layout.

### Preserved fields

`pages.character_style` and `pages.character_desc` remain as per-page overrides. When non-empty they take precedence over `book.style_guide` and matched `book_characters` in the prompt builder. This preserves every existing page's generation behavior exactly.

## Layout Catalog (v1)

Seven layouts. Metadata lives in `shared/layouts.json`, consumed by both frontend (renderers, UI) and backend (copy generation, prompt hints).

| id | name | bookTypes | imageAspect | copy generated? |
|---|---|---|---|---|
| `full_image` | Full Image | coloring, activity | 8.5:11 | no |
| `image_with_lines` | Image + Writing Lines | activity | 8.5:5 | no (user chooses line count) |
| `image_with_prompt_lines` | Image + Prompt + Lines | activity | 8.5:5 | yes (question) |
| `image_with_checklist` | Image + Find Things Checklist | activity | 8.5:6.5 | yes (5 items) |
| `image_with_qa` | Image + Q&A | activity | 8.5:5.5 | yes (3 questions) |
| `image_with_draw_box` | Image + Draw Your Own | activity | 8.5:5 | yes (instruction) |
| `image_with_fill_blank` | Image + Fill-in-the-Blank | activity | 8.5:6 | yes (3 sentences) |

### `shared/layouts.json` shape

Each entry:

```json
{
  "id": "image_with_checklist",
  "name": "Image + Find Things Checklist",
  "description": "A list of things to find hidden in the image.",
  "bookTypes": ["activity"],
  "imageAspect": "8.5:6.5",
  "promptHint": "The scene MUST visibly contain all of: {items}.",
  "copyPromptTemplate": "Given this scene: {scene}, list exactly 5 specific visual things a child could find in the illustration. Keep each item to 2-4 words, concrete, kid-friendly. Return JSON: {\"items\": [\"...\", \"...\", \"...\", \"...\", \"...\"]}.",
  "dataSchema": { "items": "string[]" },
  "editableFields": [
    { "key": "items", "label": "Things to find", "type": "stringList", "min": 3, "max": 8 }
  ],
  "badge": "🔍"
}
```

`pdfRenderer` is NOT in the JSON — it's a JS function, kept in `src/lib/layout-renderers.js` keyed by layout id.

## Prompt Pipeline

### Layered assembly

New module: `lambda/lib/prompt-builder.js` — extracted from wherever prompt building currently lives in the generate-image route.

Assembly order (outer to inner), with each layer skipped if empty:

1. **Style DNA** — `book.style_guide`
2. **Relevant characters** — matched subset of `book_characters` (substring match of `name` against `page.title` + `page.scene`). Injected as `name: description` lines.
3. **Per-page override** — `page.character_style` and `page.character_desc` when non-empty. Takes precedence over layers 1 and 2 for the specific concern it names.
4. **Scene** — `page.prompt || page.scene`
5. **Layout hint** — `LAYOUTS[page.layout].promptHint`, with `{items}`, `{question}`, etc. substituted from `layout_data`. For `full_image` the hint is empty.
6. **Model-specific format** — Flux gets flat text, Gemini/GPT get XML-structured (keeping the existing `lambda/lib/prompt-builder` model-aware formatting from commit `13e541c`).

### Prompt caching

The style-guide + sorted-characters block is deterministic per book. Cache key: `hash(style_guide + sorted(character_blocks) + scene + layout_hint)`. Extends the existing prompt cache from commit `b6b830b`.

### `generateLayoutCopy`

New module: `lambda/lib/layout-copy.js`. Signature:

```js
async function generateLayoutCopy(scene, layoutId, bookContext) { ... }
```

Reads the layout's `copyPromptTemplate`, substitutes `{scene}`, runs one OpenRouter call (same stack as chat), parses the JSON response against the layout's `dataSchema`, returns the parsed object. Malformed JSON → one retry with a "respond with valid JSON only" reminder, then fall back to an empty/default shape (e.g. `{items: []}`) so the UI doesn't crash.

### Style DNA generation

The wizard, after generating the book concept, makes one extra LLM call:

> "Given this book concept: {concept}, write a 4-6 line Style Guide describing the visual art direction (linework, shading, character proportions, background density, mood). This will be prepended to every page image prompt."

Result stored to `books.style_guide`. The user sees it in the wizard with Edit and Regenerate buttons.

### Reference-image conditioning

In `lambda/api/routes/generate-image.js`:

- Load `book.style_anchor_image_url` if set. Load matched-character `anchor_image_url`s, up to a cap of 3 (book anchor + top 3 character anchors by name match).
- If the selected model is **Gemini**: fetch anchor bytes from S3, include as additional input in the Gemini request. Document the exact request shape in the implementation plan once confirmed against current Gemini API.
- If the model is **Flux** (or any other non-reference-capable model): skip silently. The layered text assembly is still authoritative.

### Auto-anchoring

On page approval (`POST /api/pages/:pageId/images/:imageId/approve`): if `book.style_anchor_locked = 0` AND `book.style_anchor_image_url IS NULL or ''`, set it to the just-approved image URL. This locks in visual style from the first approval without user effort. Lock/unlock exposed in Book Settings.

## Per-Layout Image Aspect Ratios

Every image is generated at the aspect ratio declared by its page's layout.

### Generation pipeline

`lambda/api/routes/generate-image.js` resolves: page → layout → `imageAspect` → model-specific dimensions.

- **Gemini** supports a fixed enum: `1:1`, `3:4`, `4:3`, `9:16`, `16:9`. Layout aspects map to the nearest supported value via `lambda/lib/aspect-mapping.js`. Example mapping: `8.5:11 → 3:4`, `8.5:5 → 16:9`, `8.5:6 → 4:3`, etc. Exact mapping table in `aspect-mapping.js` with a unit test ensuring every layout maps to a valid enum.
- **Flux Schnell via fal.ai** accepts explicit `{width, height}`. Dimensions computed from `imageAspect` to land on clean values (e.g. `1024x600` for `8.5:5`). Preferred path — closer fidelity than enum mapping.

### 300 DPI upscaling

`lambda/lib/image.js` (currently hard-coded to 2550x3300) becomes aspect-aware: `(8.5 * 300) × (heightInches * 300)`. Stored with the existing `-print.png` suffix.

### Layout changes on approved pages

When a user switches a page's layout to one with a different `imageAspect` AND the page has approved images, the UI shows:

> "Changing the layout will require regenerating images at a new size. Existing approved images will still be available but may not fit the new layout perfectly. **[Regenerate]** **[Keep existing]**"

Keeping the existing image lets the renderer draw it into the new region with letterboxing/cropping. Regenerating kicks off normal generation at the new aspect.

## PDF Export

### File reorganization

- **Extract** the PDF export logic out of `src/components/BookViewer.jsx` (currently around line 583) into a new module **`src/lib/pdf-export.js`**.
- **New sibling** `src/lib/layout-renderers.js` exports one function per layout id.
- `BookViewer.jsx` retains only the download modal UI and calls `exportInteriorPdf(book, pages, opts)`, `exportCoverPdf(...)`, `exportCompleteBookPdf(...)`.

### Top-level export

```js
// src/lib/pdf-export.js
export async function exportInteriorPdf(book, pages, opts) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const fonts = {
    body: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
  };

  for (const page of pages) {
    if (opts.bleedThrough) addBleedPage(pdf);

    const pdfPage = pdf.addPage([612, 792]); // 8.5x11 at 72pt/in
    const rect = computePrintableRect(pdfPage, opts.margins);
    const image = await loadAndEmbedImage(pdf, page);

    const layout = getLayout(page.layout || 'full_image');
    await layout.pdfRenderer(pdfPage, {
      image,
      layoutData: safeJsonParse(page.layout_data) || {},
      page,
      book,
      fonts,
      rect,
      rgb,
    });
  }

  return pdf.save();
}
```

### Renderer contract

All renderers in `layout-renderers.js` share the signature:

```js
function renderXxx(pdfPage, { image, layoutData, page, book, fonts, rect, rgb }) { ... }
```

Each renderer draws *only* inside `rect` and is responsible for its own title/caption/artifacts. Since images now match their region exactly, renderers do not letterbox.

### Per-layout rendering notes

- **`renderFullImage`** — title band top, image fills remaining ~85% of rect, caption band bottom. Matches current behavior.
- **`renderImageWithLines`** — title band, image in top half, ruled lines filling bottom half (count from `layoutData.lineCount || 8`), drawn via `drawLine` with a thin gray stroke at even spacing.
- **`renderImageWithPromptLines`** — title band, image top ~45%, prompt question in bold serif below image, ruled lines below the question.
- **`renderImageWithChecklist`** — title band, image top ~60%, each item rendered as an empty `drawRectangle` checkbox + item text. Rectangle drawn explicitly (not a Unicode glyph) to avoid font fallback issues.
- **`renderImageWithQA`** — title band, image top ~50%, then numbered questions each followed by `linesPerQuestion` ruled lines. Overflow: shrink line count, never spill to a second page.
- **`renderImageWithDrawBox`** — title band, image top ~45%, instruction text centered, then a bordered empty rectangle filling the remainder.
- **`renderImageWithFillBlank`** — title band, image top ~55%, sentences below in larger body text, blanks drawn as underscore runs.

### Fail-safe

If `page.layout` is unknown, `getLayout(id)` returns `LAYOUTS.full_image`. Books never fail to export.

### Cover and complete-book export

Covers always render as `full_image`. The complete-book PDF wraps cover + interior. No changes to those paths beyond the call-site refactor.

## UI Changes

### 1. Wizard — book type selector

New first step: two large cards, **Coloring Book** (current behavior) and **Activity Book**. Activity-book branch gets a sub-multi-select: *"What kind of activities? (writing prompts, find-things, draw-your-own, mixed)"*. Defaults to "mixed."

The wizard's concept-generation LLM prompt gets a new instruction for activity books:

> "For each page, also assign one layout from this list: {layoutIds}. Distribute layouts to keep the book varied. Favor layouts matching the user's preference: {preference}."

Returned page objects include `layout`, which is stored when the book is saved. Coloring books default every page to `full_image` and skip the layout-assignment instruction.

### 2. Wizard — Style DNA preview

After concept generation, a collapsible section shows the generated `style_guide` with **Regenerate** and **Edit** buttons. Saved alongside the book.

### 3. Book Settings panel (new)

Accessed via a new gear icon in the `BookViewer` sidebar header. Modal or drawer containing:

- **Style Guide** — textarea bound to `book.style_guide`. "Regenerate from concept" button.
- **Style Anchor Image** — thumbnail of `style_anchor_image_url` (or placeholder "auto: will be set on first approved image"). Lock/unlock toggle bound to `style_anchor_locked`. "Pick from approved images" action.
- **Characters** — list of `book_characters` rows. Each row: name, description textarea, optional anchor image picker, delete button. "Add Character" button. "Generate Characters from Concept" button (LLM populates 1–3 starter characters on demand).

### 4. PromptPanel — layout picker

In `src/components/PromptPanel.jsx`, a new "Layout" dropdown above existing prompt fields, populated from `layoutsForBookType(book.book_type)`. Hidden for coloring books (only one valid layout). For activity books, all 7 are listed.

Changing the layout calls `POST /api/pages/:id/layout` with `{layout: newId}`. Response includes populated `layout_data`. If the page has approved images at a different aspect ratio, show the regenerate-or-keep warning described above.

### 5. PromptPanel — layout_data editor

Below the layout picker, a dynamic form driven by the layout's `editableFields`. Field-type dispatcher handles `text`, `textarea`, `number`, `stringList`. A "Regenerate copy" button reruns `generateLayoutCopy`. Small component, ~80 lines. No form library.

### 6. PageList — emoji layout badges

Each page row in `src/components/PageList.jsx` gets a small emoji badge from `layouts[id].badge`:

| layout | emoji |
|---|---|
| `full_image` | 🖼️ |
| `image_with_lines` | 📝 |
| `image_with_prompt_lines` | ✏️ |
| `image_with_checklist` | 🔍 |
| `image_with_qa` | ❓ |
| `image_with_draw_box` | 🎨 |
| `image_with_fill_blank` | ✍️ |

### Unchanged surfaces

- Chat panel — already gets full book context.
- Admin panel — no new admin-gated controls.
- Image carousel — shows attempts unchanged, just at the new aspect ratio.

## API Changes

### New endpoints

- **`POST /api/pages/:id/layout`** — body `{layout: 'image_with_checklist'}`. Updates `pages.layout`, runs `generateLayoutCopy` if the layout has a template, writes `layout_data`, returns the updated page.
- **`POST /api/pages/:id/layout/regenerate-copy`** — reruns `generateLayoutCopy` for the page's current layout without changing the layout itself.
- **`GET /api/books/:id/characters`** — list `book_characters`.
- **`POST /api/books/:id/characters`** — create.
- **`PUT /api/characters/:id`** — update.
- **`DELETE /api/characters/:id`** — delete.
- **`POST /api/books/:id/characters/generate`** — LLM-populate 1–3 starter characters from the book concept.
- **`POST /api/books/:id/style-guide/regenerate`** — regenerate `style_guide` from the book concept.
- **`PUT /api/books/:id/style-anchor`** — body `{image_url, locked}`.

### Modified endpoints

- **`POST /api/books`** (book creation) — accepts `book_type`, `style_guide`, `characters[]`, and per-page `layout`. Existing behavior preserved when fields are absent.
- **`POST /api/generate-image`** — resolves per-layout aspect ratio and reference images from the page + book context.
- **`POST /api/pages/:pageId/images/:imageId/approve`** — auto-anchoring side effect (set `style_anchor_image_url` if unset and not locked).

## Migration & Backwards Compatibility

### Schema migrations

Append to `MIGRATIONS` array in `lambda/lib/db.js`:

```js
"ALTER TABLE books ADD COLUMN book_type TEXT DEFAULT 'coloring'",
"ALTER TABLE books ADD COLUMN style_guide TEXT DEFAULT ''",
"ALTER TABLE books ADD COLUMN style_anchor_image_url TEXT DEFAULT ''",
"ALTER TABLE books ADD COLUMN style_anchor_locked INTEGER DEFAULT 0",
"ALTER TABLE pages ADD COLUMN layout TEXT DEFAULT 'full_image'",
"ALTER TABLE pages ADD COLUMN layout_data TEXT DEFAULT '{}'",
```

Append `book_characters` CREATE TABLE to the `SCHEMA` string. Auto-migrator handles idempotency.

### Defaults preserve existing behavior

- Every existing book becomes `book_type='coloring'`, `style_guide=''`, no anchor, no characters, no lock.
- Every existing page becomes `layout='full_image'`, `layout_data='{}'`.
- Prompt builder treats empty `style_guide` and empty characters as "skip that layer" — old prompts retain their exact current shape.
- PDF export of a pre-migration book is byte-compatible with today's output (aside from any incidental changes from the export refactor, which should be reviewed as part of manual QA).

### Opt-in backfills

No automatic LLM calls on existing books. Book Settings exposes "Generate Style Guide" and "Generate Characters from Concept" buttons so users can opt in.

### Frontend defensive defaults

Everywhere the frontend reads `book.book_type`, `book.style_guide`, `page.layout`, etc., it applies a defensive default (`|| 'coloring'`, `|| ''`, `|| 'full_image'`) so a stale cached object does not crash the UI.

### Rollback

Pure additive schema + new table. Rollback is app-code-only — stop writing the new fields; old code paths still work. No destructive operations.

## Testing Strategy

### Unit tests — `lambda/test/`

- **`prompt-builder.test.js`** — table-driven tests for layer assembly. Empty style_guide skips layer. Empty characters skip layer. Per-page override beats book-level. Character name matching includes relevant descriptions and skips irrelevant ones. Layout hint substitution from `layout_data` works for every layout type.
- **`layout-copy.test.js`** — mocked OpenRouter client. Asserts correct template substitution, JSON parsing, malformed-JSON retry + fallback.
- **`aspect-mapping.test.js`** — every layout's `imageAspect` maps to a valid Gemini enum and a valid fal.ai `{width, height}`. Regression gate on adding new layouts.
- **`layouts-schema.test.js`** — schema validation of `shared/layouts.json`: required keys present, `dataSchema` matches `editableFields`, `bookTypes` values valid, layouts with `copyPromptTemplate` have matching parsers.
- **`api-layout.test.js`** — `POST /api/pages/:id/layout` happy path, no-copy path, unknown-layout error, auth failure.
- **`wizard-activity-book.test.js`** — creating a book with `book_type='activity'` yields varied per-page layouts, populated `style_guide`, and may populate starter characters. Existing `book_type='coloring'` path stays green (critical regression gate).

### Frontend tests — `src/lib/__tests__/layout-renderers.test.js`

Each renderer called with a spy `pdfPage` object. Assertions verify: respects `rect`, draws image at the declared region, draws the expected artifacts (lines / rectangles / text) for its layout. Not testing pdf-lib itself.

### Manual QA checklist (pre-release)

- Create a new coloring book → 5 pages all `full_image` → exports to KDP interior PDF with behavior matching current `main`.
- Create a new activity book → varied layouts populated, `layout_data` populated on every page, export renders every layout correctly.
- Switch a page from `full_image` → `image_with_checklist` → warning appears, regenerate regenerates at new aspect, new image fits the region.
- Lock/unlock style anchor → locked anchor persists across approvals; unlocked + empty auto-sets on first approval.
- Add a character with a description and anchor image → Gemini generation includes the anchor, Flux generation does not crash.
- Export a mixed activity book → every layout renders, bleed-through pages still interleave, KDP minimum warning still fires.
- Open an existing (pre-migration) coloring book → renders and exports identically, no missing-field errors in the console.

### Not in v1

- No PDF snapshot tests.
- No end-to-end browser tests.
- No LLM output quality eval suite.
- No new component tests (project has none today; feature does not justify introducing a harness).

## Open Questions / Deferred Decisions

- Tracing layout font asset choice — deferred to v2 when we implement `image_with_tracing`.
- Spot-the-difference image variation strategy — deferred to v2.
- Puzzle layouts via shared puzzle library — a separate project. Will need its own brainstorm and spec.
- Per-character anchor quality vs cost — we cap at 3 anchors per Gemini call in v1; may need tuning based on real results.
- The exact Gemini reference-image API shape — confirm against current Google Gemini API docs during implementation, not at design time.

## File Map (new and modified)

**New files:**
- `shared/layouts.json`
- `lambda/lib/prompt-builder.js` (extract from existing route)
- `lambda/lib/layout-copy.js`
- `lambda/lib/aspect-mapping.js`
- `src/lib/pdf-export.js`
- `src/lib/layout-renderers.js`
- `src/lib/layouts.js` (thin wrapper around `shared/layouts.json`)
- `src/components/BookSettingsPanel.jsx`
- `src/components/LayoutDataEditor.jsx`
- `lambda/test/prompt-builder.test.js`
- `lambda/test/layout-copy.test.js`
- `lambda/test/aspect-mapping.test.js`
- `lambda/test/layouts-schema.test.js`
- `lambda/test/api-layout.test.js`
- `lambda/test/wizard-activity-book.test.js`
- `src/lib/__tests__/layout-renderers.test.js`

**Modified files:**
- `lambda/lib/db.js` — migrations + `book_characters` schema + new queries.
- `lambda/api/handler.js` — new routes registered.
- `lambda/api/routes/books.js` — `book_type` + style + characters in create.
- `lambda/api/routes/pages.js` — new `POST /layout` + `POST /layout/regenerate-copy` routes.
- `lambda/api/routes/generate-image.js` — per-layout aspect + reference-image conditioning.
- `lambda/api/routes/images.js` — auto-anchoring on approval.
- `lambda/lib/image.js` — aspect-aware upscaling.
- `src/App.jsx` — wizard book-type step + Style DNA preview.
- `src/components/BookViewer.jsx` — settings panel trigger, PDF export call-sites.
- `src/components/PromptPanel.jsx` — layout picker + layout_data editor.
- `src/components/PageList.jsx` — emoji badges.
- `src/lib/api.js` — new API client methods.

## Release Plan

One release. Additive schema, opt-in backfills, no destructive changes. Rollback = redeploy previous app code.

Pre-release gate: full manual QA checklist green on a staging deploy with at least one real activity book and one pre-migration coloring book tested end-to-end.
