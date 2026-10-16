-- Phase 16: le grand livre financier et le journal d'audit sont append-only.
CREATE OR REPLACE FUNCTION prevent_financial_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'SUCCESS' THEN
    IF NEW.status NOT IN ('SUCCESS', 'REVERSED') THEN
      RAISE EXCEPTION 'A successful payment may only be reversed';
    END IF;
    IF NEW.school_id IS DISTINCT FROM OLD.school_id
      OR NEW.reference IS DISTINCT FROM OLD.reference
      OR NEW.payer_user_id IS DISTINCT FROM OLD.payer_user_id
      OR NEW.payer_name IS DISTINCT FROM OLD.payer_name
      OR NEW.payer_phone IS DISTINCT FROM OLD.payer_phone
      OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
      OR NEW.provider IS DISTINCT FROM OLD.provider
      OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
      OR NEW.provider_financial_id IS DISTINCT FROM OLD.provider_financial_id
      OR NEW.external_reference IS DISTINCT FROM OLD.external_reference
      OR NEW.channel IS DISTINCT FROM OLD.channel
      OR NEW.reversal_of_payment_id IS DISTINCT FROM OLD.reversal_of_payment_id
      OR NEW.initiated_at IS DISTINCT FROM OLD.initiated_at
      OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
      OR NEW.validated_at IS DISTINCT FROM OLD.validated_at
      OR NEW.validated_by IS DISTINCT FROM OLD.validated_by
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.cash_session_id IS DISTINCT FROM OLD.cash_session_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Successful payment financial fields are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_financial_immutability ON payments;
CREATE TRIGGER payments_financial_immutability BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION prevent_financial_mutation();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cplan_app') THEN
    EXECUTE 'REVOKE DELETE ON payments, payment_allocations, receipts, audit_logs FROM cplan_app';
    EXECUTE 'REVOKE UPDATE ON audit_logs FROM cplan_app';
  END IF;
END
$$;
