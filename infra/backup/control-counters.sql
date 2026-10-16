-- CSB-00.5 - Compteurs stables de contrôle avant/après sauvegarde ou migration.
-- La sortie est un unique document JSON, trié par code établissement, afin de
-- pouvoir être comparée octet pour octet après restauration.
WITH
student_counts AS (
  SELECT school_id,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE status = 'ACTIVE')::bigint AS active
  FROM students GROUP BY school_id
),
enrollment_counts AS (
  SELECT school_id,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE status = 'ACTIVE')::bigint AS active
  FROM enrollments GROUP BY school_id
),
payment_counts AS (
  SELECT school_id,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE status = 'SUCCESS')::bigint AS successful,
    COUNT(*) FILTER (WHERE status = 'REVERSED')::bigint AS reversed,
    COALESCE(SUM(amount) FILTER (WHERE status IN ('SUCCESS', 'REVERSED')), 0)::bigint AS ledger_amount
  FROM payments GROUP BY school_id
),
receipt_counts AS (
  SELECT school_id,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE cancelled_at IS NULL)::bigint AS active
  FROM receipts GROUP BY school_id
),
balance_counts AS (
  SELECT school_id,
    COALESCE(SUM(total_due), 0)::bigint AS total_due,
    COALESCE(SUM(total_paid), 0)::bigint AS total_paid,
    COALESCE(SUM(balance), 0)::bigint AS outstanding
  FROM v_enrollment_balance GROUP BY school_id
),
balance_audit AS (
  SELECT b.school_id,
    COUNT(*) FILTER (
      WHERE b.total_due <> a.total_due
         OR b.total_paid <> a.total_paid
         OR b.balance <> a.balance
    )::bigint AS discrepancies
  FROM v_enrollment_balance b
  JOIN v_enrollment_balance_audit a USING (enrollment_id)
  GROUP BY b.school_id
),
staff_counts AS (
  SELECT school_id,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE status = 'ACTIVE')::bigint AS active
  FROM staff_profiles GROUP BY school_id
),
grade_counts AS (
  SELECT school_id, COUNT(*)::bigint AS total FROM grades GROUP BY school_id
),
report_card_counts AS (
  SELECT school_id,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE status = 'PUBLISHED')::bigint AS published
  FROM report_cards GROUP BY school_id
),
file_counts AS (
  SELECT school_id,
    COUNT(*)::bigint AS metadata_total,
    COALESCE(SUM(size_bytes), 0)::bigint AS metadata_size_bytes
  FROM files GROUP BY school_id
),
counters AS (
  SELECT
    s.id AS school_id,
    s.code AS school_code,
    jsonb_build_object(
      'students', jsonb_build_object('total', COALESCE(st.total, 0), 'active', COALESCE(st.active, 0)),
      'enrollments', jsonb_build_object('total', COALESCE(en.total, 0), 'active', COALESCE(en.active, 0)),
      'payments', jsonb_build_object(
        'total', COALESCE(pa.total, 0),
        'successful', COALESCE(pa.successful, 0),
        'reversed', COALESCE(pa.reversed, 0),
        'ledger_amount_xaf', COALESCE(pa.ledger_amount, 0)
      ),
      'receipts', jsonb_build_object('total', COALESCE(re.total, 0), 'active', COALESCE(re.active, 0)),
      'balances', jsonb_build_object(
        'total_due_xaf', COALESCE(ba.total_due, 0),
        'total_paid_xaf', COALESCE(ba.total_paid, 0),
        'outstanding_xaf', COALESCE(ba.outstanding, 0),
        'audit_discrepancies', COALESCE(bau.discrepancies, 0)
      ),
      'staff', jsonb_build_object('total', COALESCE(sf.total, 0), 'active', COALESCE(sf.active, 0)),
      'grades', jsonb_build_object('total', COALESCE(gr.total, 0)),
      'report_cards', jsonb_build_object('total', COALESCE(rc.total, 0), 'published', COALESCE(rc.published, 0)),
      'files', jsonb_build_object(
        'metadata_total', COALESCE(fi.metadata_total, 0),
        'metadata_size_bytes', COALESCE(fi.metadata_size_bytes, 0)
      )
    ) AS values
  FROM schools s
  LEFT JOIN student_counts st ON st.school_id = s.id
  LEFT JOIN enrollment_counts en ON en.school_id = s.id
  LEFT JOIN payment_counts pa ON pa.school_id = s.id
  LEFT JOIN receipt_counts re ON re.school_id = s.id
  LEFT JOIN balance_counts ba ON ba.school_id = s.id
  LEFT JOIN balance_audit bau ON bau.school_id = s.id
  LEFT JOIN staff_counts sf ON sf.school_id = s.id
  LEFT JOIN grade_counts gr ON gr.school_id = s.id
  LEFT JOIN report_card_counts rc ON rc.school_id = s.id
  LEFT JOIN file_counts fi ON fi.school_id = s.id
)
SELECT COALESCE(
  jsonb_agg(
    jsonb_build_object('school_id', school_id, 'school_code', school_code, 'counters', values)
    ORDER BY school_code
  ),
  '[]'::jsonb
)::text
FROM counters;
