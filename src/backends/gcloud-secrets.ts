/**
 * Google Cloud Secret Manager backend via the gcloud CLI.
 */
import { CliBackend, runCommand, checkCliAvailable } from './base.js';
import type { BackendOptions } from './types.js';

export class GCloudSecretsBackend extends CliBackend {
  readonly name = 'gcloud';
  constructor(options: BackendOptions = {}) { super(options); }
  async available(): Promise<boolean> { return checkCliAvailable('gcloud', ['--version']); }

  private projectArgs(): string[] {
    return this.options.project ? ['--project', this.options.project] : [];
  }

  async get(key: string): Promise<string | null> {
    const secretName = this.prefixedKey(key);
    try {
      const stdout = await runCommand('gcloud', ['secrets', 'versions', 'access', 'latest', `--secret=${secretName}`, ...this.projectArgs()]);
      return stdout || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('NOT_FOUND') || message.includes('not found')) return null;
      throw new Error(`GCloud get failed for "${key}": ${message}`);
    }
  }

  async set(key: string, value: string): Promise<void> {
    const secretName = this.prefixedKey(key);
    try {
      await runCommand('gcloud', ['secrets', 'create', secretName, '--replication-policy=automatic', ...this.projectArgs()]);
    } catch { /* already exists */ }
    await runCommand('gcloud', ['secrets', 'versions', 'add', secretName, '--data-file=-', ...this.projectArgs()], { input: value });
  }

  async delete(key: string): Promise<void> {
    const secretName = this.prefixedKey(key);
    try {
      await runCommand('gcloud', ['secrets', 'delete', secretName, '--quiet', ...this.projectArgs()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('NOT_FOUND') || message.includes('not found')) return;
      throw new Error(`GCloud delete failed for "${key}": ${message}`);
    }
  }

  async list(): Promise<string[]> {
    try {
      const stdout = await runCommand('gcloud', ['secrets', 'list', '--format=value(name)', ...this.projectArgs()]);
      const names = stdout.trim().split('\n').filter(Boolean);
      const prefix = 'openclaw-';
      return names.filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`GCloud list failed: ${message}`);
    }
  }
}
