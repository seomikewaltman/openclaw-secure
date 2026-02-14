import { describe, it, expect } from 'vitest';
import { migrateKeys, LEGACY_KEY_NAMES } from '../src/index.js';
import { pathToKeychainName } from '../src/discovery.js';
import type { SecretBackend } from '../src/backends/index.js';

/** In-memory mock backend */
function createMockBackend(initial: Record<string, string> = {}): SecretBackend {
  const store = new Map(Object.entries(initial));
  return {
    name: 'mock',
    available: async () => true,
    get: async (key) => store.get(key) ?? null,
    set: async (key, value) => { store.set(key, value); },
    delete: async (key) => { store.delete(key); },
    list: async () => [...store.keys()],
  };
}

describe('LEGACY_KEY_NAMES', () => {
  it('contains expected legacy mappings', () => {
    expect(LEGACY_KEY_NAMES['skills.entries.openai-whisper-api.apiKey']).toBe('whisper-api-key');
    expect(LEGACY_KEY_NAMES['tools.web.search.apiKey']).toBe('brave-search-api-key');
  });

  it('legacy names differ from auto-generated names', () => {
    for (const [configPath, legacyName] of Object.entries(LEGACY_KEY_NAMES)) {
      const newName = pathToKeychainName(configPath);
      expect(legacyName).not.toBe(newName);
    }
  });
});

describe('migrateKeys', () => {
  it('migrates secrets from old names to new names', async () => {
    const backend = createMockBackend({
      'whisper-api-key': 'sk-whisper-secret-value',
      'brave-search-api-key': 'brave-api-key-value',
    });

    const results = await migrateKeys(backend);

    // Check results
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.migrated)).toBe(true);

    // Check old names are gone
    expect(await backend.get('whisper-api-key')).toBeNull();
    expect(await backend.get('brave-search-api-key')).toBeNull();

    // Check new names exist
    expect(await backend.get('openai-whisper-api-api-key')).toBe('sk-whisper-secret-value');
    expect(await backend.get('search-api-key')).toBe('brave-api-key-value');
  });

  it('skips migration when old name has no value', async () => {
    const backend = createMockBackend({});

    const results = await migrateKeys(backend);

    expect(results.every((r) => !r.migrated)).toBe(true);
    expect(results.every((r) => r.reason === 'No value found at old name')).toBe(true);
  });

  it('deletes old name when new name already exists', async () => {
    const backend = createMockBackend({
      'whisper-api-key': 'old-value',
      'openai-whisper-api-api-key': 'new-value-already-here',
    });

    const results = await migrateKeys(backend);

    const whisperResult = results.find((r) => r.oldName === 'whisper-api-key');
    expect(whisperResult?.migrated).toBe(true);
    expect(whisperResult?.reason).toContain('new already existed');

    // Old name should be deleted
    expect(await backend.get('whisper-api-key')).toBeNull();

    // New name should keep existing value
    expect(await backend.get('openai-whisper-api-api-key')).toBe('new-value-already-here');
  });

  it('handles partial migration (some keys present, some not)', async () => {
    const backend = createMockBackend({
      'whisper-api-key': 'sk-whisper-value',
      // brave-search-api-key not present
    });

    const results = await migrateKeys(backend);

    const whisperResult = results.find((r) => r.oldName === 'whisper-api-key');
    const braveResult = results.find((r) => r.oldName === 'brave-search-api-key');

    expect(whisperResult?.migrated).toBe(true);
    expect(braveResult?.migrated).toBe(false);
    expect(braveResult?.reason).toBe('No value found at old name');
  });
});
