-- Drop unused payment-status columns from payment_bag_lines.
-- App code no longer reads or writes these fields. Future payment tracking should
-- use an explicit payment workflow/table instead of reusing these stale columns.

alter table public.payment_bag_lines
  drop column if exists issue_status,
  drop column if exists paid_amount,
  drop column if exists intro_card_received,
  drop column if exists handler,
  drop column if exists payment_status;
