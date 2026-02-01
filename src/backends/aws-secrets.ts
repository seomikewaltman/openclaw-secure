/**
 * AWS Secrets Manager backend via the aws CLI.
 */
import { CliBackend, runCommand, checkCliAvailable } from './base.js';
import type { BackendOptions } from './types.js';

export class AwsSecretsBackend extends CliBackend {
  readonly name = 'aws';
  constructor(options: BackendOptions = {}) { super(options); }
  async available(): Promise<boolean> { return checkCliAvailable('aws', ['--version']); }

  private regionArgs(): string[] {
    return this.options.region ? ['--region', this.options.region] : [];
  }

  async get(key: string): Promise<string | null> {
    const secretName = this.prefixedPath(key);
    try {
      const stdout = await runCommand('aws', [
        'secretsmanager', 'get-secret-value', '--secret-id', secretName,
        '--query', 'SecretString', '--output', 'text', ...this.regionArgs(),
      ]);
      return stdout.trim() || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('ResourceNotFoundException') || message.includes('not found')) return null;
      throw new Error(`AWS get failed for "${key}": ${message}`);
    }
  }

  async set(key: string, value: string): Promise<void> {
    const secretName = this.prefixedPath(key);
    try {
      await runCommand('aws', ['secretsmanager', 'update-secret', '--secret-id', secretName, '--secret-string', value, ...this.regionArgs()]);
    } catch {
      await runCommand('aws', ['secretsmanager', 'create-secret', '--name', secretName, '--secret-string', value, ...this.regionArgs()]);
    }
  }

  async delete(key: string): Promise<void> {
    const secretName = this.prefixedPath(key);
    try {
      await runCommand('aws', ['secretsmanager', 'delete-secret', '--secret-id', secretName, '--force-delete-without-recovery', ...this.regionArgs()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('ResourceNotFoundException') || message.includes('not found')) return;
      throw new Error(`AWS delete failed for "${key}": ${message}`);
    }
  }

  async list(): Promise<string[]> {
    try {
      const stdout = await runCommand('aws', ['secretsmanager', 'list-secrets', '--query', 'SecretList[].Name', '--output', 'json', ...this.regionArgs()]);
      const names = JSON.parse(stdout) as string[];
      const prefix = 'openclaw/';
      return names.filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`AWS list failed: ${message}`);
    }
  }
}
