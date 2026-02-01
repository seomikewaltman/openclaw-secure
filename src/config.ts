import { readFile, writeFile, stat, copyFile, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { PREFERENCES_PATH } from './constants.js';
import type { BackendName } from './backends/index.js';
import type { BackendOptions } from './backends/types.js';

export interface Preferences {
  backend?: BackendName;
  vault?: string;
  region?: string;
  project?: string;
  vaultName?: string;
  addr?: string;
  config?: string;
}

export function expandPath(filePath: string): string {
  if (filePath.startsWith('~/') || filePath === '~') {
    return resolve(homedir(), filePath.slice(2));
  }
  return resolve(filePath);
}

export async function readConfig(configPath: string): Promise<Record<string, unknown>> {
  const fullPath = expandPath(configPath);
  try {
    const content = await readFile(fullPath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Config file not found: ${fullPath}`);
    }
    throw new Error(`Failed to read config at ${fullPath}: ${message}`);
  }
}

async function getFileMode(filePath: string): Promise<number> {
  try {
    const stats = await stat(filePath);
    return stats.mode;
  } catch {
    return 0o600;
  }
}

export async function backupConfig(configPath: string): Promise<string> {
  const fullPath = expandPath(configPath);
  const backupPath = `${fullPath}.bak`;
  try {
    await copyFile(fullPath, backupPath);
    return backupPath;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to create backup at ${backupPath}: ${message}`);
  }
}

export async function writeConfig(
  configPath: string,
  data: Record<string, unknown>,
  createBackup = true,
): Promise<void> {
  const fullPath = expandPath(configPath);
  const mode = await getFileMode(fullPath);
  if (createBackup) {
    try { await backupConfig(configPath); } catch { /* ignore */ }
  }
  try {
    const content = JSON.stringify(data, null, 2) + '\n';
    await writeFile(fullPath, content, { encoding: 'utf-8', mode: 0o600 });
    await chmod(fullPath, mode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to write config at ${fullPath}: ${message}`);
  }
}

export async function readPreferences(): Promise<Preferences> {
  const fullPath = expandPath(PREFERENCES_PATH);
  try {
    const content = await readFile(fullPath, 'utf-8');
    return JSON.parse(content) as Preferences;
  } catch {
    return {};
  }
}

export function preferencesToBackendOptions(prefs: Preferences): BackendOptions {
  return {
    vault: prefs.vault,
    region: prefs.region,
    project: prefs.project,
    vaultName: prefs.vaultName,
    addr: prefs.addr,
    config: prefs.config,
  };
}
