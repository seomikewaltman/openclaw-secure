import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { storeKeys, restoreKeys, scrubKeys, checkKeys } from '../src/index.js';
import { KEYCHAIN_PLACEHOLDER } from '../src/constants.js';
import type { SecretBackend } from '../src/backends/index.js';
import type { SecretMap } from '../src/types.js';

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

const testSecretMap: SecretMap = [
  { configPath: 'channels.telegram.botToken', keychainName: 'telegram-bot-token' },
  { configPath: 'gateway.auth.token', keychainName: 'gateway-auth-token' },
];

const braveSearchSecretMap: SecretMap = [
  { configPath: 'tools.web.search.apiKey', keychainName: 'brave-search-api-key' },
];

const slackSecretMap: SecretMap = [
  { configPath: 'channels.slack.appToken', keychainName: 'slack-app-token' },
  { configPath: 'channels.slack.botToken', keychainName: 'slack-bot-token' },
];

const sagSecretMap: SecretMap = [
  { configPath: 'skills.entries.sag.apiKey', keychainName: 'sag-api-key' },
];

describe('storeKeys', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'oc-store-'));
    configPath = join(tmpDir, 'openclaw.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('stores keys and replaces with placeholders', async () => {
    const config = {
      channels: { telegram: { botToken: 'real-token-123' } },
      gateway: { auth: { token: 'gw-secret' } },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const backend = createMockBackend();
    const results = await storeKeys(configPath, testSecretMap, backend);

    expect(results).toHaveLength(2);
    expect(results[0].stored).toBe(true);
    expect(results[1].stored).toBe(true);

    // Config was scrubbed
    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written.channels.telegram.botToken).toBe(KEYCHAIN_PLACEHOLDER);
    expect(written.gateway.auth.token).toBe(KEYCHAIN_PLACEHOLDER);

    // Backend has the values
    expect(await backend.get('telegram-bot-token')).toBe('real-token-123');
    expect(await backend.get('gateway-auth-token')).toBe('gw-secret');
  });

  it('skips already-stored keys', async () => {
    const config = {
      channels: { telegram: { botToken: KEYCHAIN_PLACEHOLDER } },
      gateway: { auth: { token: 'gw-secret' } },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const backend = createMockBackend();
    const results = await storeKeys(configPath, testSecretMap, backend);
    expect(results[0].skipped).toBe(true);
    expect(results[0].reason).toContain('Already stored');
    expect(results[1].stored).toBe(true);
  });

  it('skips missing config paths', async () => {
    const config = { gateway: { auth: { token: 'gw-secret' } } };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const backend = createMockBackend();
    const results = await storeKeys(configPath, testSecretMap, backend);
    expect(results[0].skipped).toBe(true);
    expect(results[0].reason).toContain('not found');
  });

  it('skips non-string values', async () => {
    const config = {
      channels: { telegram: { botToken: 12345 } },
      gateway: { auth: { token: 'gw-secret' } },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const backend = createMockBackend();
    const results = await storeKeys(configPath, testSecretMap, backend);
    expect(results[0].skipped).toBe(true);
    expect(results[0].reason).toContain('not a string');
  });
});

describe('restoreKeys', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'oc-restore-'));
    configPath = join(tmpDir, 'openclaw.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('restores keys from backend to config', async () => {
    const config = {
      channels: { telegram: { botToken: KEYCHAIN_PLACEHOLDER } },
      gateway: { auth: { token: KEYCHAIN_PLACEHOLDER } },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const backend = createMockBackend({
      'telegram-bot-token': 'real-token-123',
      'gateway-auth-token': 'gw-secret',
    });

    await restoreKeys(configPath, testSecretMap, backend);

    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written.channels.telegram.botToken).toBe('real-token-123');
    expect(written.gateway.auth.token).toBe('gw-secret');
  });

  it('leaves config alone when key not in backend', async () => {
    const config = {
      channels: { telegram: { botToken: KEYCHAIN_PLACEHOLDER } },
      gateway: { auth: { token: KEYCHAIN_PLACEHOLDER } },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const backend = createMockBackend({
      'telegram-bot-token': 'real-token',
      // gateway-auth-token missing
    });

    await restoreKeys(configPath, testSecretMap, backend);

    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written.channels.telegram.botToken).toBe('real-token');
    expect(written.gateway.auth.token).toBe(KEYCHAIN_PLACEHOLDER);
  });
});

