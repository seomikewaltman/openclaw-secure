/** Maps a key name to a dot-path in the config JSON */
export interface SecretEntry {
  /** Dot-separated path into openclaw.json (e.g. "channels.telegram.botToken") */
  configPath: string;
  /** Short key identifier (e.g. "telegram-bot-token") */
  keychainName: string;
}

/** A complete secret map is an array of entries */
export type SecretMap = SecretEntry[];

/** Result of checking a single key's presence in the backend */
export interface KeyCheckResult {
  keychainName: string;
  configPath: string;
  exists: boolean;
}

/** Result of a store operation for a single key */
export interface StoreResult {
  keychainName: string;
  configPath: string;
  stored: boolean;
  skipped: boolean;
  reason?: string;
}

/** Options for the start command */
export interface StartOptions {
  configPath: string;
  secretMap: SecretMap;
  timeoutMs: number;
  gatewayCommand?: string;
}
