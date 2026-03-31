import { useState } from 'react';
import { ArrowUp, ArrowDown, CheckCircle2, Plus, Sparkles, Trash2 } from 'lucide-react';

export default function PageList({ navPages, activePage, setActivePage, pageState, approvedUrlForPage, pageTitles, onAddPage, onAddAiPages, onDeletePage, onMovePage }) {
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Separate cover from story pages for reordering
  const storyPages = navPages.filter(p => !p.isCover);

  return (
    <div className="book-viewer__list">
      {!navPages.length && (
        <div className="book-viewer__empty">
          Add storyPages to start generating.
        </div>
      )}
      {navPages.map((p, idx) => {
        const thumbUrl = approvedUrlForPage(p);
        const isApproved = pageState[p.id]?.attempts?.some(a => a.approved) || !!p.image_url;
        const storyIdx = storyPages.indexOf(p);
        const canMoveUp = !p.isCover && storyIdx > 0;
        const canMoveDown = !p.isCover && storyIdx < storyPages.length - 1;
        return (
          <div key={p.id} className="page-card-wrap">
            <button
              onClick={() => setActivePage(p)}
              className={`page-card ${activePage?.id === p.id ? 'is-active' : ''}`}
            >
              <p className="page-card__title">{pageTitles?.[p.id] ?? p.title}</p>
              <p className="page-card__meta">{p.isCover ? 'Cover' : `Scene #${storyIdx + 1}`}</p>
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
            {!p.isCover && (
              <div className="page-card__actions">
                {onMovePage && (
                  <div className="page-card__move">
                    <button
                      className="btn-tiny"
                      onClick={() => onMovePage(p.id, 'up')}
                      disabled={!canMoveUp}
                      title="Move up"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      className="btn-tiny"
                      onClick={() => onMovePage(p.id, 'down')}
                      disabled={!canMoveDown}
                      title="Move down"
                    >
                      <ArrowDown size={12} />
                    </button>
                  </div>
                )}
                {onDeletePage && (
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
            )}
          </div>
        );
      })}
      <div className="page-card__add-group">
        {onAddPage && (
          <button className="page-card page-card--add" onClick={onAddPage}>
            <Plus size={18} />
            <span>Blank Page</span>
          </button>
        )}
        {onAddAiPages && (
          <button className="page-card page-card--add page-card--ai" onClick={onAddAiPages}>
            <Sparkles size={18} />
            <span>AI Pages</span>
          </button>
        )}
      </div>
    </div>
  );
}
