import { Info } from 'lucide-react';

export const PROMPT_TIPS = {
  style: [
    'Describe recurring characters, art style, or line weight.',
    'e.g. "Cartoon cat with big eyes, thick outlines, simple shapes"',
    'This is prepended to every generation for consistency.',
  ],
  scene: [
    'Describe the illustration for this page.',
    'Be specific about composition: foreground, background, borders.',
    'A coloring-book style hint is automatically appended.',
  ],
  caption: [
    'Printed below the image in the PDF export.',
    'Not included in image generation — text is added during export only.',
    'e.g. "Color the dragon\'s scales any color you like!"',
  ],
  cover: [
    'Describe the cover illustration for the book.',
    'Mention where the title should go (e.g. "room for title at top").',
    'Say "no text" unless you want the AI to render lettering.',
  ],
};

export default function PromptTip({ tips }) {
  return (
    <span className="prompt-tip">
      <Info size={14} className="prompt-tip__icon" />
      <span className="prompt-tip__popup">
        {tips.map((t, i) => <span key={i} className="prompt-tip__line">{t}</span>)}
      </span>
    </span>
  );
}
