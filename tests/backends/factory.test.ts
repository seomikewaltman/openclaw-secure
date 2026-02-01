import { describe, it, expect } from 'vitest';
import { createBackend, BACKEND_NAMES, KeychainBackend, OnePasswordBackend } from '../../src/backends/index.js';

describe('createBackend', () => {
  it('creates keychain backend', () => {
    const backend = createBackend('keychain');
    expect(backend).toBeInstanceOf(KeychainBackend);
    expect(backend.name).toBe('keychain');
  });

  it('creates 1password backend', () => {
    const backend = createBackend('1password');
    expect(backend).toBeInstanceOf(OnePasswordBackend);
    expect(backend.name).toBe('1password');
  });

  it('passes options to 1password backend', () => {
    const backend = createBackend('1password', { vault: 'MyVault' });
    expect(backend).toBeInstanceOf(OnePasswordBackend);
  });

  it('throws on unknown backend', () => {
    expect(() => createBackend('dropbox')).toThrow('Unknown backend "dropbox"');
    expect(() => createBackend('dropbox')).toThrow('keychain, 1password');
  });
});

describe('BACKEND_NAMES', () => {
  it('contains keychain and 1password', () => {
    expect(BACKEND_NAMES).toContain('keychain');
    expect(BACKEND_NAMES).toContain('1password');
  });
});
