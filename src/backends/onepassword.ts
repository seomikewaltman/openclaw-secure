import { CliBackend, runCommand, checkCliAvailable } from './base.js';
import type { BackendOptions } from './types.js';

export class OnePasswordBackend extends CliBackend {
  readonly name = '1password';
  constructor(options: BackendOptions = {}) { super(options); }
  async available(): Promise<boolean> { return checkCliAvailable('op', ['--version']); }

  async get(key: string): Promise<string | null> {
    const title = this.prefixedKey(key);
    try {
      const args = ['item', 'get', title, '--fields', 'password', '--format', 'json'];
      if (this.options.vault) args.push('--vault', this.options.vault);
      const stdout = await runCommand('op', args);
      const parsed = JSON.parse(stdout);
      return parsed.value ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found') || message.includes("isn't an item")) return null;
      throw new Error(`1Password get failed for "${key}": ${message}`);
    }
  }

  async set(key: string, value: string): Promise<void> {
    const title = this.prefixedKey(key);
    try {
      const args = ['item', 'edit', title, `password=${value}`];
      if (this.options.vault) args.push('--vault', this.options.vault);
      await runCommand('op', args);
    } catch {
      const args = ['item', 'create', '--category', 'password', '--title', title, `password=${value}`];
      if (this.options.vault) args.push('--vault', this.options.vault);
      await runCommand('op', args);
    }
  }

  async delete(key: string): Promise<void> {
    const title = this.prefixedKey(key);
    try {
      const args = ['item', 'delete', title];
      if (this.options.vault) args.push('--vault', this.options.vault);
      await runCommand('op', args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found') || message.includes("isn't an item")) return;
      throw new Error(`1Password delete failed for "${key}": ${message}`);
    }
  }

  async list(): Promise<string[]> {
    try {
      const args = ['item', 'list', '--format', 'json'];
      if (this.options.vault) args.push('--vault', this.options.vault);
      const stdout = await runCommand('op', args);
      const items = JSON.parse(stdout) as Array<{ title: string }>;
      const prefix = 'openclaw-';
      return items.filter((i) => i.title.startsWith(prefix)).map((i) => i.title.slice(prefix.length));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`1Password list failed: ${message}`);
    }
  }
}
