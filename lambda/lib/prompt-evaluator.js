import { chatCompletion } from './openrouter.js';

const PAGE_SYSTEM_PROMPT = `You are an expert prompt engineer for AI image generation, specializing in children's coloring book illustrations.

You receive a structured prompt and must return an OPTIMIZED version.

CRITICAL — CHARACTER CONSISTENCY:
The CHARACTER STYLE GUIDE below is LOCKED. Never alter, reinterpret, or omit any physical description from it. Copy it verbatim into the optimized prompt first, before any scene description. This is the single most important rule.

RULES:
- Begin EVERY optimized prompt with the full character style guide, unchanged
- Then describe the scene, action, composition
- Preserve ALL style constraints (black & white, no shading, thick outlines, no text, etc.)
- The scene description must describe the VISUAL SCENE for an image generation model — what to draw, not what someone would color. Write it as art direction: subjects, poses, composition, spatial relationships, expressions, environmental details.
- DO NOT write coloring activity instructions like "Color the dragon" or "Fill in the patterns" — those are for captions, not illustration prompts.
- Respect the audience age range in the style section. For adults/teens, use sophisticated, intricate, detailed compositions. For toddlers, use extremely simple shapes. Match the visual complexity to the stated age group.
- Make the scene description more specific and visual — name concrete objects, poses, expressions
- Add composition guidance (foreground/background placement, scale, centering)
- Specify what the main subject is DOING, not just what it IS
- Remove vague or redundant instructions
- Keep the total prompt under 600 words
- Return ONLY the optimized prompt — no commentary, no explanation, no preamble`;

const COVER_SYSTEM_PROMPT = `You are an expert prompt engineer for AI image generation, specializing in book cover art.

You receive a prompt for a coloring book COVER and must return an OPTIMIZED version that will produce an eye-catching, professional cover.

RULES:
- Covers should be FULL COLOR, vibrant, and visually rich — NOT black and white
- Include specific art direction: lighting, color palette, mood, atmosphere
- Add composition guidance: where the main subject sits, where title text should go
- Make the scene dynamic and appealing — this is a product that needs to sell
- Include ornate borders, decorative frames, or thematic elements when appropriate
- Specify the art style (e.g. detailed fantasy illustration, cartoon, whimsical)
- Keep the total prompt under 600 words
- Return ONLY the optimized prompt text — no commentary, no explanation, no preamble`;

const REFINEMENT_ADDENDUM = `
The user has seen a previous generation and wants changes. Incorporate their feedback while preserving the core subject and intent. Prioritize the user's feedback — they know what they want.`;

/**
 * Optimize a prompt for image generation using a cheap LLM.
 * Detects whether the prompt is for a cover or an interior page and adapts accordingly.
 *
 * @param {string} rawPrompt - The assembled prompt
 * @param {object} [options]
 * @param {string} [options.refinementFeedback] - User's feedback on a previous attempt
 * @param {boolean} [options.isCover] - Whether this is a cover prompt
 * @returns {Promise<{optimizedPrompt: string}>}
 */
export const evaluatePrompt = async (rawPrompt, { refinementFeedback, isCover, characterStyle, bookTitle, pageNumber, totalPages } = {}) => {
  const basePrompt = isCover ? COVER_SYSTEM_PROMPT : PAGE_SYSTEM_PROMPT;
  const systemContent = refinementFeedback
    ? basePrompt + REFINEMENT_ADDENDUM
    : basePrompt;

  const contextBlock = characterStyle ? `\nCHARACTER STYLE GUIDE (IMMUTABLE):\n${characterStyle}\n\nBook: "${bookTitle || 'Untitled'}" — Page ${pageNumber || '?'} of ${totalPages || '?'}\n` : '';

  const messages = [
    { role: 'system', content: systemContent },
  ];

  if (refinementFeedback) {
    messages.push({
      role: 'user',
      content: `Previous prompt:\n${rawPrompt}\n\nUser feedback: ${refinementFeedback}\n\n${contextBlock}Return the improved prompt.`,
    });
  } else {
    messages.push({
      role: 'user',
      content: `${contextBlock}Optimize this coloring book page prompt:\n\n${rawPrompt}`,
    });
  }

  const optimizedPrompt = await chatCompletion(messages, {
    temperature: 0.3,
    maxTokens: 1500,
  });

  return { optimizedPrompt: optimizedPrompt.trim() };
};
