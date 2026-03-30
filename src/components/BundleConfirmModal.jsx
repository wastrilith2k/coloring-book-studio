import { useState } from 'react';
import { Download, FileText, Image, BookOpen } from 'lucide-react';

export default function BundleConfirmModal({ loading, loadingLabel, onConfirm, onCancel }) {
  const [bleedPages, setBleedPages] = useState(true);

  return (
    <div className="bundle-confirm-overlay">
      <div className="bundle-confirm-card">
        <h3>Download</h3>

        <label className="bundle-toggle">
          <input
            type="checkbox"
            checked={bleedPages}
            onChange={e => setBleedPages(e.target.checked)}
          />
          <span className="bundle-toggle__text">
            <strong>Add bleed-through protection</strong>
            <span>Inserts solid black pages between coloring pages to prevent marker bleed-through</span>
          </span>
        </label>

        <div className="bundle-confirm-options">
          <p className="bundle-section-label">For print (KDP)</p>
          <button
            className="bundle-option"
            onClick={() => onConfirm('kdp', { bleedPages })}
            disabled={loading}
          >
            <BookOpen size={20} />
            <div>
              <strong>KDP Interior PDF</strong>
              <span>8.5x11", 300 DPI, no cover — upload directly to KDP</span>
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

          <p className="bundle-section-label">For digital</p>
          <button
            className="bundle-option"
            onClick={() => onConfirm('full-pdf', { bleedPages })}
            disabled={loading}
          >
            <Download size={20} />
            <div>
              <strong>Complete Book PDF</strong>
              <span>Cover + all pages in a single PDF — for digital sales or sharing</span>
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
