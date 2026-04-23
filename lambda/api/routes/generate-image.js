import { json } from '../../lib/cors.js';
import { logGeneration, getAdminSetting, getPage, updatePage } from '../../lib/db.js';
import { evaluatePrompt } from '../../lib/prompt-evaluator.js';
import { ALL_MODELS, PROVIDER_MAP, generators, generateWithOpenAI } from '../../../shared/image-providers.js';

export { ALL_MODELS };

export const handleGenerateImage = async (ctx) => {
  const { body, origin, userId, userEmail } = ctx;
  const { prompt, modelId, refinementFeedback, isCover, previewOnly, skipEvaluator, characterStyle, bookTitle, pageNumber, totalPages, pageId } = body;

  if (!prompt || typeof prompt !== 'string') {
    return json(400, { error: 'prompt is required' }, origin);
  }
  if (prompt.length > 5000) {
    return json(400, { error: 'prompt too long (max 5000 chars)' }, origin);
  }

  const enabledModels = (await getAdminSetting('enabled_models')) || ALL_MODELS.map(m => m.id);
  const resolvedModelId = enabledModels.includes(modelId) ? modelId : enabledModels[0];
  if (!resolvedModelId) {
    return json(400, { error: 'No image models are currently enabled' }, origin);
  }

  const provider = PROVIDER_MAP[resolvedModelId] || 'openai';
  const modelInfo = ALL_MODELS.find(m => m.id === resolvedModelId);

  let finalPrompt = prompt;
  let optimizedPrompt = null;
  let cached = false;
  if (!skipEvaluator) {
    const evaluatorEnabled = (await getAdminSetting('prompt_evaluator_enabled')) !== false;
    const shouldEvaluate = evaluatorEnabled || refinementFeedback;

    if (shouldEvaluate && pageId && !refinementFeedback && !isCover) {
      try {
        const pageRow = await getPage(pageId);
        if (pageRow?.optimized_prompt) {
          finalPrompt = pageRow.optimized_prompt;
          optimizedPrompt = pageRow.optimized_prompt;
          cached = true;
          console.log(`[generate-image] Using cached optimized_prompt for page ${pageId}`);
        }
      } catch (e) {
        console.error('Failed to check cached prompt:', e.message);
      }
    }

    if (shouldEvaluate && !cached) {
      try {
        const evalResult = await evaluatePrompt(prompt, { refinementFeedback, isCover: !!isCover, characterStyle, bookTitle, pageNumber, totalPages });
        finalPrompt = evalResult.optimizedPrompt || prompt;
        optimizedPrompt = finalPrompt;
        try {
          await logGeneration(userId, 'prompt-evaluator', 0.01, userEmail);
        } catch (e) {
          console.error('Failed to log evaluator cost:', e.message);
        }
        if (pageId && !isCover && optimizedPrompt) {
          try {
            await updatePage(pageId, { optimizedPrompt });
            console.log(`[generate-image] Cached optimized_prompt for page ${pageId}`);
          } catch (e) {
            console.error('Failed to cache optimized prompt:', e.message);
          }
        }
      } catch (e) {
        console.error('Prompt evaluator failed, using original prompt:', e.message);
      }
    }
  }

  if (previewOnly) {
    return json(200, { optimizedPrompt: optimizedPrompt || prompt, cached }, origin);
  }

  console.log(`[generate-image] provider=${provider}, model=${resolvedModelId}, prompt length=${finalPrompt.length}`);

  try {
    const generate = generators[provider] || generateWithOpenAI;
    const result = await generate(finalPrompt, resolvedModelId);

    if (result.error) {
      return json(502, { error: result.error }, origin);
    }

    try {
      await logGeneration(userId, resolvedModelId, modelInfo?.costCents || 0, userEmail);
    } catch (e) {
      console.error('Failed to log generation cost:', e.message);
    }

    return json(200, { dataUrl: result.dataUrl, optimizedPrompt }, origin);
  } catch (err) {
    console.error('Image generation error:', err);
    return json(500, { error: 'Image generation failed unexpectedly' }, origin);
  }
};
