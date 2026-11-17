-- AI key vault for the web (IA-12, ADR-0034). One row per user: the AI key
-- the desktop uploaded, encrypted with AES-256-GCM under AI_VAULT_KEY, which
-- lives outside the database. `kek_id` names that key (first bytes of its
-- SHA-256) so a row encrypted under an older one is told apart and asked to be
-- uploaded again, never decrypted with the wrong key. The row goes with the
-- account. Forward-only.

CREATE TABLE IF NOT EXISTS ai_vault (
    user_id    uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    provider   text        NOT NULL CHECK (provider IN ('gemini', 'openai', 'anthropic', 'openrouter')),
    model      text        NOT NULL,
    nonce      bytea       NOT NULL,
    ciphertext bytea       NOT NULL,
    kek_id     text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
