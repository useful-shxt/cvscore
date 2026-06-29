-- Atomic token credit on purchase (called from Stripe webhook)
CREATE OR REPLACE FUNCTION credit_user_tokens(
  p_user_id TEXT,
  p_tokens  INTEGER
) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users
  SET token_balance = token_balance + p_tokens
  WHERE id = p_user_id;
END;
$$;
