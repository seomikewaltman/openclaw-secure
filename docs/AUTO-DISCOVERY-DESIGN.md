# Auto-Discovery Design for openclaw-secure

## Problem Statement

The current `openclaw-secure` package uses a hardcoded `DEFAULT_SECRET_MAP` that manually lists specific config paths. This doesn't scale because:

1. **Dynamic arrays** — `channels.telegram.accounts.*` can have multiple accounts
2. **Plugin extensibility** — New channels/skills can add arbitrary secret fields
3. **Nested structures** — `skills.entries.{skillName}.apiKey` is dynamic
4. **Maintenance burden** — Every OpenClaw config change requires updating the map

## Solution: Pattern-Based Auto-Discovery

### Approach

Scan the entire config tree and identify secrets by:
1. **Key name patterns** — Match field names like `*Token`, `apiKey`, `password`, `*Secret`
2. **Value patterns** — Validate against known token formats (`sk-`, `xox`, etc.)
3. **Path context** — Certain paths always contain secrets (e.g., `gateway.auth.token`)

### Secret Field Patterns (from OpenClaw type analysis)

```typescript
// Field names that indicate secrets (case-insensitive suffix matching)
const SECRET_KEY_PATTERNS = [
  /token$/i,           // botToken, appToken, userToken, token
  /apikey$/i,          // apiKey
  /secret$/i,          // webhookSecret, signingSecret
  /password$/i,        // password
  /credential$/i,      // credential
];

// Exact field names that are secrets
const SECRET_KEY_EXACT = new Set([
  'apiKey',
  'token',
  'password',
  'secret',
]);

// Field names to explicitly EXCLUDE (false positives)
const SECRET_KEY_EXCLUDE = new Set([
  'tokenFile',         // Path to file, not a secret itself
  'mode',              // "token" is a mode value, not a secret
  'tlsFingerprint',    // Fingerprint, not a secret
]);
```

### Value Validation Patterns

```typescript
// Known secret value formats (validate after key match)
const SECRET_VALUE_PATTERNS = [
  /^sk-[a-zA-Z0-9-_]{20,}$/,           // OpenAI keys
  /^sk-proj-[a-zA-Z0-9-_]{20,}$/,      // OpenAI project keys
  /^xox[baprs]-[a-zA-Z0-9-]+$/,        // Slack tokens
  /^[0-9]+:[A-Za-z0-9_-]{30,}$/,       // Telegram bot tokens
  /^ghp_[a-zA-Z0-9]{36}$/,             // GitHub PATs
  /^gho_[a-zA-Z0-9]{36}$/,             // GitHub OAuth
  /^glpat-[a-zA-Z0-9-_]{20,}$/,        // GitLab PATs
  /^AKIA[A-Z0-9]{16}$/,                // AWS Access Keys
  /^AIza[a-zA-Z0-9-_]{35}$/,           // Google API keys
  /^[a-f0-9]{32,64}$/,                 // Hex tokens (gateway, webhooks)
  /^[a-zA-Z0-9+/=]{40,}$/,             // Base64-ish secrets
];

// Minimum length for a string to be considered a potential secret
const MIN_SECRET_LENGTH = 16;
```

### Known Secret Paths (from OpenClaw types)

These paths are always secrets regardless of value format:

```typescript
const KNOWN_SECRET_PATHS = [
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
];

// Path patterns (regex) for dynamic paths
const KNOWN_SECRET_PATH_PATTERNS = [
  // Channel tokens (supports accounts.*)
  /^channels\.[^.]+\.botToken$/,
  /^channels\.[^.]+\.appToken$/,
  /^channels\.[^.]+\.userToken$/,
  /^channels\.[^.]+\.token$/,
  /^channels\.[^.]+\.webhookSecret$/,
  /^channels\.[^.]+\.signingSecret$/,
  /^channels\.[^.]+\.accounts\.[^.]+\.botToken$/,
  /^channels\.[^.]+\.accounts\.[^.]+\.appToken$/,
  /^channels\.[^.]+\.accounts\.[^.]+\.userToken$/,
  /^channels\.[^.]+\.accounts\.[^.]+\.token$/,
  /^channels\.[^.]+\.accounts\.[^.]+\.webhookSecret$/,
  /^channels\.[^.]+\.accounts\.[^.]+\.signingSecret$/,
  
  // Skills
  /^skills\.entries\.[^.]+\.apiKey$/,
  
  // Media understanding
  /^tools\.media\.[^.]+\.models\.\d+\.apiKey$/,
];
```

## Implementation

### New Module: `src/discovery.ts`

```typescript
export interface DiscoveredSecret {
  /** Dot-path in config (e.g., "channels.telegram.botToken") */
  configPath: string;
  /** Derived backend key name (e.g., "telegram-bot-token") */
  keychainName: string;
  /** How the secret was identified */
  matchType: 'known-path' | 'key-pattern' | 'value-pattern';
  /** Current value (for validation, not stored) */
  value: string;
}

/**
 * Discover all secrets in an OpenClaw config object.
 */
export function discoverSecrets(
  config: Record<string, unknown>,
  options?: {
    /** Include values that don't match known patterns (risky) */
    includeUnknownPatterns?: boolean;
    /** Custom additional paths to treat as secrets */
    additionalPaths?: string[];
    /** Paths to explicitly exclude */
    excludePaths?: string[];
  }
): DiscoveredSecret[];

/**
 * Generate a keychain name from a config path.
 * "channels.telegram.accounts.main.botToken" → "telegram-main-bot-token"
 */
export function pathToKeychainName(configPath: string): string;
```

### Algorithm

