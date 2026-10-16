declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    DELEGATOR_VAULT_KEY: string;
    BUCKET?: R2Bucket;
  }
}
