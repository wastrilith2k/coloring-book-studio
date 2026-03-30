import { describe, it, expect } from 'vitest';
import { getUserId, getUserEmail, getUserIdFromWs } from '../lib/auth.js';

describe('getUserId', () => {
  it('extracts sub from HTTP API JWT authorizer claims', () => {
    const event = {
      requestContext: {
        authorizer: { jwt: { claims: { sub: 'user-123' } } },
      },
    };
    expect(getUserId(event)).toBe('user-123');
  });

  it('extracts sub from Lambda authorizer context', () => {
    const event = {
      requestContext: { authorizer: { sub: 'ws-user-456' } },
    };
    expect(getUserId(event)).toBe('ws-user-456');
  });

  it('prefers JWT claims over Lambda authorizer', () => {
    const event = {
      requestContext: {
        authorizer: {
          jwt: { claims: { sub: 'jwt-user' } },
          sub: 'lambda-user',
        },
      },
    };
    expect(getUserId(event)).toBe('jwt-user');
  });

  it('throws when no identity is found', () => {
    expect(() => getUserId({ requestContext: {} })).toThrow('Unauthorized');
    expect(() => getUserId({ requestContext: { authorizer: {} } })).toThrow('Unauthorized');
    expect(() => getUserId({})).toThrow('Unauthorized');
  });
});

describe('getUserEmail', () => {
  it('extracts email from JWT claims', () => {
    const event = {
      requestContext: {
        authorizer: { jwt: { claims: { email: 'test@example.com' } } },
      },
    };
    expect(getUserEmail(event)).toBe('test@example.com');
  });

  it('falls back to cognito:username', () => {
    const event = {
      requestContext: {
        authorizer: { jwt: { claims: { 'cognito:username': 'jdoe' } } },
      },
    };
    expect(getUserEmail(event)).toBe('jdoe');
  });

  it('returns empty string when no email or username', () => {
    expect(getUserEmail({ requestContext: { authorizer: { jwt: { claims: {} } } } })).toBe('');
    expect(getUserEmail({ requestContext: {} })).toBe('');
  });
});

describe('getUserIdFromWs', () => {
  it('extracts sub from WebSocket authorizer context', () => {
    const event = {
      requestContext: { authorizer: { sub: 'ws-user-789' } },
    };
    expect(getUserIdFromWs(event)).toBe('ws-user-789');
  });

  it('throws when no sub in authorizer', () => {
    expect(() => getUserIdFromWs({ requestContext: { authorizer: {} } })).toThrow('Unauthorized');
  });
});
