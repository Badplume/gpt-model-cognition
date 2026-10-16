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
