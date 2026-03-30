import { describe, it, expect } from 'vitest';
import { printKey } from '../lib/image.js';

describe('printKey', () => {
  it('inserts -print before .png extension', () => {
    expect(printKey('users/u1/books/1/pages/2/attempt-3.png'))
      .toBe('users/u1/books/1/pages/2/attempt-3-print.png');
  });

  it('handles cover keys', () => {
    expect(printKey('users/u1/books/1/cover/attempt-1.png'))
      .toBe('users/u1/books/1/cover/attempt-1-print.png');
  });

  it('only replaces the last .png', () => {
    expect(printKey('path/file.png.png'))
      .toBe('path/file.png-print.png');
  });
});
