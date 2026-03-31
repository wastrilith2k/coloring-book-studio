import { useRef, useState } from 'react';
import { CheckCircle2, GripVertical, Plus, Sparkles, Trash2 } from 'lucide-react';

export default function PageList({ navPages, activePage, setActivePage, pageState, approvedUrlForPage, pageTitles, onAddPage, onAddAiPages, onDeletePage, onReorder }) {
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const dragNode = useRef(null);

  const storyPages = navPages.filter(p => !p.isCover);

  const handleDragStart = (e, pageId) => {
    setDragId(pageId);
    dragNode.current = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    // Make the drag image slightly transparent
    requestAnimationFrame(() => {
      if (dragNode.current) dragNode.current.style.opacity = '0.4';
    });
  };

  const handleDragEnd = () => {
    if (dragNode.current) dragNode.current.style.opacity = '1';
    if (dragId && dragOverId && dragId !== dragOverId) {
      const fromIdx = storyPages.findIndex(p => p.id === dragId);
      const toIdx = storyPages.findIndex(p => p.id === dragOverId);
      if (fromIdx >= 0 && toIdx >= 0 && onReorder) {
        onReorder(dragId, toIdx);
      }
    }
    setDragId(null);
    setDragOverId(null);
    dragNode.current = null;
  };

  const handleDragOver = (e, pageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (pageId !== dragOverId) setDragOverId(pageId);
  };

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
        const storyIdx = storyPages.indexOf(p);
        const isDragging = dragId === p.id;
        const isDragOver = dragOverId === p.id && dragId !== p.id;
        return (
          <div
            key={p.id}
            className={`page-card-wrap ${isDragOver ? 'is-drag-over' : ''} ${isDragging ? 'is-dragging' : ''}`}
            draggable={!p.isCover && !!onReorder}
            onDragStart={e => !p.isCover && handleDragStart(e, p.id)}
            onDragEnd={handleDragEnd}
            onDragOver={e => !p.isCover && handleDragOver(e, p.id)}
            onDragLeave={() => setDragOverId(null)}
            onDrop={e => { e.preventDefault(); handleDragEnd(); }}
          >
            {!p.isCover && onReorder && (
              <span className="page-card__grip">
                <GripVertical size={14} />
              </span>
            )}
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
            {!p.isCover && onDeletePage && (
              <div className="page-card__actions">
                {confirmDelete === p.id ? (
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
