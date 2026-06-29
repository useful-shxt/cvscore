-- ── Referral columns on users ─────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_tokens_earned INTEGER NOT NULL DEFAULT 0;

-- ── Referral log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cv_referral_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  referrer_id TEXT NOT NULL REFERENCES users(id),
  referred_id TEXT REFERENCES users(id),
  tokens_gifted INTEGER NOT NULL DEFAULT 0,
  tokens_earned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cv_referral_log_referrer_idx ON cv_referral_log(referrer_id);
CREATE INDEX IF NOT EXISTS cv_referral_log_referred_idx ON cv_referral_log(referred_id);

-- ── Atomic referral credit (balance + lifetime stat + log) ─────────────────────
CREATE OR REPLACE FUNCTION credit_referral_tokens(
  p_referrer_id TEXT,
  p_referred_id TEXT,
  p_tokens      INTEGER
) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users
  SET token_balance          = token_balance + p_tokens,
      referral_tokens_earned = COALESCE(referral_tokens_earned, 0) + p_tokens
  WHERE id = p_referrer_id;

  UPDATE cv_referral_log
  SET tokens_earned = tokens_earned + p_tokens
  WHERE referrer_id = p_referrer_id
    AND referred_id = p_referred_id;
END;
$$;

-- ── Atomic referral count increment ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_referral_count(p_user_id TEXT)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users SET referral_count = referral_count + 1 WHERE id = p_user_id;
END;
$$;
