import { useState } from 'react';
import {
  Sparkles,
  Download,
  Wand2,
  AlertCircle,
  Loader2,
  BookOpen,
} from 'lucide-react';

export const MODEL_ID = 'gemini-2.5-flash-image-preview';
const ENDPOINT = 'generateContent';

export default function ImageGenerator({
  apiKey,
  modelId = MODEL_ID,
  prompt = '',
  hasSelection,
  image,
  pageId,
  onImage,
  onClear,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = async () => {
    if (!hasSelection || !prompt) return;
    setLoading(true);
    setError(null);

    const attempt = async (retry = 0) => {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:${ENDPOINT}?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
            }),
          }
        );
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        const base64 = data.candidates?.[0]?.content?.parts?.find(
          p => p.inlineData
        )?.inlineData?.data;
        if (!base64) throw new Error('No image returned');
        const url = `data:image/png;base64,${base64}`;
        onImage?.(url);
      } catch (e) {
        if (retry < 3) return attempt(retry + 1);
        setError(`The magic failed. Please try again in a moment. ${e}`);
      }
    };

    await attempt();
    setLoading(false);
  };

  return (
    <>
      <div className="book-viewer__actions">
        <button
          className="btn ghost"
          disabled={loading || !image}
          onClick={() => {
            onClear?.();
          }}
        >
          Clear preview
        </button>
        <button
          className="btn primary"
          onClick={generate}
          disabled={loading || !hasSelection || !prompt}
        >
          {loading ? (
            <Loader2 className="spin" size={18} />
          ) : (
            <Wand2 size={18} />
          )}
          {loading ? 'Brewing…' : 'Generate page'}
        </button>
      </div>

      {error && (
        <div className="book-viewer__alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="book-viewer__canvas">
        {loading ? (
          <div className="book-viewer__loading">
            <Sparkles size={48} />
            <p>Mixing the ink…</p>
          </div>
        ) : image ? (
          <div className="book-viewer__preview">
            <img src={image} alt="Coloring Page" />
            <button
              className="btn pill"
              onClick={() => {
                const a = document.createElement('a');
                a.href = image;
                a.download = `Page_${pageId ?? 'image'}.png`;
                a.click();
              }}
            >
              <Download size={18} /> Download PNG
            </button>
          </div>
        ) : hasSelection ? (
          <div className="book-viewer__placeholder">
            <BookOpen size={56} />
            <p>Generate this scene to see the art.</p>
          </div>
        ) : (
          <div className="book-viewer__placeholder">
            <BookOpen size={56} />
            <p>Add pages to begin.</p>
          </div>
        )}
      </div>
    </>
  );
}
