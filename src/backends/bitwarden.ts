/**
 * Bitwarden backend via the bw CLI.
 */
import { CliBackend, runCommand, checkCliAvailable } from './base.js';
import type { BackendOptions } from './types.js';

export class BitwardenBackend extends CliBackend {
  readonly name = 'bitwarden';
  constructor(options: BackendOptions = {}) { super(options); }
  async available(): Promise<boolean> { return checkCliAvailable('bw', ['--version']); }

  async get(key: string): Promise<string | null> {
    const itemName = this.prefixedKey(key);
    try {
      const stdout = await runCommand('bw', ['get', 'item', itemName, '--raw']);
      const item = JSON.parse(stdout);
      return item?.login?.password ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Not found')) return null;
      throw new Error(`Bitwarden get failed for "${key}": ${message}`);
    }
  }

  async set(key: string, value: string): Promise<void> {
    const itemName = this.prefixedKey(key);
    const existing = await this.get(key);
    if (existing !== null) {
      const stdout = await runCommand('bw', ['get', 'item', itemName, '--raw']);
      const item = JSON.parse(stdout);
      item.login = item.login || {};
      item.login.password = value;
      const encoded = Buffer.from(JSON.stringify(item)).toString('base64');
      await runCommand('bw', ['edit', 'item', item.id], { input: encoded });
    } else {
      const newItem = { type: 1, name: itemName, login: { password: value } };
      const encoded = Buffer.from(JSON.stringify(newItem)).toString('base64');
      await runCommand('bw', ['create', 'item', encoded]);
    }
  }

  async delete(key: string): Promise<void> {
    const itemName = this.prefixedKey(key);
    try {
      const stdout = await runCommand('bw', ['get', 'item', itemName, '--raw']);
      const item = JSON.parse(stdout);
      await runCommand('bw', ['delete', 'item', item.id]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Not found')) return;
      throw new Error(`Bitwarden delete failed for "${key}": ${message}`);
    }
  }

  async list(): Promise<string[]> {
    try {
      const stdout = await runCommand('bw', ['list', 'items', '--search', 'openclaw-']);
      const items = JSON.parse(stdout) as Array<{ name: string }>;
      const prefix = 'openclaw-';
      return items.filter((i) => i.name.startsWith(prefix)).map((i) => i.name.slice(prefix.length));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Bitwarden list failed: ${message}`);
    }
  }
}
