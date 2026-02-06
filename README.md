<p align="center">
  <h1 align="center">🔐 openclaw-secure</h1>
  <p align="center">
    <strong>Hardware-gated secret management for AI agents.</strong><br/>
    <em>Because your AI can read your config files.</em>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/openclaw-secure"><img src="https://img.shields.io/npm/v/openclaw-secure.svg?style=flat-square" alt="npm version" /></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="MIT License" /></a>
    <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=flat-square" alt="Node >= 22" />
    <img src="https://img.shields.io/badge/backends-10-orange?style=flat-square" alt="10 backends" />
  </p>
</p>

---

## 💣 The Problem

Your AI agent has tool access. It can run shell commands. It can read files. And your API keys are sitting in **plain text config files**.

```
~/.openclaw/openclaw.json
├── channels.telegram.botToken: "7234891:AAF..."   ← any agent can cat this
├── gateway.auth.token: "sk-proj-..."               ← prompt injection = game over
└── skills.entries.openai-whisper-api.apiKey: "sk-..." 
```

**Prompt injection attacks** can trick your AI into exfiltrating secrets. A single malicious webpage, document, or message can instruct the agent to `cat ~/.clawdbot/clawdbot.json` and send it somewhere. Plain text config files are a **ticking time bomb**.

## ⚡ How It Works

```
                         ┌──────────────────┐
                         │  Secret Backend  │
                         │  (1Password, AWS,│
                         │   Keychain, etc) │
                         └────────┬─────────┘
                                  │
                          openclaw-secure
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼              ▼
              1. RESTORE    2. START       3. SCRUB
              keys from     gateway        config back
              backend →     (keys in       to placeholders
              config        memory only)
                    │             │              │
                    └─────────────┼──────────────┘
                                  ▼
                      Config on disk always has:
                      "[STORED_IN_KEYCHAIN]"
```

Real API keys exist in process memory **only while the gateway is running**. The config file on disk contains only `[STORED_IN_KEYCHAIN]` placeholders — unreadable, unexploitable, useless to any attacker or rogue agent.

## 🚀 Quick Start

```bash
# 1. Install
npm install -g openclaw-secure

# 2. Store your keys (reads real values from config, saves to backend)
openclaw-secure store

# 3. Start the gateway securely (restore → start → scrub)
openclaw-secure start
```

That's it. Your config file now has placeholders instead of real keys, and the gateway has the real keys in memory.

## 🖥️ LaunchAgent Setup (macOS Boot Security)

OpenClaw starts on boot via a macOS LaunchAgent. By default it reads keys from plain text config. Patch the LaunchAgent to go through openclaw-secure instead:

```bash
# One-time setup
openclaw-secure store                    # move keys to backend
openclaw-secure install                  # patch LaunchAgent

# That's it — every reboot is now secured

# To revert
openclaw-secure uninstall                # restore original LaunchAgent
```

The `install` command:
- Backs up your existing plist to `.bak`
- Replaces `ProgramArguments` to run `openclaw-secure start` instead of `openclaw gateway`
- Reloads the LaunchAgent via `launchctl`
- Preserves environment variables (like `OPENCLAW_GATEWAY_PORT`)

You can bake in a backend choice:
```bash
openclaw-secure install --backend 1password
```

The `uninstall` command restores the original plist from the `.bak` backup and reloads.

## 📋 CLI Commands

| Command | Description | Example |
|---------|-------------|---------|
| `store` | Read secrets from config → store in backend → replace with placeholders | `openclaw-secure store` |
| `start` | Restore keys → start gateway → scrub config | `openclaw-secure start` |
| `check` | Verify all keys exist in the backend | `openclaw-secure check` |
| `restore` | Write real values back to config permanently | `openclaw-secure restore` |
| `list` | Show all managed secret paths | `openclaw-secure list` |
| `install` | Patch LaunchAgent to start via openclaw-secure on boot | `openclaw-secure install` |
| `uninstall` | Restore original LaunchAgent (undo install) | `openclaw-secure uninstall` |

### Global Options

```bash
--backend <name>        # Secret backend (default: keychain)
--config <path>         # Config file (default: ~/.openclaw/openclaw.json)
--timeout <ms>          # Gateway health timeout (default: 10000)
--help, -h              # Show help
```

## 🔒 Backends Comparison

