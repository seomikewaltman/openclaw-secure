import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import { OnePasswordBackend } from '../../src/backends/onepassword.js';

const mockedExecFile = vi.mocked(execFile);

function mockOpCall(stdout: string, error: Error | null = null) {
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

describe('OnePasswordBackend', () => {
  let backend: OnePasswordBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new OnePasswordBackend();
  });

  describe('available()', () => {
    it('returns true when op --version succeeds', async () => {
      mockOpCall('2.24.0');
      expect(await backend.available()).toBe(true);
    });

    it('returns false when op is not installed', async () => {
      mockOpCall('', new Error('command not found'));
      expect(await backend.available()).toBe(false);
    });
  });

  describe('get()', () => {
    it('returns password on success', async () => {
      mockOpCall(JSON.stringify({ value: 'secret-token-123' }));
      const result = await backend.get('telegram-bot-token');
      expect(result).toBe('secret-token-123');
    });

    it('returns null when item not found', async () => {
      mockOpCall('', new Error("isn't an item"));
      const result = await backend.get('missing-key');
      expect(result).toBeNull();
    });

    it('returns null for "not found" error', async () => {
      mockOpCall('', new Error('not found'));
      const result = await backend.get('missing-key');
      expect(result).toBeNull();
    });

    it('throws on unexpected errors', async () => {
      mockOpCall('', new Error('session expired'));
      await expect(backend.get('test-key')).rejects.toThrow('1Password get failed');
    });

    it('uses prefixed item title openclaw-{key}', async () => {
      mockOpCall(JSON.stringify({ value: 'v' }));
      await backend.get('my-key');
      expect(mockedExecFile).toHaveBeenCalledWith(
        'op',
        expect.arrayContaining(['openclaw-my-key']),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('get() with vault option', () => {
    it('passes --vault flag', async () => {
      const vaultBackend = new OnePasswordBackend({ vault: 'Private' });
      mockOpCall(JSON.stringify({ value: 'val' }));
      await vaultBackend.get('key');
      expect(mockedExecFile).toHaveBeenCalledWith(
        'op',
        expect.arrayContaining(['--vault', 'Private']),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('set()', () => {
    it('tries edit first, then create on failure', async () => {
      let callCount = 0;
      mockedExecFile.mockImplementation(
        ((_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
          const cb = callback as (err: Error | null, stdout: string, stderr: string) => void;
          callCount++;
          if (callCount === 1) {
            // edit fails (not found)
            cb(new Error('not found'), '', '');
          } else {
            // create succeeds
            cb(null, '', '');
          }
        }) as typeof execFile,
      );

      await backend.set('test-key', 'secret');
      expect(mockedExecFile).toHaveBeenCalledTimes(2);

      // Second call should be item create
      const secondCallArgs = mockedExecFile.mock.calls[1][1] as string[];
      expect(secondCallArgs).toContain('create');
      expect(secondCallArgs).toContain('--title');
      expect(secondCallArgs).toContain('openclaw-test-key');
    });
  });

  describe('delete()', () => {
    it('succeeds silently', async () => {
      mockOpCall('');
      await expect(backend.delete('test-key')).resolves.toBeUndefined();
    });

    it('silently ignores not-found', async () => {
      mockOpCall('', new Error('not found'));
      await expect(backend.delete('missing-key')).resolves.toBeUndefined();
    });
  });

  describe('list()', () => {
    it('returns filtered key names', async () => {
      const items = [
        { title: 'openclaw-telegram-bot-token' },
        { title: 'openclaw-gateway-auth-token' },
        { title: 'something-else' },
      ];
      mockOpCall(JSON.stringify(items));
      const result = await backend.list();
      expect(result).toEqual(['telegram-bot-token', 'gateway-auth-token']);
    });

    it('passes vault when configured', async () => {
      const vaultBackend = new OnePasswordBackend({ vault: 'Work' });
      mockOpCall(JSON.stringify([]));
      await vaultBackend.list();
      expect(mockedExecFile).toHaveBeenCalledWith(
        'op',
        expect.arrayContaining(['--vault', 'Work']),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('name', () => {
    it('is "1password"', () => {
      expect(backend.name).toBe('1password');
    });
  });
});
