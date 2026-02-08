/**
 * Doppler backend via the doppler CLI.
 *
 * Doppler uses UPPER_SNAKE_CASE for secret names, so we convert:
 *   "telegram-bot-token" → "OPENCLAW_TELEGRAM_BOT_TOKEN"
 */
import { CliBackend, runCommand, checkCliAvailable } from './base.js';
import type { BackendOptions } from './types.js';

export class DopplerBackend extends CliBackend {
  readonly name = 'doppler';
  constructor(options: BackendOptions = {}) { super(options); }
  async available(): Promise<boolean> { return checkCliAvailable('doppler', ['--version']); }

  private projectArgs(): string[] {
    const args: string[] = [];
    if (this.options.dopplerProject) args.push('--project', this.options.dopplerProject);
    if (this.options.dopplerConfig) args.push('--config', this.options.dopplerConfig);
    return args;
  }

  private dopplerKey(key: string): string {
    return `OPENCLAW_${key.toUpperCase().replace(/-/g, '_')}`;
  }

  async get(key: string): Promise<string | null> {
    const dKey = this.dopplerKey(key);
    try {
      const stdout = await runCommand('doppler', ['secrets', 'get', dKey, '--plain', ...this.projectArgs()]);
      return stdout.trim() || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('ould not find') || message.includes('not found')) return null;
      throw new Error(`Doppler get failed for "${key}": ${message}`);
    }
  }

  async set(key: string, value: string): Promise<void> {
    const dKey = this.dopplerKey(key);
    try {
      await runCommand('doppler', ['secrets', 'set', dKey, '--raw', ...this.projectArgs()], { input: value });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Doppler set failed for "${key}": ${message}`);
    }
  }

  async delete(key: string): Promise<void> {
    const dKey = this.dopplerKey(key);
    try {
      await runCommand('doppler', ['secrets', 'delete', dKey, '--yes', ...this.projectArgs()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('ould not find') || message.includes('not found')) return;
      throw new Error(`Doppler delete failed for "${key}": ${message}`);
    }
  }

  async list(): Promise<string[]> {
    try {
      const stdout = await runCommand('doppler', ['secrets', '--json', ...this.projectArgs()]);
      const secrets = JSON.parse(stdout) as Record<string, unknown>;
      const prefix = 'OPENCLAW_';
      return Object.keys(secrets)
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length).toLowerCase().replace(/_/g, '-'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Doppler list failed: ${message}`);
    }
  }
}
