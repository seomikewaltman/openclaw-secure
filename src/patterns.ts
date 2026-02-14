/**
 * Secret detection patterns for auto-discovery.
 */

/** Field names that indicate secrets (suffix patterns, case-insensitive) */
export const SECRET_KEY_SUFFIXES = [
  'token',
  'apikey',
  'secret',
  'password',
  'credential',
];

/** Exact field names that are always secrets */
export const SECRET_KEY_EXACT = new Set([
  'apiKey',
  'token',
  'password',
  'secret',
  'botToken',
  'appToken',
  'userToken',
  'webhookSecret',
  'signingSecret',
]);

/** Field names to explicitly EXCLUDE (false positives) */
export const SECRET_KEY_EXCLUDE = new Set([
  'tokenFile',        // Path to file, not a secret itself
  'mode',             // "token" is a mode value, not a secret
  'tlsFingerprint',   // Fingerprint, not a secret
  'sessionPrefix',    // Just a prefix string
]);

/** Known value patterns for secrets (for optional validation) */
export const SECRET_VALUE_PATTERNS: RegExp[] = [
  /^sk-[a-zA-Z0-9-_]{20,}$/,                    // OpenAI keys
  /^sk-proj-[a-zA-Z0-9-_]{20,}$/,               // OpenAI project keys
  /^xox[baprs]-[a-zA-Z0-9-]+$/,                 // Slack tokens
  /^[0-9]+:[A-Za-z0-9_-]{30,}$/,                // Telegram bot tokens
  /^ghp_[a-zA-Z0-9]{20,}$/,                     // GitHub PATs
  /^gho_[a-zA-Z0-9]{20,}$/,                     // GitHub OAuth
  /^glpat-[a-zA-Z0-9-_]{20,}$/,                 // GitLab PATs
  /^AKIA[A-Z0-9]{16}$/,                         // AWS Access Keys
  /^AIza[a-zA-Z0-9-_]{35}$/,                    // Google API keys
  /^[a-f0-9]{32,64}$/,                          // Hex tokens (gateway, webhooks)
];

/** Minimum length for a string to be considered a potential secret */
export const MIN_SECRET_LENGTH = 16;

/** Known secret paths (always treated as secrets) */
export const KNOWN_SECRET_PATHS = new Set([
  // Gateway
  'gateway.auth.token',
  'gateway.auth.password',
  'gateway.remote.token',
  'gateway.remote.password',

  // TTS
  'tts.elevenlabs.apiKey',
  'tts.openai.apiKey',

  // Tools
  'tools.web.search.apiKey',
  'tools.web.search.perplexity.apiKey',
  'tools.web.search.grok.apiKey',
  'tools.web.fetch.firecrawl.apiKey',
  'tools.memorySearch.remote.apiKey',
]);

/** Path patterns (regex) for dynamic secret paths */
export const KNOWN_SECRET_PATH_PATTERNS: RegExp[] = [
  // Channel tokens (top-level)
  /^channels\.[^.]+\.botToken$/,
  /^channels\.[^.]+\.appToken$/,
  /^channels\.[^.]+\.userToken$/,
  /^channels\.[^.]+\.token$/,
  /^channels\.[^.]+\.webhookSecret$/,
  /^channels\.[^.]+\.signingSecret$/,

  // Channel tokens (nested in accounts.*)
  /^channels\.[^.]+\.accounts\.[^.]+\.botToken$/,
  /^channels\.[^.]+\.accounts\.[^.]+\.appToken$/,
  /^channels\.[^.]+\.accounts\.[^.]+\.userToken$/,
  /^channels\.[^.]+\.accounts\.[^.]+\.token$/,
  /^channels\.[^.]+\.accounts\.[^.]+\.webhookSecret$/,
  /^channels\.[^.]+\.accounts\.[^.]+\.signingSecret$/,

  // Skills - direct apiKey
  /^skills\.entries\.[^.]+\.apiKey$/,

  // Skills - env vars (all env vars treated as potential secrets)
  /^skills\.entries\.[^.]+\.env\.[^.]+$/,

  // Skills - nested config secrets
  /^skills\.entries\.[^.]+\.config\..+(?:token|apikey|secret|password|credential)$/i,

  // Media understanding models
  /^tools\.media\.[^.]+\.models\.\d+\.apiKey$/,
  /^tools\.media\.models\.\d+\.apiKey$/,

  // Custom model providers
  /^models\.providers\.[^.]+\.apiKey$/,

  // Memory search remote
  /^tools\.memorySearch\.remote\.apiKey$/,
];

/**
 * Check if a path is a known secret path.
 */
export function isKnownSecretPath(path: string): boolean {
  if (KNOWN_SECRET_PATHS.has(path)) return true;
  return KNOWN_SECRET_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if a key name indicates a secret field.
 */
export function isSecretKeyName(key: string): boolean {
  if (SECRET_KEY_EXCLUDE.has(key)) return false;
  if (SECRET_KEY_EXACT.has(key)) return true;

  const lowerKey = key.toLowerCase();
  return SECRET_KEY_SUFFIXES.some((suffix) => lowerKey.endsWith(suffix));
}

/**
 * Check if a value matches known secret patterns.
 */
export function matchesSecretValuePattern(value: string): boolean {
  if (value.length < MIN_SECRET_LENGTH) return false;
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}
