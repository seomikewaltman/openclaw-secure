/**
 * pass (Unix/GPG password manager) backend via the pass CLI.
 */
import { CliBackend, runCommand, checkCliAvailable } from './base.js';
import type { BackendOptions } from './types.js';

export class PassBackend extends CliBackend {
  readonly name = 'pass';
  constructor(options: BackendOptions = {}) { super(options); }
  async available(): Promise<boolean> { return checkCliAvailable('pass', ['version']); }

  async get(key: string): Promise<string | null> {
    const path = this.prefixedPath(key);
    try {
      const stdout = await runCommand('pass', ['show', path]);
      return stdout.split('\n')[0] || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not in the password store') || message.includes('is not in')) return null;
      throw new Error(`pass get failed for "${key}": ${message}`);
    }
  }

  async set(key: string, value: string): Promise<void> {
    const path = this.prefixedPath(key);
    try {
      await runCommand('pass', ['insert', '--force', '--multiline', path], { input: value });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`pass set failed for "${key}": ${message}`);
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.prefixedPath(key);
    try {
      await runCommand('pass', ['rm', '--force', path]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not in the password store') || message.includes('is not in')) return;
      throw new Error(`pass delete failed for "${key}": ${message}`);
    }
  }

  async list(): Promise<string[]> {
    try {
      const stdout = await runCommand('pass', ['ls', 'openclaw/']);
      const lines = stdout.trim().split('\n').filter(Boolean);
      return lines.map((line: string) => line.replace(/[\u2500\u2502\u2514\u251c\u2524 ]/g, '').trim()).filter((name: string) => name.length > 0 && !name.includes('openclaw'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not in the password store')) return [];
      throw new Error(`pass list failed: ${message}`);
    }
  }
}
