import { FileText, Image, BookOpen } from 'lucide-react';

export default function BundleConfirmModal({ loading, loadingLabel, onConfirm, onCancel }) {
  return (
    <div className="bundle-confirm-overlay">
      <div className="bundle-confirm-card">
        <h3>Download for KDP</h3>
        <p>
          Choose a download format for your coloring book. KDP requires the interior and cover as separate files.
        </p>

        <div className="bundle-confirm-options">
          <button
            className="bundle-option"
            onClick={() => onConfirm('kdp')}
            disabled={loading}
          >
            <BookOpen size={20} />
            <div>
              <strong>KDP Interior PDF</strong>
              <span>8.5×11", 300 DPI, no cover — upload directly to KDP</span>
            </div>
          </button>

          <button
            className="bundle-option"
            onClick={() => onConfirm('cover')}
            disabled={loading}
          >
            <FileText size={20} />
            <div>
              <strong>KDP Cover PDF</strong>
              <span>Front cover as a separate PDF for KDP cover upload</span>
            </div>
          </button>

          <button
            className="bundle-option"
            onClick={() => onConfirm('zip')}
            disabled={loading}
          >
            <Image size={20} />
            <div>
              <strong>Images ZIP</strong>
              <span>All images as individual PNGs (300 DPI)</span>
            </div>
          </button>
        </div>

        {loading && <p className="bundle-confirm-status">{loadingLabel || 'Preparing...'}</p>}
        <div className="bundle-confirm-actions">
          <button className="btn ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
