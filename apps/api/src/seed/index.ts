import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLES, permissionsForRole } from '@cplan/contracts';
import { requirePhone } from '@cplan/domain';
import { hashPassword } from '../platform/crypto.js';
import { createAuditService } from '../platform/audit.js';
import { createReportCardsService } from '../modules/report-cards/report-cards.service.js';
import { seedExtendedDemoData } from './modules.js';

/**
 * Jeu de données de démonstration.
 *
 * Exigence de la Definition of Done (docs/06-CONVENTIONS-DEV.md §9) : le seed
 * doit permettre de rejouer le parcours de bout en bout de chaque phase livrée.
 *
 * IDEMPOTENT : `pnpm db:seed` exécuté deux fois ne produit aucun doublon.
 * Les identifiants des comptes de démonstration sont remis à leur valeur documentée.
 */
const prisma = new PrismaClient();

const DEMO_SCHOOL_CODE = 'CSBNK';
const DEMO_PASSWORD = 'CSBNoutchaDemo2026!';

function log(message: string): void {
  process.stdout.write(`  ${message}\n`);
}

/* -------------------------------------------------------------------------- */

async function verifyFoundations(): Promise<void> {
  const [uuid] = await prisma.$queryRaw<Array<{ id: string }>>`SELECT uuidv7() AS id`;
  if (uuid?.id[14] !== '7') {
    throw new Error('uuidv7() est absente ou incorrecte. Lancez « pnpm db:migrate ».');
  }
  log(`Fondations SQL          uuidv7 → ${uuid.id}`);
}

async function seedPermissions(): Promise<void> {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: { description: permission.description, group: permission.group },
      create: {
        code: permission.code,
        description: permission.description,
        group: permission.group,
      },
    });
  }
  log(`Permissions             ${PERMISSIONS.length} entrées`);
}

async function seedRoles(): Promise<void> {
  const permissionIds = new Map(
    (await prisma.permission.findMany({ select: { id: true, code: true } })).map((p) => [
      p.code,
      p.id,
    ]),
  );

  for (const definition of ROLES) {
    // Les rôles natifs sont globaux (school_id NULL). Prisma refuse `null`
    // dans un `where` composé portant sur une colonne nullable : on passe donc
    // par findFirst + create/update plutôt que par upsert.
    const existing = await prisma.role.findFirst({
      where: { code: definition.code, schoolId: null },
    });

    const role = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: {
            name: definition.name,
            description: definition.description,
            isSystem: true,
          },
        })
      : await prisma.role.create({
          data: {
            code: definition.code,
            name: definition.name,
            description: definition.description,
            isSystem: true,
            schoolId: null,
          },
        });

    const codes = permissionsForRole(definition);

    // Remplacement intégral : le seed fait autorité sur la dotation des rôles
    // système. Une permission retirée du catalogue disparaît des rôles.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: codes
        .map((code) => permissionIds.get(code))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });

    log(`  ${definition.code.padEnd(14)} ${codes.length} permissions`);
  }
}

async function seedSchool(): Promise<string> {
  const identity = {
    code: DEMO_SCHOOL_CODE,
    name: 'Complexe Scolaire Bilingue Noutcha KAMGUE',
    address: 'Dogpassi, Douala, Cameroun',
    phone: '+237233000000',
    email: 'contact@csb-noutcha-kamgue.local',
  };
  const legacy = await prisma.school.findUnique({ where: { code: 'CPLAN' } });
  const current = await prisma.school.findUnique({ where: { code: DEMO_SCHOOL_CODE } });
  const school = current
    ? await prisma.school.update({ where: { id: current.id }, data: identity })
    : legacy
      ? await prisma.school.update({ where: { id: legacy.id }, data: identity })
      : await prisma.school.create({ data: identity });

  await prisma.schoolSettings.upsert({
    where: { schoolId: school.id },
    update: {},
    create: { schoolId: school.id },
  });

  log(`Établissement           ${school.name} (${school.code})`);
  return school.id;
}

interface DemoUser {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  roleCode: string;
  jobTitle?: string;
  /** Un rôle de plateforme n'est rattaché à aucun établissement. */
  platformRole?: boolean;
}

