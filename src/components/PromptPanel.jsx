import { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, Code, RotateCcw, Sparkles, StickyNote } from 'lucide-react';
import PromptTip, { PROMPT_TIPS } from './PromptTip.jsx';
import PromptGuide from './PromptGuide.jsx';

function PlacementToggle({ label, value, onChange }) {
  return (
    <div className="placement-toggle">
      <span className="placement-toggle__label">{label}</span>
      <button
        className={`placement-toggle__btn ${value === 'pdf' ? 'is-active' : ''}`}
        onClick={() => onChange('pdf')}
      >PDF</button>
      <button
        className={`placement-toggle__btn ${value === 'image' ? 'is-active' : ''}`}
        onClick={() => onChange('image')}
      >Image</button>
    </div>
  );
}

export default function PromptPanel({
  activePage,
  isCover,
  bookTitle,
  // Cover
  coverPrompt,
  onCoverPromptChange,
  // Style
  currentStyle,
  characterGuide,
  onStyleChange,
  onStyleBlur,
  onStyleReset,
  onStyleApplyAll,
  styleSaving,
  styleError,
  // Character
  currentCharacter,
  onCharacterChange,
  onCharacterBlur,
  characterSaving,
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
  // Placement toggles
  titleIn,
  onTitleInChange,
  captionIn,
  onCaptionInChange,
  // Notes
  currentPageNotes,
  onPageNotesChange,
  onPageNotesBlur,
  // Title editing
  currentTitle,
  onTitleChange,
  onTitleBlur,
  titleSaving,
  // AI Generate
  onAiGenerate,
  aiGenerating,
  // Prompt preview
  assembledPrompt,
  lastOptimizedPrompt,
  // Errors
  imageError,
  genError,
}) {
  const [characterOpen, setCharacterOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const isStyleCustomized = characterGuide && currentStyle && currentStyle !== characterGuide;
  const isStyleDefault = characterGuide && currentStyle === characterGuide;

  return (
    <div className="main-layout__prompts">
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
          <PlacementToggle label="Title in" value={titleIn} onChange={onTitleInChange} />
        ) : (
          <h2>{activePage?.title ?? 'Select a page'}</h2>
        )}
        {titleSaving && <span className="pill subtle">Saving...</span>}
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
              onChange={onCoverPromptChange}
              placeholder="Describe the cover illustration."
              rows={3}
            />
          </div>
          <div className="prompt-field">
            <button
              type="button"
              className="prompt-field__collapse-toggle"
              onClick={() => setPreviewOpen(o => !o)}
            >
              {previewOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Code size={12} />
              <span>View prompt</span>
            </button>
            {previewOpen && (
              <div className="prompt-preview">
                <div className="prompt-preview__section">
                  <span className="prompt-preview__label">Assembled prompt</span>
                  <pre className="prompt-preview__code">{assembledPrompt || '(empty)'}</pre>
                </div>
                {lastOptimizedPrompt && (
                  <div className="prompt-preview__section">
                    <span className="prompt-preview__label">Last optimized prompt (sent to model)</span>
                    <pre className="prompt-preview__code">{lastOptimizedPrompt}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="prompt-stack">
          <div className="prompt-field">
            <label htmlFor="style-text">Style prompt <PromptTip tips={PROMPT_TIPS.style} /></label>
            <textarea
              id="style-text"
              value={currentStyle}
              onChange={onStyleChange}
              onBlur={onStyleBlur}
              placeholder="Describe the art style for this page (e.g. whimsical, detailed, cartoon)."
              rows={3}
            />
            <div className="prompt-field__meta">
              {styleSaving && <span className="pill subtle">Saving...</span>}
              {isStyleDefault && <span className="prompt-field__inherit">Inherited from book concept</span>}
              {isStyleCustomized && (
                <>
                  <span className="prompt-field__inherit prompt-field__inherit--custom">Custom for this page</span>
                  {onStyleReset && (
                    <button className="btn ghost prompt-field__reset" onClick={onStyleReset}>
                      <RotateCcw size={11} /> Reset to default
                    </button>
                  )}
                </>
              )}
              {onStyleApplyAll && currentStyle && (
                <button className="btn ghost prompt-field__reset" onClick={onStyleApplyAll}>
                  Apply this style to all pages
                </button>
              )}
            </div>
            {styleError && <div className="book-viewer__alert">{styleError}</div>}
          </div>

          <div className="prompt-field">
            <button
              type="button"
              className="prompt-field__collapse-toggle"
              onClick={() => setCharacterOpen(o => !o)}
            >
              {characterOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>Character description</span>
              {currentCharacter && !characterOpen && <span className="pill subtle">has content</span>}
            </button>
            {characterOpen && (
              <>
                <textarea
                  id="character-text"
                  value={currentCharacter}
                  onChange={onCharacterChange}
                  onBlur={onCharacterBlur}
                  placeholder="Describe recurring characters (appearance, outfit, features). Leave empty if no specific characters."
                  rows={3}
                />
                {characterSaving && <span className="pill subtle">Saving...</span>}
              </>
            )}
          </div>

          <div className="prompt-field">
            <label htmlFor="scene-text">Illustration prompt <PromptTip tips={PROMPT_TIPS.scene} /></label>
            <textarea
              id="scene-text"
              value={currentPrompt}
              onChange={onPromptChange}
              onBlur={onPromptBlur}
              placeholder="Describe the scene to generate."
              rows={3}
            />
            {promptSaving && <span className="pill subtle">Saving...</span>}
            {promptError && <div className="book-viewer__alert">{promptError}</div>}
            {onAiGenerate && !currentPrompt?.trim() && (
              <button className="btn ghost ai-gen-btn" onClick={onAiGenerate} disabled={aiGenerating}>
                <Sparkles size={14} />
                {aiGenerating ? 'Generating...' : 'AI Generate Description'}
              </button>
            )}
          </div>
          <div className="prompt-field">
            <label htmlFor="caption-text">Print caption <PromptTip tips={PROMPT_TIPS.caption} /></label>
            <textarea
              id="caption-text"
              value={currentCaption}
              onChange={onCaptionChange}
              onBlur={onCaptionBlur}
              placeholder="Caption printed below the image in the PDF export."
              rows={2}
            />
            {captionSaving && <span className="pill subtle">Saving...</span>}
            <PlacementToggle label="Caption in" value={captionIn} onChange={onCaptionInChange} />
          </div>
          <div className="prompt-field">
            <label htmlFor="page-notes">
              <StickyNote size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
              Page notes
            </label>
            <textarea
              id="page-notes"
              value={currentPageNotes}
              onChange={onPageNotesChange}
              onBlur={onPageNotesBlur}
              placeholder="Internal notes for this page..."
              rows={2}
            />
          </div>

          {/* Prompt preview (advanced, off by default) */}
          <div className="prompt-field">
            <button
              type="button"
              className="prompt-field__collapse-toggle"
              onClick={() => setPreviewOpen(o => !o)}
            >
              {previewOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Code size={12} />
              <span>View prompt</span>
            </button>
            {previewOpen && (
              <div className="prompt-preview">
                <div className="prompt-preview__section">
                  <span className="prompt-preview__label">Assembled prompt</span>
                  <pre className="prompt-preview__code">{assembledPrompt || '(empty)'}</pre>
                </div>
                {lastOptimizedPrompt && (
                  <div className="prompt-preview__section">
                    <span className="prompt-preview__label">Last optimized prompt (sent to model)</span>
                    <pre className="prompt-preview__code">{lastOptimizedPrompt}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {imageError && <div className="book-viewer__alert"><AlertCircle size={14} /> {imageError}</div>}
      {genError && <div className="book-viewer__alert"><AlertCircle size={14} /> {genError}</div>}
    </div>
  );
}
