# Activity Book v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Activity Book as a second book type alongside Coloring Book, with per-page layouts (image + text-field variants), book-level Style DNA, structured recurring characters, and reference-image conditioning on Gemini.

**Architecture:** Additive schema (4 new columns on `books`, 2 on `pages`, 1 new table `book_characters`). New `shared/layouts.json` is the single source of truth for layout metadata. Prompt builder becomes a layered assembler. PDF export is extracted from `BookViewer.jsx` into a dispatcher-plus-renderers module. Per-layout image aspect ratios flow end-to-end from generation to upscaling to PDF rendering.

**Tech Stack:** Node.js 20 (Lambda), React 19 + Vite 7, Turso (libSQL/SQLite), pdf-lib, Sharp, vitest, fal.ai (Flux Schnell), Google Gemini API, OpenRouter.

**Source spec:** `docs/superpowers/specs/2026-04-14-activity-book-v1-design.md`

---

## Phase 1 — Foundation (schema, layout metadata)

### Task 1: Add `shared/layouts.json`

**Files:**
- Create: `shared/layouts.json`

- [ ] **Step 1: Create shared metadata file**

```json
{
  "full_image": {
    "id": "full_image",
    "name": "Full Image",
    "description": "Classic coloring page. Big image, optional title/caption.",
    "bookTypes": ["coloring", "activity"],
    "imageAspect": "8.5:11",
    "promptHint": "",
    "copyPromptTemplate": null,
    "dataSchema": {},
    "editableFields": [],
    "badge": "🖼️"
  },
  "image_with_lines": {
    "id": "image_with_lines",
    "name": "Image + Writing Lines",
    "description": "Image on top, ruled lines below for a story or journal entry.",
    "bookTypes": ["activity"],
    "imageAspect": "8.5:5",
    "promptHint": "Composition: leave the bottom 40% of the canvas visually empty or low-detail so writing lines can be overlaid in the PDF.",
    "copyPromptTemplate": null,
    "dataSchema": { "lineCount": "number" },
    "editableFields": [
      { "key": "lineCount", "label": "Number of lines", "type": "number", "default": 8, "min": 3, "max": 15 }
    ],
    "badge": "📝"
  },
  "image_with_prompt_lines": {
    "id": "image_with_prompt_lines",
    "name": "Image + Prompt + Lines",
    "description": "Image, one writing-prompt question, answer lines.",
    "bookTypes": ["activity"],
    "imageAspect": "8.5:5",
    "promptHint": "Composition: leave the bottom 45% of the canvas visually empty or low-detail.",
    "copyPromptTemplate": "Given this scene: {scene}, write ONE short, open-ended writing-prompt question for a child. Return JSON only: {\"question\": \"...\"}.",
    "dataSchema": { "question": "string", "lineCount": "number" },
    "editableFields": [
      { "key": "question", "label": "Writing prompt", "type": "textarea" },
      { "key": "lineCount", "label": "Number of lines", "type": "number", "default": 6, "min": 3, "max": 12 }
    ],
    "badge": "✏️"
  },
  "image_with_checklist": {
    "id": "image_with_checklist",
    "name": "Image + Find Things Checklist",
    "description": "A list of things to find hidden in the image.",
    "bookTypes": ["activity"],
    "imageAspect": "8.5:6.5",
    "promptHint": "The scene MUST visibly contain all of: {items}.",
    "copyPromptTemplate": "Given this scene: {scene}, list exactly 5 specific visual things a child could find in the illustration. Keep each item to 2-4 words, concrete, kid-friendly. Return JSON only: {\"items\": [\"...\", \"...\", \"...\", \"...\", \"...\"]}.",
    "dataSchema": { "items": "string[]" },
    "editableFields": [
      { "key": "items", "label": "Things to find", "type": "stringList", "min": 3, "max": 8 }
    ],
    "badge": "🔍"
  },
  "image_with_qa": {
    "id": "image_with_qa",
    "name": "Image + Q&A",
    "description": "Comprehension questions with short answer lines.",
    "bookTypes": ["activity"],
    "imageAspect": "8.5:5.5",
    "promptHint": "",
    "copyPromptTemplate": "Given this scene: {scene}, write 3 open-ended comprehension questions for a child. Return JSON only: {\"questions\": [\"...\", \"...\", \"...\"]}.",
    "dataSchema": { "questions": "string[]", "linesPerQuestion": "number" },
    "editableFields": [
      { "key": "questions", "label": "Questions", "type": "stringList", "min": 2, "max": 4 },
      { "key": "linesPerQuestion", "label": "Lines per question", "type": "number", "default": 2, "min": 1, "max": 4 }
    ],
    "badge": "❓"
  },
  "image_with_draw_box": {
    "id": "image_with_draw_box",
    "name": "Image + Draw Your Own",
    "description": "Reference image on top, empty drawing box below.",
    "bookTypes": ["activity"],
    "imageAspect": "8.5:5",
    "promptHint": "",
    "copyPromptTemplate": "Given this scene: {scene}, write ONE short instruction prompting the child to draw their own version. Return JSON only: {\"instruction\": \"...\"}.",
    "dataSchema": { "instruction": "string" },
    "editableFields": [
      { "key": "instruction", "label": "Drawing instruction", "type": "textarea" }
    ],
    "badge": "🎨"
  },
  "image_with_fill_blank": {
    "id": "image_with_fill_blank",
    "name": "Image + Fill-in-the-Blank",
    "description": "Sentences with blanks to fill in.",
    "bookTypes": ["activity"],
    "imageAspect": "8.5:6",
    "promptHint": "",
    "copyPromptTemplate": "Given this scene: {scene}, write 3 simple sentences describing it, each with 1-2 blanks marked as \"___\". Return JSON only: {\"sentences\": [\"...\", \"...\", \"...\"]}.",
    "dataSchema": { "sentences": "string[]" },
    "editableFields": [
      { "key": "sentences", "label": "Sentences", "type": "stringList", "min": 2, "max": 5 }
    ],
    "badge": "✍️"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/layouts.json
git commit -m "feat(layouts): add shared layout metadata registry"
```

---

### Task 2: Schema migrations for books and pages

**Files:**
- Modify: `lambda/lib/db.js` (MIGRATIONS array and SCHEMA string)

- [ ] **Step 1: Add book-level migrations to MIGRATIONS array**

Locate the `MIGRATIONS` array (around line 26 in `lambda/lib/db.js`). Append to the end of the array, in order:

```js
"ALTER TABLE books ADD COLUMN book_type TEXT DEFAULT 'coloring'",
"ALTER TABLE books ADD COLUMN style_guide TEXT DEFAULT ''",
"ALTER TABLE books ADD COLUMN style_anchor_image_url TEXT DEFAULT ''",
"ALTER TABLE books ADD COLUMN style_anchor_locked INTEGER DEFAULT 0",
"ALTER TABLE pages ADD COLUMN layout TEXT DEFAULT 'full_image'",
"ALTER TABLE pages ADD COLUMN layout_data TEXT DEFAULT '{}'",
```

- [ ] **Step 2: Add `book_characters` table to SCHEMA**

Append to the `SCHEMA` template string, before the closing backtick:

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

- [ ] **Step 3: Apply same migrations to `server/db.js`**

Locate the equivalent MIGRATIONS/SCHEMA block in `server/db.js` (the local dev server). Add the same ALTER TABLE statements and the same `book_characters` CREATE TABLE so local dev matches production.

- [ ] **Step 4: Verify migrations run cleanly**

```bash
cd server && rm -f data.db && node -e "require('./db').init().then(() => console.log('OK'))"
```

Expected: `OK`, no errors.

- [ ] **Step 5: Commit**

```bash
git add lambda/lib/db.js server/db.js
git commit -m "feat(db): migrations for book_type, style_guide, layouts, characters"
```

---

### Task 3: Database query helpers for characters

**Files:**
- Modify: `lambda/lib/db.js` (add character CRUD helpers)
- Test: `lambda/test/db-characters.test.js`

- [ ] **Step 1: Write failing tests**

Create `lambda/test/db-characters.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { init, listCharacters, createCharacter, updateCharacter, deleteCharacter, getDb } from '../lib/db.js';

describe('book_characters CRUD', () => {
  beforeEach(async () => {
    process.env.TURSO_DATABASE_URL = 'file::memory:?cache=shared';
    await init();
    const db = getDb();
    await db.execute({ sql: "INSERT INTO books (id, user_id, title) VALUES (1, 'u1', 'Test')", args: [] });
  });

  it('creates and lists a character', async () => {
    await createCharacter({ book_id: 1, name: 'Luna', description: 'a purple dragon', anchor_image_url: '', sort_order: 0 });
    const chars = await listCharacters(1);
    expect(chars.length).toBe(1);
    expect(chars[0].name).toBe('Luna');
  });

  it('updates a character', async () => {
    const row = await createCharacter({ book_id: 1, name: 'Luna', description: '', anchor_image_url: '', sort_order: 0 });
    await updateCharacter(row.id, { description: 'updated' });
    const chars = await listCharacters(1);
    expect(chars[0].description).toBe('updated');
  });

  it('deletes a character', async () => {
    const row = await createCharacter({ book_id: 1, name: 'Luna', description: '', anchor_image_url: '', sort_order: 0 });
    await deleteCharacter(row.id);
    const chars = await listCharacters(1);
    expect(chars.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd lambda && npx vitest run test/db-characters.test.js
```

Expected: FAIL with undefined exports.

- [ ] **Step 3: Implement helpers in `lambda/lib/db.js`**

Append to `lambda/lib/db.js` (after existing page helpers):

```js
// ---------- Characters ----------

export const listCharacters = async (bookId) => {
  const db = getDb();
  const { rows } = await db.execute({
    sql: 'SELECT * FROM book_characters WHERE book_id = ? ORDER BY sort_order ASC, id ASC',
    args: [bookId],
  });
  return rows;
};

export const createCharacter = async ({ book_id, name, description = '', anchor_image_url = '', sort_order = 0 }) => {
  const db = getDb();
  const { lastInsertRowid } = await db.execute({
    sql: 'INSERT INTO book_characters (book_id, name, description, anchor_image_url, sort_order) VALUES (?, ?, ?, ?, ?)',
    args: [book_id, name, description, anchor_image_url, sort_order],
  });
  const id = Number(lastInsertRowid);
  const { rows } = await db.execute({
    sql: 'SELECT * FROM book_characters WHERE id = ?',
    args: [id],
  });
  return rows[0];
};

export const updateCharacter = async (id, fields) => {
  const db = getDb();
  const allowed = ['name', 'description', 'anchor_image_url', 'sort_order'];
  const sets = [];
  const args = [];
  for (const k of allowed) {
    if (fields[k] !== undefined) {
      sets.push(`${k} = ?`);
      args.push(fields[k]);
    }
  }
  if (sets.length === 0) return;
  args.push(id);
  await db.execute({ sql: `UPDATE book_characters SET ${sets.join(', ')} WHERE id = ?`, args });
};

export const deleteCharacter = async (id) => {
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM book_characters WHERE id = ?', args: [id] });
};
```

- [ ] **Step 4: Run test, expect pass**

```bash
cd lambda && npx vitest run test/db-characters.test.js
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lambda/lib/db.js lambda/test/db-characters.test.js
git commit -m "feat(db): CRUD helpers for book_characters"
```

---

### Task 4: Database helpers for layouts and style fields

**Files:**
- Modify: `lambda/lib/db.js` (update existing page and book update helpers)
- Test: `lambda/test/db-layouts.test.js`

- [ ] **Step 1: Write failing tests**

Create `lambda/test/db-layouts.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { init, getDb, updateBook, updatePage, getBookWithPages } from '../lib/db.js';

describe('layout and style field updates', () => {
  beforeEach(async () => {
    process.env.TURSO_DATABASE_URL = 'file::memory:?cache=shared';
    await init();
    const db = getDb();
    await db.execute({ sql: "INSERT INTO books (id, user_id, title) VALUES (1, 'u1', 'Test')", args: [] });
    await db.execute({ sql: "INSERT INTO pages (id, book_id, title) VALUES (1, 1, 'Page 1')", args: [] });
  });

  it('updates book style fields', async () => {
    await updateBook(1, 'u1', { book_type: 'activity', style_guide: 'clean line art' });
    const book = await getBookWithPages(1, 'u1');
    expect(book.book_type).toBe('activity');
    expect(book.style_guide).toBe('clean line art');
  });

  it('updates page layout and layout_data', async () => {
    await updatePage(1, 'u1', { layout: 'image_with_checklist', layout_data: '{"items":["a","b"]}' });
    const book = await getBookWithPages(1, 'u1');
    expect(book.pages[0].layout).toBe('image_with_checklist');
    expect(book.pages[0].layout_data).toBe('{"items":["a","b"]}');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd lambda && npx vitest run test/db-layouts.test.js
```