describe('scrubKeys', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'oc-scrub-'));
    configPath = join(tmpDir, 'openclaw.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('replaces real values with placeholders', async () => {
    const config = {
      channels: { telegram: { botToken: 'real-token' } },
      gateway: { auth: { token: 'gw-secret' } },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    await scrubKeys(configPath, testSecretMap);

    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written.channels.telegram.botToken).toBe(KEYCHAIN_PLACEHOLDER);
    expect(written.gateway.auth.token).toBe(KEYCHAIN_PLACEHOLDER);
  });

  it('leaves already-placeholder values alone', async () => {
    const config = {
      channels: { telegram: { botToken: KEYCHAIN_PLACEHOLDER } },
      gateway: { auth: { token: 'real-secret' } },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    await scrubKeys(configPath, testSecretMap);

    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written.channels.telegram.botToken).toBe(KEYCHAIN_PLACEHOLDER);
    expect(written.gateway.auth.token).toBe(KEYCHAIN_PLACEHOLDER);
  });
});

describe('checkKeys', () => {
  it('reports which keys exist', async () => {
    const backend = createMockBackend({
      'telegram-bot-token': 'token-value',
    });

    const results = await checkKeys(testSecretMap, backend);
    expect(results).toHaveLength(2);
    expect(results[0].exists).toBe(true);
    expect(results[0].keychainName).toBe('telegram-bot-token');
    expect(results[1].exists).toBe(false);
    expect(results[1].keychainName).toBe('gateway-auth-token');
  });

  it('reports all present when all exist', async () => {
    const backend = createMockBackend({
      'telegram-bot-token': 'tok',
      'gateway-auth-token': 'gw',
    });

    const results = await checkKeys(testSecretMap, backend);
    expect(results.every((r) => r.exists)).toBe(true);
  });
});

describe('Brave Search API key (issue #1)', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'oc-brave-'));
    configPath = join(tmpDir, 'openclaw.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('stores Brave Search API key and replaces with placeholder', async () => {
    const config = {
      tools: { web: { search: { enabled: true, apiKey: 'BSA1234567890abcdef' } } },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const backend = createMockBackend();
    const results = await storeKeys(configPath, braveSearchSecretMap, backend);

    expect(results).toHaveLength(1);
    expect(results[0].stored).toBe(true);

    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written.tools.web.search.apiKey).toBe(KEYCHAIN_PLACEHOLDER);
    expect(await backend.get('brave-search-api-key')).toBe('BSA1234567890abcdef');
  });

  it('restores Brave Search API key from backend', async () => {
    const config = {
      tools: { web: { search: { enabled: true, apiKey: KEYCHAIN_PLACEHOLDER } } },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const backend = createMockBackend({
      'brave-search-api-key': 'BSA1234567890abcdef',
    });

    await restoreKeys(configPath, braveSearchSecretMap, backend);

    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written.tools.web.search.apiKey).toBe('BSA1234567890abcdef');
  });

  it('scrubs Brave Search API key from config', async () => {
    const config = {
      tools: { web: { search: { enabled: true, apiKey: 'BSA1234567890abcdef' } } },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    await scrubKeys(configPath, braveSearchSecretMap);

    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written.tools.web.search.apiKey).toBe(KEYCHAIN_PLACEHOLDER);
  });

  it('checks Brave Search API key exists in backend', async () => {
    const backend = createMockBackend({
      'brave-search-api-key': 'BSA1234567890abcdef',
    });

    const results = await checkKeys(braveSearchSecretMap, backend);
    expect(results).toHaveLength(1);
    expect(results[0].exists).toBe(true);
    expect(results[0].keychainName).toBe('brave-search-api-key');
  });
});

