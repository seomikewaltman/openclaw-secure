/**
 * Azure Key Vault backend via the az CLI.
 */
import { CliBackend, runCommand, checkCliAvailable } from './base.js';
import type { BackendOptions } from './types.js';

export class AzureKeyVaultBackend extends CliBackend {
  readonly name = 'azure';
  constructor(options: BackendOptions = {}) {
    super(options);
    if (!options.vaultName) throw new Error('Azure Key Vault backend requires --vault-name option.');
  }
  private get vaultName(): string { return this.options.vaultName!; }
  async available(): Promise<boolean> { return checkCliAvailable('az', ['--version']); }

  async get(key: string): Promise<string | null> {
    const secretName = this.prefixedKey(key);
    try {
      const stdout = await runCommand('az', ['keyvault', 'secret', 'show', '--vault-name', this.vaultName, '--name', secretName, '--query', 'value', '--output', 'tsv']);
      return stdout.trim() || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('SecretNotFound') || message.includes('not found')) return null;
      throw new Error(`Azure get failed for "${key}": ${message}`);
    }
  }

  async set(key: string, value: string): Promise<void> {
    const secretName = this.prefixedKey(key);
    try {
      await runCommand('az', ['keyvault', 'secret', 'set', '--vault-name', this.vaultName, '--name', secretName, '--value', value]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Azure set failed for "${key}": ${message}`);
    }
  }

  async delete(key: string): Promise<void> {
    const secretName = this.prefixedKey(key);
    try {
      await runCommand('az', ['keyvault', 'secret', 'delete', '--vault-name', this.vaultName, '--name', secretName]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('SecretNotFound') || message.includes('not found')) return;
      throw new Error(`Azure delete failed for "${key}": ${message}`);
    }
  }

  async list(): Promise<string[]> {
    try {
      const stdout = await runCommand('az', ['keyvault', 'secret', 'list', '--vault-name', this.vaultName, '--query', '[].name', '--output', 'json']);
      const names = JSON.parse(stdout) as string[];
      const prefix = 'openclaw-';
      return names.filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Azure list failed: ${message}`);
    }
  }
}