| Provider | CLI Tool | Platform | Local/Cloud | Prompt Injection Resistant? | Best For |
|----------|----------|----------|-------------|----------------------------|----------|
| **macOS Keychain** | `security` | macOS | Local | ❌ Silent reads | macOS users, quick setup |
| **1Password** | `op` | All | Local+Cloud | ✅ **Biometric gate** | **Maximum security** |
| **Bitwarden** | `bw` | All | Cloud | ⚠️ Session-based | Open source enthusiasts |
| **LastPass** | `lpass` | All | Cloud | ⚠️ Session-based | LastPass users |
| **AWS Secrets Manager** | `aws` | All | Cloud | ⚠️ Audit-logged | AWS infrastructure |
| **Google Cloud Secret Manager** | `gcloud` | All | Cloud | ⚠️ Audit-logged | GCP infrastructure |
| **Azure Key Vault** | `az` | All | Cloud | ⚠️ Audit-logged | Azure infrastructure |
| **pass** | `pass` | Linux/macOS | Local | ⚠️ GPG-agent cached | Unix power users |
| **Doppler** | `doppler` | All | Cloud | ⚠️ Audit-logged | DevOps teams |
| **HashiCorp Vault** | `vault` | All | Self-hosted | ⚠️ Token-based | Enterprise self-hosted |

## 🛡️ Prompt Injection Resistance

> **This is the whole point of this tool.** Not all backends are equal.

### ✅ 1Password with Biometric — The Gold Standard

With 1Password's biometric unlock enabled, **every secret read requires Touch ID**. A prompt injection attack can instruct your AI agent to call `op item get` — but the human must physically touch the fingerprint sensor. The agent cannot bypass this.

```bash
openclaw-secure store --backend 1password --vault Private
```

**This is the recommended configuration for maximum security.**

### ❌ macOS Keychain — Convenient but Vulnerable

Keychain reads via `security find-generic-password` are **silent** — no prompt, no confirmation. If an agent is tricked into reading the keychain directly, it will succeed. Still better than plain text (the agent needs to know the exact service name), but not hardware-gated.

### ⚠️ Cloud Backends — Silent but Auditable

AWS, GCP, Azure, and Doppler all allow silent reads once authenticated. However, every access is **audit-logged**, so you can detect exfiltration after the fact. Good for teams with monitoring infrastructure.

### ⚠️ Session-Based — Depends on Lock State

Bitwarden and LastPass require an active unlocked session. If the session is locked, reads fail. If it's unlocked (which it often is during agent use), reads are silent.

### Recommendation

| Threat Level | Use |
|---|---|
| 🟢 Low (personal use) | macOS Keychain — simple, zero setup |
| 🟡 Medium (team/cloud) | AWS/GCP/Azure — audit logs catch exfil |
| 🔴 High (untrusted inputs) | **1Password biometric** — hardware gate |

## 🔧 Backend Setup

<details>
<summary><strong>macOS Keychain</strong> (default, macOS only)</summary>

No setup required! Uses `/usr/bin/security` which ships with macOS.

```bash
openclaw-secure store --backend keychain
```

Keys are stored as generic passwords with service name `openclaw-{key-name}`.

</details>

<details>
<summary><strong>1Password</strong></summary>

