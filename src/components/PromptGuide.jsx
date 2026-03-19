import { useState } from 'react';
import { Info, ChevronDown } from 'lucide-react';

const PROMPT_GUIDE = [
  {
    title: 'Character / Style prompt',
    items: [
      'This prompt is shared across ALL pages. Use it for anything you want consistent on every page.',
      'Put recurring elements here: character descriptions, art style, line weight, borders, or decorative frames.',
      'Example: "A friendly cartoon owl with big round eyes. Thick black outlines. Decorative vine border around the edge of each page."',
      'Changes here affect future generations for every page in the book.',
    ],
  },
  {
    title: 'Scene prompt',
    items: [
      'This prompt is unique to each page. Describe what happens in this specific scene.',
      'Be specific about composition: what\'s in the foreground vs. background, left vs. right.',
      'Say "no text" or "do not include any words or letters" to prevent the AI from rendering text.',
      'If you DO want text, spell it out exactly: \'The text should read "Hello World"\'.',
      'A coloring-book style hint (black & white outlines, no shading) is automatically appended.',
    ],
  },
  {
    title: 'Print caption',
    items: [
      'This text appears below the image in the printed book only.',
      'It is NOT sent to the image generator \u2014 the AI never sees it.',
      'Great for instructions like "Color the dragon\'s scales!" or educational content.',
    ],
  },
  {
    title: 'General tips',
    items: [
      'Simpler prompts often produce cleaner coloring pages. Avoid over-describing.',
      'If results have unwanted shading or color, add "absolutely no shading, no gray areas" to the scene prompt.',
      'Generate multiple attempts and use "Select" to pick the best one for each page.',
      'You can download any individual image before finalizing the book.',
    ],
  },
];

export default function PromptGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className={`prompt-guide ${open ? 'is-open' : ''}`}>
      <button className="prompt-guide__toggle" onClick={() => setOpen(o => !o)}>
        <Info size={14} />
        <span>Prompt writing guide</span>
        <ChevronDown size={14} className={`prompt-guide__chevron ${open ? 'is-open' : ''}`} />
      </button>
      {open && (
        <div className="prompt-guide__body">
          {PROMPT_GUIDE.map((section, i) => (
            <div key={i} className="prompt-guide__section">
              <h4 className="prompt-guide__heading">{section.title}</h4>
              <ul className="prompt-guide__list">
                {section.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
