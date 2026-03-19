import { AlertCircle, StickyNote } from 'lucide-react';
import PromptTip, { PROMPT_TIPS } from './PromptTip.jsx';
import PromptGuide from './PromptGuide.jsx';

export default function PromptPanel({
  activePage,
  isCover,
  bookTitle,
  // Cover
  coverPrompt,
  onCoverPromptChange,
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
}) {
  return (
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
              onChange={onCoverPromptChange}
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
              onChange={onStyleChange}
              onBlur={onStyleBlur}
              placeholder="Describe the character or style."
              rows={3}
            />
            {styleSaving && <span className="pill subtle">Saving...</span>}
            {styleError && <div className="book-viewer__alert">{styleError}</div>}
          </div>
          <div className="prompt-field">
            <label htmlFor="scene-text">Scene prompt <PromptTip tips={PROMPT_TIPS.scene} /></label>
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
          </div>
          <div className="prompt-field">
            <label htmlFor="caption-text">Print caption <PromptTip tips={PROMPT_TIPS.caption} /></label>
            <textarea
              id="caption-text"
              value={currentCaption}
              onChange={onCaptionChange}
              onBlur={onCaptionBlur}
              placeholder="Caption printed below the image (not used for generation)."
              rows={2}
            />
            {captionSaving && <span className="pill subtle">Saving...</span>}
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
        </div>
      )}

      {imageError && <div className="book-viewer__alert"><AlertCircle size={14} /> {imageError}</div>}
      {genError && <div className="book-viewer__alert"><AlertCircle size={14} /> {genError}</div>}
    </div>
  );
}