const DEMO_USERS: DemoUser[] = [
  {
    firstName: 'Nadine',
    lastName: 'Kamgue',
    phone: '+237699000000',
    email: 'superadmin@csb-noutcha-kamgue.local',
    roleCode: 'SUPER_ADMIN',
    platformRole: true,
  },
  {
    firstName: 'Awa',
    lastName: 'Ngo',
    phone: '+237699000001',
    email: 'admin@csb-noutcha-kamgue.local',
    roleCode: 'SCHOOL_ADMIN',
    jobTitle: 'Administratrice',
  },
  {
    firstName: 'Paul',
    lastName: 'Mbarga',
    phone: '+237699000002',
    email: 'direction@csb-noutcha-kamgue.local',
    roleCode: 'DIRECTOR',
    jobTitle: 'Proviseur',
  },
  {
    firstName: 'Marie',
    lastName: 'Fouda',
    phone: '+237699000003',
    email: 'compta@csb-noutcha-kamgue.local',
    roleCode: 'ACCOUNTANT',
    jobTitle: 'Comptable',
  },
  {
    firstName: 'Serge',
    lastName: 'Etoa',
    phone: '+237699000004',
    email: 'caisse@csb-noutcha-kamgue.local',
    roleCode: 'CASHIER',
    jobTitle: 'Caissier',
  },
  {
    firstName: 'Chantal',
    lastName: 'Belinga',
    phone: '+237699000005',
    email: 'scolarite@csb-noutcha-kamgue.local',
    roleCode: 'REGISTRAR',
    jobTitle: 'Secrétaire',
  },
  {
    firstName: 'Lucie',
    lastName: 'Mballa',
    phone: '+237699000006',
    email: 'enseignant@csb-noutcha-kamgue.local',
    roleCode: 'TEACHER',
    jobTitle: 'Professeure de mathématiques',
  },
  {
    firstName: 'Alain',
    lastName: 'Tchana',
    phone: '+237699000007',
    email: 'enseignant2@csb-noutcha-kamgue.local',
    roleCode: 'TEACHER',
    jobTitle: 'Professeur de lettres',
  },
  {
    firstName: 'Jean',
    lastName: 'Fotso',
    phone: '+237699123456',
    roleCode: 'PARENT',
    platformRole: true,
  },
];

async function seedUsers(schoolId: string): Promise<Map<string, string>> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const ids = new Map<string, string>();

  for (const demo of DEMO_USERS) {
    const phone = requirePhone(demo.phone).e164;

    const user = await prisma.user.upsert({
      where: { phone },
      // Ces comptes sont réservés à la démonstration : leurs identifiants
      // documentés doivent rester valides après chaque chargement du seed.
      update: {
        firstName: demo.firstName,
        lastName: demo.lastName,
        email: demo.email ?? null,
        passwordHash,
        status: 'ACTIVE',
      },
      create: {
        firstName: demo.firstName,
        lastName: demo.lastName,
        phone,
        ...(demo.email && { email: demo.email }),
        passwordHash,
        status: 'ACTIVE',
        phoneVerifiedAt: new Date(),
        emailVerifiedAt: demo.email ? new Date() : null,
      },
    });
    ids.set(phone, user.id);

    const role = await prisma.role.findFirst({
      where: { code: demo.roleCode, schoolId: null },
    });
    if (!role) throw new Error(`Rôle introuvable : ${demo.roleCode}`);

    const scopedSchoolId = demo.platformRole ? null : schoolId;

    const existingLink = await prisma.userRole.findFirst({
      where: { userId: user.id, roleId: role.id, schoolId: scopedSchoolId },
    });
    if (!existingLink) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: role.id, schoolId: scopedSchoolId },
      });
    }

    if (!demo.platformRole) {
      await prisma.staffProfile.upsert({
        where: { userId_schoolId: { userId: user.id, schoolId } },
        update: { jobTitle: demo.jobTitle ?? null },
        create: { userId: user.id, schoolId, jobTitle: demo.jobTitle ?? null },
      });
    }

    log(`  ${demo.roleCode.padEnd(14)} ${demo.firstName} ${demo.lastName} · ${phone}`);
  }
  return ids;
}

async function seedUserScopes(schoolId: string, users: Map<string, string>): Promise<void> {
  const units = await prisma.organizationalUnit.findMany({
    where: { schoolId },
    orderBy: { orderIndex: 'asc' },
  });
  const schoolWidePhones = ['+237699000001', '+237699000002', '+237699000003'];
  for (const phone of schoolWidePhones) {
    const userId = users.get(phone);
    if (!userId) continue;
    await prisma.userAccessScope.deleteMany({ where: { schoolId, userId } });
    await prisma.userAccessScope.create({ data: { schoolId, userId, scopeType: 'SCHOOL' } });
  }

  for (const phone of ['+237699000004', '+237699000005']) {
    const userId = users.get(phone);
    if (!userId) continue;
    await prisma.userAccessScope.deleteMany({ where: { schoolId, userId } });
    await prisma.userAccessScope.createMany({
      data: units.map((unit) => ({
        schoolId,
        userId,
        scopeType: 'UNIT' as const,
        organizationalUnitId: unit.id,
      })),
    });
  }

  for (const phone of ['+237699000006', '+237699000007']) {
    const userId = users.get(phone);
    if (!userId) continue;
    await prisma.userAccessScope.deleteMany({ where: { schoolId, userId } });
    await prisma.userAccessScope.create({
      data: { schoolId, userId, scopeType: 'OWN_ASSIGNMENTS' },
    });
  }
  log(`Périmètres utilisateurs ${schoolWidePhones.length} globaux · ${units.length} unités`);
}

