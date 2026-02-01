/**
 * LaunchAgent plist management for openclaw-secure.
 *
 * Patches the Clawdbot LaunchAgent to start via openclaw-secure,
 * ensuring secrets are injected at boot and scrubbed after startup.
 */

import { execSync } from 'node:child_process';
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// ── Types ──────────────────────────────────────────────────────────────

export interface PlistConfig {
  label: string;
  programArguments: string[];
  environmentVariables: Record<string, string>;
  keepAlive: boolean;
  runAtLoad: boolean;
  /** Raw XML string for round-trip preservation */
  raw: string;
}

export interface InstallOptions {
  backend?: string;
  dryRun?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────

const PLIST_FILENAME = 'com.clawdbot.gateway.plist';
const LAUNCHAGENTS_DIR = join(homedir(), 'Library', 'LaunchAgents');
const PLIST_PATH = join(LAUNCHAGENTS_DIR, PLIST_FILENAME);

// ── Plist XML Parsing (no external deps) ───────────────────────────────

/**
 * Extract a single <string> element's text content.
 */
function extractStringValue(xml: string, key: string): string {
  const keyPattern = new RegExp(`<key>${escapeRegex(key)}</key>\\s*<string>([^<]*)</string>`);
  const match = xml.match(keyPattern);
  return match ? match[1] : '';
}

/**
 * Extract the <array> of <string> elements following a given <key>.
 */
function extractStringArray(xml: string, key: string): string[] {
  const keyPattern = new RegExp(
    `<key>${escapeRegex(key)}</key>\\s*<array>([\\s\\S]*?)</array>`,
  );
  const match = xml.match(keyPattern);
  if (!match) return [];
  const arrayContent = match[1];
  const strings: string[] = [];
  const stringPattern = /<string>([^<]*)<\/string>/g;
  let m: RegExpExecArray | null;
  while ((m = stringPattern.exec(arrayContent)) !== null) {
    strings.push(m[1]);
  }
  return strings;
}

/**
 * Extract a <dict> of <key>/<string> pairs following a given <key>.
 */
function extractStringDict(xml: string, key: string): Record<string, string> {
  const keyPattern = new RegExp(
    `<key>${escapeRegex(key)}</key>\\s*<dict>([\\s\\S]*?)</dict>`,
  );
  const match = xml.match(keyPattern);
  if (!match) return {};
  const dictContent = match[1];
  const result: Record<string, string> = {};
  const pairPattern = /<key>([^<]*)<\/key>\s*<string>([^<]*)<\/string>/g;
  let m: RegExpExecArray | null;
  while ((m = pairPattern.exec(dictContent)) !== null) {
    result[m[1]] = m[2];
  }
  return result;
}

/**
 * Check for a <true/> or <false/> following a given <key>.
 */
function extractBool(xml: string, key: string): boolean {
  const pattern = new RegExp(`<key>${escapeRegex(key)}</key>\\s*<(true|false)\\s*/>`);
  const match = xml.match(pattern);
  return match ? match[1] === 'true' : false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a plist XML string from a PlistConfig.
 */
function buildPlistXml(config: PlistConfig): string {
  const indent = '    ';
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `${indent}<key>Label</key>`,
    `${indent}<string>${config.label}</string>`,
    `${indent}<key>ProgramArguments</key>`,
    `${indent}<array>`,
  ];

  for (const arg of config.programArguments) {
    lines.push(`${indent}${indent}<string>${arg}</string>`);
  }
  lines.push(`${indent}</array>`);

  if (Object.keys(config.environmentVariables).length > 0) {
    lines.push(`${indent}<key>EnvironmentVariables</key>`);
    lines.push(`${indent}<dict>`);
    for (const [k, v] of Object.entries(config.environmentVariables)) {
      lines.push(`${indent}${indent}<key>${k}</key>`);
      lines.push(`${indent}${indent}<string>${v}</string>`);
    }
    lines.push(`${indent}</dict>`);
  }

  lines.push(`${indent}<key>KeepAlive</key>`);
  lines.push(`${indent}<${config.keepAlive}/>`)
  lines.push(`${indent}<key>RunAtLoad</key>`);
  lines.push(`${indent}<${config.runAtLoad}/>`);

  lines.push('</dict>');
  lines.push('</plist>');
  lines.push('');

  return lines.join('\n');
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Find the Clawdbot LaunchAgent plist file.
 * @returns Absolute path to the plist
 * @throws If the plist does not exist
 */
export function findPlist(): string {
  if (!existsSync(PLIST_PATH)) {
    throw new Error(
      'Clawdbot LaunchAgent not found. Is Clawdbot installed?\n' +
      `  Expected: ${PLIST_PATH}`,
    );
  }
  return PLIST_PATH;
}

/**
 * Parse a plist XML file into a structured config.
 */
export function readPlist(path: string): PlistConfig {
  const raw = readFileSync(path, 'utf-8');
  return {
    label: extractStringValue(raw, 'Label'),
    programArguments: extractStringArray(raw, 'ProgramArguments'),
    environmentVariables: extractStringDict(raw, 'EnvironmentVariables'),
    keepAlive: extractBool(raw, 'KeepAlive'),
    runAtLoad: extractBool(raw, 'RunAtLoad'),
    raw,
  };
}

/**
 * Back up the plist file to `{path}.bak`.
 * @returns The backup path
 */
export function backupPlist(path: string): string {
  const backupPath = `${path}.bak`;
  copyFileSync(path, backupPath);
  return backupPath;
}

/**
 * Resolve the path to the openclaw-secure CLI binary.
 */
function resolveOpenclawBinary(): string {
  try {
    return execSync('which openclaw-secure', { encoding: 'utf-8' }).trim();
  } catch {
    // Fallback: resolve from this package's bin entry
    const pkgBin = resolve(import.meta.dirname, '..', 'dist', 'cli.js');
    if (existsSync(pkgBin)) return pkgBin;
    throw new Error(
      'Cannot find openclaw-secure binary. Is it installed globally?\n' +
      '  Run: npm install -g openclaw-secure',
    );
  }
}

/**
 * Resolve the path to the Node.js binary.
 */
function resolveNodeBinary(): string {
  return process.execPath;
}

/**
 * Reload the LaunchAgent by unloading and loading the plist.
 */
function reloadLaunchAgent(plistPath: string): void {
  try {
    execSync(`launchctl unload "${plistPath}"`, { stdio: 'pipe' });
  } catch {
    // May fail if not currently loaded — that's fine
  }
  execSync(`launchctl load "${plistPath}"`, { stdio: 'pipe' });
}

/**
 * Patch the Clawdbot LaunchAgent to start via openclaw-secure.
 */
export function installSecure(options: InstallOptions = {}): {
  plistPath: string;
  backupPath: string;
  oldArgs: string[];
  newArgs: string[];
} {
  const plistPath = findPlist();
  const config = readPlist(plistPath);
  const oldArgs = [...config.programArguments];

  // Back up before modifying
  const backupPath = backupPlist(plistPath);

  // Resolve binary paths
  const nodePath = resolveNodeBinary();
  const openclawPath = resolveOpenclawBinary();

  // Build new ProgramArguments
  const newArgs: string[] = [nodePath, openclawPath, 'start'];
  if (options.backend) {
    newArgs.push('--backend', options.backend);
  }

  // Update config
  config.programArguments = newArgs;

  // Write modified plist
  const xml = buildPlistXml(config);
  writeFileSync(plistPath, xml, 'utf-8');

  // Reload LaunchAgent
  if (!options.dryRun) {
    reloadLaunchAgent(plistPath);
  }

  return { plistPath, backupPath, oldArgs, newArgs };
}

/**
 * Restore the original Clawdbot LaunchAgent from backup.
 */
export function uninstallSecure(): {
  plistPath: string;
  restoredFrom: 'backup' | 'reconstructed';
  oldArgs: string[];
  newArgs: string[];
} {
  const plistPath = findPlist();
  const config = readPlist(plistPath);
  const oldArgs = [...config.programArguments];
  const backupPath = `${plistPath}.bak`;

  let newArgs: string[];
  let restoredFrom: 'backup' | 'reconstructed';

  if (existsSync(backupPath)) {
    // Restore from backup
    copyFileSync(backupPath, plistPath);
    const restored = readPlist(plistPath);
    newArgs = restored.programArguments;
    restoredFrom = 'backup';
  } else {
    // Reconstruct original args
    const nodePath = resolveNodeBinary();
    let clawdbotPath: string;
    try {
      const clawdbotBin = execSync('which clawdbot', { encoding: 'utf-8' }).trim();
      // The actual entry point is usually the dist/entry.js resolved from the bin
      clawdbotPath = clawdbotBin;
    } catch {
      throw new Error(
        'Cannot find clawdbot binary and no backup exists.\n' +
        '  Cannot reconstruct the original LaunchAgent.',
      );
    }

    newArgs = [nodePath, clawdbotPath, 'gateway', 'start'];
    config.programArguments = newArgs;
    const xml = buildPlistXml(config);
    writeFileSync(plistPath, xml, 'utf-8');
    restoredFrom = 'reconstructed';
  }

  // Reload
  reloadLaunchAgent(plistPath);

  return { plistPath, restoredFrom, oldArgs, newArgs };
}
