import { useMemo, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';

export default function ImageCarousel({
  attempts,
  preview,
  saving,
  generating,
  prompt,
  carouselIdx,
  setCarouselIdx,
  onGenerate,
  onSelect,
  onDelete,
  onDownload,
  activePage,
  modelId,
  onModelChange,
  enabledModels = [],
}) {
  const displayAttempts = useMemo(() => [...attempts].reverse(), [attempts]);

  const slides = useMemo(() => {
    const s = displayAttempts.map(a => ({ type: 'attempt', attempt: a }));
    if (preview) s.push({ type: 'preview', url: preview });
    s.push({ type: 'generate' });
    return s;
  }, [displayAttempts, preview]);

  useEffect(() => {
    if (carouselIdx >= slides.length) {
      setCarouselIdx(Math.max(0, slides.length - 1));
    }
  }, [slides.length]);

  const currentSlide = slides[carouselIdx] || slides[0];
  const canPrev = carouselIdx > 0;
  const canNext = carouselIdx < slides.length - 1;

  return (
    <>
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
                    onClick={onGenerate}
                    disabled={generating || !prompt}
                  >
                    <Wand2 size={20} />
                    Generate page
                  </button>
                  {enabledModels.length > 1 && (
                    <select
                      className="carousel__model-select"
                      value={modelId}
                      onChange={e => onModelChange(e.target.value)}
                    >
                      {enabledModels.map(m => (
                        <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>
                      ))}
                    </select>
                  )}
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
              {saving && (
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
          onClick={() => setCarouselIdx(i => Math.min(slides.length - 1, i + 1))}
          disabled={!canNext}
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {currentSlide?.type === 'attempt' && (
        <div className="carousel__actions">
          <button
            className={`btn ${currentSlide.attempt.approved ? 'primary' : 'ghost'}`}
            onClick={() => onSelect(currentSlide.attempt.id, !currentSlide.attempt.approved)}
          >
            {currentSlide.attempt.approved ? 'Selected' : 'Select'}
          </button>
          <button
            className="btn ghost"
            onClick={() => onDownload(
              currentSlide.attempt.url,
              `${activePage?.title || 'image'}-attempt-${currentSlide.attempt.attempt_number}.png`
            )}
          >
            <Download size={14} /> Download
          </button>
          <button
            className="btn ghost"
            onClick={() => onDelete(currentSlide.attempt.id)}
            disabled={currentSlide.attempt.approved}
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}

      <div className="carousel__thumbs">
        {slides.map((slide, i) => (
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
    </>
  );
}
