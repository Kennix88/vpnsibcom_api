-- Convert ad and traffic balances into payment_balance
UPDATE "user_balance"
SET
    "payment_balance" = "payment_balance"
        + ("ad" * 0.125)
        + (("traffic" / 1024.0) * 4),
    "ad" = 0,
    "traffic" = 0
WHERE "ad" <> 0 OR "traffic" <> 0;
