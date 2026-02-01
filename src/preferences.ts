/**
 * User preferences file (~/.openclaw-secure.json).
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Preferences {
  backend?: string;
  vault?: string;
}

export const PREFERENCES_PATH = join(homedir(), '.openclaw-secure.json');

export async function loadPreferences(path?: string): Promise<Preferences> {
  const filePath = path ?? PREFERENCES_PATH;
  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Preferences;
  } catch {
    return {};
  }
}
