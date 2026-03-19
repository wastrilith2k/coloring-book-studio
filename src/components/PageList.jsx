import { CheckCircle2 } from 'lucide-react';

export default function PageList({ navPages, activePage, setActivePage, pageState, approvedUrlForPage }) {
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
          <button
            key={p.id}
            onClick={() => setActivePage(p)}
            className={`page-card ${activePage?.id === p.id ? 'is-active' : ''}`}
          >
            <p className="page-card__title">{p.title}</p>
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
        );
      })}
    </div>
  );
}
