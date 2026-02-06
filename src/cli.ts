#!/usr/bin/env node

/**
 * openclaw-secure CLI
 *
 * Secure OpenClaw API keys with a pluggable secret backend.
 */

import {spawn} from 'node:child_process';
import {storeKeys, restoreKeys, scrubKeys, checkKeys} from './index.js';
import {createBackend} from './backends';
import type {SecretBackend, BackendOptions} from './backends';
import {loadPreferences} from './preferences.js';
import {installSecure, uninstallSecure} from './launchagent.js';
import {
    DEFAULT_CONFIG_PATH,
    DEFAULT_SECRET_MAP,
    DEFAULT_TIMEOUT_MS,
    DEFAULT_GATEWAY_COMMAND,
    DEFAULT_BACKEND,
} from './constants.js';
import type {SecretMap} from './types.js';

// ── ANSI Colors ────────────────────────────────────────────────────────

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ── Argument parsing ───────────────────────────────────────────────────

export interface ParsedArgs {
    command: string;
    configPath: string;
    timeoutMs: number;
    backend: string;
    vault?: string;
    region?: string;
    project?: string;
    vaultName?: string;
    addr?: string;
    dopplerProject?: string;
    dopplerConfig?: string;
}

function printHelp(): void {
    console.log(`
  ${bold('openclaw-secure')} — Secure OpenClaw API keys with a pluggable secret backend

${bold('USAGE')}
  openclaw-secure <command> [options]

${bold('COMMANDS')}
  ${cyan('store')}       Store config secrets into the backend, replace with placeholders
  ${cyan('start')}       Restore keys → start gateway → scrub keys
  ${cyan('check')}       Verify all keys exist in the backend
  ${cyan('restore')}     Write backend values back into config permanently
  ${cyan('list')}        List all managed secret paths
  ${cyan('install')}     Patch LaunchAgent to start via openclaw-secure on boot
  ${cyan('uninstall')}   Restore original LaunchAgent (undo install)

${bold('BACKENDS')}
  ${cyan('keychain')}     macOS Keychain via /usr/bin/security ${dim('(macOS only)')}
  ${cyan('1password')}    1Password via op CLI
  ${cyan('bitwarden')}    Bitwarden via bw CLI
  ${cyan('lastpass')}     LastPass via lpass CLI
  ${cyan('aws')}          AWS Secrets Manager via aws CLI
  ${cyan('gcloud')}       Google Cloud Secret Manager via gcloud CLI
  ${cyan('azure')}        Azure Key Vault via az CLI
  ${cyan('pass')}         pass (Unix password manager, GPG-based)
  ${cyan('doppler')}      Doppler via doppler CLI
  ${cyan('vault')}        HashiCorp Vault via vault CLI

${bold('GLOBAL OPTIONS')}
  --backend <name>        Secret backend ${dim(`(default: ${DEFAULT_BACKEND})`)}
  --config <path>         OpenClaw config file ${dim(`(default: ${DEFAULT_CONFIG_PATH})`)}
  --timeout <ms>          Gateway health timeout ${dim(`(default: ${DEFAULT_TIMEOUT_MS}ms)`)}
  --help, -h              Show this help

${bold('BACKEND OPTIONS')}
  --vault <name>          1Password vault name
  --region <region>       AWS region ${dim('(e.g. us-east-1)')}
  --project <id>          Google Cloud project ID
  --vault-name <name>     Azure Key Vault name ${dim('(required for azure)')}
  --addr <url>            HashiCorp Vault server address
  --doppler-project <n>   Doppler project name
  --doppler-config <n>    Doppler config/environment name

${bold('EXAMPLES')}
  ${dim('# macOS Keychain (default)')}
  openclaw-secure store

  ${dim('# 1Password')}
  openclaw-secure store --backend 1password --vault Private

  ${dim('# AWS Secrets Manager')}
  openclaw-secure store --backend aws --region us-east-1

  ${dim('# HashiCorp Vault')}
  openclaw-secure start --backend vault --addr http://127.0.0.1:8200

  ${dim('# Azure Key Vault')}
  openclaw-secure check --backend azure --vault-name my-keyvault

  ${dim('# Patch LaunchAgent for secure boot')}
  openclaw-secure install --backend 1password

  ${dim('# Restore original LaunchAgent')}
  openclaw-secure uninstall

${bold('PREFERENCES')}
  Set defaults in ${dim('~/.openclaw-secure.json')} to avoid repeating flags:
  ${dim('{ "backend": "1password", "vault": "Private" }')}
`);
}

