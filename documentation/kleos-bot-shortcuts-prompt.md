# Kleos Bot Apple Shortcuts persistence contract

Apple Shortcuts may trigger a ChatGPT run at any frequency. The ChatGPT run must read current canonical Kleos evidence, evaluate exactly the eight canonical vectors under methodology `1.0.0`, validate the payload, generate a unique per-execution idempotency key, and persist through the connected Supabase privileged SQL interface.

For privileged ChatGPT/Supabase execution, call:

`public.create_kleos_bot_snapshot_admin(...)`

Do not set or fabricate `request.jwt.claims`. Do not supply an owner UUID. The privileged persistence function resolves the authorized Kleos owner internally and is not executable by normal API roles.

Distinct execution keys create distinct immutable snapshots regardless of time. Reusing the exact same execution key is treated as a retry and returns the existing snapshot.
