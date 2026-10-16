/**
 * Catalogue des permissions CSB Noutcha KAMGUE.
 *
 * Source de vérité UNIQUE, partagée entre l'API (gardes de routes), le web
 * (affichage conditionnel) et le seed (chargement en base).
 *
 * Nommage : `<domaine>.<action>`. Les permissions ne se créent jamais
 * dynamiquement — une permission absente d'ici n'existe pas.
 *
 * Référence : docs/05-RBAC-PERMISSIONS.md §3.
 * Les domaines non encore livrés sont déclarés dès maintenant afin que la
 * matrice de rôles soit complète et que chaque phase n'ait qu'à brancher ses
 * routes.
 */

export interface PermissionDefinition {
  code: string;
  description: string;
  group: string;
  /** Phase qui met cette permission en usage. Purement documentaire. */
  phase: number;
}

export const PERMISSIONS = [
  /* --- Référentiel scolaire (Phase 02) ---------------------------------- */
  {
    code: 'academic_years.read',
    description: 'Consulter les années scolaires',
    group: 'academic',
    phase: 2,
  },
  {
    code: 'academic_years.create',
    description: 'Créer une année scolaire',
    group: 'academic',
    phase: 2,
  },
  {
    code: 'academic_years.update',
    description: 'Modifier une année scolaire',
    group: 'academic',
    phase: 2,
  },
  {
    code: 'academic_years.close',
    description: 'Clôturer ou archiver une année',
    group: 'academic',
    phase: 2,
  },
  { code: 'grade_levels.read', description: 'Consulter les niveaux', group: 'academic', phase: 2 },
  { code: 'grade_levels.manage', description: 'Gérer les niveaux', group: 'academic', phase: 2 },
  { code: 'classes.read', description: 'Consulter les classes', group: 'academic', phase: 2 },
  { code: 'classes.manage', description: 'Gérer les classes', group: 'academic', phase: 2 },

  /* --- Pédagogie (Phase 18) --------------------------------------------- */
  {
    code: 'pedagogy.read',
    description: 'Consulter le centre pédagogique',
    group: 'pedagogy',
    phase: 18,
  },
  {
    code: 'subjects.manage',
    description: 'Gérer le référentiel des matières',
    group: 'pedagogy',
    phase: 18,
  },
  {
    code: 'teaching_assignments.manage',
    description: 'Affecter les enseignants aux classes',
    group: 'pedagogy',
    phase: 18,
  },
  {
    code: 'timetable.read',
    description: 'Consulter les emplois du temps',
    group: 'pedagogy',
    phase: 19,
  },
  {
    code: 'timetable.manage',
    description: 'Gérer les salles et les créneaux',
    group: 'pedagogy',
    phase: 19,
  },
  {
    code: 'timetable.publish',
    description: 'Publier un emploi du temps',
    group: 'pedagogy',
    phase: 19,
  },
  {
    code: 'attendance.read',
    description: 'Consulter les présences et absences',
    group: 'pedagogy',
    phase: 20,
  },
  {
    code: 'attendance.take',
    description: 'Effectuer et modifier un appel',
    group: 'pedagogy',
    phase: 20,
  },
  {
    code: 'attendance.validate',
    description: 'Valider un appel et alerter les responsables',
    group: 'pedagogy',
    phase: 20,
  },
  {
    code: 'attendance.justify',
    description: 'Traiter les justificatifs d’absence',
    group: 'pedagogy',
    phase: 20,
  },
  {
    code: 'assessments.read',
    description: 'Consulter les évaluations et les notes',
    group: 'pedagogy',
    phase: 21,
  },
  {
    code: 'assessments.manage',
    description: 'Gérer les périodes, types et évaluations',
    group: 'pedagogy',
    phase: 21,
  },
  {
    code: 'assessments.grade',
    description: 'Saisir les notes des élèves',
    group: 'pedagogy',
    phase: 21,
  },
  {
    code: 'assessments.publish',
    description: 'Publier et verrouiller les évaluations',
    group: 'pedagogy',
    phase: 21,
  },
  {
    code: 'grading_policies.manage',
    description: 'Versionner les règles de calcul des moyennes',
    group: 'pedagogy',
    phase: 21,
  },
  {
    code: 'report_cards.read',
    description: 'Consulter les bulletins',
    group: 'pedagogy',
    phase: 22,
  },
  {
    code: 'report_cards.generate',
    description: 'Calculer les bulletins',
    group: 'pedagogy',
    phase: 22,
  },
  {
    code: 'report_cards.comment',
    description: 'Renseigner appréciations et décisions',
    group: 'pedagogy',
    phase: 22,
  },
  {
    code: 'report_cards.publish',
    description: 'Publier les bulletins',
    group: 'pedagogy',
    phase: 22,
  },
  {
    code: 'student_life.read',
    description: 'Consulter les incidents et sanctions',
    group: 'student_life',
    phase: 23,
  },
  {
    code: 'student_life.manage',
    description: 'Gérer les incidents et sanctions',
    group: 'student_life',
    phase: 23,
  },
  {
    code: 'health_records.read',
    description: 'Consulter les passages à l’infirmerie',
    group: 'student_life',
    phase: 23,
  },
  {
    code: 'health_records.manage',
    description: 'Gérer les passages à l’infirmerie',
    group: 'student_life',
    phase: 23,
  },
  {
    code: 'staff.read',
    description: 'Consulter les dossiers du personnel',
    group: 'staff',
    phase: 24,
  },
  {
    code: 'staff.manage',
    description: 'Gérer les dossiers et contrats du personnel',
    group: 'staff',
    phase: 24,
  },
  {
    code: 'staff_leaves.manage',
    description: 'Gérer les congés et absences du personnel',
    group: 'staff',
    phase: 24,
  },
  {
    code: 'communications.read',
    description: 'Consulter les annonces, événements, devoirs et messages',
    group: 'communications',
    phase: 25,
  },
  {
    code: 'communications.manage',
    description: 'Publier les annonces, événements et devoirs',
    group: 'communications',
    phase: 25,
  },
  {
    code: 'messages.send',
    description: 'Envoyer des messages internes',
    group: 'communications',
    phase: 25,
  },
  {
    code: 'school_services.read',
    description: 'Consulter bibliothèque, cantine, transport et stocks',
    group: 'services',
    phase: 26,
  },
  {
    code: 'school_services.manage',
    description: 'Gérer bibliothèque, cantine, transport et stocks',
    group: 'services',
    phase: 26,
  },
  {
    code: 'portal.read',
    description: 'Accéder à son portail personnel',
    group: 'portal',
    phase: 27,
  },
  {
    code: 'suppliers.read',
    description: 'Consulter les fournisseurs',
    group: 'procurement',
    phase: 28,
  },
  {
    code: 'suppliers.manage',
    description: 'Gérer les fournisseurs et catégories de dépenses',
    group: 'procurement',
    phase: 28,
  },
  { code: 'purchases.read', description: 'Consulter les achats', group: 'procurement', phase: 28 },
  {
    code: 'purchases.create',
    description: 'Créer et soumettre des bons d’achat',
    group: 'procurement',
    phase: 28,
  },
  {
    code: 'purchases.approve',
    description: 'Approuver ou rejeter les achats',
    group: 'procurement',
    phase: 28,
  },
  {
    code: 'purchases.receive',
    description: 'Confirmer la réception des achats',
    group: 'procurement',
    phase: 28,
  },
  {
    code: 'expenses.read',
    description: 'Consulter les dépenses et échéances fournisseurs',
    group: 'procurement',
    phase: 28,
  },
  {
    code: 'expenses.create',
    description: 'Créer et soumettre les dépenses',
    group: 'procurement',
    phase: 28,
  },
  {
    code: 'expenses.approve',
    description: 'Approuver ou rejeter les dépenses',
    group: 'procurement',
    phase: 28,
  },
  {
    code: 'expenses.pay',
    description: 'Décaisser les paiements fournisseurs',
    group: 'procurement',
    phase: 28,
  },

  /* --- Élèves & inscriptions (Phase 03) --------------------------------- */
  { code: 'students.read', description: 'Consulter les élèves', group: 'students', phase: 3 },
  { code: 'students.create', description: 'Créer un élève', group: 'students', phase: 3 },
  { code: 'students.update', description: 'Modifier un élève', group: 'students', phase: 3 },
  {
    code: 'students.change_status',
    description: "Changer le statut d'un élève",
    group: 'students',
    phase: 3,
  },
  {
    code: 'students.archive',
    description: 'Archiver ou supprimer un élève',
    group: 'students',
    phase: 3,
  },
  {
    code: 'students.export',
    description: 'Exporter la liste des élèves',
    group: 'students',
    phase: 3,
  },
  {
    code: 'students.print',
    description: 'Imprimer les fiches élèves',
    group: 'students',
    phase: 3,
  },
  {
    code: 'enrollments.read',
    description: 'Consulter les inscriptions',
    group: 'students',
    phase: 3,
  },
  { code: 'enrollments.create', description: 'Créer une inscription', group: 'students', phase: 3 },
  {
    code: 'enrollments.update',
    description: 'Modifier une inscription',
    group: 'students',
    phase: 3,
  },
  {
    code: 'enrollments.transfer_class',
    description: 'Changer un élève de classe',
    group: 'students',
    phase: 3,
  },
  {
    code: 'enrollments.cancel',
    description: 'Annuler une inscription',
    group: 'students',
    phase: 3,
  },
  {
    code: 'enrollments.bulk_reenroll',
    description: 'Réinscrire en masse',
    group: 'students',
    phase: 5,
  },
  {
    code: 'imports.students.run',
    description: 'Importer des élèves depuis un fichier',
    group: 'students',
    phase: 5,
  },

  /* --- Responsables & associations (Phase 04) --------------------------- */
  {
    code: 'guardians.read',
    description: 'Consulter les responsables',
    group: 'guardians',
    phase: 4,
  },
  { code: 'guardians.create', description: 'Créer un responsable', group: 'guardians', phase: 4 },
  {
    code: 'guardians.update',
    description: 'Modifier un responsable',
    group: 'guardians',
    phase: 4,
  },
  {
    code: 'guardian_links.read',
    description: 'Consulter les associations parent-élève',
    group: 'guardians',
    phase: 4,
  },
  {
    code: 'guardian_links.create',
    description: 'Rattacher un responsable à un élève',
    group: 'guardians',
    phase: 4,
  },
  {
    code: 'guardian_links.revoke',
    description: "Révoquer l'accès d'un responsable",
    group: 'guardians',
    phase: 4,
  },
  {
    code: 'guardian_invites.manage',
    description: 'Générer ou révoquer un code d’association',
    group: 'guardians',
    phase: 4,
  },
  {
    code: 'guardian_requests.handle',
    description: 'Traiter les demandes et litiges d’association',
    group: 'guardians',
    phase: 4,
  },

  /* --- Structure financière (Phase 06) ---------------------------------- */
  {
    code: 'fee_types.read',
    description: 'Consulter les types de frais',
    group: 'billing',
    phase: 6,
  },
  { code: 'fee_types.manage', description: 'Gérer les types de frais', group: 'billing', phase: 6 },
  {
    code: 'fee_structures.read',
    description: 'Consulter les structures tarifaires',
    group: 'billing',
    phase: 6,
  },
  {
    code: 'fee_structures.manage',
    description: 'Créer et modifier les structures tarifaires',
    group: 'billing',
    phase: 6,
  },
  {
    code: 'fee_structures.duplicate_year',
    description: "Dupliquer les tarifs vers l'année suivante",
    group: 'billing',
    phase: 6,
  },
  {
    code: 'student_fees.read',
    description: "Consulter la situation financière d'un élève",
    group: 'billing',
    phase: 6,
  },
  {
    code: 'student_fees.assign',
    description: 'Affecter des frais à un élève',
    group: 'billing',
    phase: 6,
  },
  {
    code: 'student_fees.recalculate',
    description: 'Recalculer les affectations de frais',
    group: 'billing',
    phase: 6,
  },
  { code: 'student_fees.waive', description: 'Annuler une dette', group: 'billing', phase: 6 },
  { code: 'discounts.read', description: 'Consulter les remises', group: 'billing', phase: 6 },
  { code: 'discounts.create', description: 'Créer une remise', group: 'billing', phase: 6 },
  { code: 'discounts.approve', description: 'Approuver une remise', group: 'billing', phase: 6 },
  { code: 'discounts.cancel', description: 'Annuler une remise', group: 'billing', phase: 6 },

  /* --- Paiements (Phases 07, 08, 11, 12) -------------------------------- */
  {
    code: 'payments.read',
    description: 'Consulter tous les paiements',
    group: 'payments',
    phase: 7,
  },
  {
    code: 'payments.read_own',
    description: 'Consulter les paiements de ses enfants',
    group: 'payments',
    phase: 10,
  },
  {
    code: 'payments.create_cash',
    description: 'Encaisser au guichet',
    group: 'payments',
    phase: 8,
  },
  {
    code: 'payments.create_online',
    description: 'Initier un paiement Mobile Money',
    group: 'payments',
    phase: 11,
  },
  {
    code: 'payments.declare_external',
    description: 'Déclarer un paiement externe',
    group: 'payments',
    phase: 12,
  },
  {
    code: 'payments.validate_external',
    description: 'Valider ou rejeter un paiement externe',
    group: 'payments',
    phase: 12,
  },
  {
    code: 'payments.allocate_manual',
    description: 'Affecter manuellement un paiement',
    group: 'payments',
    phase: 7,
  },
  {
    code: 'payments.reverse',
    description: 'Contrepasser un paiement',
    group: 'payments',
    phase: 7,
  },
  {
    code: 'payments.approve_reversal',
    description: 'Approuver une contrepassation au-delà du seuil',
    group: 'payments',
    phase: 7,
  },
  { code: 'payments.export', description: 'Exporter les paiements', group: 'payments', phase: 15 },

  /* --- Notifications (Phase 13) ---------------------------------------- */
  {
    code: 'notifications.manage',
    description: 'Configurer les modèles de notification',
    group: 'notifications',
    phase: 13,
  },
  {
    code: 'notifications.broadcast',
    description: 'Envoyer une annonce aux familles',
    group: 'notifications',
    phase: 13,
  },
  {
    code: 'notifications.read_stats',
    description: 'Consulter les statistiques de livraison',
    group: 'notifications',
    phase: 13,
  },

  /* --- Caisse (Phase 08) ------------------------------------------------ */
  {
    code: 'cash_sessions.operate',
    description: 'Ouvrir et fermer sa caisse',
    group: 'cashier',
    phase: 8,
  },
  {
    code: 'cash_sessions.read',
    description: 'Consulter les sessions de caisse',
    group: 'cashier',
    phase: 8,
  },
  {
    code: 'cash_sessions.reconcile',
    description: 'Rapprocher une session de caisse',
    group: 'cashier',
    phase: 8,
  },

  /* --- Reçus (Phase 07) ------------------------------------------------- */
  { code: 'receipts.read', description: 'Consulter les reçus', group: 'receipts', phase: 7 },
  {
    code: 'receipts.read_own',
    description: 'Consulter ses propres reçus',
    group: 'receipts',
    phase: 10,
  },
  { code: 'receipts.print', description: 'Imprimer un reçu', group: 'receipts', phase: 7 },
  { code: 'receipts.reissue', description: 'Rééditer un reçu', group: 'receipts', phase: 7 },

  /* --- Reporting (Phases 14, 15) ---------------------------------------- */
  {
    code: 'reports.financial.read',
    description: 'Consulter les états financiers',
    group: 'reporting',
    phase: 14,
  },
  {
    code: 'reports.director.read',
    description: 'Consulter le tableau de bord Direction',
    group: 'reporting',
    phase: 14,
  },
  { code: 'reports.export', description: 'Exporter les états', group: 'reporting', phase: 15 },
  {
    code: 'search.global',
    description: 'Utiliser la recherche globale',
    group: 'reporting',
    phase: 3,
  },

  /* --- Administration & sécurité (Phase 01) ----------------------------- */
  { code: 'users.read', description: 'Consulter les utilisateurs', group: 'admin', phase: 1 },
  { code: 'users.create', description: 'Créer un utilisateur', group: 'admin', phase: 1 },
  { code: 'users.update', description: 'Modifier un utilisateur', group: 'admin', phase: 1 },
  { code: 'users.deactivate', description: 'Désactiver un utilisateur', group: 'admin', phase: 1 },
  { code: 'users.assign_roles', description: 'Attribuer des rôles', group: 'admin', phase: 1 },
  { code: 'roles.read', description: 'Consulter les rôles', group: 'admin', phase: 1 },
  { code: 'roles.manage', description: 'Créer et modifier les rôles', group: 'admin', phase: 1 },
  { code: 'audit.read', description: "Consulter le journal d'audit", group: 'admin', phase: 1 },
  {
    code: 'audit.read_financial',
    description: "Consulter le journal d'audit financier",
    group: 'admin',
    phase: 1,
  },
  {
    code: 'settings.read',
    description: "Consulter les paramètres de l'établissement",
    group: 'admin',
    phase: 1,
  },
  {
    code: 'settings.update',
    description: "Modifier les paramètres de l'établissement",
    group: 'admin',
    phase: 1,
  },
  {
    code: 'settings.update_financial',
    description: 'Modifier les paramètres financiers',
    group: 'admin',
    phase: 6,
  },
  {
    code: 'schools.manage',
    description: 'Gérer les établissements de la plateforme',
    group: 'platform',
    phase: 1,
  },
] as const satisfies readonly PermissionDefinition[];

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];

export const PERMISSION_CODES: readonly PermissionCode[] = PERMISSIONS.map((p) => p.code);

/** Vrai si la chaîne correspond à une permission du catalogue. */
export function isPermissionCode(value: string): value is PermissionCode {
  return (PERMISSION_CODES as readonly string[]).includes(value);
}
