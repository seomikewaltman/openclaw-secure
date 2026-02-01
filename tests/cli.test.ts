import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseArgs } from '../src/cli.js';
import { DEFAULT_CONFIG_PATH, DEFAULT_TIMEOUT_MS, DEFAULT_BACKEND } from '../src/constants.js';

// Mock process.exit to prevent test runner from exiting
vi.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as typeof process.exit);

describe('parseArgs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses a simple command', () => {
    const result = parseArgs(['node', 'cli.js', 'store']);
    expect(result.command).toBe('store');
    expect(result.configPath).toBe(DEFAULT_CONFIG_PATH);
    expect(result.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    expect(result.backend).toBe(DEFAULT_BACKEND);
    expect(result.vault).toBeUndefined();
  });

  it('parses --config option', () => {
    const result = parseArgs(['node', 'cli.js', 'start', '--config', '/tmp/config.json']);
    expect(result.command).toBe('start');
    expect(result.configPath).toBe('/tmp/config.json');
  });

  it('parses --timeout option', () => {
    const result = parseArgs(['node', 'cli.js', 'start', '--timeout', '5000']);
    expect(result.command).toBe('start');
    expect(result.timeoutMs).toBe(5000);
  });

  it('parses --backend option', () => {
    const result = parseArgs(['node', 'cli.js', 'store', '--backend', '1password']);
    expect(result.command).toBe('store');
    expect(result.backend).toBe('1password');
  });

  it('parses --vault option', () => {
    const result = parseArgs(['node', 'cli.js', 'store', '--backend', '1password', '--vault', 'Private']);
    expect(result.command).toBe('store');
    expect(result.backend).toBe('1password');
    expect(result.vault).toBe('Private');
  });

  it('parses all options together', () => {
    const result = parseArgs([
      'node', 'cli.js',
      '--config', '/my/config.json',
      '--backend', '1password',
      '--vault', 'Work',
      'check',
      '--timeout', '3000',
    ]);
    expect(result.command).toBe('check');
    expect(result.configPath).toBe('/my/config.json');
    expect(result.timeoutMs).toBe(3000);
    expect(result.backend).toBe('1password');
    expect(result.vault).toBe('Work');
  });

  it('defaults to empty command when none given', () => {
    const result = parseArgs(['node', 'cli.js']);
    expect(result.command).toBe('');
  });

  it('recognizes all valid commands', () => {
    for (const cmd of ['store', 'start', 'check', 'restore', 'list']) {
      const result = parseArgs(['node', 'cli.js', cmd]);
      expect(result.command).toBe(cmd);
    }
  });

  it('defaults backend to keychain', () => {
    const result = parseArgs(['node', 'cli.js', 'check']);
    expect(result.backend).toBe('keychain');
  });
});