async function assertCsbDemoVolumes(schoolId: string): Promise<void> {
  const counts = await Promise.all([
    prisma.organizationalUnit.count({ where: { schoolId } }),
    prisma.languageSection.count({ where: { schoolId } }),
    prisma.educationTrack.count({ where: { schoolId } }),
    prisma.gradeLevel.count({ where: { schoolId } }),
    prisma.class.count({ where: { schoolId } }),
    prisma.cashRegister.count({ where: { schoolId } }),
    prisma.budget.count({ where: { schoolId, fiscalYear: 2026 } }),
    prisma.userAccessScope.count({ where: { schoolId } }),
  ]);
  const expected = [4, 8, 2, 18, 20, 4, 4, 13];
  const labels = [
    'unités',
    'sections',
    'filières',
    'niveaux',
    'classes',
    'caisses',
    'budgets',
    'périmètres',
  ];
  const failures = counts.flatMap((count, index) =>
    count < (expected[index] ?? 0) ? [`${labels[index]}=${count}/${expected[index]}`] : [],
  );
  if (failures.length) throw new Error(`Volumes CSB insuffisants : ${failures.join(', ')}.`);
  log(`Volumes CSB validés       ${counts.join(' · ')}`);
}

async function seedUnitBudgets(schoolId: string): Promise<void> {
  const [units, categories] = await Promise.all([
    prisma.organizationalUnit.findMany({ where: { schoolId }, orderBy: { orderIndex: 'asc' } }),
    prisma.expenseCategory.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
  ]);
  const category = categories[0];
  if (!category) throw new Error('Catégorie de dépense absente pour les budgets de démonstration.');
  for (const unit of units) {
    const budget = await prisma.budget.upsert({
      where: {
        organizationalUnitId_fiscalYear: { organizationalUnitId: unit.id, fiscalYear: 2026 },
      },
      update: { name: `Budget 2026 — ${unit.name}`, status: 'ACTIVE' },
      create: {
        schoolId,
        organizationalUnitId: unit.id,
        fiscalYear: 2026,
        name: `Budget 2026 — ${unit.name}`,
      },
    });
    await prisma.budgetLine.upsert({
      where: {
        budgetId_expenseCategoryId: { budgetId: budget.id, expenseCategoryId: category.id },
      },
      update: { plannedAmount: 2_500_000n },
      create: { budgetId: budget.id, expenseCategoryId: category.id, plannedAmount: 2_500_000n },
    });
  }
  log(`Budgets par cycle         ${units.length} budgets 2026`);
}

