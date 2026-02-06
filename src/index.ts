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

// Constants
export {
  KEYCHAIN_PLACEHOLDER,
  DEFAULT_CONFIG_PATH,
  DEFAULT_SECRET_MAP,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_BACKEND,
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
import { KEYCHAIN_PLACEHOLDER } from './constants.js';
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
