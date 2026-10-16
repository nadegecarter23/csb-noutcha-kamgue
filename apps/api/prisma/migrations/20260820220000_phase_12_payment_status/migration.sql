-- La valeur d'enum est isolée : PostgreSQL interdit son utilisation dans la
-- même transaction que ALTER TYPE ... ADD VALUE.
ALTER TYPE "payment_status" ADD VALUE IF NOT EXISTS 'CORRECTION_REQUESTED' AFTER 'AWAITING_VALIDATION';

