import { describe, it, expect } from 'vitest';
import {
  discoverSecrets,
  pathToKeychainName,
  discoveredToSecretMap,
} from '../src/discovery.js';
import { KEYCHAIN_PLACEHOLDER } from '../src/constants.js';

describe('pathToKeychainName', () => {
  it('converts simple channel path', () => {
    expect(pathToKeychainName('channels.telegram.botToken')).toBe('telegram-bot-token');
  });

  it('converts nested account path', () => {
    expect(pathToKeychainName('channels.telegram.accounts.main.botToken')).toBe('telegram-main-bot-token');
  });

  it('converts skill path', () => {
    expect(pathToKeychainName('skills.entries.openai-whisper-api.apiKey')).toBe('openai-whisper-api-api-key');
  });

  it('converts gateway path', () => {
    expect(pathToKeychainName('gateway.auth.token')).toBe('gateway-auth-token');
  });

  it('converts tools path', () => {
    expect(pathToKeychainName('tools.web.search.apiKey')).toBe('search-api-key');
  });

  it('converts camelCase to kebab-case', () => {
    expect(pathToKeychainName('channels.slack.signingSecret')).toBe('slack-signing-secret');
  });

  it('skips array indices', () => {
    expect(pathToKeychainName('tools.media.models.0.apiKey')).toBe('models-api-key');
  });
});