1. Install the [1Password CLI](https://developer.1password.com/docs/cli/):
   ```bash
   brew install --cask 1password-cli
   ```
2. Sign in:
   ```bash
   op signin
   ```
3. (Recommended) Enable biometric unlock in 1Password settings for Touch ID prompts on every read.
4. Use:
   ```bash
   openclaw-secure store --backend 1password --vault Private
   ```

</details>

<details>
<summary><strong>Bitwarden</strong></summary>

1. Install:
   ```bash
   npm install -g @bitwarden/cli
   ```
2. Login and unlock:
   ```bash
   bw login
   bw unlock
   ```
3. Export session (required):
   ```bash
   export BW_SESSION="your-session-key"
   ```
4. Use:
   ```bash
   openclaw-secure store --backend bitwarden
   ```

</details>

<details>
<summary><strong>LastPass</strong></summary>

1. Install [lastpass-cli](https://github.com/lastpass/lastpass-cli):
   ```bash
   brew install lastpass-cli  # macOS
   ```
2. Login:
   ```bash
   lpass login your@email.com
   ```
3. Use:
   ```bash
   openclaw-secure store --backend lastpass
   ```

</details>

<details>
<summary><strong>AWS Secrets Manager</strong></summary>

1. Install and configure [AWS CLI](https://aws.amazon.com/cli/):
   ```bash
   aws configure
   ```
2. Use:
   ```bash
   openclaw-secure store --backend aws --region us-east-1
   ```

Secrets are stored at `openclaw/{key-name}` in Secrets Manager.

</details>

<details>
<summary><strong>Google Cloud Secret Manager</strong></summary>

1. Install [gcloud CLI](https://cloud.google.com/sdk/docs/install):
   ```bash
   gcloud auth login
   ```
2. Use:
   ```bash
   openclaw-secure store --backend gcloud --project my-project-id
   ```

</details>

<details>
<summary><strong>Azure Key Vault</strong></summary>

1. Install [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli):
   ```bash
   az login
   ```
2. Use (vault name is **required**):
   ```bash
   openclaw-secure store --backend azure --vault-name my-keyvault
   ```

</details>

<details>
<summary><strong>pass (Unix password manager)</strong></summary>

1. Install [pass](https://www.passwordstore.org/):
   ```bash
   brew install pass        # macOS
   apt install pass         # Debian/Ubuntu
   ```
2. Initialize:
   ```bash
   pass init <your-gpg-id>
   ```
3. Use:
   ```bash
   openclaw-secure store --backend pass
   ```

Secrets stored at `openclaw/{key-name}` in the password store.

</details>

<details>
<summary><strong>Doppler</strong></summary>

1. Install [Doppler CLI](https://docs.doppler.com/docs/cli):
   ```bash
   brew install dopplerhq/cli/doppler
   doppler login
   ```
2. Use:
   ```bash
   openclaw-secure store --backend doppler --doppler-project myapp --doppler-config prd
   ```

Keys are converted to `OPENCLAW_UPPER_SNAKE_CASE` format.

</details>

<details>
<summary><strong>HashiCorp Vault</strong></summary>

1. Install [Vault CLI](https://developer.hashicorp.com/vault/install):
   ```bash
   brew install vault
   vault login
   ```
2. Use:
   ```bash
   openclaw-secure store --backend vault --addr http://127.0.0.1:8200
   ```

Secrets stored at `secret/openclaw/{key-name}` using KV v2.

</details>

## ⚙️ Configuration

### Preferences File

Save defaults to `~/.openclaw-secure.json` so you don't repeat flags:

```json
{
  "backend": "1password",
  "vault": "Private"
}
```

CLI flags always override preferences.

### Secret Map

By default, openclaw-secure manages these OpenClaw config paths:

| Config Path | Backend Key |
|---|---|
| `channels.telegram.botToken` | `telegram-bot-token` |
| `gateway.auth.token` | `gateway-auth-token` |
| `skills.entries.openai-whisper-api.apiKey` | `whisper-api-key` |

## 📦 Programmatic API

```typescript
import {
  createBackend,
  storeKeys,
  restoreKeys,
  scrubKeys,
  checkKeys,
  KEYCHAIN_PLACEHOLDER,
  DEFAULT_SECRET_MAP,
} from 'openclaw-secure';

// Create a backend
const backend = createBackend('1password', { vault: 'Private' });

// Store keys from config into backend
const results = await storeKeys('~/.openclaw/openclaw.json', DEFAULT_SECRET_MAP, backend);

// Restore keys from backend to config
await restoreKeys('~/.openclaw/openclaw.json', DEFAULT_SECRET_MAP, backend);

// Scrub config (replace real values with placeholders)
await scrubKeys('~/.openclaw/openclaw.json', DEFAULT_SECRET_MAP);

// Check all keys exist in backend
const checks = await checkKeys(DEFAULT_SECRET_MAP, backend);
checks.forEach(c => console.log(`${c.keychainName}: ${c.exists ? '✔' : '✘'}`));
```

### Backend Interface

All backends implement `SecretBackend`:

```typescript
interface SecretBackend {
  readonly name: string;
  available(): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}
```

### Available Backends

```typescript
import {
  KeychainBackend,
  OnePasswordBackend,
  BitwardenBackend,
  LastPassBackend,
  AwsSecretsBackend,
  GCloudSecretsBackend,
  AzureKeyVaultBackend,
  PassBackend,
  DopplerBackend,
  VaultBackend,
} from 'openclaw-secure';
```

## 🔐 Security Model

### What openclaw-secure protects against

- ✅ **Config file reads** — `cat`, `read`, agent file access all see placeholders
- ✅ **Prompt injection exfiltration** — no secrets in config to steal
- ✅ **Accidental git commits** — placeholders are safe to commit
- ✅ **Shoulder surfing** — no secrets visible in config files
- ✅ **Cold disk access** — secrets aren't on disk (with hardware-gated backends)

### What it does NOT protect against

- ❌ **Memory inspection** — secrets exist in the gateway's process memory while running
- ❌ **Root access** — a root attacker can read process memory
- ❌ **Backend compromise** — if your 1Password/AWS account is compromised, secrets are exposed
- ❌ **Runtime agent interception** — an agent that can intercept HTTP traffic to the gateway can see decrypted requests

### Threat model summary

openclaw-secure raises the bar from "any file read leaks everything" to "requires hardware interaction or backend compromise." With 1Password biometric, even a fully compromised agent session cannot extract secrets without physical human confirmation.

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repo
2. Create a feature branch
3. Write tests for new backends/features
4. Run `npm run build && npm test`
5. Submit a PR

## 📄 License

[MIT](LICENSE) © Michael Waltman