async function seedAcademicReference(
  schoolId: string,
): Promise<{ yearId: string; classIds: string[]; categoryId: string }> {
  const current = await prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
  const year = await prisma.academicYear.upsert({
    where: { schoolId_name: { schoolId, name: '2026/2027' } },
    update: current && current.name !== '2026/2027' ? {} : { status: 'ACTIVE', isCurrent: true },
    create: {
      schoolId,
      name: '2026/2027',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2027-07-31T00:00:00.000Z'),
      status: 'ACTIVE',
      isCurrent: current === null,
    },
  });

  const definitions = [
    ['Petite crèche', 'CRE-PETITE', 'CRECHE'],
    ['Grande crèche', 'CRE-GRANDE', 'CRECHE'],
    ['Petite section', 'MAT-PS', 'MATERNELLE'],
    ['Moyenne section', 'MAT-MS', 'MATERNELLE'],
    ['Grande section', 'MAT-GS', 'MATERNELLE'],
    ['SIL / Class 1', 'PRI-SIL', 'PRIMAIRE'],
    ['CP / Class 2', 'PRI-CP', 'PRIMAIRE'],
    ['CE1 / Class 3', 'PRI-CE1', 'PRIMAIRE'],
    ['CE2 / Class 4', 'PRI-CE2', 'PRIMAIRE'],
    ['CM1 / Class 5', 'PRI-CM1', 'PRIMAIRE'],
    ['CM2 / Class 6', 'PRI-CM2', 'PRIMAIRE'],
    ['6e / Form 1', '6E', 'SECONDAIRE'],
    ['5e / Form 2', '5E', 'SECONDAIRE'],
    ['4e / Form 3', '4E', 'SECONDAIRE'],
    ['3e / Form 4', '3E', 'SECONDAIRE'],
    ['2nde / Form 5', '2NDE', 'SECONDAIRE'],
    ['1re / Lower Sixth', '1RE', 'SECONDAIRE'],
    ['Terminale / Upper Sixth', 'TLE', 'SECONDAIRE'],
  ] as const;

  const units = await prisma.organizationalUnit.findMany({ where: { schoolId } });
  const unitByCode = new Map(units.map((unit) => [unit.code, unit]));

  const levelIds = new Map<string, string>();
  const classIds: string[] = [];
  for (const [orderIndex, definition] of definitions.entries()) {
    const [name, code, cycle] = definition;
    const level = await prisma.gradeLevel.upsert({
      where: { schoolId_code: { schoolId, code } },
      update: {
        name,
        orderIndex,
        cycle,
        organizationalUnitId: unitByCode.get(cycle)?.id ?? null,
        status: 'ACTIVE',
      },
      create: {
        schoolId,
        name,
        code,
        orderIndex,
        cycle,
        organizationalUnitId: unitByCode.get(cycle)?.id ?? null,
      },
    });
    levelIds.set(code, level.id);
  }

  const classDefinitions = [
    ['6E', '6e A francophone', 'SECONDAIRE', 'FRANCOPHONE', 'GENERAL'],
    ['6E', 'Form 1 A anglophone', 'SECONDAIRE', 'ANGLOPHONE', 'GENERAL'],
    ['5E', '5e A francophone', 'SECONDAIRE', 'FRANCOPHONE', 'GENERAL'],
    ['5E', 'Form 2 A anglophone', 'SECONDAIRE', 'ANGLOPHONE', 'GENERAL'],
    ['4E', '4e technique', 'SECONDAIRE', 'FRANCOPHONE', 'TECHNIQUE'],
    ['3E', 'Form 4 technique', 'SECONDAIRE', 'ANGLOPHONE', 'TECHNIQUE'],
    ['2NDE', '2nde A', 'SECONDAIRE', 'FRANCOPHONE', 'GENERAL'],
    ['1RE', 'Lower Sixth', 'SECONDAIRE', 'ANGLOPHONE', 'GENERAL'],
    ['TLE', 'Terminale technique', 'SECONDAIRE', 'FRANCOPHONE', 'TECHNIQUE'],
    ['CRE-PETITE', 'Petite crèche', 'CRECHE', 'FRANCOPHONE', null],
    ['CRE-GRANDE', 'Grande crèche anglophone', 'CRECHE', 'ANGLOPHONE', null],
    ['MAT-PS', 'Petite section', 'MATERNELLE', 'FRANCOPHONE', null],
    ['MAT-MS', 'Middle section', 'MATERNELLE', 'ANGLOPHONE', null],
    ['MAT-GS', 'Grande section', 'MATERNELLE', 'FRANCOPHONE', null],
    ['PRI-SIL', 'SIL A', 'PRIMAIRE', 'FRANCOPHONE', null],
    ['PRI-CP', 'Class 2 A', 'PRIMAIRE', 'ANGLOPHONE', null],
    ['PRI-CE1', 'CE1 A', 'PRIMAIRE', 'FRANCOPHONE', null],
    ['PRI-CE2', 'Class 4 A', 'PRIMAIRE', 'ANGLOPHONE', null],
    ['PRI-CM1', 'CM1 A', 'PRIMAIRE', 'FRANCOPHONE', null],
    ['PRI-CM2', 'Class 6 A', 'PRIMAIRE', 'ANGLOPHONE', null],
  ] as const;
  for (const [levelCode, className, unitCode, sectionCode, trackCode] of classDefinitions) {
    const gradeLevelId = levelIds.get(levelCode);
    if (!gradeLevelId) throw new Error(`Niveau absent pour la classe ${className}.`);
    const unit = unitByCode.get(unitCode);
    if (!unit) throw new Error(`UnitÃ© absente pour la classe ${className}.`);
    const section = await prisma.languageSection.findUnique({
      where: { organizationalUnitId_code: { organizationalUnitId: unit.id, code: sectionCode } },
    });
    const track = trackCode
      ? await prisma.educationTrack.findUnique({
          where: { organizationalUnitId_code: { organizationalUnitId: unit.id, code: trackCode } },
        })
      : null;
    const existing = await prisma.class.findFirst({
      where: {
        schoolId,
        academicYearId: year.id,
        name: { equals: className, mode: 'insensitive' },
      },
    });
    const classData = {
      gradeLevelId,
      organizationalUnitId: unit.id,
      languageSectionId: section?.id ?? null,
      educationTrackId: track?.id ?? null,
      capacity: unitCode === 'CRECHE' ? 25 : 60,
      status: 'ACTIVE' as const,
    };
    const classroom = existing
      ? await prisma.class.update({ where: { id: existing.id }, data: classData })
      : await prisma.class.create({
          data: { schoolId, academicYearId: year.id, name: className, ...classData },
        });
    classIds.push(classroom.id);
  }

  let categoryId = '';
  for (const [code, name] of [
    ['EXTERNE', 'Externe'],
    ['DEMI_PENSIONNAIRE', 'Demi-pensionnaire'],
    ['INTERNE', 'Interne'],
  ] as const) {
    const category = await prisma.studentCategory.upsert({
      where: { schoolId_code: { schoolId, code } },
      update: { name, status: 'ACTIVE' },
      create: { schoolId, code, name },
    });
    if (code === 'EXTERNE') categoryId = category.id;
  }
  log(`Référentiel scolaire    ${definitions.length} niveaux · ${classDefinitions.length} classes`);
  return { yearId: year.id, classIds, categoryId };
}

