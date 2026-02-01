import { describe, it, expect } from 'vitest';
import { getByPath, setByPath, hasPath } from '../src/paths.js';

describe('getByPath', () => {
  it('gets a top-level value', () => {
    expect(getByPath({ foo: 'bar' }, 'foo')).toBe('bar');
  });

  it('gets a nested value', () => {
    const obj = { a: { b: { c: 42 } } };
    expect(getByPath(obj, 'a.b.c')).toBe(42);
  });

  it('returns undefined for missing path', () => {
    expect(getByPath({ a: 1 }, 'b')).toBeUndefined();
  });

  it('returns undefined for partial missing path', () => {
    expect(getByPath({ a: { b: 1 } }, 'a.c.d')).toBeUndefined();
  });

  it('returns undefined when traversing through a non-object', () => {
    expect(getByPath({ a: 'string' }, 'a.b')).toBeUndefined();
  });

  it('returns undefined when traversing through null', () => {
    expect(getByPath({ a: null } as Record<string, unknown>, 'a.b')).toBeUndefined();
  });

  it('handles the actual clawdbot config paths', () => {
    const config = {
      channels: { telegram: { botToken: 'tok123' } },
      gateway: { auth: { token: 'gw-tok' } },
      skills: { entries: { 'openai-whisper-api': { apiKey: 'sk-123' } } },
    };
    expect(getByPath(config, 'channels.telegram.botToken')).toBe('tok123');
    expect(getByPath(config, 'gateway.auth.token')).toBe('gw-tok');
    expect(getByPath(config, 'skills.entries.openai-whisper-api.apiKey')).toBe('sk-123');
  });
});

describe('setByPath', () => {
  it('sets a top-level value', () => {
    const result = setByPath({ foo: 'old' }, 'foo', 'new');
    expect(result.foo).toBe('new');
  });

  it('sets a nested value', () => {
    const obj = { a: { b: { c: 1 } } };
    const result = setByPath(obj, 'a.b.c', 99);
    expect((result.a as Record<string, unknown>).b).toEqual({ c: 99 });
  });

  it('creates intermediate objects', () => {
    const result = setByPath({}, 'a.b.c', 'hello');
    expect(getByPath(result, 'a.b.c')).toBe('hello');
  });

  it('does not mutate the original', () => {
    const original = { a: { b: 1 } };
    const result = setByPath(original, 'a.b', 2);
    expect((original.a as Record<string, unknown>).b).toBe(1);
    expect(getByPath(result, 'a.b')).toBe(2);
  });

  it('overwrites non-object intermediate values', () => {
    const result = setByPath({ a: 'string' }, 'a.b', 'value');
    expect(getByPath(result, 'a.b')).toBe('value');
  });
});

describe('hasPath', () => {
  it('returns true for existing path', () => {
    expect(hasPath({ a: { b: 1 } }, 'a.b')).toBe(true);
  });

  it('returns false for missing path', () => {
    expect(hasPath({ a: 1 }, 'b')).toBe(false);
  });

  it('returns true for falsy values (0, empty string)', () => {
    expect(hasPath({ a: 0 }, 'a')).toBe(true);
    expect(hasPath({ a: '' }, 'a')).toBe(true);
    expect(hasPath({ a: false }, 'a')).toBe(true);
  });
});