describe('discoverSecrets', () => {
  it('finds top-level channel tokens', () => {
    const config = {
      channels: {
        telegram: {
          botToken: 'abc123456789012345678901234567890',
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(1);
    expect(secrets[0]).toMatchObject({
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
            main: { botToken: 'abc123456789012345678901234567890' },
            backup: { botToken: 'def456789012345678901234567890abc' },
          },
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(2);
    expect(secrets.map((s) => s.keychainName)).toContain('telegram-main-bot-token');
    expect(secrets.map((s) => s.keychainName)).toContain('telegram-backup-bot-token');
  });

  it('finds dynamic skill apiKeys', () => {
    const config = {
      skills: {
        entries: {
          'my-custom-skill': { apiKey: 'sk-abc123456789012345678901234567890' },
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(1);
    expect(secrets[0].keychainName).toBe('my-custom-skill-api-key');
  });

  it('finds skill env vars', () => {
    const config = {
      skills: {
        entries: {
          'my-skill': {
            env: {
              SECRET_TOKEN: 'secret-token-value-1234567890',
              API_KEY: 'api-key-value-123456789012345',
            },
          },
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(2);
    expect(secrets.map((s) => s.configPath)).toContain('skills.entries.my-skill.env.SECRET_TOKEN');
    expect(secrets.map((s) => s.configPath)).toContain('skills.entries.my-skill.env.API_KEY');
  });

  it('finds skill config nested secrets', () => {
    const config = {
      skills: {
        entries: {
          'my-skill': {
            config: {
              webhookSecret: 'webhook-secret-12345678901234',
              apiToken: 'api-token-value-123456789012345',
              enabled: true, // Should be ignored (not a secret)
              timeout: 5000, // Should be ignored (not a string)
            },
          },
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(2);
    expect(secrets.map((s) => s.configPath)).toContain('skills.entries.my-skill.config.webhookSecret');
    expect(secrets.map((s) => s.configPath)).toContain('skills.entries.my-skill.config.apiToken');
  });

  it('finds deeply nested skill config secrets', () => {
    const config = {
      skills: {
        entries: {
          'my-skill': {
            config: {
              auth: {
                oauth: {
                  clientSecret: 'client-secret-value-12345678',
                },
              },
            },
          },
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(1);
    expect(secrets[0].configPath).toBe('skills.entries.my-skill.config.auth.oauth.clientSecret');
  });

  it('finds custom model provider apiKeys', () => {
    const config = {
      models: {
        providers: {
          'my-openrouter': {
            baseUrl: 'https://openrouter.ai/api/v1',
            apiKey: 'sk-or-v1-abc12345678901234567890',
          },
          'custom-anthropic': {
            baseUrl: 'https://api.anthropic.com',
            apiKey: 'sk-ant-api-key-123456789012345',
          },
          'local-ollama': {
            baseUrl: 'http://localhost:11434',
            // no apiKey
          },
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(2);
    expect(secrets.map((s) => s.configPath)).toContain('models.providers.my-openrouter.apiKey');
    expect(secrets.map((s) => s.configPath)).toContain('models.providers.custom-anthropic.apiKey');
  });

  it('finds memory search remote apiKey', () => {
    const config = {
      tools: {
        memorySearch: {
          remote: {
            apiKey: 'voyage-api-key-123456789012345',
          },
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(1);
    expect(secrets[0].configPath).toBe('tools.memorySearch.remote.apiKey');
  });

  it('finds gateway auth token', () => {
    const config = {
      gateway: {
        auth: {
          token: 'abc123456789012345678901234567890def',
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(1);
    expect(secrets[0]).toMatchObject({
      configPath: 'gateway.auth.token',
      matchType: 'known-path',
    });
  });

  it('finds gateway auth password', () => {
    const config = {
      gateway: {
        auth: {
          password: 'secretpassword123456',
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(1);
    expect(secrets[0].configPath).toBe('gateway.auth.password');
  });

  it('finds TTS apiKeys', () => {
    const config = {
      tts: {
        elevenlabs: {
          apiKey: 'sk-elevenlabs-1234567890123456',
        },
        openai: {
          apiKey: 'sk-openai-12345678901234567890',
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(2);
    expect(secrets.map((s) => s.configPath)).toContain('tts.elevenlabs.apiKey');
    expect(secrets.map((s) => s.configPath)).toContain('tts.openai.apiKey');
  });

  it('finds tools apiKeys', () => {
    const config = {
      tools: {
        web: {
          search: {
            apiKey: 'brave-search-api-key-123456789',
          },
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(1);
    expect(secrets[0].configPath).toBe('tools.web.search.apiKey');
  });

  it('ignores tokenFile paths', () => {
    const config = {
      channels: {
        telegram: {
          tokenFile: '/path/to/token/file/that/is/long/enough',
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(0);
  });

  it('ignores already-stored placeholders', () => {
    const config = {
      channels: {
        telegram: {
          botToken: KEYCHAIN_PLACEHOLDER,
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(0);
  });

  it('ignores short values', () => {
    const config = {
      channels: {
        telegram: {
          botToken: 'short', // Less than MIN_SECRET_LENGTH
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(0);
  });

  it('respects excludePaths option', () => {
    const config = {
      channels: {
        dev: { botToken: 'dev-token-1234567890123456789' },
        prod: { botToken: 'prod-token-123456789012345678' },
      },
    };
    const secrets = discoverSecrets(config, { excludePaths: ['channels.dev.*'] });
    expect(secrets).toHaveLength(1);
    expect(secrets[0].configPath).toBe('channels.prod.botToken');
  });

  it('respects additionalPaths option', () => {
    const config = {
      custom: {
        integration: {
          secret: 'custom-secret-value-123456789',
        },
      },
    };
    // Without additionalPaths, 'secret' alone might not match
    const secrets = discoverSecrets(config, {
      additionalPaths: ['custom.integration.secret'],
    });
    expect(secrets).toHaveLength(1);
    expect(secrets[0].configPath).toBe('custom.integration.secret');
  });

  it('finds secrets by key pattern (webhookSecret)', () => {
    const config = {
      channels: {
        telegram: {
          webhookSecret: 'webhook-secret-value-1234567890',
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(1);
    expect(secrets[0].matchType).toBe('known-path');
  });

  it('finds secrets by key pattern (signingSecret)', () => {
    const config = {
      channels: {
        slack: {
          signingSecret: 'signing-secret-value-1234567890',
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(1);
  });

  it('finds Slack multiple tokens', () => {
    const config = {
      channels: {
        slack: {
          botToken: 'xoxb-slack-bot-token-1234567890',
          appToken: 'xapp-slack-app-token-1234567890',
          userToken: 'xoxp-slack-user-token-123456789',
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(3);
  });

  it('finds Discord token', () => {
    const config = {
      channels: {
        discord: {
          token: 'discord-bot-token-value-12345678',
        },
      },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(1);
    expect(secrets[0].configPath).toBe('channels.discord.token');
  });

  it('handles empty config', () => {
    const secrets = discoverSecrets({});
    expect(secrets).toHaveLength(0);
  });

  it('handles nested empty objects', () => {
    const config = {
      channels: {},
      skills: { entries: {} },
    };
    const secrets = discoverSecrets(config);
    expect(secrets).toHaveLength(0);
  });

  it('sorts results by path', () => {
    const config = {
      channels: {
        telegram: { botToken: 'telegram-token-1234567890123' },
        discord: { token: 'discord-token-12345678901234' },
      },
      gateway: {
        auth: { token: 'gateway-token-123456789012345' },
      },
    };
    const secrets = discoverSecrets(config);
    const paths = secrets.map((s) => s.configPath);
    expect(paths).toEqual([...paths].sort());
  });

  it('finds value patterns when includeUnknownPatterns is true', () => {
    const config = {
      custom: {
        field: 'sk-proj-1234567890123456789012345678901234567890',
      },
    };
    // Without includeUnknownPatterns, 'field' won't match
    const secretsWithout = discoverSecrets(config, { includeUnknownPatterns: false });
    expect(secretsWithout).toHaveLength(0);

    const secretsWith = discoverSecrets(config, { includeUnknownPatterns: true });
    expect(secretsWith).toHaveLength(1);
    expect(secretsWith[0].matchType).toBe('value-pattern');
  });
});

describe('discoveredToSecretMap', () => {
  it('converts discovered secrets to SecretMap format', () => {
    const discovered = [
      {
        configPath: 'channels.telegram.botToken',
        keychainName: 'telegram-bot-token',
        matchType: 'known-path' as const,
        value: 'test-value',
      },
    ];
    const secretMap = discoveredToSecretMap(discovered);
    expect(secretMap).toHaveLength(1);
    expect(secretMap[0]).toEqual({
      configPath: 'channels.telegram.botToken',
      keychainName: 'telegram-bot-token',
    });
    // Value should not be in the SecretMap
    expect('value' in secretMap[0]).toBe(false);
  });
});
