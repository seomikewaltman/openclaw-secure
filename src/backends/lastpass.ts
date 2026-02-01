/**
 * LastPass backend via the lpass CLI.
 */
import { CliBackend, runCommand, checkCliAvailable } from './base.js';
import type { BackendOptions } from './types.js';

export class LastPassBackend extends CliBackend {
  readonly name = 'lastpass';
  constructor(options: BackendOptions = {}) { super(options); }
  async available(): Promise<boolean> { return checkCliAvailable('lpass', ['--version']); }

  async get(key: string): Promise<string | null> {
    const path = this.prefixedPath(key);
    try {
      const stdout = await runCommand('lpass', ['show', '--password', path]);
      return stdout.trim() || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Could not find') || message.includes('not found')) return null;
      throw new Error(`LastPass get failed for "${key}": ${message}`);
    }
  }

  async set(key: string, value: string): Promise<void> {
    const path = this.prefixedPath(key);
    const existing = await this.get(key);
    if (existing !== null) {
      await runCommand('lpass', ['edit', '--non-interactive', '--pass', path], { input: value });
    } else {
      await runCommand('lpass', ['add', '--non-interactive', '--pass', path], { input: value });
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.prefixedPath(key);
    try {
      await runCommand('lpass', ['rm', path]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Could not find') || message.includes('not found')) return;
      throw new Error(`LastPass delete failed for "${key}": ${message}`);
    }
  }

  async list(): Promise<string[]> {
    try {
      const stdout = await runCommand('lpass', ['ls', 'openclaw/']);
      const lines = stdout.trim().split('\n').filter(Boolean);
      return lines
        .map((line: string) => { const m = line.match(/openclaw\/([^\s[]+)/); return m ? m[1] : null; })
        .filter((k: string | null): k is string => k !== null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`LastPass list failed: ${message}`);
    }
  }
}
