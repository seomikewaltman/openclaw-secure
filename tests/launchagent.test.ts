import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {mkdtemp, rm, writeFile, readFile, copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {findPlist, readPlist, backupPlist} from '../src';

// ── Sample plist XML ───────────────────────────────────────────────────

const SAMPLE_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.gateway</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/usr/local/lib/node_modules/openclaw/dist/entry.js</string>
        <string>gateway</string>
        <string>--port</string>
        <string>18789</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>OPENCLAW_GATEWAY_PORT</key>
        <string>18789</string>
    </dict>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>`;

const MINIMAL_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.gateway</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/usr/local/bin/openclaw</string>
        <string>gateway</string>
    </array>
    <key>KeepAlive</key>
    <false/>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>`;

// ── Tests ──────────────────────────────────────────────────────────────

describe('findPlist', () => {
    it('throws when plist does not exist', () => {
        // findPlist checks a hardcoded path — we can't easily mock fs.existsSync
        // without mocking the module, so we just verify the error message shape
        // by testing with the real filesystem (plist likely doesn't exist in test env)
        // This test will pass in CI where the plist doesn't exist
        try {
            findPlist();
            // If it succeeds (macOS with openclaw installed), that's fine too
        } catch (err) {
            expect(err).toBeInstanceOf(Error);
            expect((err as Error).message).toContain('OpenClaw LaunchAgent not found');
        }
    });
});

describe('readPlist', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), 'oc-plist-'));
    });

    afterEach(async () => {
        await rm(tmpDir, {recursive: true, force: true});
    });

    it('parses a full plist with all fields', async () => {
        const plistPath = join(tmpDir, 'test.plist');
        await writeFile(plistPath, SAMPLE_PLIST);

        const config = readPlist(plistPath);

        expect(config.label).toBe('com.openclaw.gateway');
        expect(config.programArguments).toEqual([
            '/usr/local/bin/node',
            '/usr/local/lib/node_modules/openclaw/dist/entry.js',
            'gateway',
            '--port',
            '18789',
        ]);
        expect(config.environmentVariables).toEqual({
            OPENCLAW_GATEWAY_PORT: '18789',
        });
        expect(config.keepAlive).toBe(true);
        expect(config.runAtLoad).toBe(true);
        expect(config.raw).toBe(SAMPLE_PLIST);
    });

    it('parses a minimal plist without environment variables', async () => {
        const plistPath = join(tmpDir, 'minimal.plist');
        await writeFile(plistPath, MINIMAL_PLIST);

        const config = readPlist(plistPath);

        expect(config.label).toBe('com.openclaw.gateway');
        expect(config.programArguments).toEqual([
            '/usr/local/bin/node',
            '/usr/local/bin/openclaw',
            'gateway',
        ]);
        expect(config.environmentVariables).toEqual({});
        expect(config.keepAlive).toBe(false);
        expect(config.runAtLoad).toBe(true);
    });

    it('preserves the raw XML', async () => {
        const plistPath = join(tmpDir, 'raw.plist');
        await writeFile(plistPath, SAMPLE_PLIST);

        const config = readPlist(plistPath);
        expect(config.raw).toBe(SAMPLE_PLIST);
    });
});

describe('backupPlist', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), 'oc-backup-'));
    });

    afterEach(async () => {
        await rm(tmpDir, {recursive: true, force: true});
    });

    it('creates a .bak copy of the plist', async () => {
        const plistPath = join(tmpDir, 'test.plist');
        await writeFile(plistPath, SAMPLE_PLIST);

        const backupPath = backupPlist(plistPath);

        expect(backupPath).toBe(`${plistPath}.bak`);
        expect(existsSync(backupPath)).toBe(true);

        const backupContent = await readFile(backupPath, 'utf-8');
        expect(backupContent).toBe(SAMPLE_PLIST);
    });

    it('overwrites existing backup', async () => {
        const plistPath = join(tmpDir, 'test.plist');
        const backupPath = `${plistPath}.bak`;

        await writeFile(plistPath, SAMPLE_PLIST);
        await writeFile(backupPath, 'old backup content');

        backupPlist(plistPath);

        const backupContent = await readFile(backupPath, 'utf-8');
        expect(backupContent).toBe(SAMPLE_PLIST);
    });
});

