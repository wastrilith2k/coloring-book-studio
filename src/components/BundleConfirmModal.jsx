import { AlertCircle } from 'lucide-react';

export default function BundleConfirmModal({ loading, onConfirm, onCancel }) {
  return (
    <div className="bundle-confirm-overlay">
      <div className="bundle-confirm-card">
        <h3>Download Print Bundle</h3>
        <p>
          This will download all selected images as a ZIP file.
        </p>
        <p className="bundle-confirm-warn">
          <AlertCircle size={16} />
          All non-selected images will be deleted after download. If you want to keep any, download them individually first.
        </p>
        <div className="bundle-confirm-actions">
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Preparing...' : 'Download & Finalize'}
          </button>
        </div>
      </div>
    </div>
  );
}
