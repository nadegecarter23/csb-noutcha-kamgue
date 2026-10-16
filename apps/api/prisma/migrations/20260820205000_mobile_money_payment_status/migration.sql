-- PostgreSQL exige que la nouvelle valeur d'enum soit validée dans une
-- transaction distincte avant son utilisation dans un index partiel.
ALTER TYPE "payment_status" ADD VALUE IF NOT EXISTS 'PENDING_INVESTIGATION' AFTER 'PROCESSING';