Expected: FAIL — `updateBook`/`updatePage` don't accept the new fields yet.

- [ ] **Step 3: Extend `updateBook` and `updatePage` to accept new fields**

In `lambda/lib/db.js`, find the existing `updateBook` function. Extend its `allowed` fields list to include:

```js
const allowed = ['title', 'concept', 'tagLine', 'cover_url', 'notes', 'audience',
  'book_type', 'style_guide', 'style_anchor_image_url', 'style_anchor_locked'];
```

Find the existing `updatePage` function. Extend its `allowed` fields list to include:

```js
const allowed = ['title', 'scene', 'prompt', 'character_style', 'character_desc',
  'image_url', 'sort_order', 'caption', 'notes', 'text_in_image', 'title_in', 'caption_in',
  'optimized_prompt', 'layout', 'layout_data'];
```

(Exact existing list depends on current `lambda/lib/db.js` — preserve every existing entry and add the new ones at the end.)

- [ ] **Step 4: Run test, expect pass**

```bash
cd lambda && npx vitest run test/db-layouts.test.js
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lambda/lib/db.js lambda/test/db-layouts.test.js
git commit -m "feat(db): accept layout and style fields in update helpers"
```

---

## Phase 2 — Prompt Pipeline

### Task 5: Aspect mapping module

**Files:**
- Create: `lambda/lib/aspect-mapping.js`
- Test: `lambda/test/aspect-mapping.test.js`

- [ ] **Step 1: Write failing test**

Create `lambda/test/aspect-mapping.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { aspectToGeminiEnum, aspectToFalDimensions, aspectToInches } from '../lib/aspect-mapping.js';
import layouts from '../../shared/layouts.json' assert { type: 'json' };

describe('aspect mapping', () => {
  it('maps 8.5:11 to 3:4 Gemini enum', () => {
    expect(aspectToGeminiEnum('8.5:11')).toBe('3:4');
  });

  it('maps 8.5:5 to 16:9 Gemini enum', () => {
    expect(aspectToGeminiEnum('8.5:5')).toBe('16:9');
  });

  it('maps 8.5:11 to fal dimensions with 8.5 inches wide', () => {
    const d = aspectToFalDimensions('8.5:11');
    expect(d.width).toBeGreaterThan(0);
    expect(d.height).toBeGreaterThan(d.width);
  });

  it('returns inches from aspect', () => {
    expect(aspectToInches('8.5:11')).toEqual({ widthIn: 8.5, heightIn: 11 });
    expect(aspectToInches('8.5:5')).toEqual({ widthIn: 8.5, heightIn: 5 });
  });

  it('every layout in shared/layouts.json maps to a valid Gemini enum', () => {
    const validEnums = ['1:1', '3:4', '4:3', '9:16', '16:9'];
    for (const l of Object.values(layouts)) {
      expect(validEnums).toContain(aspectToGeminiEnum(l.imageAspect));
    }
  });

  it('every layout maps to fal dimensions with width <= 2048', () => {
    for (const l of Object.values(layouts)) {
      const d = aspectToFalDimensions(l.imageAspect);
      expect(d.width).toBeLessThanOrEqual(2048);
      expect(d.height).toBeLessThanOrEqual(2048);
    }
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd lambda && npx vitest run test/aspect-mapping.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement module**

Create `lambda/lib/aspect-mapping.js`:

```js
// Maps layout imageAspect strings (e.g. "8.5:11") to model-specific parameters.

export function aspectToInches(aspect) {
  const [w, h] = aspect.split(':').map(Number);
  return { widthIn: w, heightIn: h };
}

export function aspectToRatio(aspect) {
  const { widthIn, heightIn } = aspectToInches(aspect);
  return widthIn / heightIn;
}

const GEMINI_ENUMS = [
  { enum: '1:1', ratio: 1 },
  { enum: '3:4', ratio: 3 / 4 },
  { enum: '4:3', ratio: 4 / 3 },
  { enum: '9:16', ratio: 9 / 16 },
  { enum: '16:9', ratio: 16 / 9 },
];

export function aspectToGeminiEnum(aspect) {
  const r = aspectToRatio(aspect);
  let best = GEMINI_ENUMS[0];
  let bestDelta = Math.abs(best.ratio - r);
  for (const e of GEMINI_ENUMS) {
    const d = Math.abs(e.ratio - r);
    if (d < bestDelta) {
      best = e;
      bestDelta = d;
    }
  }
  return best.enum;
}

// Produce width/height that: (a) match the target ratio closely, (b) are multiples of 64,
// (c) keep the long side <= 1536 so Flux Schnell is happy.
export function aspectToFalDimensions(aspect) {
  const r = aspectToRatio(aspect);
  const LONG = 1536;
  let width, height;
  if (r >= 1) {
    width = LONG;
    height = Math.round(LONG / r);
  } else {
    height = LONG;
    width = Math.round(LONG * r);
  }
  // Round to nearest multiple of 64
  width = Math.max(64, Math.round(width / 64) * 64);
  height = Math.max(64, Math.round(height / 64) * 64);
  return { width, height };
}

