/**
 * HashiCorp Vault backend via the vault CLI.
 *
 * Secrets stored at: secret/openclaw/{keyName}
 * Uses kv v2 engine by default.
 */
import { CliBackend, runCommand, checkCliAvailable } from './base.js';
import type { BackendOptions } from './types.js';

export class VaultBackend extends CliBackend {
  readonly name = 'vault';
  constructor(options: BackendOptions = {}) { super(options); }
  async available(): Promise<boolean> { return checkCliAvailable('vault', ['version']); }

  private envVars(): Record<string, string> | undefined {
    if (this.options.addr) return { VAULT_ADDR: this.options.addr };
    return undefined;
  }

  private secretPath(key: string): string { return `secret/openclaw/${key}`; }

  async get(key: string): Promise<string | null> {
    const path = this.secretPath(key);
    try {
      const stdout = await runCommand('vault', ['kv', 'get', '-field=value', path], { env: this.envVars() });
      return stdout.trim() || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('No value found') || message.includes('not found') || message.includes('no secrets')) return null;
      throw new Error(`Vault get failed for "${key}": ${message}`);
    }
  }

  async set(key: string, value: string): Promise<void> {
    const path = this.secretPath(key);
    try {
      await runCommand('vault', ['kv', 'put', path, `value=${value}`], { env: this.envVars() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Vault set failed for "${key}": ${message}`);
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.secretPath(key);
    try {
      await runCommand('vault', ['kv', 'delete', path], { env: this.envVars() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('No value found') || message.includes('not found')) return;
      throw new Error(`Vault delete failed for "${key}": ${message}`);
    }
  }

  async list(): Promise<string[]> {
    try {
      const stdout = await runCommand('vault', ['kv', 'list', '-format=json', 'secret/openclaw/'], { env: this.envVars() });
      const keys = JSON.parse(stdout) as string[];
      return keys.map((k) => k.replace(/\/$/, ''));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('No value found') || message.includes('not found')) return [];
      throw new Error(`Vault list failed: ${message}`);
    }
  }
}
