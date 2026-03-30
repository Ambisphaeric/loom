# @enhancement/credentials

Secure credential storage with AES-GCM encryption and workspace-scoped access control.

## Purpose

Provides encrypted credential storage for API keys, OAuth tokens, passwords, and other secrets. Credentials are encrypted at rest using AES-GCM with PBKDF2 key derivation. Supports workspace-scoped access control and fail-closed security behavior.

## Key Domain Concepts

- **CredentialProvider**: Interface for storing and retrieving encrypted credentials.
- **LocalCredentialProvider**: Main implementation using AES-GCM encryption.
- **CredentialStore**: Pluggable storage backend (default: in-memory).
- **InMemoryCredentialStore**: Default storage implementation for testing and development.
- **CredentialAccessError**: Error thrown when decryption fails or access is denied.
- **EncryptionResult**: Container for encrypted value, IV, and salt.

## Public API

### LocalCredentialProvider

```typescript
import { LocalCredentialProvider, generateMasterKey } from '@enhancement/credentials';

// Generate or provide a master encryption key
const masterKey = generateMasterKey(); // 32-byte Uint8Array

// Create provider with workspace scope
const provider = new LocalCredentialProvider('my-workspace', masterKey);

// Store a credential
await provider.set('openai', 'default', 'sk-...', {
  scopes: ['chat', 'embeddings'],
  note: 'Production API key'
}, { workspaceAccess: '*' });

// Retrieve a credential
const apiKey = await provider.get('openai', 'default');
// Returns: 'sk-...' or null if not found

// Check existence
const exists = await provider.exists('openai', 'default');

// List credentials (metadata only, no decryption)
const credentials = await provider.list('openai');
// Returns: [{ id, service, account, credentialType, metadata, isEnabled, ... }]

// Delete a credential
await provider.delete('openai', 'default');

// Securely clear the master key from memory
provider.destroy();
```

### createCredentialProvider Factory

```typescript
import { createCredentialProvider } from '@enhancement/credentials';

// Auto-generates master key if not provided
const provider = createCredentialProvider('my-workspace');

// Or provide your own key
const provider = createCredentialProvider('my-workspace', existingKey);
```

### InMemoryCredentialStore

```typescript
import { InMemoryCredentialStore, LocalCredentialProvider } from '@enhancement/credentials';

// Create custom store for testing
const store = new InMemoryCredentialStore();
const provider = new LocalCredentialProvider('test-workspace', masterKey, store);

// Clear all credentials (testing utility)
store.clear();
```

### Encryption Utilities

```typescript
import { encryptValue, decryptValue, generateMasterKey, generateCredentialId } from '@enhancement/credentials';

// Generate a new random master key (32 bytes)
const masterKey = generateMasterKey();

// Encrypt a value
const { encrypted, iv, salt } = await encryptValue('secret-data', masterKey);
// Returns: { encrypted: 'base64...', iv: 'base64...', salt: 'base64...' }

// Decrypt a value
const decrypted = await decryptValue(encrypted, iv, salt, masterKey);
// Returns: 'secret-data'

// Generate a random credential ID
const id = generateCredentialId(); // 32-char hex string
```

### CredentialAccessError

```typescript
import { CredentialAccessError } from '@enhancement/credentials';

try {
  const value = await provider.get('service', 'account');
} catch (error) {
  if (error instanceof CredentialAccessError) {
    console.log(error.service);   // 'service'
    console.log(error.account);   // 'account'
    console.log(error.reason);    // 'decryption_failed' | 'invalid_key' | 'corrupted_data'
    console.log(error.cause);     // Original error
  }
}
```

## Design Decisions

1. **AES-GCM Encryption**: Provides authenticated encryption — tampering is detected during decryption. Combines confidentiality with integrity verification in a single algorithm.

2. **PBKDF2 with 100k Iterations**: Industry-standard key derivation that strengthens the master key against brute-force attacks. 100,000 iterations balances security with performance.

3. **Fail-Closed Behavior**: Decryption failures throw `CredentialAccessError` rather than returning null. This prevents silent security failures — if a credential cannot be decrypted, the operation fails explicitly.

4. **Workspace-Scoped Access**: Credentials can be restricted to specific workspaces via `workspaceAccess` option. `"*"` allows all workspaces; comma-separated list restricts access.

5. **Pluggable Storage Interface**: `CredentialStore` interface allows swapping storage backends. Default `InMemoryCredentialStore` is suitable for testing; production can implement persistent stores (SQLite, file system, etc.).

6. **Secure Memory Clearing**: `destroy()` method overwrites the master key buffer with zeros to minimize key exposure in memory.

7. **Per-Credential Salt and IV**: Each credential gets unique random salt (32 bytes) and IV (16 bytes). Never reuse encryption parameters across credentials.

8. **Type-Safe Credential Types**: Credentials are typed (`api_key`, `oauth_token`, `password`, `token`, `certificate`) for semantic clarity and validation.

## Dependencies

- `@enhancement/types`: Core type system (re-exported types)

## Package Structure

```text
packages/credentials/
├── src/
│   ├── index.ts              # Public exports
│   ├── credential-provider.ts # LocalCredentialProvider, InMemoryCredentialStore, CredentialAccessError
│   ├── encryption.ts         # encryptValue, decryptValue, generateMasterKey, generateCredentialId
│   └── types.ts              # CredentialProvider, CredentialEntry, CredentialMetadata, etc.
└── test/
    ├── conformance.test.ts   # AGENTS spec conformance
    └── credential-provider.test.ts
```

---

## Credential Types

| Type | Purpose |
| ------ | --------- |
| `api_key` | Service API keys (OpenAI, Anthropic, etc.) |
| `oauth_token` | OAuth access/refresh tokens |
| `password` | User passwords |
| `token` | Generic bearer tokens |
| `certificate` | TLS/SSL certificates |

## Security Parameters

| Parameter | Value | Purpose |
| ----------- | ------- | --------- |
| Algorithm | AES-GCM-256 | Authenticated encryption |
| Key Derivation | PBKDF2 | Strengthens master key |
| Iterations | 100,000 | Brute-force resistance |
| Hash | SHA-256 | PBKDF2 hash function |
| Salt Length | 32 bytes | Per-credential uniqueness |
| IV Length | 16 bytes | AES-GCM nonce |
| Key Length | 32 bytes | 256-bit encryption key |