async function seedStudentsAndGuardians(
  schoolId: string,
  academic: { yearId: string; classIds: string[]; categoryId: string },
  users: Map<string, string>,
): Promise<void> {
  const parentPhone = '+237699123456';
  const parentUserId = users.get(parentPhone);
  if (!parentUserId) throw new Error('Compte parent de démonstration introuvable.');
  const guardian = await prisma.guardian.upsert({
    where: { schoolId_phone: { schoolId, phone: parentPhone } },
    update: { userId: parentUserId, firstName: 'Jean', lastName: 'Fotso' },
    create: {
      schoolId,
      userId: parentUserId,
      firstName: 'Jean',
      lastName: 'Fotso',
      phone: parentPhone,
    },
  });
  const firstNames = [
    'Nathan',
    'Sarah',
    'Estelle',
    'Junior',
    'Grâce',
    'Yannick',
    'Aïcha',
    'Brice',
    'Merveille',
    'Loïc',
    'Vanessa',
    'Landry',
    'Prisca',
    'Ulrich',
    'Diane',
    'Kevin',
    'Ruth',
    'Steve',
    'Nadia',
    'Franck',
  ] as const;
  const lastNames = [
    'Fotso',
    'Ngo',
    'Mbarga',
    'Fouda',
    'Etoa',
    'Belinga',
    'Tchana',
    'Njoya',
    'Mballa',
    'Essomba',
    'Kamga',
    'Ondoa',
    'Abanda',
    'Meka',
    'Njikam',
  ] as const;
  const featured = [
    { firstName: 'Nathan', lastName: 'Fotso', birthDate: '2014-03-12', gender: 'M' as const },
    { firstName: 'Sarah', lastName: 'Fotso', birthDate: '2012-06-18', gender: 'F' as const },
    { firstName: 'Estelle', lastName: 'Fotso', birthDate: '2010-11-04', gender: 'F' as const },
  ];
  const definitions = Array.from({ length: 50 }, (_, index) => {
    const generated = {
      firstName: firstNames[index % firstNames.length] ?? 'Élève',
      lastName: lastNames[(index * 3) % lastNames.length] ?? 'Démo',
      birthDate: `${2009 + (index % 7)}-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`,
      gender: index % 2 === 0 ? ('M' as const) : ('F' as const),
    };
    return {
      studentNumber: `SFA-${String(index + 1).padStart(5, '0')}`,
      ...(featured[index] ?? generated),
      classIndex: index % academic.classIds.length,
    };
  });

  for (const [index, definition] of definitions.entries()) {
    const { studentNumber, firstName, lastName, birthDate, gender, classIndex } = definition;
    const classId = academic.classIds[classIndex];
    if (!classId) throw new Error(`Classe de démonstration absente à l’index ${classIndex}.`);
    const student = await prisma.student.upsert({
      where: { schoolId_studentNumber: { schoolId, studentNumber } },
      update: { firstName, lastName, status: 'ACTIVE' },
      create: {
        schoolId,
        studentNumber,
        firstName,
        lastName,
        dateOfBirth: new Date(`${birthDate}T00:00:00.000Z`),
        gender,
      },
    });
    await prisma.enrollment.upsert({
      where: {
        studentId_academicYearId: { studentId: student.id, academicYearId: academic.yearId },
      },
      update: { classId, status: 'ACTIVE' },
      create: {
        schoolId,
        studentId: student.id,
        academicYearId: academic.yearId,
        classId,
        studentCategoryId: academic.categoryId,
        enrollmentDate: new Date('2026-09-01T00:00:00.000Z'),
        enrollmentType: 'NEW',
        status: 'ACTIVE',
      },
    });
    if (index < featured.length) {
      await prisma.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
        update: { status: 'ACCEPTED', acceptedAt: new Date('2026-09-01T00:00:00.000Z') },
        create: {
          studentId: student.id,
          guardianId: guardian.id,
          relationship: 'PERE',
          isPrimary: true,
          isFinancialResponsible: true,
          status: 'ACCEPTED',
          acceptedAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      });
    }
  }
  const sequence = await prisma.numberSequence.findUnique({
    where: { schoolId_scope_period: { schoolId, scope: 'STUDENT_NUMBER', period: '' } },
  });
  if (!sequence) {
    await prisma.numberSequence.create({
      data: { schoolId, scope: 'STUDENT_NUMBER', period: '', currentValue: 50n },
    });
  } else if (sequence.currentValue < 50n) {
    await prisma.numberSequence.update({
      where: { schoolId_scope_period: { schoolId, scope: 'STUDENT_NUMBER', period: '' } },
      data: { currentValue: 50n },
    });
  }
  log(`Élèves & responsables   ${definitions.length} élèves · 3 enfants liés au compte parent`);
}