export function parseArgs(argv: string[]): ParsedArgs {
    let command = '';
    let configPath = DEFAULT_CONFIG_PATH;
    let timeoutMs = DEFAULT_TIMEOUT_MS;
    let backend = DEFAULT_BACKEND;
    let vault: string | undefined;
    let region: string | undefined;
    let project: string | undefined;
    let vaultName: string | undefined;
    let addr: string | undefined;
    let dopplerProject: string | undefined;
    let dopplerConfig: string | undefined;

    const args = argv.slice(2);

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        }

        if (arg === '--config') {
            configPath = args[++i] ?? '';
            if (!configPath) {
                console.error(red('Error: --config requires a path'));
                process.exit(1);
            }
            continue;
        }
        if (arg === '--timeout') {
            const v = args[++i];
            if (!v || isNaN(Number(v))) {
                console.error(red('Error: --timeout requires a number'));
                process.exit(1);
            }
            timeoutMs = Number(v);
            continue;
        }
        if (arg === '--backend') {
            backend = args[++i] ?? '';
            if (!backend) {
                console.error(red('Error: --backend requires a name'));
                process.exit(1);
            }
            continue;
        }
        if (arg === '--vault') {
            vault = args[++i];
            continue;
        }
        if (arg === '--region') {
            region = args[++i];
            continue;
        }
        if (arg === '--project') {
            project = args[++i];
            continue;
        }
        if (arg === '--vault-name') {
            vaultName = args[++i];
            continue;
        }
        if (arg === '--addr') {
            addr = args[++i];
            continue;
        }
        if (arg === '--doppler-project') {
            dopplerProject = args[++i];
            continue;
        }
        if (arg === '--doppler-config') {
            dopplerConfig = args[++i];
            continue;
        }

        if (arg.startsWith('-')) {
            console.error(red(`Error: Unknown option "${arg}"`));
            printHelp();
            process.exit(1);
        }
        if (!command) command = arg;
    }

    return {command, configPath, timeoutMs, backend, vault, region, project, vaultName, addr, dopplerProject, dopplerConfig};
}

// ── Commands ───────────────────────────────────────────────────────────

async function cmdStore(configPath: string, secretMap: SecretMap, backend: SecretBackend): Promise<void> {
    console.log(bold(`\n🔐 Storing secrets via ${cyan(backend.name)} backend...\n`));
    const results = await storeKeys(configPath, secretMap, backend);
    for (const r of results) {
        if (r.stored) console.log(`  ${green('✔')} ${r.configPath} → ${cyan(r.keychainName)}`);
        else console.log(`  ${yellow('⊘')} ${r.configPath} ${dim(`(${r.reason})`)}`);
    }
    const n = results.filter((r) => r.stored).length;
    console.log(`\n${green(`✔ ${n} key(s) stored.`)} Config scrubbed.\n`);
}

async function cmdCheck(secretMap: SecretMap, backend: SecretBackend): Promise<void> {
    console.log(bold(`\n🔍 Checking ${cyan(backend.name)} backend for stored keys...\n`));
    const results = await checkKeys(secretMap, backend);
    let allGood = true;
    for (const r of results) {
        if (r.exists) console.log(`  ${green('✔')} ${r.keychainName} ${dim(`(${r.configPath})`)}`);
        else {
            console.log(`  ${red('✘')} ${r.keychainName} ${dim(`(${r.configPath})`)}`);
            allGood = false;
        }
    }
    if (allGood) console.log(`\n${green('✔ All keys present.')}\n`);
    else {
        console.log(`\n${yellow('⚠ Some keys are missing. Run "openclaw-secure store" first.')}\n`);
        process.exit(1);
    }
}

async function cmdRestore(configPath: string, secretMap: SecretMap, backend: SecretBackend): Promise<void> {
    console.log(bold(`\n🔓 Restoring secrets from ${cyan(backend.name)} to config...\n`));
    await restoreKeys(configPath, secretMap, backend);
    console.log(`${green('✔ Config restored with real values.')}\n`);
}

async function cmdList(secretMap: SecretMap): Promise<void> {
    console.log(bold('\n📋 Managed secret paths:\n'));
    for (const entry of secretMap) {
        console.log(`  ${cyan(entry.keychainName)}`);
        console.log(`    Config path: ${entry.configPath}`);
        console.log('');
    }
}

async function cmdInstall(backendName: string | undefined): Promise<void> {
    console.log(bold('\n🔧 Patching OpenClaw LaunchAgent...\n'));

    try {
        const result = installSecure({backend: backendName !== DEFAULT_BACKEND ? backendName : undefined});

        console.log(`  ${dim('Plist:')}    ${result.plistPath}`);
        console.log(`  ${dim('Backup:')}   ${result.backupPath}`);
        console.log('');
        console.log(`  ${red('Before:')}  ${result.oldArgs.join(' ')}`);
        console.log(`  ${green('After:')}   ${result.newArgs.join(' ')}`);
        console.log('');
        console.log(green('✔ LaunchAgent patched. Gateway will start via openclaw-secure on boot.\n'));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`\n${red('Error:')} ${message}\n`);
        process.exit(1);
    }
}

async function cmdUninstall(): Promise<void> {
    console.log(bold('\n🔧 Restoring original OpenClaw LaunchAgent...\n'));

    try {
        const result = uninstallSecure();

        console.log(`  ${dim('Plist:')}     ${result.plistPath}`);
        console.log(`  ${dim('Restored:')}  ${result.restoredFrom === 'backup' ? 'from backup (.bak)' : 'reconstructed'}`);
        console.log('');
        console.log(`  ${red('Before:')}  ${result.oldArgs.join(' ')}`);
        console.log(`  ${green('After:')}   ${result.newArgs.join(' ')}`);
        console.log('');
        console.log(green('✔ LaunchAgent restored to original. Gateway starts directly on boot.\n'));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`\n${red('Error:')} ${message}\n`);
        process.exit(1);
    }
}

