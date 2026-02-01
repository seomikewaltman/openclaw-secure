import { execFile } from 'node:child_process';
import type { SecretBackend, BackendOptions } from './types.js';

export function runCommand(cmd: string, args: string[], options?: { timeout?: number; input?: string; env?: Record<string, string> }): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { timeout: options?.timeout ?? 15_000, env: options?.env ? { ...process.env, ...options.env } : undefined }, (error, stdout, stderr) => {
      if (error) {
        const msg = stderr?.trim() || stdout?.trim() || error.message;
        reject(new Error(msg));
        return;
      }
      resolve(stdout);
    });
    if (options?.input && child.stdin) {
      child.stdin.write(options.input);
      child.stdin.end();
    }
  });
}

export async function checkCliAvailable(cmd: string, args: string[] = ['--version']): Promise<boolean> {
  try {
    await runCommand(cmd, args, { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export abstract class CliBackend implements SecretBackend {
  abstract readonly name: string;
  protected readonly options: BackendOptions;
  constructor(options: BackendOptions = {}) { this.options = options; }
  abstract available(): Promise<boolean>;
  abstract get(key: string): Promise<string | null>;
  abstract set(key: string, value: string): Promise<void>;
  abstract delete(key: string): Promise<void>;
  abstract list(): Promise<string[]>;
  protected prefixedKey(key: string): string { return `openclaw-${key}`; }
  protected prefixedPath(key: string): string { return `openclaw/${key}`; }
}
