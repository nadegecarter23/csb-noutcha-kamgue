import type { Prisma } from '@prisma/client';
import type { Database } from './db.js';
import { getContext } from './request-context.js';

/**
 * Journal d'audit (§57, règle 10 du §81).
 *
 * Deux principes non négociables :
 *
 *  1. L'écriture se fait DANS la transaction métier. Si l'action est annulée,
 *     le log l'est aussi — on ne veut pas de trace d'une opération qui n'a pas
 *     eu lieu, ni d'opération sans trace.
 *
 *  2. Aucun secret n'entre dans le journal. La liste noire ci-dessous est
 *     appliquée récursivement aux valeurs avant/après.
 *
 * La table est append-only au niveau des privilèges PostgreSQL : même un bug
 * applicatif ne peut pas effacer une trace.
 */

/** Champs jamais journalisés, quelle que soit leur provenance. */
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'currentPassword',
  'newPassword',
  'codeHash',
  'code_hash',
  'otp',
  'otpCode',
  'token',
  'tokenHash',
  'token_hash',
  'refreshToken',
  'refreshTokenHash',
  'refresh_token_hash',
  'accessToken',
  'secret',
  'apiKey',
]);

type JsonValue = Prisma.InputJsonValue;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));

  if (typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_FIELDS.has(key) ? '[REDACTED]' : sanitize(entry, depth + 1);
    }
    return result;
  }

  // Les BigInt ne sont pas sérialisables en JSON.
  if (typeof value === 'bigint') return value.toString();
  return value;
}

/**
 * Ne conserve que les champs réellement modifiés.
 *
 * Journaliser l'objet entier à chaque écriture rend le journal illisible et
 * empêche de repérer ce qui a changé — c'est pourtant la seule question qu'on
 * pose à un journal d'audit.
 */
export function diffValues(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): { oldValues: JsonValue | undefined; newValues: JsonValue | undefined } {
  if (!before) {
    return {
      oldValues: undefined,
      newValues: after ? (sanitize(after) as JsonValue) : undefined,
    };
  }
  if (!after) {
    return { oldValues: sanitize(before) as JsonValue, newValues: undefined };
  }

  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(sanitize(a)) !== JSON.stringify(sanitize(b))) {
      oldValues[key] = sanitize(a);
      newValues[key] = sanitize(b);
    }
  }

  if (Object.keys(newValues).length === 0) {
    return { oldValues: undefined, newValues: undefined };
  }
  return { oldValues: oldValues as JsonValue, newValues: newValues as JsonValue };
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  schoolId?: string | null;
  userId?: string | null;
  actorType?: 'USER' | 'SYSTEM' | 'WEBHOOK';
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Montant, motif, référence — pour un journal lisible sans jointure. */
  metadata?: Record<string, unknown>;
}

