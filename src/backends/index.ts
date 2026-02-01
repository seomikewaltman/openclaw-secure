/**
 * Backend registry — factory and discovery for all secret backends.
 */

import type { SecretBackend, BackendOptions } from './types.js';
import { KeychainBackend } from './keychain.js';
import { OnePasswordBackend } from './onepassword.js';
import { BitwardenBackend } from './bitwarden.js';
import { LastPassBackend } from './lastpass.js';
import { AwsSecretsBackend } from './aws-secrets.js';
import { GCloudSecretsBackend } from './gcloud-secrets.js';
import { AzureKeyVaultBackend } from './azure-keyvault.js';
import { PassBackend } from './pass.js';
import { DopplerBackend } from './doppler.js';
import { VaultBackend } from './vault.js';

export type { SecretBackend, BackendOptions } from './types.js';
export {
  KeychainBackend,
  OnePasswordBackend,
  BitwardenBackend,
  LastPassBackend,
  AwsSecretsBackend,
  GCloudSecretsBackend,
  AzureKeyVaultBackend,
  PassBackend,
  DopplerBackend,
  VaultBackend,
};

/** All supported backend names */
export const BACKEND_NAMES = [
  'keychain', '1password', 'bitwarden', 'lastpass',
  'aws', 'gcloud', 'azure', 'pass', 'doppler', 'vault',
] as const;

export type BackendName = (typeof BACKEND_NAMES)[number];

/** Create a backend instance by name */
export function createBackend(name: string, options: BackendOptions = {}): SecretBackend {
  switch (name) {
    case 'keychain':    return new KeychainBackend(options);
    case '1password':   return new OnePasswordBackend(options);
    case 'bitwarden':   return new BitwardenBackend(options);
    case 'lastpass':    return new LastPassBackend(options);
    case 'aws':         return new AwsSecretsBackend(options);
    case 'gcloud':      return new GCloudSecretsBackend(options);
    case 'azure':       return new AzureKeyVaultBackend(options);
    case 'pass':        return new PassBackend(options);
    case 'doppler':     return new DopplerBackend(options);
    case 'vault':       return new VaultBackend(options);
    default:
      throw new Error(`Unknown backend "${name}". Supported: ${BACKEND_NAMES.join(', ')}`);
  }
}