```typescript
function discoverSecrets(config: Record<string, unknown>): DiscoveredSecret[] {
  const secrets: DiscoveredSecret[] = [];
  
  function walk(obj: unknown, path: string[] = []): void {
    if (obj === null || obj === undefined) return;
    
    if (typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [key, value] of Object.entries(obj)) {
        walk(value, [...path, key]);
      }
      return;
    }
    
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => walk(item, [...path, String(index)]));
      return;
    }
    
    // Leaf value - check if it's a secret
    if (typeof obj === 'string' && obj.length >= MIN_SECRET_LENGTH) {
      const fullPath = path.join('.');
      const key = path[path.length - 1];
      
      // Skip excluded keys
      if (SECRET_KEY_EXCLUDE.has(key)) return;
      
      // Skip placeholder values
      if (obj === KEYCHAIN_PLACEHOLDER) return;
      
      // Check known paths first
      if (isKnownSecretPath(fullPath)) {
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
        secrets.push({
          configPath: fullPath,
          keychainName: pathToKeychainName(fullPath),
          matchType: 'key-pattern',
          value: obj,
        });
        return;
      }
      
      // Optionally check value patterns
      if (options?.includeUnknownPatterns && matchesSecretValuePattern(obj)) {
        secrets.push({
          configPath: fullPath,
          keychainName: pathToKeychainName(fullPath),
          matchType: 'value-pattern',
          value: obj,
        });
      }
    }
  }
  
  walk(config);
  return secrets;
}
```

### Keychain Name Generation

```typescript
function pathToKeychainName(configPath: string): string {
  // "channels.telegram.accounts.main.botToken" → "telegram-main-bot-token"
  // "skills.entries.openai-whisper-api.apiKey" → "openai-whisper-api-api-key"
  // "gateway.auth.token" → "gateway-auth-token"
  
  const parts = configPath.split('.');
  const result: string[] = [];
  
  // Skip common prefixes
  const skipPrefixes = ['channels', 'skills', 'tools', 'accounts', 'entries'];
  
  for (const part of parts) {
    if (skipPrefixes.includes(part)) continue;
    if (/^\d+$/.test(part)) continue; // Skip array indices
    
    // Convert camelCase to kebab-case
    const kebab = part.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    result.push(kebab);
  }
  
  return result.join('-');
}
```

## CLI Changes

### New `discover` command

```bash
# Show all discovered secrets
openclaw-secure discover

# Output:
# 🔍 Discovered 5 secrets in ~/.openclaw/openclaw.json
#
#   channels.telegram.botToken → telegram-bot-token (known-path)
#   gateway.auth.token → gateway-auth-token (known-path)
#   skills.entries.openai-whisper-api.apiKey → openai-whisper-api-api-key (key-pattern)
#   ...

# Store all discovered secrets
openclaw-secure store --auto

# Check discovered vs stored
openclaw-secure check --auto
```

### Updated `store` command

```bash
# Use auto-discovery instead of hardcoded map
openclaw-secure store --auto

# Combine auto-discovery with additional manual paths
openclaw-secure store --auto --also "custom.path.secret"

# Exclude specific paths from auto-discovery
openclaw-secure store --auto --exclude "channels.test.*"
```

## Preferences Extension

```json
{
  "backend": "1password",
  "vault": "Private",
  "discovery": {
    "enabled": true,
    "includeUnknownPatterns": false,
    "additionalPaths": [
      "custom.integration.apiKey"
    ],
    "excludePaths": [
      "channels.dev.*"
    ]
  }
}
```

## Migration Path

1. **v1.3.0** — Add `discover` command and `--auto` flag
2. **v1.4.0** — Make `--auto` the default behavior
3. **v2.0.0** — Remove `DEFAULT_SECRET_MAP` entirely

## Security Considerations

1. **False positives** — Better to over-protect than under-protect
2. **False negatives** — Known paths should catch most cases
3. **Value validation** — Optional, helps reduce noise
4. **Explicit excludes** — Let users skip test/dev secrets

## Test Cases

```typescript
describe('discoverSecrets', () => {
  it('finds top-level channel tokens', () => {
    const config = { channels: { telegram: { botToken: 'abc123...' } } };
    const secrets = discoverSecrets(config);
    expect(secrets).toContainEqual({
      configPath: 'channels.telegram.botToken',
      keychainName: 'telegram-bot-token',
      matchType: 'known-path',
    });
  });

  it('finds nested account tokens', () => {
    const config = {
      channels: {
        telegram: {
          accounts: {
            main: { botToken: 'abc123...' },
            backup: { botToken: 'def456...' },
          },
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(2);
  });

  it('finds dynamic skill apiKeys', () => {
    const config = {
      skills: {
        entries: {
          'my-custom-skill': { apiKey: 'sk-abc123...' },
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets[0].keychainName).toBe('my-custom-skill-api-key');
  });

  it('ignores tokenFile paths', () => {
    const config = { channels: { telegram: { tokenFile: '/path/to/token' } } };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(0);
  });

  it('ignores already-stored placeholders', () => {
    const config = { channels: { telegram: { botToken: '[STORED_IN_KEYCHAIN]' } } };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(0);
  });
});
```

## File Structure

```
src/
├── discovery.ts          # NEW: Auto-discovery logic
├── patterns.ts           # NEW: Secret patterns (extracted)
├── constants.ts          # Updated: Import patterns, keep DEFAULT_SECRET_MAP for compat
├── cli.ts                # Updated: Add discover command, --auto flag
├── index.ts              # Updated: Export discovery functions
└── ...
```

## Summary

This design replaces the brittle hardcoded approach with intelligent pattern matching that:

- ✅ Handles dynamic `accounts.*` and `entries.*` structures
- ✅ Catches new secret fields automatically
- ✅ Minimizes false positives with known-path priority
- ✅ Remains backwards compatible with existing workflows
- ✅ Gives users control via excludes and additional paths
