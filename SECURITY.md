# gpt-model-cognition security

Version 3.5.0 adds an encrypted desktop key form. P-256 ECDH, HKDF-SHA256 and AES-GCM protect the API key before tools/call. Only ciphertext is accepted by the app-only connection tool. Challenges bind the authenticated user, provider and purpose, expire after five minutes, and are atomically consumed in D1. Private transport keys are sealed with the existing vault. No provider credentials are returned to the UI or model. App-only visibility and encryption do not prove a human click; final paid-request approval remains on the authenticated same-origin HTTP page and is absent from MCP.

# Security and deployment boundaries

Never post API keys, vault keys, session cookies, OAuth tokens, database dumps,
or private prompts in GitHub issues or pull requests. Report vulnerabilities
privately through GitHub's security reporting feature when available.

The deployed application depends on the trusted Sites gateway for authenticated
user identity and audience controls. `oai-authenticated-user-id` is trusted only
because that gateway supplies it. Exposing the Worker directly to untrusted
clients without equivalent authenticated gateway enforcement is unsafe.

Local preview uses mock identity for development. It must remain on loopback;
do not expose the preview or its mock authentication on a public network.

Store `DELEGATOR_VAULT_KEY` as a server secret. Existing encrypted data cannot be
decrypted after replacing it; key rotation needs a separate migration. Provider
keys are encrypted per user and are sent only to fixed official endpoints.
Redirects are rejected and paid inference is not automatically retried.

Repository visibility is independent of application audience. Publishing source
does not grant access to the maintainer's private service, accounts, or keys.
