import { describe, it, expect } from 'vitest';
import {
  isKnownSecretPath,
  isSecretKeyName,
  matchesSecretValuePattern,
} from '../src/patterns.js';

describe('isKnownSecretPath', () => {
  it('matches exact known paths', () => {
    expect(isKnownSecretPath('gateway.auth.token')).toBe(true);
    expect(isKnownSecretPath('gateway.auth.password')).toBe(true);
    expect(isKnownSecretPath('gateway.remote.token')).toBe(true);
    expect(isKnownSecretPath('tts.elevenlabs.apiKey')).toBe(true);
    expect(isKnownSecretPath('tts.openai.apiKey')).toBe(true);
    expect(isKnownSecretPath('tools.web.search.apiKey')).toBe(true);
  });

  it('matches channel token patterns', () => {
    expect(isKnownSecretPath('channels.telegram.botToken')).toBe(true);
    expect(isKnownSecretPath('channels.slack.appToken')).toBe(true);
    expect(isKnownSecretPath('channels.discord.token')).toBe(true);
    expect(isKnownSecretPath('channels.telegram.webhookSecret')).toBe(true);
    expect(isKnownSecretPath('channels.slack.signingSecret')).toBe(true);
  });

  it('matches nested account token patterns', () => {
    expect(isKnownSecretPath('channels.telegram.accounts.main.botToken')).toBe(true);
    expect(isKnownSecretPath('channels.slack.accounts.work.appToken')).toBe(true);
    expect(isKnownSecretPath('channels.discord.accounts.personal.token')).toBe(true);
  });

  it('matches skill apiKey patterns', () => {
    expect(isKnownSecretPath('skills.entries.my-skill.apiKey')).toBe(true);
    expect(isKnownSecretPath('skills.entries.openai-whisper-api.apiKey')).toBe(true);
  });

  it('matches skill env var patterns', () => {
    expect(isKnownSecretPath('skills.entries.my-skill.env.SECRET_TOKEN')).toBe(true);
    expect(isKnownSecretPath('skills.entries.my-skill.env.API_KEY')).toBe(true);
    expect(isKnownSecretPath('skills.entries.my-skill.env.DATABASE_URL')).toBe(true);
  });

  it('matches skill config nested secrets', () => {
    expect(isKnownSecretPath('skills.entries.my-skill.config.webhookSecret')).toBe(true);
    expect(isKnownSecretPath('skills.entries.my-skill.config.apiToken')).toBe(true);
    expect(isKnownSecretPath('skills.entries.my-skill.config.nested.deep.password')).toBe(true);
  });

  it('rejects skill config non-secrets', () => {
    expect(isKnownSecretPath('skills.entries.my-skill.config.enabled')).toBe(false);
    expect(isKnownSecretPath('skills.entries.my-skill.config.timeout')).toBe(false);
  });

  it('matches custom model provider apiKeys', () => {
    expect(isKnownSecretPath('models.providers.my-openrouter.apiKey')).toBe(true);
    expect(isKnownSecretPath('models.providers.custom-anthropic.apiKey')).toBe(true);
  });

  it('matches memory search remote apiKey', () => {
    expect(isKnownSecretPath('tools.memorySearch.remote.apiKey')).toBe(true);
  });

  it('rejects non-secret paths', () => {
    expect(isKnownSecretPath('channels.telegram.enabled')).toBe(false);
    expect(isKnownSecretPath('gateway.port')).toBe(false);
    expect(isKnownSecretPath('ui.assistant.name')).toBe(false);
    expect(isKnownSecretPath('random.path')).toBe(false);
  });
});

describe('isSecretKeyName', () => {
  it('matches exact secret key names', () => {
    expect(isSecretKeyName('apiKey')).toBe(true);
    expect(isSecretKeyName('token')).toBe(true);
    expect(isSecretKeyName('password')).toBe(true);
    expect(isSecretKeyName('secret')).toBe(true);
    expect(isSecretKeyName('botToken')).toBe(true);
    expect(isSecretKeyName('appToken')).toBe(true);
  });

  it('matches suffix patterns', () => {
    expect(isSecretKeyName('myApiKey')).toBe(true);
    expect(isSecretKeyName('webhookSecret')).toBe(true);
    expect(isSecretKeyName('signingSecret')).toBe(true);
    expect(isSecretKeyName('accessToken')).toBe(true);
    expect(isSecretKeyName('refreshToken')).toBe(true);
    expect(isSecretKeyName('userPassword')).toBe(true);
  });

  it('is case-insensitive for suffixes', () => {
    expect(isSecretKeyName('APIKEY')).toBe(true);
    expect(isSecretKeyName('ApiKey')).toBe(true);
    expect(isSecretKeyName('TOKEN')).toBe(true);
  });

  it('rejects excluded keys', () => {
    expect(isSecretKeyName('tokenFile')).toBe(false);
    expect(isSecretKeyName('mode')).toBe(false);
    expect(isSecretKeyName('tlsFingerprint')).toBe(false);
  });

  it('rejects non-secret keys', () => {
    expect(isSecretKeyName('enabled')).toBe(false);
    expect(isSecretKeyName('port')).toBe(false);
    expect(isSecretKeyName('name')).toBe(false);
    expect(isSecretKeyName('url')).toBe(false);
  });
});

describe('matchesSecretValuePattern', () => {
  it('matches OpenAI API keys', () => {
    expect(matchesSecretValuePattern('sk-abc123def456ghi789jkl012mno345pqr678stu901vwx234')).toBe(true);
    expect(matchesSecretValuePattern('sk-proj-abc123def456ghi789jkl012mno345pqr678stu901')).toBe(true);
  });

  it('matches Slack tokens', () => {
    expect(matchesSecretValuePattern('xoxb-FAKE-TEST-TOKEN-PLACEHOLDER')).toBe(true);
    expect(matchesSecretValuePattern('xoxp-FAKE-TEST-TOKEN-PLACEHOLDER')).toBe(true);
    expect(matchesSecretValuePattern('xoxa-FAKE-TEST-PLACEHOLDER')).toBe(true);
  });

  it('matches Telegram bot tokens', () => {
    expect(matchesSecretValuePattern('123456789:ABCdefGHIjklMNOpqrSTUvwxYZ1234567890')).toBe(true);
    expect(matchesSecretValuePattern('7234567890:AAF_abcDEFghiJKLmno123456789012345')).toBe(true);
  });

  it('matches hex tokens', () => {
    expect(matchesSecretValuePattern('abcdef1234567890abcdef1234567890')).toBe(true);
    expect(matchesSecretValuePattern('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')).toBe(true);
  });

  it('matches GitHub tokens', () => {
    expect(matchesSecretValuePattern('ghp_abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
    expect(matchesSecretValuePattern('gho_abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
  });

  it('rejects short values', () => {
    expect(matchesSecretValuePattern('short')).toBe(false);
    expect(matchesSecretValuePattern('abc123')).toBe(false);
  });

  it('rejects non-secret patterns', () => {
    expect(matchesSecretValuePattern('hello world this is a long string')).toBe(false);
    expect(matchesSecretValuePattern('/path/to/some/file/location')).toBe(false);
  });
});
