import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process before importing
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Mock os.platform to return darwin
vi.mock('node:os', () => ({
  platform: () => 'darwin',
  homedir: () => '/Users/test',
}));

import { execFile } from 'node:child_process';
import { KeychainBackend } from '../../src/backends/keychain.js';

const mockedExecFile = vi.mocked(execFile);

function mockSecurityCall(stdout: string, error: Error | null = null) {
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

describe('KeychainBackend', () => {
  let backend: KeychainBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new KeychainBackend();
  });

  describe('available()', () => {
    it('returns true on macOS (darwin)', async () => {
      expect(await backend.available()).toBe(true);
    });
  });

  describe('get()', () => {
    it('returns password on success', async () => {
      mockSecurityCall('my-secret-password\n');
      const result = await backend.get('telegram-bot-token');
      expect(result).toBe('my-secret-password');
    });

    it('returns null when key not found', async () => {
      mockSecurityCall('', new Error('could not be found'));
      const result = await backend.get('missing-key');
      expect(result).toBeNull();
    });

    it('returns null for errSecItemNotFound', async () => {
      mockSecurityCall('', new Error('errSecItemNotFound'));
      const result = await backend.get('missing-key');
      expect(result).toBeNull();
    });

    it('throws on unexpected errors', async () => {
      mockSecurityCall('', new Error('keychain locked'));
      await expect(backend.get('test-key')).rejects.toThrow('Keychain read failed');
    });

    it('uses prefixed service name openclaw-{key}', async () => {
      mockSecurityCall('value');
      await backend.get('my-key');
      expect(mockedExecFile).toHaveBeenCalledWith(
        '/usr/bin/security',
        expect.arrayContaining(['-s', 'openclaw-my-key']),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('set()', () => {
    it('deletes then adds', async () => {
      let callCount = 0;
      mockedExecFile.mockImplementation(
        ((_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
          const cb = callback as (err: Error | null, stdout: string, stderr: string) => void;
          callCount++;
          if (callCount === 1) {
            cb(new Error('could not be found'), '', '');
          } else {
            cb(null, '', '');
          }
        }) as typeof execFile,
      );

      await backend.set('test-key', 'secret123');
      expect(mockedExecFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('delete()', () => {
    it('returns without error on success', async () => {
      mockSecurityCall('');
      await expect(backend.delete('test-key')).resolves.toBeUndefined();
    });

    it('silently ignores not-found', async () => {
      mockSecurityCall('', new Error('could not be found'));
      await expect(backend.delete('missing-key')).resolves.toBeUndefined();
    });
  });

  describe('name', () => {
    it('is "keychain"', () => {
      expect(backend.name).toBe('keychain');
    });
  });
});
