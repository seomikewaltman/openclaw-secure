# Security Audit Report: openclaw-secure

**Audit Date:** 2026-02-14  
**Auditor:** Jarvis (AI Security Review)  
**Package Version:** 1.2.0  
**Scope:** Full codebase security review

---

## Executive Summary

`openclaw-secure` is a well-designed security tool for protecting OpenClaw API keys from prompt injection attacks. The core security model is sound: secrets are stored in external backends and replaced with placeholders in config files. However, several implementation-level vulnerabilities could expose secrets through command-line arguments or error messages.

**Overall Risk Assessment:** Medium  
**Most Critical Finding:** Secrets passed as command-line arguments (visible via `ps`)

---

## 1. Hardcoded Secrets Scan

### ✅ No Hardcoded Production Secrets Found

| Location | Finding | Severity |
|----------|---------|----------|
| `README.md:24` | Example placeholder `"sk-proj-..."` | None (documentation) |
| `tests/store.test.ts` | Test tokens like `xoxb-restored-token`, `sk-123` | None (test fixtures) |
| `tests/paths.test.ts` | Example API key `sk-123` | None (test fixtures) |

**Verdict:** Clean. Test files appropriately use fake tokens. No real secrets in codebase.

---

## 2. Environment Variable Analysis

### Secrets / API Keys Referenced

| Variable | Service | Expiration | Referenced In |
|----------|---------|------------|---------------|
| `BW_SESSION` | Bitwarden CLI auth | Session-based | `README.md` (user setup) |
| `VAULT_ADDR` | HashiCorp Vault server | N/A (config) | `src/backends/vault.ts:21` |

**Note:** This package intentionally avoids environment variables for secrets, using backend CLI tools instead. Environment variables are only used for backend configuration (not secrets themselves).

---

## 3. API Endpoint Analysis

**N/A** — This is a CLI tool, not a web application. No HTTP endpoints are exposed.

The only network interaction is:
- `http://127.0.0.1:3577/health` — Gateway health check (localhost only, no auth required)

---

## 4. Security Misconfiguration Check

### ✅ Passed Checks

| Check | Status | Notes |
|-------|--------|-------|
| Debug mode in production | ✅ Pass | No debug flags or verbose logging |
| Stack traces in errors | ✅ Pass | Errors show message only, not stack |
| Default credentials | ✅ Pass | No default passwords |
| Prototype pollution | ✅ Pass | `paths.ts` blocks `__proto__`, `constructor`, `prototype` |
| File permissions | ✅ Pass | Config files written with `0o600` |

### ⚠️ Concerns

| Check | Status | Notes |
|-------|--------|-------|
| Secrets in CLI args | ⚠️ Concern | See Critical Findings below |

---

## 5. Security Findings

### 🔴 CRITICAL — Fix Immediately

#### C1: Secrets Exposed in Process Arguments

**Affected Backends:** Azure Key Vault, 1Password, macOS Keychain

**Description:** Multiple backends pass secret values as command-line arguments, which are visible to any user on the system via `ps aux` or `/proc/<pid>/cmdline`.

**Vulnerable Code:**

```typescript
// src/backends/azure-keyvault.ts:31
await runCommand('az', ['keyvault', 'secret', 'set', '--vault-name', this.vaultName, '--name', secretName, '--value', value]);
//                                                                                            ↑ SECRET VISIBLE IN `ps`

// src/backends/onepassword.ts:17
const args = ['item', 'edit', title, `password=${value}`];
//                                     ↑ SECRET VISIBLE IN `ps`

// src/backends/keychain.ts:33
await runCommand('/usr/bin/security', ['add-generic-password', '-s', service, '-a', KEYCHAIN_ACCOUNT, '-w', value, '-U']);
//                                                                                                        ↑ SECRET VISIBLE IN `ps`
```

**Impact:** Any process on the system can capture secrets by monitoring process lists. This defeats the purpose of the tool if the attacker can run `ps` continuously.

**Recommendation:** Use stdin for all secret values:

```typescript
// SECURE: Pass via stdin
await runCommand('az', ['keyvault', 'secret', 'set', '--vault-name', this.vaultName, '--name', secretName, '--value', '@-'], { input: value });
```

Some backends already do this correctly:
- ✅ `aws-secrets.ts` — Uses `file:///dev/stdin`
- ✅ `gcloud-secrets.ts` — Uses `--data-file=-`
- ✅ `pass.ts` — Uses `--multiline` with stdin
- ✅ `doppler.ts` — Uses `--raw` with stdin
- ✅ `vault.ts` — Uses stdin with `-`

**Fix Required For:**
- `azure-keyvault.ts` — Use `--value @-` with stdin
- `onepassword.ts` — Use `op item create --category=password` with stdin template
- `keychain.ts` — Use `-w -` (read from stdin) — **Note:** May require macOS testing

---

### 🟠 HIGH — Fix Within 24 Hours

#### H1: Secrets May Appear in Error Messages

**Description:** When backend CLI commands fail, the error message may include the command arguments (including secrets).

**Vulnerable Code:**

```typescript
// src/backends/base.ts:7
const msg = stderr?.trim() || stdout?.trim() || error.message;
reject(new Error(msg));
```

If `error.message` contains the executed command (which Node.js `execFile` can include), secrets could be logged.

**Recommendation:** Sanitize error messages to remove potential secret values:

```typescript
reject(new Error(sanitizeErrorMessage(msg, [value])));
```

