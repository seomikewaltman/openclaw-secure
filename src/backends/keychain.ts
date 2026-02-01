/**
 * macOS Keychain backend via the `security` CLI.
 */

import { platform } from 'node:os';
import { CliBackend, runCommand } from './base.js';
import type { BackendOptions } from './types.js';

const KEYCHAIN_ACCOUNT = 'openclaw';

export class KeychainBackend extends CliBackend {
  readonly name = 'keychain';

  constructor(options: BackendOptions = {}) {
    super(options);
  }

  async available(): Promise<boolean> {
    return platform() === 'darwin';
  }

  async get(key: string): Promise<string | null> {
    this.assertMacOS();
    const service = this.prefixedKey(key);
    try {
      const stdout = await runCommand('/usr/bin/security', [
        'find-generic-password', '-s', service, '-a', KEYCHAIN_ACCOUNT, '-w',
      ]);
      return stdout.trim();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (this.isNotFound(message)) return null;
      throw new Error(`Keychain read failed for "${key}": ${message}`);
    }
  }

  async set(key: string, value: string): Promise<void> {
    this.assertMacOS();
    const service = this.prefixedKey(key);
    try {
      await runCommand('/usr/bin/security', [
        'delete-generic-password', '-s', service, '-a', KEYCHAIN_ACCOUNT,
      ]);
    } catch {
      // Entry didn't exist — fine
    }
    try {
      await runCommand('/usr/bin/security', [
        'add-generic-password', '-s', service, '-a', KEYCHAIN_ACCOUNT, '-w', value, '-U',
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Keychain write failed for "${key}": ${message}`);
    }
  }

  async delete(key: string): Promise<void> {
    this.assertMacOS();
    const service = this.prefixedKey(key);
    try {
      await runCommand('/usr/bin/security', [
        'delete-generic-password', '-s', service, '-a', KEYCHAIN_ACCOUNT,
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (this.isNotFound(message)) return;
      throw new Error(`Keychain delete failed for "${key}": ${message}`);
    }
  }

  async list(): Promise<string[]> {
    this.assertMacOS();
    try {
      const stdout = await runCommand('/usr/bin/security', ['dump-keychain'], { timeout: 30_000 });
      const keys: string[] = [];
      const prefix = 'openclaw-';
      const serviceRegex = /"svce"<blob>="([^"]+)"/g;
      let match: RegExpExecArray | null;
      while ((match = serviceRegex.exec(stdout)) !== null) {
        const service = match[1];
        if (service.startsWith(prefix)) {
          keys.push(service.slice(prefix.length));
        }
      }
      return keys;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Keychain list failed: ${message}`);
    }
  }

  private assertMacOS(): void {
    if (platform() !== 'darwin') {
      throw new Error('Keychain backend requires macOS.');
    }
  }

  private isNotFound(message: string): boolean {
    return (
      message.includes('could not be found') ||
      message.includes('SecItemNotFound') ||
      message.includes('errSecItemNotFound')
    );
  }
}
