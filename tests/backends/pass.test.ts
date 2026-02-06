import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process before importing
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import { PassBackend } from '../../src/backends/pass.js';

const mockedExecFile = vi.mocked(execFile);

function mockPassCall(stdout: string, error: Error | null = null) {
  mockedExecFile.mockImplementation(
    ((_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
      const cb = callback as (err: Error | null, stdout: string, stderr: string) => void;
      if (error) {
        cb(error, '', error.message);
      } else {
        cb(null, stdout, '');
      }
    }) as typeof execFile,
  );
}

describe('PassBackend', () => {
  let backend: PassBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new PassBackend();
  });

  describe('name', () => {
    it('is "pass"', () => {
      expect(backend.name).toBe('pass');
    });
  });

  describe('available()', () => {
    it('returns true when pass CLI is available', async () => {
      mockPassCall('pass 1.7.4');
      expect(await backend.available()).toBe(true);
    });

    it('returns false when pass CLI is not available', async () => {
      mockPassCall('', new Error('command not found'));
      expect(await backend.available()).toBe(false);
    });
  });

  describe('get()', () => {
    it('returns password on success', async () => {
      mockPassCall('my-secret-api-key\n');
      const result = await backend.get('tools-web-search-apiKey');
      expect(result).toBe('my-secret-api-key');
    });

    it('returns null when key not found', async () => {
      mockPassCall('', new Error('is not in the password store'));
      const result = await backend.get('missing-key');
      expect(result).toBeNull();
    });

    it('returns null for "not in the password store" error', async () => {
      mockPassCall('', new Error('Error: openclaw/missing-key is not in the password store'));
      const result = await backend.get('missing-key');
      expect(result).toBeNull();
    });

    it('throws on unexpected errors', async () => {
      mockPassCall('', new Error('gpg: decryption failed'));
      await expect(backend.get('test-key')).rejects.toThrow('pass get failed');
    });

    it('uses prefixed path openclaw/{key}', async () => {
      mockPassCall('value');
      await backend.get('tools-web-search-apiKey');
      expect(mockedExecFile).toHaveBeenCalledWith(
        'pass',
        ['show', 'openclaw/tools-web-search-apiKey'],
        expect.anything(),
        expect.anything(),
      );
    });

    it('retrieves Brave Search API key correctly', async () => {
      mockPassCall('BSA1234567890abcdef\n');
      const result = await backend.get('tools-web-search-apiKey');
      expect(result).toBe('BSA1234567890abcdef');
    });
  });

  describe('set()', () => {
    it('inserts key with --force --multiline flags', async () => {
      mockPassCall('');
      await backend.set('tools-web-search-apiKey', 'BSA1234567890');
      expect(mockedExecFile).toHaveBeenCalledWith(
        'pass',
        ['insert', '--force', '--multiline', 'openclaw/tools-web-search-apiKey'],
        expect.anything(),
        expect.anything(),
      );
    });

    it('throws on failure', async () => {
      mockPassCall('', new Error('gpg: encryption failed'));
      await expect(backend.set('test-key', 'value')).rejects.toThrow('pass set failed');
    });
  });

  describe('delete()', () => {
    it('returns without error on success', async () => {
      mockPassCall('');
      await expect(backend.delete('test-key')).resolves.toBeUndefined();
    });

    it('silently ignores not-found', async () => {
      mockPassCall('', new Error('is not in the password store'));
      await expect(backend.delete('missing-key')).resolves.toBeUndefined();
    });

    it('uses --force flag', async () => {
      mockPassCall('');
      await backend.delete('tools-web-search-apiKey');
      expect(mockedExecFile).toHaveBeenCalledWith(
        'pass',
        ['rm', '--force', 'openclaw/tools-web-search-apiKey'],
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('list()', () => {
    it('returns list of keys', async () => {
      mockPassCall(`openclaw
├── gateway-auth-token
├── telegram-bot-token
└── tools-web-search-apiKey
`);
      const result = await backend.list();
      expect(result).toContain('gateway-auth-token');
      expect(result).toContain('telegram-bot-token');
      expect(result).toContain('tools-web-search-apiKey');
    });

    it('returns empty array when no keys exist', async () => {
      mockPassCall('', new Error('is not in the password store'));
      const result = await backend.list();
      expect(result).toEqual([]);
    });
  });
});
