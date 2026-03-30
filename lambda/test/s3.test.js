import { describe, it, expect } from 'vitest';
import { buildImageKey, buildCoverKey } from '../lib/s3.js';

describe('buildImageKey', () => {
  it('builds the correct S3 key path', () => {
    expect(buildImageKey('user-1', 10, 20, 3))
      .toBe('users/user-1/books/10/pages/20/attempt-3.png');
  });

  it('handles string arguments', () => {
    expect(buildImageKey('abc', '5', '12', '1'))
      .toBe('users/abc/books/5/pages/12/attempt-1.png');
  });
});

describe('buildCoverKey', () => {
  it('builds the correct S3 key path for covers', () => {
    expect(buildCoverKey('user-1', 10, 2))
      .toBe('users/user-1/books/10/cover/attempt-2.png');
  });
});