#### H2: No Input Validation on Key Names

**Description:** Key names from `secretMap` are passed directly to shell commands without validation. Malicious key names could inject shell arguments.

**Example Attack:**
```javascript
{ configPath: 'x', keychainName: '--help; cat /etc/passwd' }
```

**Current Protection:** `execFile` is used instead of `exec`, which prevents shell injection. However, some backends may interpret special characters in key names differently.

**Recommendation:** Validate key names match a safe pattern:

```typescript
function validateKeyName(key: string): void {
  if (!/^[a-z0-9-]+$/i.test(key)) {
    throw new Error(`Invalid key name: ${key}`);
  }
}
```

#### H3: Backup File Left After Uninstall

**Description:** `uninstallSecure()` restores from backup but doesn't delete the `.bak` file, which may contain the patched plist with backend preferences.

**Recommendation:** Delete backup after successful restore:

```typescript
if (existsSync(backupPath)) {
  copyFileSync(backupPath, plistPath);
  unlinkSync(backupPath); // Clean up
}
```

---

### 🟡 MEDIUM — Fix Within 1 Week

#### M1: Static Placeholder String is Predictable

**Description:** The placeholder `[STORED_IN_KEYCHAIN]` is hardcoded and predictable. An attacker who sees this knows exactly which backend approach is being used.

**Impact:** Information disclosure about security configuration.

**Recommendation:** Consider making the placeholder configurable or randomized:

```typescript
export const KEYCHAIN_PLACEHOLDER = `[STORED:${crypto.randomUUID().slice(0,8)}]`;
```

#### M2: No Audit Logging

**Description:** The tool doesn't log when secrets are stored, restored, or accessed. This makes incident response difficult.

**Recommendation:** Add optional audit logging:

```typescript
function auditLog(action: string, key: string): void {
  const entry = `${new Date().toISOString()} ${action} ${key}\n`;
  appendFileSync('~/.openclaw-secure.log', entry, { mode: 0o600 });
}
```

#### M3: Gateway Health Check Timeout Race Condition

**Description:** In `cmdStart()`, after the gateway becomes healthy, there's no guarantee the gateway has loaded all secrets into memory before `scrubKeys()` runs.

**Vulnerable Code:**

```typescript
await waitForGateway(timeoutMs);
await scrubKeys(configPath, secretMap); // Gateway may not have read config yet!
```

**Recommendation:** Add a delay after health check or implement a more robust readiness signal.

#### M4: No Secret Rotation Support

**Description:** There's no built-in mechanism to rotate secrets or invalidate old values.

**Recommendation:** Add a `rotate` command that:
1. Generates new secret (for self-managed keys)
2. Stores new value in backend
3. Updates downstream service
4. Archives old value with timestamp

---

### 🟢 LOW — Fix in Next Maintenance Cycle

#### L1: Test Files Contain Example Tokens

**Description:** Test files include realistic-looking token patterns (`xoxb-`, `sk-`) which could trigger secret scanners.

**Recommendation:** Use obviously-fake values like `test-token-12345` or `FAKE_API_KEY`.

#### L2: No Lockfile for Concurrent Access

**Description:** Multiple simultaneous runs of `openclaw-secure` could corrupt the config file.

**Recommendation:** Implement file locking:

```typescript
import { flock } from 'fs-ext';
```

#### L3: Preferences File Not Permission-Protected

**Description:** `~/.openclaw-secure.json` is created with default permissions, not `0o600`.

**Location:** `src/preferences.ts`

**Recommendation:** If preferences ever expand to include sensitive data, ensure restrictive permissions.

#### L4: LaunchAgent Backup Permissions

**Description:** The backup plist is created with `0o600`, but the original plist may have different intended permissions.

**Recommendation:** Preserve original permissions when creating backup.

#### L5: Missing CLI Version Command

**Description:** No `--version` flag to help users identify which version they're running during incident response.

**Recommendation:** Add version output:

```typescript
if (arg === '--version' || arg === '-v') {
  console.log('openclaw-secure 1.2.0');
  process.exit(0);
}
```

---

## Summary Table

| Severity | Count | Action Required |
|----------|-------|-----------------|
| 🔴 Critical | 1 | Fix immediately |
| 🟠 High | 3 | Fix within 24 hours |
| 🟡 Medium | 4 | Fix within 1 week |
| 🟢 Low | 5 | Next maintenance |

---

## Recommended Priority Order

1. **C1** — Stdin for all secret values (Critical)
2. **H1** — Sanitize error messages (High)
3. **H2** — Validate key names (High)
4. **H3** — Clean up backup files (High)
5. **M3** — Gateway readiness race condition (Medium)
6. **M2** — Add audit logging (Medium)
7. Remaining issues...

---

## Positive Security Findings

The following security best practices were observed:

- ✅ **Zero runtime dependencies** — Reduces supply chain attack surface
- ✅ **Prototype pollution protection** — `paths.ts` blocks dangerous segments
- ✅ **Secure file permissions** — `0o600` for config files
- ✅ **No shell injection** — Uses `execFile`, not `exec`
- ✅ **Stdin for some backends** — AWS, GCloud, pass, doppler, vault do this correctly
- ✅ **Hardware security option** — 1Password biometric integration documented
- ✅ **Clear threat model** — README honestly describes limitations

---

*Report generated by security audit tooling. Manual review recommended before implementing fixes.*
