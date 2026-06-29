-- Updated credit_referral_tokens — called from Stripe webhook after purchase.
-- Handles first-time vs repeat purchases from the same referred user.
CREATE OR REPLACE FUNCTION credit_referral_tokens(
  p_referrer_id TEXT,
  p_referred_id TEXT,
  p_tokens      INTEGER
) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  existing_earn_rows INTEGER;
BEGIN
  -- Credit referrer's balance and lifetime earnings stat
  UPDATE users
  SET token_balance          = token_balance + p_tokens,
      referral_tokens_earned = COALESCE(referral_tokens_earned, 0) + p_tokens
  WHERE id = p_referrer_id;

  -- Check whether we already have an earn log entry for this referrer/referred pair
  -- (earn rows have tokens_gifted = 0 to distinguish from gift rows)
  SELECT COUNT(*) INTO existing_earn_rows
  FROM cv_referral_log
  WHERE referrer_id = p_referrer_id
    AND referred_id = p_referred_id
    AND tokens_gifted = 0;

  IF existing_earn_rows > 0 THEN
    -- Subsequent purchase — accumulate tokens_earned on existing row
    UPDATE cv_referral_log
    SET tokens_earned = tokens_earned + p_tokens
    WHERE referrer_id = p_referrer_id
      AND referred_id = p_referred_id
      AND tokens_gifted = 0;
  ELSE
    -- First purchase from this referred user — insert earn row and increment count
    INSERT INTO cv_referral_log (referrer_id, referred_id, tokens_gifted, tokens_earned)
    VALUES (p_referrer_id, p_referred_id, 0, p_tokens);

    UPDATE users
    SET referral_count = referral_count + 1
    WHERE id = p_referrer_id;
  END IF;
END;
$$;