function waitForGateway(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            if (Date.now() - start > timeoutMs) {
                reject(new Error(`Gateway did not become healthy within ${timeoutMs}ms`));
                return;
            }
            fetch('http://127.0.0.1:3577/health')
                .then((res) => {
                    if (res.ok) resolve(); else setTimeout(check, 500);
                })
                .catch(() => setTimeout(check, 500));
        };
        setTimeout(check, 1000);
    });
}

async function cmdStart(configPath: string, secretMap: SecretMap, backend: SecretBackend, timeoutMs: number): Promise<void> {
    console.log(bold(`\n🚀 Secure gateway start (${cyan(backend.name)} backend)...\n`));

    const cleanup = async () => {
        try {
            await scrubKeys(configPath, secretMap);
        } catch { /* best-effort */
        }
    };
    const onSignal = () => {
        cleanup().finally(() => process.exit(1));
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    console.log(`  ${dim('→')} Restoring keys from ${backend.name}...`);
    await restoreKeys(configPath, secretMap, backend);
    console.log(`  ${green('✔')} Config populated with real keys`);

    console.log(`  ${dim('→')} Starting gateway...`);
    const parts = DEFAULT_GATEWAY_COMMAND.split(' ');
    const child = spawn(parts[0], parts.slice(1), {stdio: 'inherit', detached: true});
    child.unref();

    console.log(`  ${dim('→')} Waiting for gateway health (${timeoutMs}ms timeout)...`);
    try {
        await waitForGateway(timeoutMs);
        console.log(`  ${green('✔')} Gateway is healthy`);
    } catch {
        console.log(`  ${yellow('⚠')} Health check timed out — scrubbing anyway`);
    }

    console.log(`  ${dim('→')} Scrubbing config...`);
    await scrubKeys(configPath, secretMap);
    console.log(`  ${green('✔')} Config scrubbed — secrets removed\n`);

    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);

    console.log(green('✔ Gateway started securely.\n'));
}

// ── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const parsed = parseArgs(process.argv);
    const secretMap = DEFAULT_SECRET_MAP;

    // Merge preferences: CLI flags win over prefs file
    const prefs = await loadPreferences();
    const backendName = parsed.backend !== DEFAULT_BACKEND ? parsed.backend : (prefs.backend ?? parsed.backend);
    const backendOpts: BackendOptions = {
        vault: parsed.vault ?? prefs.vault,
        region: parsed.region,
        project: parsed.project,
        vaultName: parsed.vaultName,
        addr: parsed.addr,
        dopplerProject: parsed.dopplerProject,
        dopplerConfig: parsed.dopplerConfig,
    };

    try {
        if (parsed.command === 'list') {
            await cmdList(secretMap);
            return;
        }
        if (parsed.command === 'install') {
            await cmdInstall(backendName);
            return;
        }
        if (parsed.command === 'uninstall') {
            await cmdUninstall();
            return;
        }
        if (parsed.command === '') {
            printHelp();
            return;
        }

        const backend = createBackend(backendName, backendOpts);

        const isAvailable = await backend.available();
        if (!isAvailable) {
            console.error(red(`\nError: Backend "${backendName}" is not available on this system.`));
            const hints: Record<string, string> = {
                keychain: 'The keychain backend requires macOS.',
                '1password': 'Install: https://developer.1password.com/docs/cli/ then: op signin',
                bitwarden: 'Install: https://bitwarden.com/help/cli/ then: bw login && bw unlock',
                lastpass: 'Install: https://github.com/lastpass/lastpass-cli then: lpass login',
                aws: 'Install: https://aws.amazon.com/cli/ then: aws configure',
                gcloud: 'Install: https://cloud.google.com/sdk/docs/install then: gcloud auth login',
                azure: 'Install: https://learn.microsoft.com/en-us/cli/azure/install then: az login',
                pass: 'Install: https://www.passwordstore.org/ then: pass init <gpg-id>',
                doppler: 'Install: https://docs.doppler.com/docs/cli then: doppler login',
                vault: 'Install: https://developer.hashicorp.com/vault/install then: vault login',
            };
            if (hints[backendName]) console.error(dim(`  ${hints[backendName]}`));
            console.error('');
            process.exit(1);
        }

        switch (parsed.command) {
            case 'store':
                await cmdStore(parsed.configPath, secretMap, backend);
                break;
            case 'start':
                await cmdStart(parsed.configPath, secretMap, backend, parsed.timeoutMs);
                break;
            case 'check':
                await cmdCheck(secretMap, backend);
                break;
            case 'restore':
                await cmdRestore(parsed.configPath, secretMap, backend);
                break;
            default:
                console.error(red(`Error: Unknown command "${parsed.command}"\n`));
                printHelp();
                process.exit(1);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`\n${red('Error:')} ${message}\n`);
        process.exit(1);
    }
}

main();