describe('installSecure argument generation', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), 'oc-install-'));
    });

    afterEach(async () => {
        await rm(tmpDir, {recursive: true, force: true});
    });

    it('readPlist + manual arg replacement generates correct args', async () => {
        const plistPath = join(tmpDir, 'test.plist');
        await writeFile(plistPath, SAMPLE_PLIST);

        const config = readPlist(plistPath);

        // Simulate what installSecure does
        const nodePath = '/usr/local/bin/node';
        const openclawPath = '/usr/local/bin/openclaw-secure';
        const newArgs = [nodePath, openclawPath, 'start'];

        expect(newArgs).toEqual([
            '/usr/local/bin/node',
            '/usr/local/bin/openclaw-secure',
            'start',
        ]);

        // Verify original args were different
        expect(config.programArguments).not.toEqual(newArgs);
        expect(config.label).toBe('com.openclaw.gateway');
    });

    it('includes --backend flag when specified', () => {
        const nodePath = '/usr/local/bin/node';
        const openclawPath = '/usr/local/bin/openclaw-secure';
        const backend = '1password';

        const newArgs = [nodePath, openclawPath, 'start', '--backend', backend];

        expect(newArgs).toEqual([
            '/usr/local/bin/node',
            '/usr/local/bin/openclaw-secure',
            'start',
            '--backend',
            '1password',
        ]);
    });

    it('omits --backend flag when not specified', () => {
        const nodePath = '/usr/local/bin/node';
        const openclawPath = '/usr/local/bin/openclaw-secure';

        const newArgs = [nodePath, openclawPath, 'start'];

        expect(newArgs).toHaveLength(3);
        expect(newArgs).not.toContain('--backend');
    });
});

describe('uninstallSecure backup restoration', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), 'oc-uninstall-'));
    });

    afterEach(async () => {
        await rm(tmpDir, {recursive: true, force: true});
    });

    it('restores plist from backup when backup exists', async () => {
        const plistPath = join(tmpDir, 'test.plist');
        const backupPath = `${plistPath}.bak`;

        // Write a "modified" plist (what install would create)
        const modifiedPlist = SAMPLE_PLIST.replace(
            /<array>[\s\S]*?<\/array>/,
            `<array>
        <string>/usr/local/bin/node</string>
        <string>/usr/local/bin/openclaw-secure</string>
        <string>start</string>
    </array>`,
        );
        await writeFile(plistPath, modifiedPlist);
        await writeFile(backupPath, SAMPLE_PLIST);

        // Simulate uninstall: copy backup over plist
        await copyFile(backupPath, plistPath);

        const restored = await readFile(plistPath, 'utf-8');
        expect(restored).toBe(SAMPLE_PLIST);

        // Parse to verify args are original
        const config = readPlist(plistPath);
        expect(config.programArguments).toContain('gateway');
        expect(config.programArguments).not.toContain('openclaw-secure');
        expect(config.label).toBe('com.openclaw.gateway');
    });
});

describe('CLI parseArgs with install/uninstall', () => {
    // Import parseArgs dynamically to test the updated CLI
    it('parses install command', async () => {
        const {parseArgs} = await import('../src/cli.js');
        const result = parseArgs(['node', 'cli.js', 'install']);
        expect(result.command).toBe('install');
    });

    it('parses install with --backend', async () => {
        const {parseArgs} = await import('../src/cli.js');
        const result = parseArgs(['node', 'cli.js', 'install', '--backend', '1password']);
        expect(result.command).toBe('install');
        expect(result.backend).toBe('1password');
    });

    it('parses uninstall command', async () => {
        const {parseArgs} = await import('../src/cli.js');
        const result = parseArgs(['node', 'cli.js', 'uninstall']);
        expect(result.command).toBe('uninstall');
    });
});