export interface AuditService {
  log(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void>;
}

export function createAuditService(db: Database): AuditService {
  return {
    async log(entry, tx) {
      const client = tx ?? db;
      const context = getContext();
      const { oldValues, newValues } = diffValues(entry.before, entry.after);

      await client.auditLog.create({
        data: {
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          actorType: entry.actorType ?? (context?.userId ? 'USER' : 'SYSTEM'),
          schoolId: entry.schoolId ?? context?.schoolId ?? null,
          userId: entry.userId ?? context?.userId ?? null,
          ...(oldValues !== undefined && { oldValues }),
          ...(newValues !== undefined && { newValues }),
          ...(entry.metadata && { metadata: sanitize(entry.metadata) as JsonValue }),
          ipAddress: context?.ipAddress ?? null,
          userAgent: context?.userAgent ?? null,
          requestId: context?.requestId ?? null,
        },
      });
    },
  };
}

/**
 * Catalogue des actions auditées (docs/05-RBAC-PERMISSIONS.md §8).
 *
 * Le test de couverture d'audit de la Phase 16 s'appuie sur cette liste : une
 * action ajoutée ici sans implémentation fait échouer la CI. Elle s'enrichit
 * à chaque phase.
 */
export const AuditAction = {
  // Sécurité (Phase 01)
  LOGIN_SUCCEEDED: 'auth.login_succeeded',
  LOGIN_FAILED: 'auth.login_failed',
  LOGOUT: 'auth.logout',
  ACCOUNT_LOCKED: 'auth.account_locked',
  PASSWORD_CHANGED: 'auth.password_changed',
  PASSWORD_RESET: 'auth.password_reset',
  PHONE_CHANGED: 'auth.phone_changed',
  PHONE_VERIFIED: 'auth.phone_verified',
  SESSION_REVOKED: 'auth.session_revoked',
  TOKEN_REUSE_DETECTED: 'auth.token_reuse_detected',

  USER_CREATED: 'user.create',
  USER_UPDATED: 'user.update',
  USER_DEACTIVATED: 'user.deactivate',
  USER_ROLES_ASSIGNED: 'user.assign_roles',
  USER_SCOPES_ASSIGNED: 'user.assign_scopes',
  ROLE_CREATED: 'role.create',
  ROLE_UPDATED: 'role.update',
  SETTINGS_UPDATED: 'settings.update',
  MODULE_SETTINGS_UPDATED: 'modules.update',

  ACADEMIC_YEAR_CREATED: 'academic_year.create',
  ACADEMIC_YEAR_UPDATED: 'academic_year.update',
  ACADEMIC_YEAR_ACTIVATED: 'academic_year.activate',
  ACADEMIC_YEAR_CLOSED: 'academic_year.close',
  ACADEMIC_YEAR_ARCHIVED: 'academic_year.archive',
  ACADEMIC_STRUCTURE_DUPLICATED: 'academic_year.duplicate_structure',
  GRADE_LEVEL_CREATED: 'grade_level.create',
  GRADE_LEVEL_UPDATED: 'grade_level.update',
  GRADE_LEVEL_REORDERED: 'grade_level.reorder',
  GRADE_LEVEL_DEACTIVATED: 'grade_level.deactivate',
  CLASS_CREATED: 'class.create',
  CLASS_UPDATED: 'class.update',
  CLASS_DEACTIVATED: 'class.deactivate',
  SUBJECT_CREATED: 'subject.create',
  SUBJECT_UPDATED: 'subject.update',
  TEACHING_ASSIGNMENT_SAVED: 'teaching_assignment.save',
  TIMETABLE_ROOM_CREATED: 'timetable_room.create',
  TIMETABLE_ENTRY_CREATED: 'timetable_entry.create',
  TIMETABLE_ENTRY_CANCELLED: 'timetable_entry.cancel',
  TIMETABLE_PUBLISHED: 'timetable.publish',
  ATTENDANCE_SESSION_OPENED: 'attendance_session.open',
  ATTENDANCE_SAVED: 'attendance.save',
  ATTENDANCE_VALIDATED: 'attendance.validate',
  ATTENDANCE_JUSTIFICATION_UPDATED: 'attendance_justification.update',
  ACADEMIC_PERIOD_CREATED: 'academic_period.create',
  ACADEMIC_PERIOD_STATUS_CHANGED: 'academic_period.status_change',
  ASSESSMENT_TYPE_CREATED: 'assessment_type.create',
  COMPETENCY_CREATED: 'competency.create',
  GRADING_POLICY_CREATED: 'grading_policy.create',
  ASSESSMENT_CREATED: 'assessment.create',
  GRADES_SAVED: 'assessment.grades_save',
  ASSESSMENT_PUBLISHED: 'assessment.publish',
  REPORT_CARDS_GENERATED: 'report_cards.generate',
  REPORT_CARD_UPDATED: 'report_card.update',
  REPORT_CARDS_PUBLISHED: 'report_cards.publish',
  STUDENT_INCIDENT_CREATED: 'student_incident.create',
  DISCIPLINARY_ACTION_CREATED: 'disciplinary_action.create',
  STUDENT_INCIDENT_CLOSED: 'student_incident.close',
  HEALTH_VISIT_CREATED: 'health_visit.create',
  STAFF_PROFILE_UPDATED: 'staff_profile.update',
  STAFF_DIRECTORY_READ: 'staff_directory.read',
  STAFF_LEAVE_CREATED: 'staff_leave.create',
  STAFF_LEAVE_DECIDED: 'staff_leave.decide',
  ANNOUNCEMENT_CREATED: 'announcement.create',
  SCHOOL_EVENT_CREATED: 'school_event.create',
  HOMEWORK_CREATED: 'homework.create',
  SCHOOL_MESSAGE_SENT: 'school_message.send',
  LIBRARY_BOOK_CREATED: 'library_book.create',
  LIBRARY_LOAN_CREATED: 'library_loan.create',
  LIBRARY_LOAN_RETURNED: 'library_loan.return',
  CANTEEN_MEAL_SAVED: 'canteen_meal.save',
  TRANSPORT_ROUTE_CREATED: 'transport_route.create',
  TRANSPORT_ENROLLMENT_CREATED: 'transport_enrollment.create',
  INVENTORY_ITEM_CREATED: 'inventory_item.create',
  INVENTORY_MOVEMENT_CREATED: 'inventory_movement.create',
  SUPPLIER_CREATED: 'supplier.create',
  SUPPLIER_UPDATED: 'supplier.update',
  EXPENSE_CATEGORY_CREATED: 'expense_category.create',
  PURCHASE_ORDER_CREATED: 'purchase_order.create',
  PURCHASE_ORDER_SUBMITTED: 'purchase_order.submit',
  PURCHASE_ORDER_DECIDED: 'purchase_order.decide',
  PURCHASE_ORDER_RECEIVED: 'purchase_order.receive',
  EXPENSE_CREATED: 'expense.create',
  EXPENSE_SUBMITTED: 'expense.submit',
  EXPENSE_DECIDED: 'expense.decide',
  SUPPLIER_PAYMENT_CREATED: 'supplier_payment.create',
  STUDENT_CATEGORY_CREATED: 'student_category.create',
  STUDENT_CATEGORY_UPDATED: 'student_category.update',
  STUDENT_CREATED: 'student.create',
  STUDENT_UPDATED: 'student.update',
  STUDENT_NUMBER_CORRECTED: 'student.correct_number',
  STUDENT_STATUS_CHANGED: 'student.change_status',
  STUDENT_DELETED: 'student.delete',
  ENROLLMENT_CREATED: 'enrollment.create',
  ENROLLMENT_UPDATED: 'enrollment.update',
  ENROLLMENT_CLASS_TRANSFERRED: 'enrollment.transfer_class',
  ENROLLMENT_CANCELLED: 'enrollment.cancel',
  GUARDIAN_CREATED: 'guardian.create',
  GUARDIAN_UPDATED: 'guardian.update',
  GUARDIAN_LINK_CREATED: 'guardian_link.create',
  GUARDIAN_LINK_UPDATED: 'guardian_link.update',
  GUARDIAN_LINK_ACCEPTED: 'guardian_link.accept',
  GUARDIAN_LINK_REJECTED: 'guardian_link.reject',
  GUARDIAN_LINK_REVOKED: 'guardian_link.revoke',
  GUARDIAN_AUTO_DETECTED: 'guardian.auto_detected',
  GUARDIAN_INVITE_CREATED: 'guardian_invite.create',
  GUARDIAN_INVITE_REDEEMED: 'guardian_invite.redeem',
  GUARDIAN_INVITE_REVOKED: 'guardian_invite.revoke',
  GUARDIAN_REQUEST_CREATED: 'guardian_request.create',
  GUARDIAN_REQUEST_APPROVED: 'guardian_request.approve',
  GUARDIAN_REQUEST_REJECTED: 'guardian_request.reject',
  IMPORT_CREATED: 'import.create',
  IMPORT_VALIDATED: 'import.validate',
  IMPORT_EXECUTED: 'import.execute',
  ENROLLMENT_REENROLLED: 'enrollment.reenroll',
  FEE_TYPE_CREATED: 'fee_type.create',
  FEE_TYPE_UPDATED: 'fee_type.update',
  FEE_STRUCTURE_CREATED: 'fee_structure.create',
  FEE_STRUCTURE_UPDATED: 'fee_structure.update',
  FEE_STRUCTURE_DUPLICATED: 'fee_structure.duplicate',
  STUDENT_FEES_ASSIGNED: 'student_fees.assign',
  DISCOUNT_CREATED: 'discount.create',
  DISCOUNT_APPROVED: 'discount.approve',
  DISCOUNT_REJECTED: 'discount.reject',
  DISCOUNT_CANCELLED: 'discount.cancel',
  PAYMENT_CREATED: 'payment.create',
  PAYMENT_SUCCEEDED: 'payment.succeed',
  PAYMENT_FAILED: 'payment.fail',
  PAYMENT_INVESTIGATION: 'payment.investigation',
  PAYMENT_REALLOCATED: 'payment.reallocate',
  PAYMENT_REVERSED: 'payment.reverse',
  EXTERNAL_PAYMENT_DECLARED: 'external_payment.declare',
  EXTERNAL_PAYMENT_CANCELLED: 'external_payment.cancel',
  EXTERNAL_PAYMENT_VALIDATED: 'external_payment.validate',
  EXTERNAL_PAYMENT_REJECTED: 'external_payment.reject',
  EXTERNAL_PAYMENT_CORRECTION_REQUESTED: 'external_payment.request_correction',
  NOTIFICATION_TEMPLATE_UPDATED: 'notification_template.update',
  NOTIFICATION_BROADCAST_SENT: 'notification.broadcast',
  CASH_SESSION_OPENED: 'cash_session.opened',
  CASH_SESSION_CLOSED: 'cash_session.closed',
  CASH_SESSION_RECONCILED: 'cash_session.reconciled',
  RECEIPT_REISSUED: 'receipt.reissue',
  SAVED_REPORT_QUERY_CREATED: 'report.saved_query.create',
  EXPORT_REQUESTED: 'export.request',
  EXPORT_READY: 'export.ready',
  EXPORT_DOWNLOADED: 'export.download',
  DOCUMENT_TEMPLATE_UPDATED: 'document_template.update',
  DATA_RETENTION_PURGED: 'security.retention_purge',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];
