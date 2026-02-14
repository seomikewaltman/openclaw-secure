/**
 * Auto-discovery of secrets in OpenClaw config files.
 */

import { KEYCHAIN_PLACEHOLDER } from './constants.js';
import {
  isKnownSecretPath,
  isSecretKeyName,
  matchesSecretValuePattern,
  MIN_SECRET_LENGTH,
  SECRET_KEY_EXCLUDE,
} from './patterns.js';
import type { SecretEntry, SecretMap } from './types.js';

/** How a secret was identified */
export type MatchType = 'known-path' | 'key-pattern' | 'value-pattern';

/** A discovered secret with metadata */
export interface DiscoveredSecret {
  /** Dot-path in config (e.g., "channels.telegram.botToken") */
  configPath: string;
  /** Derived backend key name (e.g., "telegram-bot-token") */
  keychainName: string;
  /** How the secret was identified */
  matchType: MatchType;
  /** Current value (for validation, not persisted) */
  value: string;
}

/** Options for secret discovery */
export interface DiscoveryOptions {
  /** Include values that match secret patterns but not key patterns (riskier) */
  includeUnknownPatterns?: boolean;
  /** Custom additional paths to treat as secrets */
  additionalPaths?: string[];
  /** Paths to explicitly exclude (supports wildcards with *) */
  excludePaths?: string[];
}

/**
 * Convert a config path to a keychain-friendly name.
 *
 * Examples:
 *   "channels.telegram.botToken" → "telegram-bot-token"
 *   "channels.telegram.accounts.main.botToken" → "telegram-main-bot-token"
 *   "skills.entries.openai-whisper-api.apiKey" → "openai-whisper-api-api-key"
 *   "gateway.auth.token" → "gateway-auth-token"
 */
export function pathToKeychainName(configPath: string): string {
  const parts = configPath.split('.');
  const result: string[] = [];

  // Prefixes to skip (they don't add useful context)
  const skipPrefixes = new Set(['channels', 'skills', 'tools', 'accounts', 'entries', 'web', 'media']);

  for (const part of parts) {
    // Skip common structural prefixes
    if (skipPrefixes.has(part)) continue;
    // Skip array indices
    if (/^\d+$/.test(part)) continue;

    // Convert camelCase to kebab-case
    const kebab = part.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    result.push(kebab);
  }

  return result.join('-');
}

/**
 * Check if a path matches an exclude pattern.
 * Supports wildcards: "channels.dev.*" matches "channels.dev.anything"
 */
function matchesExcludePattern(path: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      // Convert wildcard to regex
      const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      if (regex.test(path)) return true;
    } else {
      if (path === pattern || path.startsWith(pattern + '.')) return true;
    }
  }
  return false;
}

/**
 * Discover all secrets in an OpenClaw config object.
 *
 * Walks the entire config tree and identifies secrets by:
 * 1. Known secret paths (highest priority)
 * 2. Secret key name patterns (*Token, apiKey, etc.)
 * 3. Optionally, value patterns (sk-*, xox*, etc.)
 */
export function discoverSecrets(
  config: Record<string, unknown>,
  options: DiscoveryOptions = {},
): DiscoveredSecret[] {
  const secrets: DiscoveredSecret[] = [];
  const seenPaths = new Set<string>();

  const excludePaths = options.excludePaths ?? [];
  const additionalPaths = new Set(options.additionalPaths ?? []);

  function walk(obj: unknown, path: string[] = []): void {
    if (obj === null || obj === undefined) return;

    if (typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        walk(value, [...path, key]);
      }
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => walk(item, [...path, String(index)]));
      return;
    }

    // Leaf value - check if it's a secret
    if (typeof obj !== 'string') return;

    const fullPath = path.join('.');
    const key = path[path.length - 1];

    // Skip if already processed
    if (seenPaths.has(fullPath)) return;

    // Skip excluded paths
    if (matchesExcludePattern(fullPath, excludePaths)) return;

    // Skip excluded keys
    if (SECRET_KEY_EXCLUDE.has(key)) return;

    // Skip placeholder values (already stored)
    if (obj === KEYCHAIN_PLACEHOLDER) return;

    // Skip values that are too short to be secrets
    if (obj.length < MIN_SECRET_LENGTH) return;

    // Check additional paths first (user-specified)
    if (additionalPaths.has(fullPath)) {
      seenPaths.add(fullPath);
      secrets.push({
        configPath: fullPath,
        keychainName: pathToKeychainName(fullPath),
        matchType: 'known-path',
        value: obj,
      });
      return;
    }

    // Check known paths (highest priority)
    if (isKnownSecretPath(fullPath)) {
      seenPaths.add(fullPath);
      secrets.push({
        configPath: fullPath,
        keychainName: pathToKeychainName(fullPath),
        matchType: 'known-path',
        value: obj,
      });
      return;
    }

    // Check key name patterns
    if (isSecretKeyName(key)) {
      seenPaths.add(fullPath);
      secrets.push({
        configPath: fullPath,
        keychainName: pathToKeychainName(fullPath),
        matchType: 'key-pattern',
        value: obj,
      });
      return;
    }

    // Optionally check value patterns (for unknown key names)
    if (options.includeUnknownPatterns && matchesSecretValuePattern(obj)) {
      seenPaths.add(fullPath);
      secrets.push({
        configPath: fullPath,
        keychainName: pathToKeychainName(fullPath),
        matchType: 'value-pattern',
        value: obj,
      });
    }
  }

  walk(config);

  // Sort by path for consistent output
  secrets.sort((a, b) => a.configPath.localeCompare(b.configPath));

  return secrets;
}

/**
 * Convert discovered secrets to a SecretMap (for compatibility with existing code).
 */
export function discoveredToSecretMap(discovered: DiscoveredSecret[]): SecretMap {
  return discovered.map((d) => ({
    configPath: d.configPath,
    keychainName: d.keychainName,
  }));
}

/**
 * Convert a SecretEntry to a DiscoveredSecret (for display purposes).
 */
export function secretEntryToDiscovered(
  entry: SecretEntry,
  value: string,
  matchType: MatchType = 'known-path',
): DiscoveredSecret {
  return {
    configPath: entry.configPath,
    keychainName: entry.keychainName,
    matchType,
    value,
  };
}
