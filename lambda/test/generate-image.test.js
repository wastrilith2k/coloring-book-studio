import { describe, it, expect } from 'vitest';
import { ALL_MODELS } from '../api/routes/generate-image.js';

describe('ALL_MODELS', () => {
  it('has unique IDs', () => {
    const ids = ALL_MODELS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every model has required fields', () => {
    for (const model of ALL_MODELS) {
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('label');
      expect(model).toHaveProperty('provider');
      expect(model).toHaveProperty('costCents');
      expect(typeof model.costCents).toBe('number');
      expect(['openai', 'gemini']).toContain(model.provider);
    }
  });

  it('includes at least one model per provider', () => {
    const providers = new Set(ALL_MODELS.map(m => m.provider));
    expect(providers.has('openai')).toBe(true);
    expect(providers.has('gemini')).toBe(true);
  });
});
