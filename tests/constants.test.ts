import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SECRET_MAP,
  KEYCHAIN_PLACEHOLDER,
  SERVICE_PREFIX,
  DEFAULT_CONFIG_PATH,
  DEFAULT_BACKEND,
  serviceName,
} from '../src/constants.js';

describe('constants', () => {
  describe('DEFAULT_SECRET_MAP', () => {
    it('includes Slack app token', () => {
      const entry = DEFAULT_SECRET_MAP.find(
        (e) => e.configPath === 'channels.slack.appToken'
      );
      expect(entry).toBeDefined();
      expect(entry?.keychainName).toBe('slack-app-token');
    });

    it('includes Slack bot token', () => {
      const entry = DEFAULT_SECRET_MAP.find(
        (e) => e.configPath === 'channels.slack.botToken'
      );
      expect(entry).toBeDefined();
      expect(entry?.keychainName).toBe('slack-bot-token');
    });

    it('includes SAG API key', () => {
      const entry = DEFAULT_SECRET_MAP.find(
        (e) => e.configPath === 'skills.entries.sag.apiKey'
      );
      expect(entry).toBeDefined();
      expect(entry?.keychainName).toBe('sag-api-key');
    });

    it('includes Telegram bot token', () => {
      const entry = DEFAULT_SECRET_MAP.find(
        (e) => e.configPath === 'channels.telegram.botToken'
      );
      expect(entry).toBeDefined();
      expect(entry?.keychainName).toBe('telegram-bot-token');
    });

    it('includes gateway auth token', () => {
      const entry = DEFAULT_SECRET_MAP.find(
        (e) => e.configPath === 'gateway.auth.token'
      );
      expect(entry).toBeDefined();
      expect(entry?.keychainName).toBe('gateway-auth-token');
    });

    it('includes Whisper API key', () => {
      const entry = DEFAULT_SECRET_MAP.find(
        (e) => e.configPath === 'skills.entries.openai-whisper-api.apiKey'
      );
      expect(entry).toBeDefined();
      expect(entry?.keychainName).toBe('whisper-api-key');
    });

    it('includes Brave Search API key', () => {
      const entry = DEFAULT_SECRET_MAP.find(
        (e) => e.configPath === 'tools.web.search.apiKey'
      );
      expect(entry).toBeDefined();
      expect(entry?.keychainName).toBe('brave-search-api-key');
    });

    it('has 7 total entries', () => {
      expect(DEFAULT_SECRET_MAP).toHaveLength(7);
    });
  });

  describe('serviceName', () => {
    it('prefixes keychain name with service prefix', () => {
      expect(serviceName('slack-app-token')).toBe('openclaw-slack-app-token');
      expect(serviceName('sag-api-key')).toBe('openclaw-sag-api-key');
    });
  });

  describe('constants values', () => {
    it('has correct placeholder value', () => {
      expect(KEYCHAIN_PLACEHOLDER).toBe('[STORED_IN_KEYCHAIN]');
    });

    it('has correct service prefix', () => {
      expect(SERVICE_PREFIX).toBe('openclaw');
    });

    it('has correct default config path', () => {
      expect(DEFAULT_CONFIG_PATH).toBe('~/.openclaw/openclaw.json');
    });

    it('has correct default backend', () => {
      expect(DEFAULT_BACKEND).toBe('keychain');
    });
  });
});
