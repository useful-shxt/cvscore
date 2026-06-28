-- ── Token system columns on users table ────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_free_tier BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_tokens_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_spent FLOAT NOT NULL DEFAULT 0.0;

-- ── Atomic token deduction + platform budget update ─────────────────────────────
-- Returns jsonb { "success": boolean, "new_balance": integer }
-- Only deducts if token_balance >= p_tokens. If not, returns success=false.
CREATE OR REPLACE FUNCTION deduct_user_tokens(
  p_user_id TEXT,
  p_tokens INTEGER,
  p_api_cost FLOAT
) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_is_free BOOLEAN;
  v_new_balance INTEGER;
BEGIN
  -- Atomic deduction: only fires if balance is sufficient
  UPDATE users
  SET
    token_balance    = GREATEST(token_balance - p_tokens, 0),
    total_tokens_used = total_tokens_used + p_tokens,
    total_spent      = total_spent + p_api_cost
  WHERE id = p_user_id
    AND token_balance >= p_tokens
  RETURNING is_free_tier, token_balance INTO v_is_free, v_new_balance;

  IF NOT FOUND THEN
    -- Balance was insufficient — no deduction made
    RETURN jsonb_build_object('success', false, 'new_balance', 0);
  END IF;

  -- Update shared platform budget for free-tier users
  IF v_is_free THEN
    UPDATE cv_platform_config
    SET value = (COALESCE(value::float, 0) + p_api_cost)::text
    WHERE key = 'free_budget_spent';
  END IF;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;
