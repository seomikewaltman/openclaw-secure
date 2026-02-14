<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text-dark.png">
    <img src="https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png" alt="OpenClaw" width="400">
  </picture>
</p>

<h1 align="center">🔐 OpenClaw Secure</h1>

<p align="center">
  <strong>Hardware-gated secret management for AI agents.</strong><br/>
  <em>Your AI can read your config files. This stops that from being a problem.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/openclaw-secure"><img src="https://img.shields.io/npm/v/openclaw-secure.svg?style=for-the-badge" alt="npm version" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=for-the-badge" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=for-the-badge" alt="Node >= 22" />
  <img src="https://img.shields.io/badge/backends-10-orange?style=for-the-badge" alt="10 backends" />
</p>

---

# ⬆️ Existing Users: Upgrade to v2.x

**Already using openclaw-secure?** Here's how to upgrade:

```bash
# 1. Update the package
npm install -g openclaw-secure@latest

# 2. Done! Migration happens automatically on next start.
```

### What Changed

| v1.x | v2.x |
|------|------|
| Hardcoded secret paths | Auto-discovers all secrets |
| Manual `DEFAULT_SECRET_MAP` | Scans your entire config |
| Fixed keychain names | Dynamic names from paths |

### Migration Details

Your existing secrets are automatically migrated on first `start`:

```
🚀 Secure gateway start (keychain, auto-discovery)...

  ✔ Migrated 2 legacy key(s)
  → Restoring keys from keychain...
```

To migrate manually (optional):
```bash
openclaw-secure migrate
openclaw-secure check    # verify everything moved
```

### LaunchAgent (macOS Boot)

**No action needed.** Your existing LaunchAgent calls `openclaw-secure start`, which now auto-migrates and auto-discovers.

---

# 🚀 New Users: Quick Start

```bash
# 1. Install
npm install -g openclaw-secure

# 2. Store your secrets (auto-discovers everything)
openclaw-secure store

# 3. Start the gateway securely
openclaw-secure start
```

Your config file now has `[STORED_IN_KEYCHAIN]` placeholders. Secrets exist only in memory while the gateway runs.

### For Boot Security (macOS)

```bash
openclaw-secure install    # patches LaunchAgent
# Now every reboot is secure
```

---

# 📋 TL;DR — Usage Reference

## Commands

| Command | What it does |
|---------|--------------|
| `discover` | Preview secrets found in your config |
| `store` | Move secrets to backend, replace with placeholders |
| `start` | Restore → start gateway → scrub (for boot) |
| `check` | Verify all secrets exist in backend |
| `restore` | Write real values back to config |
| `migrate` | Move v1.x keychain names to v2.x |
| `install` | Patch LaunchAgent for secure boot |
| `uninstall` | Restore original LaunchAgent |

## Common Flags

```bash
--backend <name>     # keychain, 1password, bitwarden, aws, gcloud, azure, pass, doppler, vault
--exclude <path>     # Skip paths (e.g., "channels.dev.*")
--also <path>        # Add custom paths
--no-auto            # Use legacy hardcoded paths
```

## Backends by Security Level

| Level | Backend | Why |
|-------|---------|-----|
| 🟢 Easy | `keychain` | Zero setup, macOS only |
| 🟡 Better | `aws`, `gcloud`, `azure` | Audit logs |
| 🔴 Best | `1password` | **Biometric = hardware gate** |

---

# 🔐 Why This Exists

Your AI agent can run shell commands and read files. Your API keys are in `~/.openclaw/openclaw.json`:

```
channels.telegram.botToken: "7234891:AAF..."   ← agent can cat this
gateway.auth.token: "sk-proj-..."               ← prompt injection = game over
```

**Prompt injection attacks** trick your AI into exfiltrating secrets. One malicious webpage can instruct the agent to read and send your keys.

OpenClaw Secure moves secrets to hardware-protected storage. Config files only have placeholders.

---

# 🔒 Backend Setup

<details>
<summary><strong>macOS Keychain</strong> (default)</summary>

No setup. Just works on macOS.

```bash
openclaw-secure store
```
</details>

<details>
<summary><strong>1Password</strong> (recommended)</summary>

```bash
brew install --cask 1password-cli
op signin
openclaw-secure store --backend 1password --vault Private
```

Enable biometric unlock for Touch ID on every secret read.
</details>

<details>
<summary><strong>Bitwarden</strong></summary>

```bash
npm install -g @bitwarden/cli
bw login && bw unlock
export BW_SESSION="..."
openclaw-secure store --backend bitwarden
```
</details>

<details>
<summary><strong>AWS Secrets Manager</strong></summary>

```bash
aws configure
openclaw-secure store --backend aws --region us-east-1
```
</details>

<details>
<summary><strong>Google Cloud</strong></summary>

```bash
gcloud auth login
openclaw-secure store --backend gcloud --project my-project
```
</details>

<details>
<summary><strong>Azure Key Vault</strong></summary>

```bash
az login
openclaw-secure store --backend azure --vault-name my-vault
```
</details>

<details>
<summary><strong>pass</strong></summary>

```bash
pass init <gpg-id>
openclaw-secure store --backend pass
```
</details>

<details>
<summary><strong>Doppler</strong></summary>

```bash
doppler login
openclaw-secure store --backend doppler --doppler-project myapp --doppler-config prd
```
</details>

<details>
<summary><strong>HashiCorp Vault</strong></summary>

```bash
vault login
openclaw-secure store --backend vault --addr http://127.0.0.1:8200
```
</details>

---

# ⚙️ Config

Save defaults to `~/.openclaw-secure.json`:

```json
{
  "backend": "1password",
  "vault": "Private"
}
```

---

# 📦 API

```typescript
import { discoverSecrets, autoStoreKeys, createBackend } from 'openclaw-secure';

const backend = createBackend('1password', { vault: 'Private' });
const results = await autoStoreKeys('~/.openclaw/openclaw.json', backend);
```

---

# 🛡️ Security Model

**Protects against:**
- ✅ Config file reads (placeholders only)
- ✅ Prompt injection exfiltration
- ✅ Accidental git commits
- ✅ Shoulder surfing

**Does NOT protect against:**
- ❌ Memory inspection (secrets in RAM while running)
- ❌ Root access
- ❌ Backend compromise

### ⚠️ Hot-Reload Limitation

**Config changes while running will crash the gateway.**

OpenClaw hot-reloads `openclaw.json` when it detects changes. After `openclaw-secure start`, the config contains `[STORED_IN_KEYCHAIN]` placeholders. If OpenClaw reloads, it tries to use these placeholders as actual API keys — and fails.

This is inherent to wrapping OpenClaw externally. Secrets must stay off disk to prevent prompt injection.

---

## 🔄 Changing Models

```bash
# 1. Restore your secrets
openclaw-secure restore
```

Now OpenClaw works normally. Use `/model` to switch models, change settings, whatever you need.

```bash
# 2. When you're done, lock it back down
openclaw-secure start
```

That's it. Restore → make changes → start.

**Bottom line:** With 1Password biometric, even a fully compromised agent session cannot extract secrets without your fingerprint.

---

<p align="center">
  <strong>🦞 Part of the <a href="https://github.com/openclaw/openclaw">OpenClaw</a> ecosystem</strong><br/>
  <em>Secure your crustacean.</em>
</p>

## License

[MIT](LICENSE) © Michael Waltman