async function seedPedagogy(
  schoolId: string,
  academic: { yearId: string; classIds: string[] },
  users: Map<string, string>,
): Promise<void> {
  const classId = academic.classIds[0];
  if (!classId) throw new Error('Classe de démonstration introuvable.');
  const subjectDefinitions = [
    { code: 'MATH', name: 'Mathématiques', color: '#2563EB', coefficient: 400, weeklyHours: 5 },
    { code: 'FR', name: 'Français', color: '#DC2626', coefficient: 300, weeklyHours: 5 },
    { code: 'ANG', name: 'Anglais', color: '#16A34A', coefficient: 200, weeklyHours: 3 },
  ] as const;
  const assignments = [];
  const teacherIds = [users.get('+237699000006'), users.get('+237699000007')].filter(
    (id): id is string => Boolean(id),
  );
  for (const definition of subjectDefinitions) {
    const subject = await prisma.subject.upsert({
      where: { schoolId_code: { schoolId, code: definition.code } },
      update: { name: definition.name, color: definition.color, status: 'ACTIVE' },
      create: { schoolId, code: definition.code, name: definition.name, color: definition.color },
    });
    assignments.push(
      await prisma.teachingAssignment.upsert({
        where: {
          academicYearId_classId_subjectId: {
            academicYearId: academic.yearId,
            classId,
            subjectId: subject.id,
          },
        },
        update: {
          teacherUserId: teacherIds[assignments.length % teacherIds.length] ?? null,
          weeklyHours: definition.weeklyHours,
          coefficient: definition.coefficient,
          status: teacherIds.length ? 'ACTIVE' : 'PLANNED',
        },
        create: {
          schoolId,
          academicYearId: academic.yearId,
          classId,
          subjectId: subject.id,
          teacherUserId: teacherIds[assignments.length % teacherIds.length] ?? null,
          weeklyHours: definition.weeklyHours,
          coefficient: definition.coefficient,
          status: teacherIds.length ? 'ACTIVE' : 'PLANNED',
        },
      }),
    );
  }
  const type = await prisma.assessmentType.upsert({
    where: { schoolId_code: { schoolId, code: 'DEVOIR' } },
    update: { name: 'Devoir surveillé', defaultWeight: 200, status: 'ACTIVE' },
    create: { schoolId, code: 'DEVOIR', name: 'Devoir surveillé', defaultWeight: 200 },
  });
  const period1 = await prisma.academicPeriod.upsert({
    where: { academicYearId_name: { academicYearId: academic.yearId, name: 'Trimestre 1' } },
    update: { orderIndex: 1, startDate: new Date('2026-09-01'), endDate: new Date('2026-12-20') },
    create: {
      schoolId,
      academicYearId: academic.yearId,
      name: 'Trimestre 1',
      orderIndex: 1,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-20'),
      status: 'CLOSED',
    },
  });
  await prisma.academicPeriod.upsert({
    where: { academicYearId_name: { academicYearId: academic.yearId, name: 'Trimestre 2' } },
    update: { orderIndex: 2, startDate: new Date('2027-01-04'), endDate: new Date('2027-03-31') },
    create: {
      schoolId,
      academicYearId: academic.yearId,
      name: 'Trimestre 2',
      orderIndex: 2,
      startDate: new Date('2027-01-04'),
      endDate: new Date('2027-03-31'),
      status: 'OPEN',
    },
  });
  const activePolicy = await prisma.gradingPolicy.findFirst({
    where: { schoolId, academicYearId: academic.yearId, cycle: null, isActive: true },
  });
  if (!activePolicy)
    await prisma.gradingPolicy.create({
      data: {
        schoolId,
        academicYearId: academic.yearId,
        cycle: null,
        version: 1,
        roundingDigits: 2,
        weightingMode: 'WEIGHTED_AVERAGE',
        absenceHandling: 'EXCLUDE',
        rankingEnabled: true,
      },
    });
  const enrollments = await prisma.enrollment.findMany({
    where: { schoolId, academicYearId: academic.yearId, classId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  for (const [assessmentIndex, assignment] of assignments.entries()) {
    const title = `Devoir de ${subjectDefinitions[assessmentIndex]?.name ?? 'matière'} — T1`;
    let assessment = await prisma.assessment.findFirst({
      where: { schoolId, periodId: period1.id, teachingAssignmentId: assignment.id, title },
    });
    assessment ??= await prisma.assessment.create({
      data: {
        schoolId,
        academicYearId: academic.yearId,
        periodId: period1.id,
        teachingAssignmentId: assignment.id,
        classId,
        typeId: type.id,
        title,
        date: new Date(`2026-${String(10 + assessmentIndex).padStart(2, '0')}-10`),
        maxScore: 2000,
        weight: type.defaultWeight,
        status: 'LOCKED',
        publishedAt: new Date(),
      },
    });
    for (const [studentIndex, enrollment] of enrollments.entries()) {
      const score = 1100 + ((studentIndex + assessmentIndex * 2) % 8) * 100;
      await prisma.grade.upsert({
        where: {
          assessmentId_enrollmentId: { assessmentId: assessment.id, enrollmentId: enrollment.id },
        },
        update: { score, isAbsent: false },
        create: { schoolId, assessmentId: assessment.id, enrollmentId: enrollment.id, score },
      });
    }
    await prisma.assessment.update({
      where: { id: assessment.id },
      data: { status: 'LOCKED', publishedAt: assessment.publishedAt ?? new Date() },
    });
  }
  await prisma.academicPeriod.update({ where: { id: period1.id }, data: { status: 'CLOSED' } });
  const existingReportCards = await prisma.reportCard.count({
    where: {
      schoolId,
      academicYearId: academic.yearId,
      periodId: period1.id,
      enrollment: { classId },
    },
  });
  if (existingReportCards !== enrollments.length)
    await createReportCardsService(prisma, createAuditService(prisma)).generate(schoolId, {
      academicYearId: academic.yearId,
      periodId: period1.id,
      classId,
    });
  log(
    `Pédagogie              ${subjectDefinitions.length} matières · ${assignments.length} affectations · ${enrollments.length} bulletins`,
  );
}

async function seedFinance(schoolId: string, academicYearId: string): Promise<void> {
  const definitions = [
    ['INSCRIPTION', "Frais d'inscription", 10],
    ['PENSION', 'Pension scolaire', 20],
    ['APE', 'Association des parents d’élèves', 30],
    ['EXAMEN', "Frais d'examen", 40],
    ['TRANSPORT', 'Transport scolaire', 50],
    ['CANTINE', 'Cantine', 60],
    ['INTERNAT', 'Internat', 70],
    ['UNIFORME', 'Uniforme', 80],
    ['MANUELS', 'Manuels scolaires', 90],
    ['ASSURANCE', 'Assurance scolaire', 100],
    ['ACTIVITES', 'Activités périscolaires', 110],
    ['INFORMATIQUE', 'Informatique', 120],
    ['LABORATOIRE', 'Laboratoire', 130],
    ['SORTIE', 'Sortie pédagogique', 140],
    ['AUTRE', 'Autre frais', 150],
  ] as const;
  const typeIds = new Map<string, string>();
  for (const [code, name, priority] of definitions) {
    const type = await prisma.feeType.upsert({
      where: { schoolId_code: { schoolId, code } },
      update: { name, priority },
      create: {
        schoolId,
        code,
        name,
        priority,
        isMandatory: ['INSCRIPTION', 'PENSION', 'APE'].includes(code),
      },
    });
    typeIds.set(code, type.id);
  }
  const structures = [
    { code: 'INSCRIPTION', name: 'Inscription annuelle', amount: 25_000n, installments: [] },
    {
      code: 'PENSION',
      name: 'Pension tous niveaux',
      amount: 175_000n,
      installments: [
        ['1ère tranche', 75_000n, '2026-09-30'],
        ['2e tranche', 60_000n, '2027-01-15'],
        ['3e tranche', 40_000n, '2027-03-31'],
      ] as const,
    },
    { code: 'APE', name: 'Cotisation APE', amount: 10_000n, installments: [] },
  ] as const;
  for (const definition of structures) {
    const feeTypeId = typeIds.get(definition.code);
    if (!feeTypeId) continue;
    let structure = await prisma.feeStructure.findFirst({
      where: {
        schoolId,
        academicYearId,
        feeTypeId,
        gradeLevelId: null,
        classId: null,
        studentCategoryId: null,
      },
    });
    structure ??= await prisma.feeStructure.create({
      data: {
        schoolId,
        academicYearId,
        feeTypeId,
        name: definition.name,
        amount: definition.amount,
        status: 'ACTIVE',
        isMandatory: true,
        dueDate: definition.code === 'INSCRIPTION' ? new Date('2026-09-30') : null,
        installments: {
          create: definition.installments.map(([name, installmentAmount, dueDate], orderIndex) => ({
            name,
            amount: installmentAmount,
            dueDate: new Date(dueDate),
            orderIndex,
          })),
        },
      },
    });
    const installmentRows = await prisma.feeInstallment.findMany({
      where: { feeStructureId: structure.id },
      orderBy: { orderIndex: 'asc' },
    });
    const enrollments = await prisma.enrollment.findMany({
      where: { schoolId, academicYearId },
      include: { class: { select: { organizationalUnitId: true } } },
    });
    for (const enrollment of enrollments) {
      const assignment = await prisma.studentFeeAssignment.upsert({
        where: {
          enrollmentId_feeStructureId: {
            enrollmentId: enrollment.id,
            feeStructureId: structure.id,
          },
        },
        update: { organizationalUnitId: enrollment.class?.organizationalUnitId ?? null },
        create: {
          schoolId,
          enrollmentId: enrollment.id,
          studentId: enrollment.studentId,
          feeStructureId: structure.id,
          feeTypeId,
          organizationalUnitId: enrollment.class?.organizationalUnitId ?? null,
          originalAmount: structure.amount,
          finalAmount: structure.amount,
        },
      });
      for (const item of installmentRows)
        await prisma.studentFeeInstallment.upsert({
          where: {
            studentFeeAssignmentId_orderIndex: {
              studentFeeAssignmentId: assignment.id,
              orderIndex: item.orderIndex,
            },
          },
          update: {},
          create: {
            studentFeeAssignmentId: assignment.id,
            feeInstallmentId: item.id,
            name: item.name,
            amount: item.amount,
            dueDate: item.dueDate,
            orderIndex: item.orderIndex,
          },
        });
    }
  }
  log(
    `Finances                ${definitions.length} types · ${structures.length} structures actives`,
  );
}

async function seedDemoPayments(schoolId: string, actorId: string): Promise<void> {
  const situations = Array.from({ length: 50 }, (_, index) => {
    const label: 'PAYE' | 'PARTIEL' | 'IMPAYE' =
      index < 20 ? 'PAYE' : index < 35 ? 'PARTIEL' : 'IMPAYE';
    return {
      studentNumber: `SFA-${String(index + 1).padStart(5, '0')}`,
      label,
      amount: label === 'PAYE' ? 210_000n : label === 'PARTIEL' ? 100_000n : 0n,
    };
  });

  for (const situation of situations) {
    const student = await prisma.student.findUniqueOrThrow({
      where: { schoolId_studentNumber: { schoolId, studentNumber: situation.studentNumber } },
      include: {
        enrollments: {
          where: { academicYear: { isCurrent: true } },
          include: {
            feeAssignments: {
              include: { feeType: true, installments: { orderBy: { orderIndex: 'asc' } } },
            },
          },
          take: 1,
        },
      },
    });
    const enrollment = student.enrollments[0];
    if (!enrollment) throw new Error(`Inscription active absente pour ${situation.studentNumber}.`);

    const reference = `SFA-DEMO-${situation.studentNumber}-2026`;
    const existingPayment = await prisma.payment.findUnique({ where: { reference } });
    if (existingPayment) {
      await prisma.paymentAllocation.deleteMany({ where: { paymentId: existingPayment.id } });
    }

    for (const assignment of enrollment.feeAssignments) {
      await prisma.studentFeeInstallment.updateMany({
        where: { studentFeeAssignmentId: assignment.id },
        data: { paidAmount: 0n, status: 'UPCOMING' },
      });
      await prisma.studentFeeAssignment.update({
        where: { id: assignment.id },
        data: { paidAmount: 0n, status: 'PENDING' },
      });
    }

    if (situation.amount === 0n) continue;

    const payment = await prisma.payment.upsert({
      where: { reference },
      update: {
        amount: situation.amount,
        status: 'SUCCESS',
        paidAt: new Date('2026-09-05T09:00:00.000Z'),
        validatedAt: new Date('2026-09-05T09:00:00.000Z'),
        validatedBy: actorId,
      },
      create: {
        schoolId,
        reference,
        payerName: 'Jean Fotso',
        payerPhone: '+237699123456',
        amount: situation.amount,
        paymentMethod: 'CASH',
        status: 'SUCCESS',
        channel: 'BACKOFFICE',
        paidAt: new Date('2026-09-05T09:00:00.000Z'),
        validatedAt: new Date('2026-09-05T09:00:00.000Z'),
        validatedBy: actorId,
        createdBy: actorId,
        note: `Paiement de démonstration — élève ${situation.label.toLowerCase()}`,
      },
    });
    await prisma.paymentTarget.upsert({
      where: { paymentId_enrollmentId: { paymentId: payment.id, enrollmentId: enrollment.id } },
      update: {},
      create: {
        paymentId: payment.id,
        schoolId,
        studentId: student.id,
        enrollmentId: enrollment.id,
      },
    });

    let remaining = situation.amount;
    const assignments = [...enrollment.feeAssignments].sort(
      (a, b) => a.feeType.priority - b.feeType.priority,
    );
    for (const assignment of assignments) {
      if (remaining <= 0n) break;
      const paid = remaining < assignment.finalAmount ? remaining : assignment.finalAmount;
      let assignmentRemaining = paid;

      if (assignment.installments.length > 0) {
        for (const installment of assignment.installments) {
          if (assignmentRemaining <= 0n) break;
          const installmentPaid =
            assignmentRemaining < installment.amount ? assignmentRemaining : installment.amount;
          await prisma.studentFeeInstallment.update({
            where: { id: installment.id },
            data: {
              paidAmount: installmentPaid,
              status: installmentPaid >= installment.amount ? 'PAID' : 'PARTIALLY_PAID',
            },
          });
          await prisma.paymentAllocation.create({
            data: {
              paymentId: payment.id,
              studentFeeAssignmentId: assignment.id,
              studentFeeInstallmentId: installment.id,
              studentId: student.id,
              enrollmentId: enrollment.id,
              schoolId,
              amount: installmentPaid,
              createdBy: actorId,
            },
          });
          assignmentRemaining -= installmentPaid;
        }
      } else {
        await prisma.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            studentFeeAssignmentId: assignment.id,
            studentId: student.id,
            enrollmentId: enrollment.id,
            schoolId,
            amount: paid,
            createdBy: actorId,
          },
        });
      }

      await prisma.studentFeeAssignment.update({
        where: { id: assignment.id },
        data: {
          paidAmount: paid,
          status: paid >= assignment.finalAmount ? 'PAID' : 'PARTIALLY_PAID',
        },
      });
      remaining -= paid;
    }
  }

  log('Situations financières   20 payés · 15 partiels · 15 impayés');
}

