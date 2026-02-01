import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readConfig, writeConfig, backupConfig, expandPath } from '../src/config.js';
import { mkdtemp, rm, readFile, writeFile, stat, chmod } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

describe('expandPath', () => {
  it('expands ~ to home directory', () => {
    expect(expandPath('~/foo/bar')).toBe(join(homedir(), 'foo/bar'));
  });

  it('expands bare ~', () => {
    expect(expandPath('~')).toBe(homedir());
  });

  it('leaves absolute paths alone', () => {
    expect(expandPath('/usr/local/bin')).toBe('/usr/local/bin');
  });

  it('resolves relative paths', () => {
    const result = expandPath('foo/bar');
    expect(result).toContain('foo/bar');
    expect(result.startsWith('/')).toBe(true);
  });
});

describe('readConfig / writeConfig', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ck-test-'));
    configPath = join(tmpDir, 'config.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('reads a valid JSON config', async () => {
    await writeFile(configPath, JSON.stringify({ foo: 'bar' }));
    const result = await readConfig(configPath);
    expect(result).toEqual({ foo: 'bar' });
  });

  it('throws on missing file', async () => {
    await expect(readConfig(join(tmpDir, 'nope.json'))).rejects.toThrow('not found');
  });

  it('throws on invalid JSON', async () => {
    await writeFile(configPath, 'not json');
    await expect(readConfig(configPath)).rejects.toThrow('Failed to read');
  });

  it('writes config with 2-space indent and trailing newline', async () => {
    await writeFile(configPath, '{}'); // create so backup doesn't fail
    await writeConfig(configPath, { hello: 'world' });
    const content = await readFile(configPath, 'utf-8');
    expect(content).toBe('{\n  "hello": "world"\n}\n');
  });

  it('preserves file permissions', async () => {
    await writeFile(configPath, '{}', { mode: 0o644 });
    await chmod(configPath, 0o644);
    await writeConfig(configPath, { a: 1 });
    const stats = await stat(configPath);
    // Check permission bits (lower 9 bits)
    expect(stats.mode & 0o777).toBe(0o644);
  });

  it('creates a backup before writing', async () => {
    await writeFile(configPath, JSON.stringify({ original: true }));
    await writeConfig(configPath, { updated: true });

    const backup = await readFile(`${configPath}.bak`, 'utf-8');
    expect(JSON.parse(backup)).toEqual({ original: true });
  });
});

describe('backupConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ck-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a .bak file', async () => {
    const configPath = join(tmpDir, 'test.json');
    await writeFile(configPath, '{"a":1}');
    const backupPath = await backupConfig(configPath);
    expect(backupPath).toBe(`${configPath}.bak`);
    const content = await readFile(backupPath, 'utf-8');
    expect(content).toBe('{"a":1}');
  });
});
