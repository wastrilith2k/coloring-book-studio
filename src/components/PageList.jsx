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
