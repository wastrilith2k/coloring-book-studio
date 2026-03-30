import { chatCompletion } from './openrouter.js';

const SYSTEM_PROMPT = `You are an expert prompt engineer for AI image generation, specializing in children's coloring book illustrations.

You receive a structured prompt and must return an OPTIMIZED version that will produce a better coloring book page.

RULES:
- Preserve ALL style constraints (black & white, no shading, thick outlines, no text, etc.)
- Make the scene description more specific and visual — name concrete objects, poses, expressions
- Add composition guidance (foreground/background placement, scale, centering)
- Specify what the main subject is DOING, not just what it IS
- Remove vague or redundant instructions
- Keep the total prompt under 600 words
- Preserve the XML tag structure
- Return ONLY the optimized prompt text — no commentary, no explanation, no preamble`;

const REFINEMENT_ADDENDUM = `
The user has seen a previous generation and wants changes. Incorporate their feedback while preserving all style constraints and the core subject. Prioritize the user's feedback — they know what they want.`;

/**
 * Optimize a prompt for coloring book image generation using a cheap LLM.
 * Optionally incorporates user refinement feedback from a previous attempt.
 *
 * @param {string} rawPrompt - The assembled XML-structured prompt
 * @param {object} [options]
 * @param {string} [options.refinementFeedback] - User's feedback on a previous attempt
 * @returns {Promise<{optimizedPrompt: string}>}
 */
export const evaluatePrompt = async (rawPrompt, { refinementFeedback } = {}) => {
  const systemContent = refinementFeedback
    ? SYSTEM_PROMPT + REFINEMENT_ADDENDUM
    : SYSTEM_PROMPT;

  const messages = [
    { role: 'system', content: systemContent },
  ];

  if (refinementFeedback) {
    messages.push({
      role: 'user',
      content: `Previous prompt:\n${rawPrompt}\n\nUser feedback: ${refinementFeedback}\n\nReturn the improved prompt.`,
    });
  } else {
    messages.push({
      role: 'user',
      content: `Optimize this coloring book image prompt:\n\n${rawPrompt}`,
    });
  }

  const optimizedPrompt = await chatCompletion(messages, {
    temperature: 0.3,
    maxTokens: 1500,
  });

  return { optimizedPrompt: optimizedPrompt.trim() };
};