export function aspectToUpscalePixels(aspect, dpi = 300) {
  const { widthIn, heightIn } = aspectToInches(aspect);
  return { width: Math.round(widthIn * dpi), height: Math.round(heightIn * dpi) };
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
cd lambda && npx vitest run test/aspect-mapping.test.js
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lambda/lib/aspect-mapping.js lambda/test/aspect-mapping.test.js
git commit -m "feat(lambda): aspect mapping for Gemini and fal.ai"
```

---

### Task 6: Layout metadata loader (lambda side)

**Files:**
- Create: `lambda/lib/layouts.js`
- Test: `lambda/test/layouts-schema.test.js`

- [ ] **Step 1: Write failing test**

Create `lambda/test/layouts-schema.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { LAYOUTS, getLayout, layoutsForBookType, LAYOUT_IDS } from '../lib/layouts.js';

describe('layouts module', () => {
  it('loads all layouts from shared json', () => {
    expect(LAYOUT_IDS).toContain('full_image');
    expect(LAYOUT_IDS).toContain('image_with_checklist');
    expect(LAYOUT_IDS.length).toBe(7);
  });

  it('getLayout returns full_image for unknown id', () => {
    expect(getLayout('does_not_exist').id).toBe('full_image');
  });

  it('layoutsForBookType coloring returns only full_image', () => {
    const l = layoutsForBookType('coloring');
    expect(l.length).toBe(1);
    expect(l[0].id).toBe('full_image');
  });

  it('layoutsForBookType activity returns all 7', () => {
    const l = layoutsForBookType('activity');
    expect(l.length).toBe(7);
  });

  it('every layout with copyPromptTemplate has editableFields matching dataSchema keys', () => {
    for (const layout of Object.values(LAYOUTS)) {
      if (!layout.copyPromptTemplate) continue;
      const schemaKeys = Object.keys(layout.dataSchema);
      const editableKeys = layout.editableFields.map(f => f.key);
      for (const k of schemaKeys) {
        expect(editableKeys).toContain(k);
      }
    }
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd lambda && npx vitest run test/layouts-schema.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement loader**

Create `lambda/lib/layouts.js`:

```js
import layoutsJson from '../../shared/layouts.json' assert { type: 'json' };

export const LAYOUTS = layoutsJson;
export const LAYOUT_IDS = Object.keys(LAYOUTS);

export function getLayout(id) {
  return LAYOUTS[id] || LAYOUTS.full_image;
}

export function layoutsForBookType(bookType) {
  return Object.values(LAYOUTS).filter(l => l.bookTypes.includes(bookType));
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
cd lambda && npx vitest run test/layouts-schema.test.js
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lambda/lib/layouts.js lambda/test/layouts-schema.test.js
git commit -m "feat(lambda): layouts module backed by shared/layouts.json"
```

---

### Task 7: Prompt builder (layered assembler)

**Files:**
- Create: `lambda/lib/prompt-builder.js`
- Test: `lambda/test/prompt-builder.test.js`

- [ ] **Step 1: Write failing tests**

Create `lambda/test/prompt-builder.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildPagePrompt, matchCharacters } from '../lib/prompt-builder.js';

const baseBook = {
  id: 1,
  book_type: 'activity',
  concept: 'A cozy dragon adventure',
  style_guide: 'Clean bold line art, no shading, round friendly characters',
};

const baseCharacters = [
  { id: 1, name: 'Luna', description: 'purple dragon with silver wings' },
  { id: 2, name: 'Benny', description: 'brown bear cub in a red hat' },
];

describe('matchCharacters', () => {
  it('matches character by name in scene', () => {
    const m = matchCharacters(baseCharacters, 'Luna flies over the forest');
    expect(m.length).toBe(1);
    expect(m[0].name).toBe('Luna');
  });

  it('matches multiple characters', () => {
    const m = matchCharacters(baseCharacters, 'Luna and Benny meet');
    expect(m.length).toBe(2);
  });

  it('returns empty when no match', () => {
    const m = matchCharacters(baseCharacters, 'A lonely fox');
    expect(m.length).toBe(0);
  });

  it('is case-insensitive', () => {
    const m = matchCharacters(baseCharacters, 'LUNA soars');
    expect(m.length).toBe(1);
  });
});

describe('buildPagePrompt', () => {
  it('includes style_guide when present', () => {
    const page = { scene: 'a castle', layout: 'full_image', layout_data: '{}' };
    const out = buildPagePrompt({ book: baseBook, characters: [], page, model: 'gemini' });
    expect(out).toContain('Clean bold line art');
  });

  it('skips style layer when style_guide empty', () => {
    const book = { ...baseBook, style_guide: '' };
    const page = { scene: 'a castle', layout: 'full_image', layout_data: '{}' };
    const out = buildPagePrompt({ book, characters: [], page, model: 'gemini' });
    expect(out).not.toContain('Clean bold line art');
  });

  it('includes matched character descriptions', () => {
    const page = { scene: 'Luna in the forest', layout: 'full_image', layout_data: '{}' };
    const out = buildPagePrompt({ book: baseBook, characters: baseCharacters, page, model: 'gemini' });
    expect(out).toContain('purple dragon');
    expect(out).not.toContain('brown bear');
  });

  it('per-page character_style overrides book style_guide', () => {
    const page = { scene: 'a castle', character_style: 'sketchy pencil', layout: 'full_image', layout_data: '{}' };
    const out = buildPagePrompt({ book: baseBook, characters: [], page, model: 'gemini' });
    expect(out).toContain('sketchy pencil');
    expect(out).not.toContain('Clean bold line art');
  });

  it('includes layout hint with substituted items from layout_data', () => {
    const page = {
      scene: 'a forest clearing',
      layout: 'image_with_checklist',
      layout_data: '{"items":["a butterfly","a red flower","a hidden key"]}',
    };
    const out = buildPagePrompt({ book: baseBook, characters: [], page, model: 'gemini' });
    expect(out).toContain('a butterfly');
    expect(out).toContain('a red flower');
  });

  it('uses flat text format for flux model', () => {
    const page = { scene: 'a castle', layout: 'full_image', layout_data: '{}' };
    const out = buildPagePrompt({ book: baseBook, characters: [], page, model: 'flux' });
    expect(out).not.toContain('<');
  });

  it('uses XML format for gemini model', () => {
    const page = { scene: 'a castle', layout: 'full_image', layout_data: '{}' };
    const out = buildPagePrompt({ book: baseBook, characters: [], page, model: 'gemini' });
    expect(out).toMatch(/<\w+>/);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd lambda && npx vitest run test/prompt-builder.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement prompt builder**

Create `lambda/lib/prompt-builder.js`:

```js
import { getLayout } from './layouts.js';

export function matchCharacters(characters, sceneText) {
  if (!characters || characters.length === 0) return [];
  const hay = (sceneText || '').toLowerCase();
  return characters.filter(c => c.name && hay.includes(c.name.toLowerCase()));
}

function substituteHint(hint, layoutData) {
  if (!hint) return '';
  return hint.replace(/\{(\w+)\}/g, (_, key) => {
    const v = layoutData[key];
    if (Array.isArray(v)) return v.join(', ');
    if (v == null) return '';
    return String(v);
  });
}

function safeJson(str) {
  try { return JSON.parse(str || '{}'); } catch { return {}; }
}

function isXmlModel(model) {
  return /gemini|gpt/i.test(model || '');
}

export function buildPagePrompt({ book, characters, page, model }) {
  const layers = [];

  // 1. Style DNA (book-level, overridden by per-page character_style)
  const perPageStyle = (page.character_style || '').trim();
  const bookStyle = (book?.style_guide || '').trim();
  const styleLayer = perPageStyle || bookStyle;
  if (styleLayer) layers.push({ tag: 'style', text: styleLayer });

  // 2. Characters
  const matched = matchCharacters(characters || [], `${page.title || ''} ${page.scene || page.prompt || ''}`);
  if (matched.length > 0) {
    const charText = matched.map(c => `${c.name}: ${c.description}`).join('\n');
    layers.push({ tag: 'characters', text: charText });
  }

  // 3. Per-page character_desc override (if separate from style)
  const perPageDesc = (page.character_desc || '').trim();
  if (perPageDesc) layers.push({ tag: 'character_desc', text: perPageDesc });

  // 4. Scene
  const scene = (page.prompt || page.scene || '').trim();
  if (scene) layers.push({ tag: 'scene', text: scene });

  // 5. Layout hint with data substitution
  const layout = getLayout(page.layout || 'full_image');
  const layoutData = safeJson(page.layout_data);
  const hint = substituteHint(layout.promptHint, layoutData);
  if (hint) layers.push({ tag: 'layout', text: hint });

  // 6. Model-specific formatting
  if (isXmlModel(model)) {
    return layers.map(l => `<${l.tag}>${l.text}</${l.tag}>`).join('\n');
  }
  return layers.map(l => l.text).join('\n\n');
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
cd lambda && npx vitest run test/prompt-builder.test.js
```

Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add lambda/lib/prompt-builder.js lambda/test/prompt-builder.test.js
git commit -m "feat(lambda): layered prompt builder with style DNA and characters"
```

---

### Task 8: Layout copy generator

**Files:**
- Create: `lambda/lib/layout-copy.js`
- Test: `lambda/test/layout-copy.test.js`

- [ ] **Step 1: Write failing tests**

Create `lambda/test/layout-copy.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { generateLayoutCopy } from '../lib/layout-copy.js';

describe('generateLayoutCopy', () => {
  it('returns empty object for layout with no copyPromptTemplate', async () => {
    const llm = vi.fn();
    const out = await generateLayoutCopy({ scene: 'x', layoutId: 'full_image', llm });
    expect(out).toEqual({});
    expect(llm).not.toHaveBeenCalled();
  });

  it('calls llm with substituted scene and parses JSON', async () => {
    const llm = vi.fn().mockResolvedValue('{"items":["a","b","c","d","e"]}');
    const out = await generateLayoutCopy({ scene: 'a forest', layoutId: 'image_with_checklist', llm });
    expect(llm).toHaveBeenCalledOnce();
    const prompt = llm.mock.calls[0][0];
    expect(prompt).toContain('a forest');
    expect(out.items).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('retries once on malformed JSON and then falls back to default', async () => {
    const llm = vi.fn()
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce('still not json');
    const out = await generateLayoutCopy({ scene: 'x', layoutId: 'image_with_checklist', llm });
    expect(llm).toHaveBeenCalledTimes(2);
    expect(out.items).toEqual([]);
  });

  it('recovers on second attempt if first returns malformed', async () => {
    const llm = vi.fn()
      .mockResolvedValueOnce('garbage')
      .mockResolvedValueOnce('{"items":["x","y","z","a","b"]}');
    const out = await generateLayoutCopy({ scene: 'x', layoutId: 'image_with_checklist', llm });
    expect(out.items).toEqual(['x', 'y', 'z', 'a', 'b']);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd lambda && npx vitest run test/layout-copy.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement layout-copy module**

Create `lambda/lib/layout-copy.js`:

```js
import { getLayout } from './layouts.js';

const DEFAULT_SHAPES = {
  'image_with_checklist': { items: [] },
  'image_with_qa': { questions: [], linesPerQuestion: 2 },
  'image_with_prompt_lines': { question: '', lineCount: 6 },
  'image_with_draw_box': { instruction: '' },
  'image_with_fill_blank': { sentences: [] },
  'image_with_lines': { lineCount: 8 },
  'full_image': {},
};

function extractJson(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

export async function generateLayoutCopy({ scene, layoutId, llm }) {
  const layout = getLayout(layoutId);
  const def = DEFAULT_SHAPES[layoutId] || {};
  if (!layout.copyPromptTemplate) return { ...def };

  const prompt = layout.copyPromptTemplate.replace('{scene}', scene || '');
  let raw = await llm(prompt);
  let parsed = extractJson(raw);

  if (!parsed) {
    const retry = `${prompt}\n\nRespond with valid JSON only, no prose.`;
    raw = await llm(retry);
    parsed = extractJson(raw);
  }

  if (!parsed) return { ...def };
  return { ...def, ...parsed };
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
cd lambda && npx vitest run test/layout-copy.test.js
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lambda/lib/layout-copy.js lambda/test/layout-copy.test.js
git commit -m "feat(lambda): layout copy generator with malformed-JSON retry"
```

---

## Phase 3 — Generation Pipeline

### Task 9: Wire per-layout aspect ratio into image generation

**Files:**
- Modify: `lambda/api/routes/generate-image.js`
- Modify: `lambda/lib/image.js` (aspect-aware upscale)
- Test: extend existing generation route tests if present

- [ ] **Step 1: Read current `generate-image.js` to locate model branches**

```bash
cat lambda/api/routes/generate-image.js
```

Identify: (a) where the page and book are loaded, (b) where the prompt is currently built, (c) where the model-specific request is constructed for Gemini vs Flux.

- [ ] **Step 2: Replace prompt construction with `buildPagePrompt`**

At the top of the file add imports:

```js
import { buildPagePrompt } from '../../lib/prompt-builder.js';
import { getLayout } from '../../lib/layouts.js';
import { aspectToGeminiEnum, aspectToFalDimensions } from '../../lib/aspect-mapping.js';
import { listCharacters } from '../../lib/db.js';
```

In the request handler, after loading the page and book, replace the existing prompt assembly with:

```js
const characters = await listCharacters(book.id);
const prompt = buildPagePrompt({ book, characters, page, model: modelId });
const layout = getLayout(page.layout || 'full_image');
```

- [ ] **Step 3: Resolve aspect-specific model params**

Branch on model id. For Gemini:

```js
if (/gemini/i.test(modelId)) {
  const aspectRatio = aspectToGeminiEnum(layout.imageAspect);
  // Pass aspectRatio into the Gemini request body's generationConfig (or equivalent).
  // Confirm exact field name against current Gemini API during implementation.
}
```

For Flux (fal.ai):

```js
if (/flux/i.test(modelId)) {
  const { width, height } = aspectToFalDimensions(layout.imageAspect);
  // Pass image_size: { width, height } to the fal.ai request body.
}
```

- [ ] **Step 4: Update upscale pipeline in `lambda/lib/image.js`**

Locate the existing upscale function (currently hardcoded to 2550x3300). Change its signature to accept target dimensions:

```js
// Before: upscaleToPrint(imageBuffer)
// After:
export async function upscaleToPrint(imageBuffer, { width = 2550, height = 3300 } = {}) {
  const sharp = (await import('sharp')).default;
  return sharp(imageBuffer)
    .resize(width, height, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();
}
```

- [ ] **Step 5: Update callers of upscale to pass aspect-aware dimensions**

In `lambda/api/routes/images.js` (approve endpoint) where upscale is called, pass the layout-derived size:

```js
import { getLayout } from '../../lib/layouts.js';
import { aspectToUpscalePixels } from '../../lib/aspect-mapping.js';

// Inside the approve handler, after loading the page:
const layout = getLayout(page.layout || 'full_image');
const target = aspectToUpscalePixels(layout.imageAspect);
const printBuffer = await upscaleToPrint(origBuffer, target);
```

- [ ] **Step 6: Run full test suite**

```bash
cd lambda && npx vitest run
```

Expected: all existing tests still green.

- [ ] **Step 7: Commit**

```bash
git add lambda/api/routes/generate-image.js lambda/lib/image.js lambda/api/routes/images.js
git commit -m "feat(generation): per-layout aspect ratio end-to-end"
```

---

### Task 10: Reference-image conditioning for Gemini

**Files:**
- Modify: `lambda/api/routes/generate-image.js`
- Test: `lambda/test/generate-image-reference.test.js`

- [ ] **Step 1: Write failing test**

Create `lambda/test/generate-image-reference.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { collectReferenceImages } from '../api/routes/generate-image.js';

describe('collectReferenceImages', () => {
  it('returns empty array when no anchor and no characters', () => {
    const book = { style_anchor_image_url: '' };
    const refs = collectReferenceImages({ book, characters: [], page: { scene: 'x' } });
    expect(refs).toEqual([]);
  });

  it('includes book style anchor when set', () => {
    const book = { style_anchor_image_url: 's3://anchor.png' };
    const refs = collectReferenceImages({ book, characters: [], page: { scene: 'x' } });
    expect(refs).toContain('s3://anchor.png');
  });

  it('includes matched character anchors', () => {
    const book = { style_anchor_image_url: '' };
    const characters = [
      { name: 'Luna', anchor_image_url: 's3://luna.png' },
      { name: 'Benny', anchor_image_url: 's3://benny.png' },
    ];
    const refs = collectReferenceImages({ book, characters, page: { scene: 'Luna plays' } });
    expect(refs).toContain('s3://luna.png');
    expect(refs).not.toContain('s3://benny.png');
  });

  it('caps references at 3 total', () => {
    const book = { style_anchor_image_url: 's3://a.png' };
    const characters = [
      { name: 'A', anchor_image_url: 's3://1.png' },
      { name: 'B', anchor_image_url: 's3://2.png' },
      { name: 'C', anchor_image_url: 's3://3.png' },
      { name: 'D', anchor_image_url: 's3://4.png' },
    ];
    const refs = collectReferenceImages({
      book, characters,
      page: { scene: 'A B C D' },
    });
    expect(refs.length).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd lambda && npx vitest run test/generate-image-reference.test.js
```

Expected: FAIL — `collectReferenceImages` not exported.

- [ ] **Step 3: Implement and export**

In `lambda/api/routes/generate-image.js`, add and export:

```js
import { matchCharacters } from '../../lib/prompt-builder.js';

export function collectReferenceImages({ book, characters, page, max = 3 }) {
  const refs = [];
  if (book?.style_anchor_image_url) refs.push(book.style_anchor_image_url);
  const matched = matchCharacters(characters || [], `${page.title || ''} ${page.scene || page.prompt || ''}`);
  for (const c of matched) {
    if (refs.length >= max) break;
    if (c.anchor_image_url) refs.push(c.anchor_image_url);
  }
  return refs.slice(0, max);
}
```

- [ ] **Step 4: Wire into Gemini request path**

In the same file, inside the Gemini branch of the generation handler:

```js
if (/gemini/i.test(modelId)) {
  const referenceUrls = collectReferenceImages({ book, characters, page });
  const referenceImageBytes = await Promise.all(
    referenceUrls.map(url => fetchS3ImageBytes(url))
  );
  // Include referenceImageBytes as additional inline_data parts in the Gemini request.
  // Exact request shape to be confirmed against current Gemini API docs during this task.
}
```

If `fetchS3ImageBytes` doesn't exist, add a minimal helper:

```js
import { getObjectBytes } from '../../lib/s3.js';
async function fetchS3ImageBytes(url) {
  if (url.startsWith('s3://')) {
    const [, , bucket, ...keyParts] = url.split('/');
    return getObjectBytes(bucket, keyParts.join('/'));
  }
  // https presigned URL
  const r = await fetch(url);
  return Buffer.from(await r.arrayBuffer());
}
```

(If `s3.js` doesn't export `getObjectBytes`, add a thin wrapper around the existing S3 client that returns a buffer for a given bucket+key.)

- [ ] **Step 5: Run test, expect pass**

```bash
cd lambda && npx vitest run test/generate-image-reference.test.js
```

Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lambda/api/routes/generate-image.js lambda/lib/s3.js lambda/test/generate-image-reference.test.js
git commit -m "feat(generation): reference-image conditioning for Gemini"
```

---

### Task 11: Auto-anchoring on image approval

**Files:**
- Modify: `lambda/api/routes/images.js`
- Test: `lambda/test/auto-anchor.test.js`

- [ ] **Step 1: Write failing test**

Create `lambda/test/auto-anchor.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { init, getDb, updateBook } from '../lib/db.js';
import { maybeSetStyleAnchor } from '../api/routes/images.js';

describe('maybeSetStyleAnchor', () => {
  beforeEach(async () => {
    process.env.TURSO_DATABASE_URL = 'file::memory:?cache=shared';
    await init();
    const db = getDb();
    await db.execute({ sql: "DELETE FROM books", args: [] });
    await db.execute({ sql: "INSERT INTO books (id, user_id, title) VALUES (1, 'u1', 'Test')", args: [] });
  });

  it('sets anchor when empty and not locked', async () => {
    await maybeSetStyleAnchor(1, 'u1', 'https://example.com/img.png');
    const db = getDb();
    const { rows } = await db.execute({ sql: "SELECT style_anchor_image_url FROM books WHERE id = 1", args: [] });
    expect(rows[0].style_anchor_image_url).toBe('https://example.com/img.png');
  });

  it('does not overwrite when already set', async () => {
    await updateBook(1, 'u1', { style_anchor_image_url: 'https://existing.png' });
    await maybeSetStyleAnchor(1, 'u1', 'https://new.png');
    const db = getDb();
    const { rows } = await db.execute({ sql: "SELECT style_anchor_image_url FROM books WHERE id = 1", args: [] });
    expect(rows[0].style_anchor_image_url).toBe('https://existing.png');
  });

  it('does not set when locked', async () => {
    await updateBook(1, 'u1', { style_anchor_locked: 1 });
    await maybeSetStyleAnchor(1, 'u1', 'https://new.png');
    const db = getDb();
    const { rows } = await db.execute({ sql: "SELECT style_anchor_image_url FROM books WHERE id = 1", args: [] });
    expect(rows[0].style_anchor_image_url).toBe('');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd lambda && npx vitest run test/auto-anchor.test.js
```

Expected: FAIL — `maybeSetStyleAnchor` not exported.

- [ ] **Step 3: Implement and export helper**

In `lambda/api/routes/images.js`, add:

```js
import { getDb, updateBook } from '../../lib/db.js';

export async function maybeSetStyleAnchor(bookId, userId, imageUrl) {
  const db = getDb();
  const { rows } = await db.execute({
    sql: 'SELECT style_anchor_image_url, style_anchor_locked FROM books WHERE id = ? AND user_id = ?',
    args: [bookId, userId],
  });
  const book = rows[0];
  if (!book) return;
  if (book.style_anchor_locked) return;
  if (book.style_anchor_image_url && book.style_anchor_image_url.length > 0) return;
  await updateBook(bookId, userId, { style_anchor_image_url: imageUrl });
}
```

- [ ] **Step 4: Call from approve route**

In the same file, inside the approve handler, after successfully marking the image approved and writing the print version:

```js
await maybeSetStyleAnchor(page.book_id, userId, approvedImageUrl);
```

- [ ] **Step 5: Run test, expect pass**

```bash
cd lambda && npx vitest run test/auto-anchor.test.js
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lambda/api/routes/images.js lambda/test/auto-anchor.test.js
git commit -m "feat(images): auto-set style anchor on first approval when unlocked"
```

---

## Phase 4 — API Routes

### Task 12: `POST /api/pages/:id/layout` route

**Files:**
- Modify: `lambda/api/routes/pages.js`
- Modify: `lambda/api/handler.js` (register route)
- Test: `lambda/test/api-layout.test.js`

- [ ] **Step 1: Write failing test**

Create `lambda/test/api-layout.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setPageLayout } from '../api/routes/pages.js';
import { init, getDb } from '../lib/db.js';

describe('setPageLayout', () => {
  beforeEach(async () => {
    process.env.TURSO_DATABASE_URL = 'file::memory:?cache=shared';
    await init();
    const db = getDb();
    await db.execute({ sql: "DELETE FROM pages", args: [] });
    await db.execute({ sql: "DELETE FROM books", args: [] });
    await db.execute({ sql: "INSERT INTO books (id, user_id, title) VALUES (1, 'u1', 'Test')", args: [] });
    await db.execute({ sql: "INSERT INTO pages (id, book_id, title, scene) VALUES (1, 1, 'P1', 'a forest')", args: [] });
  });

  it('switches layout and leaves layout_data default for no-copy layout', async () => {
    const llm = vi.fn();
    const res = await setPageLayout({ pageId: 1, userId: 'u1', layout: 'full_image', llm });
    expect(res.layout).toBe('full_image');
    expect(llm).not.toHaveBeenCalled();
  });

  it('switches layout and generates copy for copy layout', async () => {
    const llm = vi.fn().mockResolvedValue('{"items":["a","b","c","d","e"]}');
    const res = await setPageLayout({ pageId: 1, userId: 'u1', layout: 'image_with_checklist', llm });
    expect(res.layout).toBe('image_with_checklist');
    expect(JSON.parse(res.layout_data).items.length).toBe(5);
  });

  it('rejects unknown layout', async () => {
    const llm = vi.fn();
    await expect(setPageLayout({ pageId: 1, userId: 'u1', layout: 'bogus', llm })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd lambda && npx vitest run test/api-layout.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement `setPageLayout`**

In `lambda/api/routes/pages.js`, add:

```js
import { getLayout, LAYOUT_IDS } from '../../lib/layouts.js';
import { generateLayoutCopy } from '../../lib/layout-copy.js';
import { getDb, updatePage } from '../../lib/db.js';
import { callOpenRouter } from '../../lib/openrouter.js';

export async function setPageLayout({ pageId, userId, layout, llm = callOpenRouter }) {
  if (!LAYOUT_IDS.includes(layout)) {
    const err = new Error(`Unknown layout: ${layout}`);
    err.statusCode = 400;
    throw err;
  }

  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT p.* FROM pages p
          JOIN books b ON b.id = p.book_id
          WHERE p.id = ? AND b.user_id = ?`,
    args: [pageId, userId],
  });
  const page = rows[0];
  if (!page) {
    const err = new Error('Page not found');
    err.statusCode = 404;
    throw err;
  }

  const copy = await generateLayoutCopy({ scene: page.scene || page.prompt || '', layoutId: layout, llm });
  const layout_data = JSON.stringify(copy);

  await updatePage(pageId, userId, { layout, layout_data });

  const { rows: updated } = await db.execute({
    sql: 'SELECT * FROM pages WHERE id = ?',
    args: [pageId],
  });
  return updated[0];
}
```

If `callOpenRouter` does not exist in `lambda/lib/openrouter.js` as a simple prompt-in-string-out function, add a thin wrapper:

```js
// lambda/lib/openrouter.js — add if missing
export async function callOpenRouter(prompt, { model = 'google/gemini-2.0-flash-exp:free' } = {}) {
  // Use the existing OpenRouter client / fetch path. Return the assistant's text content.
}
```

- [ ] **Step 4: Register HTTP route**

In `lambda/api/handler.js`, find where page routes are registered. Add:

```js
if (method === 'POST' && pathMatches('/api/pages/:id/layout')) {
  const pageId = Number(pathParams.id);
  const body = parseBody(event);
  const updated = await setPageLayout({ pageId, userId, layout: body.layout });
  return jsonResponse(200, updated);
}
```

Use whatever routing convention the handler already uses (regex, if/else chain, or router). Match the existing style.

- [ ] **Step 5: Run test, expect pass**

```bash
cd lambda && npx vitest run test/api-layout.test.js
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lambda/api/routes/pages.js lambda/api/handler.js lambda/lib/openrouter.js lambda/test/api-layout.test.js
git commit -m "feat(api): POST /api/pages/:id/layout"
```

---

### Task 13: `POST /api/pages/:id/layout/regenerate-copy`

**Files:**
- Modify: `lambda/api/routes/pages.js`
- Modify: `lambda/api/handler.js`
- Test: extend `lambda/test/api-layout.test.js`

- [ ] **Step 1: Add failing test to `lambda/test/api-layout.test.js`**

```js
import { regenerateLayoutCopy } from '../api/routes/pages.js';

describe('regenerateLayoutCopy', () => {
  beforeEach(async () => {
    process.env.TURSO_DATABASE_URL = 'file::memory:?cache=shared';
    await init();
    const db = getDb();
    await db.execute({ sql: "DELETE FROM pages", args: [] });
    await db.execute({ sql: "DELETE FROM books", args: [] });
    await db.execute({ sql: "INSERT INTO books (id, user_id, title) VALUES (1, 'u1', 'Test')", args: [] });
    await db.execute({
      sql: "INSERT INTO pages (id, book_id, title, scene, layout, layout_data) VALUES (1, 1, 'P1', 'a forest', 'image_with_checklist', '{}')",
      args: [],
    });
  });

  it('regenerates copy for current layout', async () => {
    const llm = vi.fn().mockResolvedValue('{"items":["new1","new2","new3","new4","new5"]}');
    const res = await regenerateLayoutCopy({ pageId: 1, userId: 'u1', llm });
    expect(JSON.parse(res.layout_data).items[0]).toBe('new1');
  });
});
```

- [ ] **Step 2: Implement**

In `lambda/api/routes/pages.js`:

```js
export async function regenerateLayoutCopy({ pageId, userId, llm = callOpenRouter }) {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT p.* FROM pages p JOIN books b ON b.id = p.book_id WHERE p.id = ? AND b.user_id = ?`,
    args: [pageId, userId],
  });
  const page = rows[0];
  if (!page) {
    const err = new Error('Page not found');
    err.statusCode = 404;
    throw err;
  }
  const copy = await generateLayoutCopy({
    scene: page.scene || page.prompt || '',
    layoutId: page.layout || 'full_image',
    llm,
  });
  await updatePage(pageId, userId, { layout_data: JSON.stringify(copy) });
  const { rows: updated } = await db.execute({ sql: 'SELECT * FROM pages WHERE id = ?', args: [pageId] });
  return updated[0];
}
```

- [ ] **Step 3: Register HTTP route in `lambda/api/handler.js`**

```js
if (method === 'POST' && pathMatches('/api/pages/:id/layout/regenerate-copy')) {
  const pageId = Number(pathParams.id);
  const updated = await regenerateLayoutCopy({ pageId, userId });
  return jsonResponse(200, updated);
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
cd lambda && npx vitest run test/api-layout.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lambda/api/routes/pages.js lambda/api/handler.js lambda/test/api-layout.test.js
git commit -m "feat(api): POST /api/pages/:id/layout/regenerate-copy"
```

---

### Task 14: Character CRUD endpoints

**Files:**
- Create: `lambda/api/routes/characters.js`
- Modify: `lambda/api/handler.js`
- Test: `lambda/test/api-characters.test.js`

- [ ] **Step 1: Write failing test**

Create `lambda/test/api-characters.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listCharactersRoute,
  createCharacterRoute,
  updateCharacterRoute,
  deleteCharacterRoute,
  generateCharactersRoute,
} from '../api/routes/characters.js';
import { init, getDb } from '../lib/db.js';

describe('characters routes', () => {
  beforeEach(async () => {
    process.env.TURSO_DATABASE_URL = 'file::memory:?cache=shared';
    await init();
    const db = getDb();
    await db.execute({ sql: "DELETE FROM book_characters", args: [] });
    await db.execute({ sql: "DELETE FROM books", args: [] });
    await db.execute({ sql: "INSERT INTO books (id, user_id, title, concept) VALUES (1, 'u1', 'Test', 'Dragons')", args: [] });
  });

  it('creates, lists, updates, deletes a character', async () => {
    const created = await createCharacterRoute({ bookId: 1, userId: 'u1', body: { name: 'Luna', description: 'dragon' } });
    expect(created.id).toBeDefined();
    const list = await listCharactersRoute({ bookId: 1, userId: 'u1' });
    expect(list.length).toBe(1);
    await updateCharacterRoute({ characterId: created.id, userId: 'u1', body: { description: 'purple dragon' } });
    const list2 = await listCharactersRoute({ bookId: 1, userId: 'u1' });
    expect(list2[0].description).toBe('purple dragon');
    await deleteCharacterRoute({ characterId: created.id, userId: 'u1' });
    const list3 = await listCharactersRoute({ bookId: 1, userId: 'u1' });
    expect(list3.length).toBe(0);
  });

  it('generates characters from book concept', async () => {
    const llm = vi.fn().mockResolvedValue('{"characters":[{"name":"Luna","description":"purple dragon"},{"name":"Benny","description":"brown bear"}]}');
    const out = await generateCharactersRoute({ bookId: 1, userId: 'u1', llm });
    expect(out.length).toBe(2);
    const list = await listCharactersRoute({ bookId: 1, userId: 'u1' });
    expect(list.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd lambda && npx vitest run test/api-characters.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement route module**

Create `lambda/api/routes/characters.js`:

```js
import {
  getDb,
  listCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter,
} from '../../lib/db.js';
import { callOpenRouter } from '../../lib/openrouter.js';

async function assertBookOwned(bookId, userId) {
  const db = getDb();
  const { rows } = await db.execute({
    sql: 'SELECT id, concept FROM books WHERE id = ? AND user_id = ?',
    args: [bookId, userId],
  });
  if (!rows[0]) {
    const err = new Error('Book not found');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

async function assertCharacterOwned(characterId, userId) {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT c.* FROM book_characters c
          JOIN books b ON b.id = c.book_id
          WHERE c.id = ? AND b.user_id = ?`,
    args: [characterId, userId],
  });
  if (!rows[0]) {
    const err = new Error('Character not found');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

export async function listCharactersRoute({ bookId, userId }) {
  await assertBookOwned(bookId, userId);
  return listCharacters(bookId);
}

export async function createCharacterRoute({ bookId, userId, body }) {
  await assertBookOwned(bookId, userId);
  return createCharacter({
    book_id: bookId,
    name: body.name || 'Unnamed',
    description: body.description || '',
    anchor_image_url: body.anchor_image_url || '',
    sort_order: body.sort_order || 0,
  });
}

export async function updateCharacterRoute({ characterId, userId, body }) {
  await assertCharacterOwned(characterId, userId);
  await updateCharacter(characterId, body);
  const db = getDb();
  const { rows } = await db.execute({ sql: 'SELECT * FROM book_characters WHERE id = ?', args: [characterId] });
  return rows[0];
}

export async function deleteCharacterRoute({ characterId, userId }) {
  await assertCharacterOwned(characterId, userId);
  await deleteCharacter(characterId);
  return { ok: true };
}

function extractJson(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

export async function generateCharactersRoute({ bookId, userId, llm = callOpenRouter }) {
  const book = await assertBookOwned(bookId, userId);
  const prompt = `Given this book concept: ${book.concept || ''}, list 1 to 3 recurring characters. For each, provide a short name and a one-line visual description suitable for an illustrator. Return JSON only: {"characters":[{"name":"...","description":"..."}]}.`;
  const raw = await llm(prompt);
  const parsed = extractJson(raw) || { characters: [] };
  const created = [];
  for (const c of (parsed.characters || []).slice(0, 3)) {
    const row = await createCharacter({
      book_id: bookId,
      name: c.name || 'Character',
      description: c.description || '',
      anchor_image_url: '',
      sort_order: created.length,
    });
    created.push(row);
  }
  return created;
}
```

- [ ] **Step 4: Register routes in `lambda/api/handler.js`**

```js
import {
  listCharactersRoute, createCharacterRoute, updateCharacterRoute,
  deleteCharacterRoute, generateCharactersRoute,
} from './routes/characters.js';

// In the route dispatch:
if (method === 'GET' && pathMatches('/api/books/:id/characters')) {
  const bookId = Number(pathParams.id);
  const list = await listCharactersRoute({ bookId, userId });
  return jsonResponse(200, list);
}
if (method === 'POST' && pathMatches('/api/books/:id/characters')) {
  const bookId = Number(pathParams.id);
  const created = await createCharacterRoute({ bookId, userId, body: parseBody(event) });
  return jsonResponse(201, created);
}
if (method === 'POST' && pathMatches('/api/books/:id/characters/generate')) {
  const bookId = Number(pathParams.id);
  const out = await generateCharactersRoute({ bookId, userId });
  return jsonResponse(201, out);
}
if (method === 'PUT' && pathMatches('/api/characters/:id')) {
  const characterId = Number(pathParams.id);
  const updated = await updateCharacterRoute({ characterId, userId, body: parseBody(event) });
  return jsonResponse(200, updated);
}
if (method === 'DELETE' && pathMatches('/api/characters/:id')) {
  const characterId = Number(pathParams.id);
  await deleteCharacterRoute({ characterId, userId });
  return jsonResponse(204, null);
}
```

- [ ] **Step 5: Run test, expect pass**

```bash
cd lambda && npx vitest run test/api-characters.test.js
```

Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add lambda/api/routes/characters.js lambda/api/handler.js lambda/test/api-characters.test.js
git commit -m "feat(api): book_characters CRUD and generate-from-concept"
```

---

### Task 15: Style guide regeneration and anchor endpoints

**Files:**
- Create: `lambda/api/routes/style.js`
- Modify: `lambda/api/handler.js`
- Test: `lambda/test/api-style.test.js`

- [ ] **Step 1: Write failing test**

Create `lambda/test/api-style.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { regenerateStyleGuideRoute, updateStyleAnchorRoute } from '../api/routes/style.js';
import { init, getDb } from '../lib/db.js';

describe('style routes', () => {
  beforeEach(async () => {
    process.env.TURSO_DATABASE_URL = 'file::memory:?cache=shared';
    await init();
    const db = getDb();
    await db.execute({ sql: "DELETE FROM books", args: [] });
    await db.execute({ sql: "INSERT INTO books (id, user_id, title, concept) VALUES (1, 'u1', 'Test', 'Dragons')", args: [] });
  });

  it('regenerates style guide', async () => {
    const llm = vi.fn().mockResolvedValue('Clean bold line art, round friendly characters');
    const out = await regenerateStyleGuideRoute({ bookId: 1, userId: 'u1', llm });
    expect(out.style_guide).toContain('Clean bold line art');
  });

  it('updates style anchor', async () => {
    const out = await updateStyleAnchorRoute({ bookId: 1, userId: 'u1', body: { image_url: 'https://a.png', locked: 1 } });
    expect(out.style_anchor_image_url).toBe('https://a.png');
    expect(out.style_anchor_locked).toBe(1);
  });
});
```

- [ ] **Step 2: Implement**

Create `lambda/api/routes/style.js`:

```js
import { getDb, updateBook } from '../../lib/db.js';
import { callOpenRouter } from '../../lib/openrouter.js';

async function loadBook(bookId, userId) {
  const db = getDb();
  const { rows } = await db.execute({
    sql: 'SELECT * FROM books WHERE id = ? AND user_id = ?',
    args: [bookId, userId],
  });
  if (!rows[0]) {
    const err = new Error('Book not found');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

export async function regenerateStyleGuideRoute({ bookId, userId, llm = callOpenRouter }) {
  const book = await loadBook(bookId, userId);
  const prompt = `Given this book concept: ${book.concept || ''}, write a 4-6 line Style Guide describing visual art direction (linework, shading, character proportions, background density, mood). This will be prepended to every page image prompt. Return only the style guide text, no prose or explanation.`;
  const style_guide = (await llm(prompt)).trim();
  await updateBook(bookId, userId, { style_guide });
  return loadBook(bookId, userId);
}

export async function updateStyleAnchorRoute({ bookId, userId, body }) {
  await loadBook(bookId, userId);
  const fields = {};
  if (body.image_url !== undefined) fields.style_anchor_image_url = body.image_url;
  if (body.locked !== undefined) fields.style_anchor_locked = body.locked ? 1 : 0;
  await updateBook(bookId, userId, fields);
  return loadBook(bookId, userId);
}
```

- [ ] **Step 3: Register routes in handler**

```js
import { regenerateStyleGuideRoute, updateStyleAnchorRoute } from './routes/style.js';

if (method === 'POST' && pathMatches('/api/books/:id/style-guide/regenerate')) {
  const bookId = Number(pathParams.id);
  const out = await regenerateStyleGuideRoute({ bookId, userId });
  return jsonResponse(200, out);
}
if (method === 'PUT' && pathMatches('/api/books/:id/style-anchor')) {
  const bookId = Number(pathParams.id);
  const out = await updateStyleAnchorRoute({ bookId, userId, body: parseBody(event) });
  return jsonResponse(200, out);
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
cd lambda && npx vitest run test/api-style.test.js
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lambda/api/routes/style.js lambda/api/handler.js lambda/test/api-style.test.js
git commit -m "feat(api): style guide regeneration and anchor endpoints"
```

---

### Task 16: Wizard — accept `book_type` and per-page `layout` in book creation

**Files:**
- Modify: `lambda/api/routes/books.js`
- Modify: `lambda/api/routes/ideas.js` (or wherever concept generation lives)
- Test: `lambda/test/wizard-activity-book.test.js`

- [ ] **Step 1: Locate current ideas/concept endpoint**

```bash
grep -rn "ideas\|generateConcept" lambda/api/
```

Identify the file that handles `POST /api/ideas`.

- [ ] **Step 2: Write failing test**

Create `lambda/test/wizard-activity-book.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBookFromConcept } from '../api/routes/books.js';
import { init, getDb } from '../lib/db.js';

describe('createBookFromConcept', () => {
  beforeEach(async () => {
    process.env.TURSO_DATABASE_URL = 'file::memory:?cache=shared';
    await init();
    const db = getDb();
    await db.execute({ sql: "DELETE FROM pages", args: [] });
    await db.execute({ sql: "DELETE FROM books", args: [] });
  });

  it('creates coloring book with every page as full_image', async () => {
    const out = await createBookFromConcept({
      userId: 'u1',
      body: {
        book_type: 'coloring',
        title: 'Coloring Test',
        concept: 'cats',
        pages: [{ title: 'P1', scene: 's1' }, { title: 'P2', scene: 's2' }],
      },
    });
    const db = getDb();
    const { rows } = await db.execute({ sql: "SELECT layout FROM pages WHERE book_id = ?", args: [out.id] });
    expect(rows.every(r => r.layout === 'full_image')).toBe(true);
  });

  it('creates activity book preserving supplied per-page layouts', async () => {
    const out = await createBookFromConcept({
      userId: 'u1',
      body: {
        book_type: 'activity',
        title: 'Activity Test',
        concept: 'dragons',
        style_guide: 'bold line art',
        pages: [
          { title: 'P1', scene: 's1', layout: 'image_with_checklist' },
          { title: 'P2', scene: 's2', layout: 'image_with_qa' },
        ],
      },
    });
    const db = getDb();
    const { rows } = await db.execute({ sql: "SELECT layout FROM pages WHERE book_id = ? ORDER BY id", args: [out.id] });
    expect(rows[0].layout).toBe('image_with_checklist');
    expect(rows[1].layout).toBe('image_with_qa');
    const { rows: br } = await db.execute({ sql: "SELECT style_guide FROM books WHERE id = ?", args: [out.id] });
    expect(br[0].style_guide).toBe('bold line art');
  });
});
```

- [ ] **Step 3: Extend book-creation handler**

In `lambda/api/routes/books.js`, find the create-book function. Make it accept and persist `book_type`, `style_guide`, and per-page `layout`:

```js
export async function createBookFromConcept({ userId, body }) {
  const db = getDb();
  const {
    title, concept = '', tagLine = '', audience = '',
    book_type = 'coloring',
    style_guide = '',
    pages = [],
  } = body;

  const { lastInsertRowid } = await db.execute({
    sql: `INSERT INTO books (user_id, title, concept, tagLine, audience, book_type, style_guide)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [userId, title, concept, tagLine, audience, book_type, style_guide],
  });
  const bookId = Number(lastInsertRowid);

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const layout = book_type === 'coloring' ? 'full_image' : (p.layout || 'full_image');
    await db.execute({
      sql: `INSERT INTO pages (book_id, title, scene, prompt, character_style, sort_order, layout, layout_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        bookId,
        p.title || `Page ${i + 1}`,
        p.scene || '',
        p.prompt || '',
        p.character_style || '',
        i,
        layout,
        JSON.stringify(p.layout_data || {}),
      ],
    });
  }

  const { rows } = await db.execute({ sql: 'SELECT * FROM books WHERE id = ?', args: [bookId] });
  return rows[0];
}
```

(Preserve any existing behavior around `cover_url`, `notes`, `generation_log` insertion, etc., by adding the new fields to the existing function rather than replacing it wholesale.)

- [ ] **Step 4: Update ideas endpoint to emit per-page layouts for activity books**

In the ideas endpoint, branch on `book_type`. For activity books, include this in the concept-generation prompt:

```
For each of the {pageCount} pages, also assign one layout from this list:
full_image, image_with_lines, image_with_prompt_lines, image_with_checklist,
image_with_qa, image_with_draw_box, image_with_fill_blank.

Distribute layouts to keep the book varied. Favor variety over repetition.
Return each page as: {"title": "...", "scene": "...", "layout": "..."}.
```

Also generate the `style_guide` in the same call (or a second call) and return it alongside the concept.

For coloring books, the existing behavior is preserved and `layout` defaults to `full_image` downstream.

- [ ] **Step 5: Run test, expect pass**

```bash
cd lambda && npx vitest run test/wizard-activity-book.test.js
```

Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add lambda/api/routes/books.js lambda/api/routes/ideas.js lambda/test/wizard-activity-book.test.js
git commit -m "feat(wizard): book_type and per-page layout in creation"
```

---

## Phase 5 — Frontend: PDF export refactor

### Task 17: Extract PDF export to `src/lib/pdf-export.js`

**Files:**
- Create: `src/lib/pdf-export.js`
- Create: `src/lib/layouts.js`
- Create: `src/lib/layout-renderers.js`
- Modify: `src/components/BookViewer.jsx` (call-site only — do not change UI in this task)

- [ ] **Step 1: Create frontend layouts wrapper**

Create `src/lib/layouts.js`:

```js
import layoutsJson from '../../shared/layouts.json';

export const LAYOUTS = layoutsJson;
export const LAYOUT_IDS = Object.keys(LAYOUTS);

export function getLayout(id) {
  return LAYOUTS[id] || LAYOUTS.full_image;
}

export function layoutsForBookType(bookType) {
  return Object.values(LAYOUTS).filter(l => l.bookTypes.includes(bookType || 'coloring'));
}
```

- [ ] **Step 2: Create layout-renderers skeleton**

Create `src/lib/layout-renderers.js`:

```js
// Each renderer receives: (pdfPage, { image, layoutData, page, book, fonts, rect, rgb })
// rect = { x, y, width, height } — the printable area in pdf-lib points (72 per inch).

function drawTitleBand(pdfPage, { page, fonts, rect, rgb }) {
  const title = page.title || '';
  if (!title) return { y: rect.y + rect.height, consumed: 0 };
  const bandHeight = 24;
  pdfPage.drawText(title, {
    x: rect.x + rect.width / 2 - (title.length * 3.2),
    y: rect.y + rect.height - 18,
    size: 14,
    font: fonts.bold,
    color: rgb(0, 0, 0),
  });
  return { y: rect.y + rect.height - bandHeight, consumed: bandHeight };
}

function drawCaptionBand(pdfPage, { page, fonts, rect, rgb }) {
  const caption = page.caption || '';
  if (!caption) return { consumed: 0 };
  pdfPage.drawText(caption, {
    x: rect.x + 12,
    y: rect.y + 12,
    size: 10,
    font: fonts.body,
    color: rgb(0.2, 0.2, 0.2),
  });
  return { consumed: 20 };
}

function fitImage(pdfPage, image, box) {
  const iw = image.width;
  const ih = image.height;
  const scale = Math.min(box.width / iw, box.height / ih);
  const w = iw * scale;
  const h = ih * scale;
  pdfPage.drawImage(image, {
    x: box.x + (box.width - w) / 2,
    y: box.y + (box.height - h) / 2,
    width: w,
    height: h,
  });
}

function drawRuledLines(pdfPage, { rect, count, rgb }) {
  const padding = 12;
  const usable = rect.height - padding * 2;
  const spacing = usable / count;
  for (let i = 0; i < count; i++) {
    const y = rect.y + padding + i * spacing;
    pdfPage.drawLine({
      start: { x: rect.x + padding, y },
      end: { x: rect.x + rect.width - padding, y },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
  }
}

export function renderFullImage(pdfPage, ctx) {
  const { image, page, fonts, rect, rgb } = ctx;
  const title = drawTitleBand(pdfPage, ctx);
  const caption = drawCaptionBand(pdfPage, ctx);
  const box = {
    x: rect.x,
    y: rect.y + caption.consumed,
    width: rect.width,
    height: title.y - (rect.y + caption.consumed),
  };
  fitImage(pdfPage, image, box);
}

export function renderImageWithLines(pdfPage, ctx) {
  const { image, layoutData, rect, rgb } = ctx;
  const title = drawTitleBand(pdfPage, ctx);
  const top = title.y;
  const imageH = (top - rect.y) * 0.55;
  const imageBox = { x: rect.x, y: top - imageH, width: rect.width, height: imageH };
  fitImage(pdfPage, image, imageBox);
  const linesRect = { x: rect.x, y: rect.y, width: rect.width, height: imageBox.y - rect.y };
  drawRuledLines(pdfPage, { rect: linesRect, count: layoutData.lineCount || 8, rgb });
}

export function renderImageWithPromptLines(pdfPage, ctx) {
  const { image, layoutData, fonts, rect, rgb } = ctx;
  const title = drawTitleBand(pdfPage, ctx);
  const top = title.y;
  const imageH = (top - rect.y) * 0.5;
  const imageBox = { x: rect.x, y: top - imageH, width: rect.width, height: imageH };
  fitImage(pdfPage, image, imageBox);
  const questionY = imageBox.y - 24;
  const question = layoutData.question || '';
  if (question) {
    pdfPage.drawText(question, { x: rect.x + 12, y: questionY, size: 12, font: fonts.bold, color: rgb(0, 0, 0) });
  }
  const linesRect = { x: rect.x, y: rect.y, width: rect.width, height: questionY - rect.y - 12 };
  drawRuledLines(pdfPage, { rect: linesRect, count: layoutData.lineCount || 6, rgb });
}

export function renderImageWithChecklist(pdfPage, ctx) {
  const { image, layoutData, fonts, rect, rgb } = ctx;
  const title = drawTitleBand(pdfPage, ctx);
  const top = title.y;
  const imageH = (top - rect.y) * 0.62;
  const imageBox = { x: rect.x, y: top - imageH, width: rect.width, height: imageH };
  fitImage(pdfPage, image, imageBox);
  const items = layoutData.items || [];
  const startY = imageBox.y - 20;
  const lineHeight = 20;
  items.forEach((item, i) => {
    const y = startY - i * lineHeight;
    pdfPage.drawRectangle({ x: rect.x + 16, y: y - 2, width: 12, height: 12, borderWidth: 1, borderColor: rgb(0, 0, 0) });
    pdfPage.drawText(item, { x: rect.x + 34, y, size: 12, font: fonts.body, color: rgb(0, 0, 0) });
  });
}

export function renderImageWithQA(pdfPage, ctx) {
  const { image, layoutData, fonts, rect, rgb } = ctx;
  const title = drawTitleBand(pdfPage, ctx);
  const top = title.y;
  const imageH = (top - rect.y) * 0.52;
  const imageBox = { x: rect.x, y: top - imageH, width: rect.width, height: imageH };
  fitImage(pdfPage, image, imageBox);
  const questions = layoutData.questions || [];
  const linesPerQ = layoutData.linesPerQuestion || 2;
  let y = imageBox.y - 16;
  questions.forEach((q, i) => {
    pdfPage.drawText(`${i + 1}. ${q}`, { x: rect.x + 12, y, size: 11, font: fonts.body, color: rgb(0, 0, 0) });
    y -= 16;
    for (let l = 0; l < linesPerQ; l++) {
      pdfPage.drawLine({
        start: { x: rect.x + 24, y },
        end: { x: rect.x + rect.width - 12, y },
        thickness: 0.5,
        color: rgb(0.6, 0.6, 0.6),
      });
      y -= 14;
    }
    y -= 6;
  });
}

export function renderImageWithDrawBox(pdfPage, ctx) {
  const { image, layoutData, fonts, rect, rgb } = ctx;
  const title = drawTitleBand(pdfPage, ctx);
  const top = title.y;
  const imageH = (top - rect.y) * 0.48;
  const imageBox = { x: rect.x, y: top - imageH, width: rect.width, height: imageH };
  fitImage(pdfPage, image, imageBox);
  const instruction = layoutData.instruction || 'Now draw your own!';
  pdfPage.drawText(instruction, {
    x: rect.x + 12, y: imageBox.y - 20, size: 12, font: fonts.bold, color: rgb(0, 0, 0),
  });
  const boxY = rect.y + 12;
  const boxH = imageBox.y - 36 - boxY;
  pdfPage.drawRectangle({
    x: rect.x + 12, y: boxY, width: rect.width - 24, height: boxH,
    borderWidth: 1, borderColor: rgb(0.4, 0.4, 0.4),
  });
}

export function renderImageWithFillBlank(pdfPage, ctx) {
  const { image, layoutData, fonts, rect, rgb } = ctx;
  const title = drawTitleBand(pdfPage, ctx);
  const top = title.y;
  const imageH = (top - rect.y) * 0.55;
  const imageBox = { x: rect.x, y: top - imageH, width: rect.width, height: imageH };
  fitImage(pdfPage, image, imageBox);
  const sentences = layoutData.sentences || [];
  let y = imageBox.y - 24;
  for (const s of sentences) {
    pdfPage.drawText(s, { x: rect.x + 12, y, size: 14, font: fonts.body, color: rgb(0, 0, 0) });
    y -= 28;
  }
}

export const RENDERERS = {
  full_image: renderFullImage,
  image_with_lines: renderImageWithLines,
  image_with_prompt_lines: renderImageWithPromptLines,
  image_with_checklist: renderImageWithChecklist,
  image_with_qa: renderImageWithQA,
  image_with_draw_box: renderImageWithDrawBox,
  image_with_fill_blank: renderImageWithFillBlank,
};
```

- [ ] **Step 3: Create pdf-export module**

Create `src/lib/pdf-export.js`:

```js
import { getLayout } from './layouts.js';
import { RENDERERS } from './layout-renderers.js';

function safeJson(s) {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

async function loadAndEmbedImage(pdf, page) {
  const url = page.print_image_url || page.image_url;
  if (!url) return null;
  const res = await fetch(url);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (url.toLowerCase().includes('.jpg') || url.toLowerCase().includes('.jpeg')) {
    return pdf.embedJpg(buf);
  }
  return pdf.embedPng(buf);
}

function computePrintableRect(pdfPage, margin = 36) {
  const { width, height } = pdfPage.getSize();
  return { x: margin, y: margin, width: width - margin * 2, height: height - margin * 2 };
}

function addBleedPage(pdf, rgb) {
  const p = pdf.addPage([612, 792]);
  p.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(0, 0, 0) });
}

export async function exportInteriorPdf(book, pages, opts = {}) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const fonts = {
    body: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
  };

  for (const page of pages) {
    if (opts.bleedThrough) addBleedPage(pdf, rgb);

    const pdfPage = pdf.addPage([612, 792]);
    const rect = computePrintableRect(pdfPage, opts.margin || 36);
    const image = await loadAndEmbedImage(pdf, page);
    if (!image) continue;

    const layout = getLayout(page.layout || 'full_image');
    const renderer = RENDERERS[layout.id] || RENDERERS.full_image;
    await renderer(pdfPage, {
      image,
      layoutData: safeJson(page.layout_data),
      page,
      book,
      fonts,
      rect,
      rgb,
    });
  }

  return pdf.save();
}

export async function exportCoverPdf(book, coverImageUrl) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const fonts = { bold: await pdf.embedFont(StandardFonts.HelveticaBold), body: await pdf.embedFont(StandardFonts.Helvetica), serif: await pdf.embedFont(StandardFonts.TimesRoman) };
  const pdfPage = pdf.addPage([612, 792]);
  const rect = computePrintableRect(pdfPage);
  const res = await fetch(coverImageUrl);
  const buf = new Uint8Array(await res.arrayBuffer());
  const image = coverImageUrl.toLowerCase().includes('.jpg') ? await pdf.embedJpg(buf) : await pdf.embedPng(buf);
  RENDERERS.full_image(pdfPage, { image, layoutData: {}, page: { title: book.title, caption: book.tagLine || '' }, book, fonts, rect, rgb });
  return pdf.save();
}

export async function exportCompleteBookPdf(book, pages, coverImageUrl, opts = {}) {
  // Concatenate cover + interior into one PDF.
  const { PDFDocument } = await import('pdf-lib');
  const combined = await PDFDocument.create();
  if (coverImageUrl) {
    const coverBytes = await exportCoverPdf(book, coverImageUrl);
    const coverPdf = await PDFDocument.load(coverBytes);
    const [coverPage] = await combined.copyPages(coverPdf, [0]);
    combined.addPage(coverPage);
  }
  const interiorBytes = await exportInteriorPdf(book, pages, opts);
  const interiorPdf = await PDFDocument.load(interiorBytes);
  const interiorPages = await combined.copyPages(interiorPdf, interiorPdf.getPageIndices());
  for (const p of interiorPages) combined.addPage(p);
  return combined.save();
}
```

- [ ] **Step 4: Replace PDF logic in `BookViewer.jsx`**

In `src/components/BookViewer.jsx`, find the existing PDF-generation function (around line 583). Replace its body with:

```js
import { exportInteriorPdf, exportCoverPdf, exportCompleteBookPdf } from '../lib/pdf-export.js';

// ...inside the download handler:
const bytes = await exportInteriorPdf(book, pages, { bleedThrough: options.bleedThrough, margin: 36 });
const blob = new Blob([bytes], { type: 'application/pdf' });
// ...existing download flow using blob
```

Remove the now-unused pdf-lib imports from `BookViewer.jsx`. Similarly route cover and complete-book downloads through `exportCoverPdf` and `exportCompleteBookPdf`.

- [ ] **Step 5: Build frontend**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/layouts.js src/lib/layout-renderers.js src/lib/pdf-export.js src/components/BookViewer.jsx
git commit -m "refactor(pdf): extract PDF export into dispatcher + layout renderers"
```

---

### Task 18: Renderer unit tests

**Files:**
- Create: `src/lib/__tests__/layout-renderers.test.js`
- Modify: `vite.config.js` or `package.json` (add vitest test config for src/ if missing)

- [ ] **Step 1: Ensure vitest can run against `src/`**

Check `package.json` for a vitest config. If not present, add:

```json
"scripts": {
  "test:frontend": "vitest run --config vitest.frontend.config.js"
}
```

And create `vitest.frontend.config.js`:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
```

- [ ] **Step 2: Write failing test**

Create `src/lib/__tests__/layout-renderers.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { RENDERERS } from '../layout-renderers.js';

function makeSpyPage() {
  return {
    drawText: vi.fn(),
    drawImage: vi.fn(),
    drawLine: vi.fn(),
    drawRectangle: vi.fn(),
    getSize: () => ({ width: 612, height: 792 }),
  };
}

const rgb = (r, g, b) => ({ r, g, b });
const fonts = { body: {}, bold: {}, serif: {} };
const image = { width: 1000, height: 1000 };
const rect = { x: 36, y: 36, width: 540, height: 720 };

describe('layout renderers', () => {
  it('renderFullImage draws exactly one image', () => {
    const p = makeSpyPage();
    RENDERERS.full_image(p, { image, layoutData: {}, page: { title: 'T' }, book: {}, fonts, rect, rgb });
    expect(p.drawImage).toHaveBeenCalledTimes(1);
  });

  it('renderImageWithLines draws image plus N lines', () => {
    const p = makeSpyPage();
    RENDERERS.image_with_lines(p, { image, layoutData: { lineCount: 6 }, page: { title: 'T' }, book: {}, fonts, rect, rgb });
    expect(p.drawImage).toHaveBeenCalledTimes(1);
    expect(p.drawLine).toHaveBeenCalledTimes(6);
  });

  it('renderImageWithChecklist draws one rectangle per item', () => {
    const p = makeSpyPage();
    RENDERERS.image_with_checklist(p, {
      image, layoutData: { items: ['a', 'b', 'c', 'd', 'e'] },
      page: { title: 'T' }, book: {}, fonts, rect, rgb,
    });
    expect(p.drawRectangle).toHaveBeenCalledTimes(5);
  });

  it('renderImageWithQA draws lines proportional to questions*linesPerQuestion', () => {
    const p = makeSpyPage();
    RENDERERS.image_with_qa(p, {
      image, layoutData: { questions: ['q1', 'q2', 'q3'], linesPerQuestion: 2 },
      page: { title: 'T' }, book: {}, fonts, rect, rgb,
    });
    expect(p.drawLine).toHaveBeenCalledTimes(6);
  });

  it('renderImageWithDrawBox draws a bordered rectangle', () => {
    const p = makeSpyPage();
    RENDERERS.image_with_draw_box(p, {
      image, layoutData: { instruction: 'draw!' },
      page: { title: 'T' }, book: {}, fonts, rect, rgb,
    });
    expect(p.drawRectangle).toHaveBeenCalled();
  });

  it('renderImageWithFillBlank draws each sentence', () => {
    const p = makeSpyPage();
    RENDERERS.image_with_fill_blank(p, {
      image, layoutData: { sentences: ['s1', 's2', 's3'] },
      page: { title: 'T' }, book: {}, fonts, rect, rgb,
    });
    // Title + 3 sentences = 4 drawText calls
    expect(p.drawText.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 3: Run test, expect pass**

```bash
npx vitest run --config vitest.frontend.config.js
```

Expected: PASS (6 tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/__tests__/layout-renderers.test.js vitest.frontend.config.js package.json
git commit -m "test(frontend): unit tests for layout renderers"
```

---

## Phase 6 — Frontend UI

### Task 19: API client methods

**Files:**
- Modify: `src/lib/api.js`

- [ ] **Step 1: Add new client functions**

Append to `src/lib/api.js` (match existing style — auth token passed, etc.):

```js
export async function setPageLayout(pageId, layoutId) {
  return apiFetch(`/api/pages/${pageId}/layout`, {
    method: 'POST',
    body: JSON.stringify({ layout: layoutId }),
  });
}

export async function regeneratePageLayoutCopy(pageId) {
  return apiFetch(`/api/pages/${pageId}/layout/regenerate-copy`, { method: 'POST' });
}

export async function listCharacters(bookId) {
  return apiFetch(`/api/books/${bookId}/characters`);
}

export async function createCharacter(bookId, data) {
  return apiFetch(`/api/books/${bookId}/characters`, { method: 'POST', body: JSON.stringify(data) });
}

export async function updateCharacter(characterId, data) {
  return apiFetch(`/api/characters/${characterId}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteCharacter(characterId) {
  return apiFetch(`/api/characters/${characterId}`, { method: 'DELETE' });
}

export async function generateCharacters(bookId) {
  return apiFetch(`/api/books/${bookId}/characters/generate`, { method: 'POST' });
}

export async function regenerateStyleGuide(bookId) {
  return apiFetch(`/api/books/${bookId}/style-guide/regenerate`, { method: 'POST' });
}

export async function updateStyleAnchor(bookId, { image_url, locked }) {
  return apiFetch(`/api/books/${bookId}/style-anchor`, {
    method: 'PUT',
    body: JSON.stringify({ image_url, locked }),
  });
}
```

(Match the exact helper name and auth pattern already in `src/lib/api.js`; this is pseudocode for the shape.)

- [ ] **Step 2: Commit**

```bash
git add src/lib/api.js
git commit -m "feat(api-client): activity book endpoints"
```

---

### Task 20: Wizard — book type selector

**Files:**
- Modify: `src/App.jsx` (wizard flow)

- [ ] **Step 1: Add book type state and selector**

In the wizard component in `src/App.jsx`, add a new first step before the theme picker:

```jsx
const [bookType, setBookType] = useState('coloring');

// In the wizard UI:
{wizardStep === 'book-type' && (
  <div className="wizard-cards">
    <button
      className={`wizard-card ${bookType === 'coloring' ? 'selected' : ''}`}
      onClick={() => { setBookType('coloring'); setWizardStep('theme'); }}
    >
      <h3>Coloring Book</h3>
      <p>Classic full-page coloring pages.</p>
    </button>
    <button
      className={`wizard-card ${bookType === 'activity' ? 'selected' : ''}`}
      onClick={() => { setBookType('activity'); setWizardStep('theme'); }}
    >
      <h3>Activity Book</h3>
      <p>Mixed pages: images with writing prompts, checklists, Q&A, and more.</p>
    </button>
  </div>
)}
```

- [ ] **Step 2: Pass `book_type` into idea generation request**

In the handler that calls `POST /api/ideas`:

```js
const concept = await fetchIdeas({ theme, audience, pageCount, book_type: bookType });
```

- [ ] **Step 3: Pass `book_type`, `style_guide`, and per-page `layout` into book creation**

In the save-book handler:

```js
const book = await createBook({
  title: concept.title,
  concept: concept.description,
  tagLine: concept.tagLine,
  audience,
  book_type: bookType,
  style_guide: concept.style_guide || '',
  pages: concept.pages, // each page already has layout from ideas response for activity books
});
```

- [ ] **Step 4: Show Style DNA preview after concept generation**

After concept is received in the wizard, render a collapsible section:

```jsx
{concept?.style_guide && (
  <details className="wizard-style-preview">
    <summary>Style Guide</summary>
    <textarea
      value={concept.style_guide}
      onChange={e => setConcept({ ...concept, style_guide: e.target.value })}
    />
    <button onClick={regenerateStyle}>Regenerate</button>
  </details>
)}
```

Where `regenerateStyle` re-calls the ideas endpoint with the same inputs but asks only for a new style_guide.

- [ ] **Step 5: Build frontend**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat(wizard): book type selector and Style DNA preview"
```

---

### Task 21: Book Settings panel (style + characters)

**Files:**
- Create: `src/components/BookSettingsPanel.jsx`
- Modify: `src/components/BookViewer.jsx` (add trigger button)

- [ ] **Step 1: Create component**

Create `src/components/BookSettingsPanel.jsx`:

```jsx
import { useState, useEffect } from 'react';
import {
  listCharacters as apiListCharacters,
  createCharacter as apiCreateCharacter,
  updateCharacter as apiUpdateCharacter,
  deleteCharacter as apiDeleteCharacter,
  generateCharacters as apiGenerateCharacters,
  regenerateStyleGuide as apiRegenerateStyleGuide,
  updateStyleAnchor as apiUpdateStyleAnchor,
  updateBook as apiUpdateBook,
} from '../lib/api.js';

export default function BookSettingsPanel({ book, onClose, onBookChange }) {
  const [styleGuide, setStyleGuide] = useState(book.style_guide || '');
  const [anchorUrl, setAnchorUrl] = useState(book.style_anchor_image_url || '');
  const [anchorLocked, setAnchorLocked] = useState(!!book.style_anchor_locked);
  const [characters, setCharacters] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiListCharacters(book.id).then(setCharacters);
  }, [book.id]);

  async function saveStyleGuide() {
    setBusy(true);
    const updated = await apiUpdateBook(book.id, { style_guide: styleGuide });
    onBookChange?.(updated);
    setBusy(false);
  }

  async function regenerateStyle() {
    setBusy(true);
    const updated = await apiRegenerateStyleGuide(book.id);
    setStyleGuide(updated.style_guide);
    onBookChange?.(updated);
    setBusy(false);
  }

  async function saveAnchor() {
    setBusy(true);
    const updated = await apiUpdateStyleAnchor(book.id, { image_url: anchorUrl, locked: anchorLocked ? 1 : 0 });
    onBookChange?.(updated);
    setBusy(false);
  }

  async function addCharacter() {
    const row = await apiCreateCharacter(book.id, { name: 'New Character', description: '' });
    setCharacters([...characters, row]);
  }

  async function genCharacters() {
    setBusy(true);
    const rows = await apiGenerateCharacters(book.id);
    setCharacters([...characters, ...rows]);
    setBusy(false);
  }

  async function updateChar(id, fields) {
    const updated = await apiUpdateCharacter(id, fields);
    setCharacters(characters.map(c => c.id === id ? updated : c));
  }

  async function removeChar(id) {
    await apiDeleteCharacter(id);
    setCharacters(characters.filter(c => c.id !== id));
  }

  return (
    <div className="book-settings-overlay" onClick={onClose}>
      <div className="book-settings-panel" onClick={e => e.stopPropagation()}>
        <div className="book-settings-header">
          <h2>Book Settings</h2>
          <button onClick={onClose}>×</button>
        </div>

        <section>
          <h3>Style Guide</h3>
          <textarea
            rows={6}
            value={styleGuide}
            onChange={e => setStyleGuide(e.target.value)}
            placeholder="Visual art direction: linework, shading, character proportions, mood..."
          />
          <div className="row">
            <button onClick={saveStyleGuide} disabled={busy}>Save</button>
            <button onClick={regenerateStyle} disabled={busy}>Regenerate from concept</button>
          </div>
        </section>

        <section>
          <h3>Style Anchor Image</h3>
          {anchorUrl ? (
            <img src={anchorUrl} alt="anchor" style={{ maxWidth: 200 }} />
          ) : (
            <p className="muted">Will be set to the first approved image on this book.</p>
          )}
          <label>
            <input type="checkbox" checked={anchorLocked} onChange={e => setAnchorLocked(e.target.checked)} />
            Lock anchor (do not auto-update)
          </label>
          <div className="row">
            <input
              type="text"
              placeholder="Image URL (or leave blank)"
              value={anchorUrl}
              onChange={e => setAnchorUrl(e.target.value)}
            />
            <button onClick={saveAnchor} disabled={busy}>Save</button>
          </div>
        </section>

        <section>
          <h3>Characters</h3>
          <button onClick={addCharacter}>Add Character</button>
          <button onClick={genCharacters} disabled={busy}>Generate from concept</button>
          {characters.map(c => (
            <div key={c.id} className="character-row">
              <input
                type="text"
                value={c.name}
                onChange={e => updateChar(c.id, { name: e.target.value })}
              />
              <textarea
                rows={2}
                value={c.description || ''}
                onChange={e => updateChar(c.id, { description: e.target.value })}
                placeholder="Visual description"
              />
              <input
                type="text"
                value={c.anchor_image_url || ''}
                onChange={e => updateChar(c.id, { anchor_image_url: e.target.value })}
                placeholder="Anchor image URL (optional)"
              />
              <button onClick={() => removeChar(c.id)}>Delete</button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add trigger to `BookViewer.jsx`**

In the sidebar header area of `BookViewer.jsx`:

```jsx
import BookSettingsPanel from './BookSettingsPanel.jsx';
// ...
const [settingsOpen, setSettingsOpen] = useState(false);
// ...
<button className="icon-button" onClick={() => setSettingsOpen(true)} title="Book settings">⚙️</button>
{settingsOpen && (
  <BookSettingsPanel
    book={book}
    onClose={() => setSettingsOpen(false)}
    onBookChange={(updated) => setBook(updated)}
  />
)}
```

- [ ] **Step 3: Add CSS for the panel**

Append to `src/App.css` (match existing dark/light variable names):

```css
.book-settings-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.book-settings-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  max-width: 640px; width: 90%;
  max-height: 85vh; overflow-y: auto;
}
.book-settings-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.character-row { display: grid; gap: 4px; padding: 12px 0; border-top: 1px solid var(--border); }
.book-settings-panel .row { display: flex; gap: 8px; margin-top: 8px; }
```

- [ ] **Step 4: Build frontend**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/BookSettingsPanel.jsx src/components/BookViewer.jsx src/App.css
git commit -m "feat(ui): Book Settings panel for style and characters"
```

---

### Task 22: PromptPanel — layout picker and data editor

**Files:**
- Modify: `src/components/PromptPanel.jsx`
- Create: `src/components/LayoutDataEditor.jsx`

- [ ] **Step 1: Create data editor**

Create `src/components/LayoutDataEditor.jsx`:

```jsx
import { useState } from 'react';
import { regeneratePageLayoutCopy } from '../lib/api.js';

export default function LayoutDataEditor({ page, layout, onPageChange }) {
  const data = (() => { try { return JSON.parse(page.layout_data || '{}'); } catch { return {}; } })();
  const [local, setLocal] = useState(data);
  const [busy, setBusy] = useState(false);

  function setField(key, value) {
    const next = { ...local, [key]: value };
    setLocal(next);
    onPageChange({ ...page, layout_data: JSON.stringify(next) });
  }

  async function regenerate() {
    setBusy(true);
    const updated = await regeneratePageLayoutCopy(page.id);
    const parsed = JSON.parse(updated.layout_data || '{}');
    setLocal(parsed);
    onPageChange(updated);
    setBusy(false);
  }

  if (!layout.editableFields || layout.editableFields.length === 0) return null;

  return (
    <div className="layout-data-editor">
      <div className="row">
        <h4>Layout content</h4>
        {layout.copyPromptTemplate && (
          <button onClick={regenerate} disabled={busy}>Regenerate copy</button>
        )}
      </div>
      {layout.editableFields.map(field => {
        const value = local[field.key] ?? field.default ?? (field.type === 'stringList' ? [] : '');
        if (field.type === 'number') {
          return (
            <label key={field.key}>
              {field.label}
              <input
                type="number"
                value={value}
                min={field.min} max={field.max}
                onChange={e => setField(field.key, Number(e.target.value))}
              />
            </label>
          );
        }
        if (field.type === 'textarea') {
          return (
            <label key={field.key}>
              {field.label}
              <textarea
                rows={2}
                value={value}
                onChange={e => setField(field.key, e.target.value)}
              />
            </label>
          );
        }
        if (field.type === 'text') {
          return (
            <label key={field.key}>
              {field.label}
              <input
                type="text"
                value={value}
                placeholder={field.placeholder || ''}
                onChange={e => setField(field.key, e.target.value)}
              />
            </label>
          );
        }
        if (field.type === 'stringList') {
          const list = Array.isArray(value) ? value : [];
          return (
            <div key={field.key}>
              <div className="row">
                <span>{field.label}</span>
                <button onClick={() => setField(field.key, [...list, ''])}>+ Add</button>
              </div>
              {list.map((item, i) => (
                <div key={i} className="row">
                  <input
                    type="text"
                    value={item}
                    onChange={e => {
                      const next = [...list];
                      next[i] = e.target.value;
                      setField(field.key, next);
                    }}
                  />
                  <button onClick={() => {
                    const next = list.filter((_, j) => j !== i);
                    setField(field.key, next);
                  }}>×</button>
                </div>
              ))}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add layout picker to PromptPanel**

In `src/components/PromptPanel.jsx`, near the top of the form:

```jsx
import { layoutsForBookType, getLayout } from '../lib/layouts.js';
import { setPageLayout as apiSetPageLayout } from '../lib/api.js';
import LayoutDataEditor from './LayoutDataEditor.jsx';

// ...inside the component:
const layouts = layoutsForBookType(book?.book_type || 'coloring');
const currentLayout = getLayout(page.layout || 'full_image');

async function handleLayoutChange(newLayoutId) {
  if (newLayoutId === page.layout) return;
  const hasApprovedImages = page.approved_image_url; // adjust to actual field
  if (hasApprovedImages && getLayout(newLayoutId).imageAspect !== currentLayout.imageAspect) {
    const ok = confirm(
      'This layout uses a different image size. Existing approved images may not fit perfectly. Switch anyway?'
    );
    if (!ok) return;
  }
  const updated = await apiSetPageLayout(page.id, newLayoutId);
  onPageChange(updated);
}

// In the form JSX:
{layouts.length > 1 && (
  <div className="field">
    <label>Layout</label>
    <select
      value={page.layout || 'full_image'}
      onChange={e => handleLayoutChange(e.target.value)}
    >
      {layouts.map(l => (
        <option key={l.id} value={l.id}>{l.badge} {l.name}</option>
      ))}
    </select>
  </div>
)}

<LayoutDataEditor
  page={page}
  layout={currentLayout}
  onPageChange={onPageChange}
/>
```

- [ ] **Step 3: Build frontend**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/PromptPanel.jsx src/components/LayoutDataEditor.jsx
git commit -m "feat(ui): PromptPanel layout picker and data editor"
```

---

### Task 23: PageList — emoji badges

**Files:**
- Modify: `src/components/PageList.jsx`

- [ ] **Step 1: Import layouts and render badge per row**

In `src/components/PageList.jsx`:

```jsx
import { getLayout } from '../lib/layouts.js';

// Inside the row render, next to the page title:
<span className="page-layout-badge" title={getLayout(page.layout).name}>
  {getLayout(page.layout).badge}
</span>
```

- [ ] **Step 2: Add CSS**

In `src/App.css`:

```css
.page-layout-badge { margin-right: 6px; font-size: 14px; }
```

- [ ] **Step 3: Build frontend**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/PageList.jsx src/App.css
git commit -m "feat(ui): emoji layout badges in PageList"
```

---

## Phase 7 — Integration and QA

### Task 24: Full test suite green

- [ ] **Step 1: Run all lambda tests**

```bash
cd lambda && npx vitest run
```

Expected: every test green. If any existing test broke, fix the regression without loosening assertions.

- [ ] **Step 2: Run frontend tests**

```bash
npx vitest run --config vitest.frontend.config.js
```

Expected: every test green.

- [ ] **Step 3: Build frontend**

```bash
npm run build
```

Expected: build succeeds, no warnings about missing modules.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test regressions from activity book work"
```

(Skip if no fixes were needed.)

---

### Task 25: Manual QA checklist

Do not automate these — run them by hand on a dev deploy or against local `npm run dev` + a staging Lambda.

- [ ] **Existing coloring book compatibility**
  - Open an existing pre-migration coloring book.
  - Verify page list renders with no console errors.
  - Verify every page shows the 🖼️ badge.
  - Export interior PDF → byte-compare qualitatively against an old export (same pages, same layout, same general look).

- [ ] **New coloring book happy path**
  - Create a new book, select "Coloring Book" in the wizard.
  - Go through theme + audience + page count.
  - Confirm the concept is generated and every page has `layout === 'full_image'` in the API response.
  - Generate and approve one page. Confirm the style anchor auto-sets to that image.
  - Export interior PDF → renders as expected.

- [ ] **New activity book happy path**
  - Create a new book, select "Activity Book" in the wizard.
  - Confirm varied layouts in the generated pages (at least 3 distinct layout types across 5 pages).
  - Confirm Style DNA preview renders.
  - Open Book Settings, confirm style_guide is populated, characters list is empty or populated, anchor is empty.
  - Click "Generate Characters from Concept" → 1–3 characters appear.
  - Generate images for one checklist page, one Q&A page, one draw-box page. Confirm each image is at the right aspect ratio (not square).
  - Approve one. Confirm the style anchor auto-sets.
  - Export interior PDF → all layouts render correctly, no page overflows.

- [ ] **Layout change flow**
  - On an activity book, change a page's layout from `full_image` → `image_with_checklist`.
  - Confirm the warning appears about image regeneration (if the page had approved images).
  - Accept, regenerate, confirm new image fits.

- [ ] **Style anchor locking**
  - In Book Settings, set lock = true, set image_url = some other approved image.
  - Approve another image. Confirm the anchor does NOT change.
  - Unlock, clear anchor. Approve another image. Confirm anchor auto-sets.

- [ ] **Character matching**
  - Add a character "Luna" with a description and an anchor image URL.
  - On a page whose scene mentions "Luna", generate on Gemini. Confirm (via logs) that the anchor URL was passed as a reference image.
  - On a page whose scene does not mention Luna, generate. Confirm the anchor was NOT passed.

- [ ] **Rollback dry-run**
  - Check out previous main; deploy locally; confirm existing books still load.
  - Check out activity-book branch; redeploy; confirm everything still loads.

- [ ] **Step 1: Document results and any follow-ups in a PR comment or follow-up ticket**

---

## Self-Review Notes

- **Spec coverage check**: every section of the spec has at least one task. Data model (Task 2–4), layout catalog (Task 1), prompt pipeline (Task 5–8), generation pipeline (Task 9–11), API routes (Task 12–16), PDF export (Task 17–18), UI (Task 19–23), migration (Task 2 defaults + Task 25 QA), testing (embedded throughout).
- **Deferred items from spec are not included as tasks**: tracing layout (v2), spot-the-difference (v2), puzzle layouts (separate project), full rebrand (future). Matches the spec's non-goals.
- **Open questions from spec flagged in implementation steps**: the exact Gemini reference-image API shape is called out in Task 10 Step 4 as something to confirm against current docs during that task.
- **Type consistency**: `setPageLayout` is used with the same signature in Tasks 12, 19, 22. `generateLayoutCopy` signature consistent across Tasks 8, 12, 13. `maybeSetStyleAnchor` consistent across Tasks 11 and the approve route.