describe('Slack channel secrets', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'oc-slack-'));
    configPath = join(tmpDir, 'openclaw.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('stores Slack app token and bot token and replaces with placeholders', async () => {
    const config = {
      channels: {
        slack: {
          appToken: 'test-slack-app-token-value',
          botToken: 'test-slack-bot-token-value',
        },
      },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const backend = createMockBackend();
    const results = await storeKeys(configPath, slackSecretMap, backend);

    expect(results).toHaveLength(2);
    expect(results[0].stored).toBe(true);
    expect(results[1].stored).toBe(true);

    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written.channels.slack.appToken).toBe(KEYCHAIN_PLACEHOLDER);
    expect(written.channels.slack.botToken).toBe(KEYCHAIN_PLACEHOLDER);

    expect(await backend.get('slack-app-token')).toBe('test-slack-app-token-value');
    expect(await backend.get('slack-bot-token')).toBe('test-slack-bot-token-value');
  });

  it('restores Slack tokens from backend', async () => {
    const config = {
      channels: {
        slack: {
          appToken: KEYCHAIN_PLACEHOLDER,
          botToken: KEYCHAIN_PLACEHOLDER,
        },
      },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const backend = createMockBackend({
      'slack-app-token': 'xapp-restored-token',
      'slack-bot-token': 'xoxb-restored-token',
    });

    await restoreKeys(configPath, slackSecretMap, backend);

    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written.channels.slack.appToken).toBe('xapp-restored-token');
    expect(written.channels.slack.botToken).toBe('xoxb-restored-token');
  });

  it('scrubs Slack tokens from config', async () => {
    const config = {
      channels: {
        slack: {
          appToken: 'xapp-secret-token',
          botToken: 'xoxb-secret-token',
        },
      },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    await scrubKeys(configPath, slackSecretMap);

    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written.channels.slack.appToken).toBe(KEYCHAIN_PLACEHOLDER);
    expect(written.channels.slack.botToken).toBe(KEYCHAIN_PLACEHOLDER);
  });

  it('checks Slack tokens exist in backend', async () => {
    const backend = createMockBackend({
      'slack-app-token': 'xapp-token',
      'slack-bot-token': 'xoxb-token',
    });

    const results = await checkKeys(slackSecretMap, backend);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.exists)).toBe(true);
  });

  it('handles partial Slack config (only bot token)', async () => {
    const config = {
      channels: {
        slack: {
          botToken: 'test-only-bot-token',
        },
      },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const backend = createMockBackend();
    const results = await storeKeys(configPath, slackSecretMap, backend);

    expect(results[0].skipped).toBe(true);
    expect(results[0].reason).toContain('not found');
    expect(results[1].stored).toBe(true);

    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written.channels.slack.botToken).toBe(KEYCHAIN_PLACEHOLDER);
    expect(await backend.get('slack-bot-token')).toBe('test-only-bot-token');
  });
});

describe('SAG (Skills API Gateway) secret', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'oc-sag-'));
    configPath = join(tmpDir, 'openclaw.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('stores SAG API key and replaces with placeholder', async () => {
    const config = {
      skills: {
        entries: {
          sag: {
            apiKey: 'sag-secret-key-12345',
            enabled: true,
          },
        },
      },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const backend = createMockBackend();
    const results = await storeKeys(configPath, sagSecretMap, backend);

    expect(results).toHaveLength(1);
    expect(results[0].stored).toBe(true);

    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written.skills.entries.sag.apiKey).toBe(KEYCHAIN_PLACEHOLDER);
    expect(await backend.get('sag-api-key')).toBe('sag-secret-key-12345');
  });

  it('restores SAG API key from backend', async () => {
    const config = {
      skills: {
        entries: {
          sag: {
            apiKey: KEYCHAIN_PLACEHOLDER,
            enabled: true,
          },
        },
      },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const backend = createMockBackend({
      'sag-api-key': 'sag-restored-key',
    });

    await restoreKeys(configPath, sagSecretMap, backend);

    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written.skills.entries.sag.apiKey).toBe('sag-restored-key');
  });

  it('scrubs SAG API key from config', async () => {
    const config = {
      skills: {
        entries: {
          sag: {
            apiKey: 'sag-secret-key',
            enabled: true,
          },
        },
      },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    await scrubKeys(configPath, sagSecretMap);

    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written.skills.entries.sag.apiKey).toBe(KEYCHAIN_PLACEHOLDER);
  });

  it('checks SAG API key exists in backend', async () => {
    const backend = createMockBackend({
      'sag-api-key': 'sag-key-value',
    });

    const results = await checkKeys(sagSecretMap, backend);
    expect(results).toHaveLength(1);
    expect(results[0].exists).toBe(true);
    expect(results[0].keychainName).toBe('sag-api-key');
  });

  it('skips SAG when skills.entries.sag not configured', async () => {
    const config = {
      skills: {
        entries: {
          'openai-whisper-api': {
            apiKey: 'whisper-key',
          },
        },
      },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const backend = createMockBackend();
    const results = await storeKeys(configPath, sagSecretMap, backend);

    expect(results[0].skipped).toBe(true);
    expect(results[0].reason).toContain('not found');
  });
});