/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  process.stdout.write('\nSeed Complexe Scolaire Bilingue Noutcha KAMGUE\n\n');

  await verifyFoundations();
  await seedPermissions();

  process.stdout.write('\nRôles\n');
  await seedRoles();

  process.stdout.write('\n');
  const schoolId = await seedSchool();

  const academic = await seedAcademicReference(schoolId);

  process.stdout.write('\nComptes de démonstration\n');
  const users = await seedUsers(schoolId);
  await seedUserScopes(schoolId, users);
  await seedStudentsAndGuardians(schoolId, academic, users);
  await seedPedagogy(schoolId, academic, users);
  await seedFinance(schoolId, academic.yearId);
  const adminId = users.get('+237699000001');
  if (!adminId) throw new Error('Compte administrateur de démonstration introuvable.');
  await seedDemoPayments(schoolId, adminId);
  await seedExtendedDemoData(prisma, {
    schoolId,
    academicYearId: academic.yearId,
    classIds: academic.classIds,
    users,
    log,
  });
  await seedUnitBudgets(schoolId);
  await assertCsbDemoVolumes(schoolId);

  process.stdout.write(
    `\n  Mot de passe commun : ${DEMO_PASSWORD}\n` +
      `  (comptes de démonstration uniquement — jamais en production)\n\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`\nSeed en échec : ${error instanceof Error ? error.stack : error}\n\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
