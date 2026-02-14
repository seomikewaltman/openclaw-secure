/**
 * openclaw-secure — Secure OpenClaw API keys with a pluggable secret backend.
 *
 * @packageDocumentation
 */

// Backend system
export {
  createBackend, BACKEND_NAMES,
  KeychainBackend, OnePasswordBackend, BitwardenBackend, LastPassBackend,
  AwsSecretsBackend, GCloudSecretsBackend, AzureKeyVaultBackend,
  PassBackend, DopplerBackend, VaultBackend,
} from './backends/index.js';
export type { SecretBackend, BackendOptions, BackendName } from './backends/index.js';

// Config & path utilities
export { readConfig, writeConfig, backupConfig, expandPath } from './config.js';
export { getByPath, setByPath, hasPath } from './paths.js';

// Preferences
export { loadPreferences, PREFERENCES_PATH } from './preferences.js';
export type { Preferences } from './preferences.js';

// LaunchAgent management
export { findPlist, readPlist, backupPlist, installSecure, uninstallSecure } from './launchagent.js';
export type { PlistConfig, InstallOptions } from './launchagent.js';

// Auto-discovery
export {
  discoverSecrets,
  discoveredToSecretMap,
  pathToKeychainName,
} from './discovery.js';
export type { DiscoveredSecret, DiscoveryOptions, MatchType } from './discovery.js';

// Patterns
export {
  isKnownSecretPath,
  isSecretKeyName,
  matchesSecretValuePattern,
  KNOWN_SECRET_PATHS,
  KNOWN_SECRET_PATH_PATTERNS,
  SECRET_KEY_EXACT,
  SECRET_KEY_SUFFIXES,
  SECRET_KEY_EXCLUDE,
  SECRET_VALUE_PATTERNS,
  MIN_SECRET_LENGTH,
} from './patterns.js';

// Constants
export {
  KEYCHAIN_PLACEHOLDER,
  DEFAULT_CONFIG_PATH,
  DEFAULT_SECRET_MAP,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_BACKEND,
  LEGACY_KEY_NAMES,
} from './constants.js';

// Types
export type {
  SecretEntry,
  SecretMap,
  KeyCheckResult,
  StoreResult,
  StartOptions,
} from './types.js';

import type { SecretBackend } from './backends';
import { readConfig, writeConfig } from './config.js';
import { getByPath, setByPath } from './paths.js';
import { KEYCHAIN_PLACEHOLDER, LEGACY_KEY_NAMES } from './constants.js';
import { pathToKeychainName } from './discovery.js';
import { discoverSecrets, discoveredToSecretMap } from './discovery.js';
import type { DiscoveryOptions } from './discovery.js';
import type { SecretMap, KeyCheckResult, StoreResult } from './types.js';

/**
 * Store all secret values from the config into the backend,
 * then replace them with placeholder values in the config file.
 */
export async function storeKeys(
  configPath: string,
  secretMap: SecretMap,
  backend: SecretBackend,
): Promise<StoreResult[]> {
  let config = await readConfig(configPath);
  const results: StoreResult[] = [];

  for (const entry of secretMap) {
    const value = getByPath(config, entry.configPath);

    if (value === undefined || value === null) {
      results.push({ keychainName: entry.keychainName, configPath: entry.configPath, stored: false, skipped: true, reason: 'Value not found in config' });
      continue;
    }
    if (typeof value !== 'string') {
      results.push({ keychainName: entry.keychainName, configPath: entry.configPath, stored: false, skipped: true, reason: 'Value is not a string' });
      continue;
    }
    if (value === KEYCHAIN_PLACEHOLDER) {
      results.push({ keychainName: entry.keychainName, configPath: entry.configPath, stored: false, skipped: true, reason: 'Already stored in backend' });
      continue;
    }

    await backend.set(entry.keychainName, value);
    config = setByPath(config, entry.configPath, KEYCHAIN_PLACEHOLDER);
    results.push({ keychainName: entry.keychainName, configPath: entry.configPath, stored: true, skipped: false });
  }

  await writeConfig(configPath, config);
  return results;
}

/** Pull keys from the backend and write real values back into config. */
export async function restoreKeys(configPath: string, secretMap: SecretMap, backend: SecretBackend): Promise<void> {
  let config = await readConfig(configPath);
  for (const entry of secretMap) {
    const value = await backend.get(entry.keychainName);
    if (value !== null) config = setByPath(config, entry.configPath, value);
  }
  await writeConfig(configPath, config);
}

/** Replace all secret values in config with placeholders. */
export async function scrubKeys(configPath: string, secretMap: SecretMap): Promise<void> {
  let config = await readConfig(configPath);
  for (const entry of secretMap) {
    const value = getByPath(config, entry.configPath);
    if (value !== undefined && value !== KEYCHAIN_PLACEHOLDER) {
      config = setByPath(config, entry.configPath, KEYCHAIN_PLACEHOLDER);
    }
  }
  await writeConfig(configPath, config);
}

/** Check whether all expected keys exist in the backend. */
export async function checkKeys(secretMap: SecretMap, backend: SecretBackend): Promise<KeyCheckResult[]> {
  const results: KeyCheckResult[] = [];
  for (const entry of secretMap) {
    const value = await backend.get(entry.keychainName);
    results.push({ keychainName: entry.keychainName, configPath: entry.configPath, exists: value !== null });
  }
  return results;
}

/**
 * Auto-discover secrets in the config and store them in the backend.
 * This is the preferred method for dynamic configs.
 */
export async function autoStoreKeys(
  configPath: string,
  backend: SecretBackend,
  options?: DiscoveryOptions,
): Promise<StoreResult[]> {
  const config = await readConfig(configPath);
  const discovered = discoverSecrets(config, options);
  const secretMap = discoveredToSecretMap(discovered);
  return storeKeys(configPath, secretMap, backend);
}

/**
 * Auto-discover secrets in the config and check if they exist in the backend.
 */
export async function autoCheckKeys(
  configPath: string,
  backend: SecretBackend,
  options?: DiscoveryOptions,
): Promise<KeyCheckResult[]> {
  const config = await readConfig(configPath);
  const discovered = discoverSecrets(config, options);
  const secretMap = discoveredToSecretMap(discovered);
  return checkKeys(secretMap, backend);
}

/**
 * Auto-discover secrets in the config and restore them from the backend.
 */
export async function autoRestoreKeys(
  configPath: string,
  backend: SecretBackend,
  options?: DiscoveryOptions,
): Promise<void> {
  const config = await readConfig(configPath);
  const discovered = discoverSecrets(config, options);
  const secretMap = discoveredToSecretMap(discovered);
  return restoreKeys(configPath, secretMap, backend);
}

/**
 * Auto-discover secrets in the config and scrub them (replace with placeholders).
 */
export async function autoScrubKeys(
  configPath: string,
  options?: DiscoveryOptions,
): Promise<void> {
  const config = await readConfig(configPath);
  const discovered = discoverSecrets(config, options);
  const secretMap = discoveredToSecretMap(discovered);
  return scrubKeys(configPath, secretMap);
}

/** Result of migrating a single key */
export interface MigrateResult {
  configPath: string;
  oldName: string;
  newName: string;
  migrated: boolean;
  reason?: string;
}

/**
 * Migrate secrets from legacy v1.x keychain names to new auto-generated names.
 * 
 * For each legacy mapping:
 * 1. Read the secret from the old keychain name
 * 2. Write it to the new keychain name
 * 3. Delete the old keychain entry
 */
export async function migrateKeys(backend: SecretBackend): Promise<MigrateResult[]> {
  const results: MigrateResult[] = [];

  for (const [configPath, oldName] of Object.entries(LEGACY_KEY_NAMES)) {
    const newName = pathToKeychainName(configPath);

    // Skip if names are the same (shouldn't happen, but safety check)
    if (oldName === newName) {
      results.push({
        configPath,
        oldName,
        newName,
        migrated: false,
        reason: 'Names are identical',
      });
      continue;
    }

    // Try to read from old name
    const value = await backend.get(oldName);
    if (value === null) {
      results.push({
        configPath,
        oldName,
        newName,
        migrated: false,
        reason: 'No value found at old name',
      });
      continue;
    }

    // Check if new name already exists
    const existingNew = await backend.get(newName);
    if (existingNew !== null) {
      // Delete old one since new one exists
      await backend.delete(oldName);
      results.push({
        configPath,
        oldName,
        newName,
        migrated: true,
        reason: 'Deleted old (new already existed)',
      });
      continue;
    }

    // Write to new name
    await backend.set(newName, value);

    // Delete old name
    await backend.delete(oldName);

    results.push({
      configPath,
      oldName,
      newName,
      migrated: true,
    });
  }

  return results;
}
