import type { PrismaClient } from '@prisma/client';
import { SCHOOL_MODULE_CODES } from '@cplan/contracts';

interface ExtendedSeedContext {
  schoolId: string;
  academicYearId: string;
  classIds: string[];
  users: Map<string, string>;
  log: (message: string) => void;
}

const date = (value: string) => new Date(value);

function requiredUser(users: Map<string, string>, phone: string, label: string): string {
  const id = users.get(phone);
  if (!id) throw new Error(`Compte ${label} de démonstration introuvable.`);
  return id;
}

async function seedModuleSettings(prisma: PrismaClient, context: ExtendedSeedContext) {
  const adminId = requiredUser(context.users, '+237699000001', 'administrateur');
  for (const moduleCode of SCHOOL_MODULE_CODES) {
    await prisma.schoolModuleSetting.upsert({
      where: { schoolId_moduleCode: { schoolId: context.schoolId, moduleCode } },
      update: { enabled: true, updatedBy: adminId },
      create: { schoolId: context.schoolId, moduleCode, enabled: true, updatedBy: adminId },
    });
  }
  context.log(`Modules                  ${SCHOOL_MODULE_CODES.length} modules activés`);
}

async function seedStaff(prisma: PrismaClient, context: ExtendedSeedContext) {
  const staffDefinitions = [
    ['+237699000001', 'EMP-001', 'PERMANENT', '2021-08-16', 40],
    ['+237699000002', 'EMP-002', 'PERMANENT', '2019-09-02', 40],
    ['+237699000003', 'EMP-003', 'PERMANENT', '2022-01-10', 40],
    ['+237699000004', 'EMP-004', 'FIXED_TERM', '2025-09-01', 40],
    ['+237699000005', 'EMP-005', 'PERMANENT', '2020-10-05', 40],
    ['+237699000006', 'ENS-001', 'PERMANENT', '2023-09-04', 18],
    ['+237699000007', 'ENS-002', 'VACATION', '2024-09-02', 16],
  ] as const;
  for (const [phone, employeeNumber, employmentType, hiredAt, weeklyWorkload] of staffDefinitions) {
    const userId = requiredUser(context.users, phone, employeeNumber);
    await prisma.staffProfile.update({
      where: { userId_schoolId: { userId, schoolId: context.schoolId } },
      data: { employeeNumber, employmentType, hiredAt: date(hiredAt), weeklyWorkload },
    });
  }
  const teacherId = requiredUser(context.users, '+237699000006', 'enseignant');
  const profile = await prisma.staffProfile.findUniqueOrThrow({
    where: { userId_schoolId: { userId: teacherId, schoolId: context.schoolId } },
  });
  const leaveStart = date('2027-02-15');
  const leave = await prisma.staffLeave.findFirst({
    where: { schoolId: context.schoolId, staffProfileId: profile.id, startsAt: leaveStart },
  });
  const leaveData = {
    type: 'Congé annuel',
    startsAt: leaveStart,
    endsAt: date('2027-02-19'),
    reason: 'Congé planifié de démonstration',
    status: 'APPROVED' as const,
    decidedAt: date('2026-10-06T10:00:00Z'),
  };
  if (leave) await prisma.staffLeave.update({ where: { id: leave.id }, data: leaveData });
  else
    await prisma.staffLeave.create({
      data: { schoolId: context.schoolId, staffProfileId: profile.id, ...leaveData },
    });
  context.log(`Personnel                ${staffDefinitions.length} dossiers · 1 congé`);
}

async function seedTimetableAndAttendance(prisma: PrismaClient, context: ExtendedSeedContext) {
  const classId = context.classIds[0];
  if (!classId) throw new Error('Classe principale de démonstration introuvable.');
  const teacherId = requiredUser(context.users, '+237699000006', 'enseignant');
  const directorId = requiredUser(context.users, '+237699000002', 'direction');
  const rooms = [];
  for (const definition of [
    { code: 'SALLE-6A', name: 'Salle 6e A', capacity: 60 },
    { code: 'LABO-SCI', name: 'Laboratoire de sciences', capacity: 32 },
    { code: 'INFO-01', name: 'Salle informatique', capacity: 30 },
  ]) {
    rooms.push(
      await prisma.timetableRoom.upsert({
        where: { schoolId_code: { schoolId: context.schoolId, code: definition.code } },
        update: { name: definition.name, capacity: definition.capacity, status: 'ACTIVE' },
        create: { schoolId: context.schoolId, ...definition },
      }),
    );
  }
  const assignments = await prisma.teachingAssignment.findMany({
    where: { schoolId: context.schoolId, academicYearId: context.academicYearId, classId },
    orderBy: { createdAt: 'asc' },
  });
  const entries = [];
  for (const [index, assignment] of assignments.entries()) {
    const dayOfWeek = (index % 5) + 1;
    const startTime = date(`1970-01-01T${String(8 + index).padStart(2, '0')}:00:00Z`);
    const existing = await prisma.timetableEntry.findFirst({
      where: { teachingAssignmentId: assignment.id, dayOfWeek, startTime },
    });
    const data = {
      roomId: rooms[index % rooms.length]?.id ?? null,
      endTime: date(`1970-01-01T${String(9 + index).padStart(2, '0')}:00:00Z`),
      status: 'PUBLISHED' as const,
    };
    entries.push(
      existing
        ? await prisma.timetableEntry.update({ where: { id: existing.id }, data })
        : await prisma.timetableEntry.create({
            data: {
              schoolId: context.schoolId,
              academicYearId: context.academicYearId,
              teachingAssignmentId: assignment.id,
              classId,
              dayOfWeek,
              startTime,
              ...data,
            },
          }),
    );
  }
  const entry = entries[0];
  if (entry) {
    const session = await prisma.attendanceSession.upsert({
      where: { timetableEntryId_date: { timetableEntryId: entry.id, date: date('2026-10-05') } },
      update: {
        status: 'VALIDATED',
        recordedBy: teacherId,
        validatedBy: directorId,
        validatedAt: date('2026-10-05T09:15:00Z'),
      },
      create: {
        schoolId: context.schoolId,
        academicYearId: context.academicYearId,
        timetableEntryId: entry.id,
        classId,
        date: date('2026-10-05'),
        status: 'VALIDATED',
        recordedBy: teacherId,
        validatedBy: directorId,
        validatedAt: date('2026-10-05T09:15:00Z'),
      },
    });
    const enrollments = await prisma.enrollment.findMany({
      where: { schoolId: context.schoolId, academicYearId: context.academicYearId, classId },
      orderBy: { createdAt: 'asc' },
    });
    for (const [index, enrollment] of enrollments.entries()) {
      const mark = index === 1 ? 'ABSENT' : index === 2 ? 'LATE' : 'PRESENT';
      await prisma.attendanceRecord.upsert({
        where: { sessionId_enrollmentId: { sessionId: session.id, enrollmentId: enrollment.id } },
        update: {
          mark,
          minutesLate: mark === 'LATE' ? 12 : 0,
          justificationStatus: mark === 'ABSENT' ? 'PENDING' : 'NONE',
        },
        create: {
          schoolId: context.schoolId,
          sessionId: session.id,
          enrollmentId: enrollment.id,
          mark,
          minutesLate: mark === 'LATE' ? 12 : 0,
          justificationStatus: mark === 'ABSENT' ? 'PENDING' : 'NONE',
        },
      });
    }
  }
  context.log(
    `Emploi du temps          ${rooms.length} salles · ${entries.length} cours · 1 appel`,
  );
}

async function seedCompetencies(prisma: PrismaClient, context: ExtendedSeedContext) {
  const competencies = [];
  for (const definition of [
    { code: 'RAISONNER', name: 'Raisonner et démontrer' },
    { code: 'COMMUNIQUER', name: "S'exprimer avec précision" },
    { code: 'AUTONOMIE', name: 'Travailler en autonomie' },
  ]) {
    competencies.push(
      await prisma.competency.upsert({
        where: { schoolId_code: { schoolId: context.schoolId, code: definition.code } },
        update: { name: definition.name, status: 'ACTIVE' },
        create: { schoolId: context.schoolId, ...definition },
      }),
    );
  }
  const assessments = await prisma.assessment.findMany({
    where: { schoolId: context.schoolId, academicYearId: context.academicYearId },
    orderBy: { createdAt: 'asc' },
  });
  for (const [index, assessment] of assessments.entries()) {
    const competency = competencies[index % competencies.length];
    if (!competency) continue;
    await prisma.assessmentCompetency.upsert({
      where: {
        assessmentId_competencyId: {
          assessmentId: assessment.id,
          competencyId: competency.id,
        },
      },
      update: { schoolId: context.schoolId },
      create: {
        schoolId: context.schoolId,
        assessmentId: assessment.id,
        competencyId: competency.id,
      },
    });
  }
  context.log(`Compétences              ${competencies.length} référentiels liés aux évaluations`);
}

async function seedCommunications(prisma: PrismaClient, context: ExtendedSeedContext) {
  const adminId = requiredUser(context.users, '+237699000001', 'administrateur');
  const teacherId = requiredUser(context.users, '+237699000006', 'enseignant');
  const parentId = requiredUser(context.users, '+237699123456', 'parent');
  const announcements = [
    {
      title: 'Réunion de rentrée des parents',
      body: 'La réunion se tiendra samedi à 9h dans la salle polyvalente.',
      audience: 'FAMILIES' as const,
      publishedAt: date('2026-10-01T08:00:00Z'),
    },
    {
      title: 'Semaine de la propreté',
      body: 'Chaque classe participera aux activités citoyennes prévues cette semaine.',
      audience: 'ALL' as const,
      publishedAt: date('2026-10-05T08:00:00Z'),
    },
  ];
  for (const item of announcements) {
    const existing = await prisma.announcement.findFirst({
      where: { schoolId: context.schoolId, title: item.title },
    });
    if (existing) await prisma.announcement.update({ where: { id: existing.id }, data: item });
    else
      await prisma.announcement.create({
        data: { schoolId: context.schoolId, createdByUserId: adminId, ...item },
      });
  }
  const eventData = {
    description: 'Rencontre sportive entre les classes du collège.',
    location: 'Stade municipal',
    audience: 'ALL' as const,
    startsAt: date('2026-10-24T08:00:00Z'),
    endsAt: date('2026-10-24T16:00:00Z'),
  };
  const event = await prisma.schoolEvent.findFirst({
    where: { schoolId: context.schoolId, title: 'Journée sportive' },
  });
  if (event) await prisma.schoolEvent.update({ where: { id: event.id }, data: eventData });
  else
    await prisma.schoolEvent.create({
      data: { schoolId: context.schoolId, title: 'Journée sportive', ...eventData },
    });
  const classId = context.classIds[0];
  const subject = await prisma.subject.findFirstOrThrow({
    where: { schoolId: context.schoolId, code: 'MATH' },
  });
  if (classId) {
    const homeworkData = {
      instructions: 'Résoudre les exercices 12 à 20 du chapitre 3.',
      dueAt: date('2026-10-16T17:00:00Z'),
      status: 'PUBLISHED' as const,
    };
    const homework = await prisma.homework.findFirst({
      where: { schoolId: context.schoolId, classId, title: 'Fractions et nombres décimaux' },
    });
    if (homework) await prisma.homework.update({ where: { id: homework.id }, data: homeworkData });
    else
      await prisma.homework.create({
        data: {
          schoolId: context.schoolId,
          academicYearId: context.academicYearId,
          classId,
          subjectId: subject.id,
          title: 'Fractions et nombres décimaux',
          ...homeworkData,
        },
      });
  }
  const message = await prisma.schoolMessage.findFirst({
    where: { schoolId: context.schoolId, senderUserId: teacherId, recipientUserId: parentId },
  });
  const messageData = {
    subject: 'Suivi scolaire de Nathan',
    body: 'Nathan progresse bien. Merci de veiller à la remise du prochain devoir.',
    sentAt: date('2026-10-07T14:30:00Z'),
  };
  if (message) await prisma.schoolMessage.update({ where: { id: message.id }, data: messageData });
  else
    await prisma.schoolMessage.create({
      data: {
        schoolId: context.schoolId,
        senderUserId: teacherId,
        recipientUserId: parentId,
        ...messageData,
      },
    });
  context.log('Communication            2 annonces · 1 événement · 1 devoir · 1 message');
}

async function seedStudentLife(prisma: PrismaClient, context: ExtendedSeedContext) {
  const enrollments = await prisma.enrollment.findMany({
    where: { schoolId: context.schoolId, academicYearId: context.academicYearId },
    orderBy: { createdAt: 'asc' },
    take: 3,
  });
  const first = enrollments[0];
  if (!first) return;
  const occurredAt = date('2026-10-06T10:15:00Z');
  let incident = await prisma.studentIncident.findFirst({
    where: { schoolId: context.schoolId, enrollmentId: first.id, occurredAt },
  });
  const incidentData = {
    category: 'Comportement',
    severity: 'MEDIUM' as const,
    description: 'Retards répétés et perturbation du cours.',
    status: 'OPEN' as const,
  };
  incident = incident
    ? await prisma.studentIncident.update({ where: { id: incident.id }, data: incidentData })
    : await prisma.studentIncident.create({
        data: { schoolId: context.schoolId, enrollmentId: first.id, occurredAt, ...incidentData },
      });
  const action = await prisma.disciplinaryAction.findFirst({
    where: { incidentId: incident.id, type: 'AVERTISSEMENT' },
  });
  const actionData = {
    description: 'Avertissement écrit et entretien avec le responsable.',
    startsAt: date('2026-10-07'),
  };
  if (action)
    await prisma.disciplinaryAction.update({ where: { id: action.id }, data: actionData });
  else
    await prisma.disciplinaryAction.create({
      data: { incidentId: incident.id, type: 'AVERTISSEMENT', ...actionData },
    });
  const second = enrollments[1] ?? first;
  const visitedAt = date('2026-10-07T11:20:00Z');
  const visit = await prisma.healthVisit.findFirst({
    where: { schoolId: context.schoolId, enrollmentId: second.id, visitedAt },
  });
  const visitData = {
    symptoms: 'Maux de tête légers',
    actionTaken: 'Repos, hydratation et prise de température.',
    guardianNotified: true,
    followUpAt: date('2026-10-08T08:00:00Z'),
  };
  if (visit) await prisma.healthVisit.update({ where: { id: visit.id }, data: visitData });
  else
    await prisma.healthVisit.create({
      data: { schoolId: context.schoolId, enrollmentId: second.id, visitedAt, ...visitData },
    });
  context.log('Vie scolaire             1 incident · 1 sanction · 1 passage infirmerie');
}

async function seedSchoolServices(prisma: PrismaClient, context: ExtendedSeedContext) {
  const enrollments = await prisma.enrollment.findMany({
    where: { schoolId: context.schoolId, academicYearId: context.academicYearId },
    orderBy: { createdAt: 'asc' },
    take: 8,
  });
  const books = [];
  for (const item of [
    {
      isbn: '978-demo-001',
      title: 'Le Petit Prince',
      author: 'Antoine de Saint-Exupéry',
      stock: 12,
    },
    { isbn: '978-demo-002', title: 'Contes du Cameroun', author: 'Collectif', stock: 8 },
    { isbn: '978-demo-003', title: 'Mathématiques 6e', author: 'Éditions scolaires', stock: 25 },
  ]) {
    books.push(
      await prisma.libraryBook.upsert({
        where: { schoolId_isbn: { schoolId: context.schoolId, isbn: item.isbn } },
        update: { title: item.title, author: item.author, stock: item.stock },
        create: { schoolId: context.schoolId, ...item },
      }),
    );
  }
  if (books[0] && enrollments[0]) {
    const borrowedAt = date('2026-10-01');
    const loan = await prisma.libraryLoan.findFirst({
      where: { bookId: books[0].id, enrollmentId: enrollments[0].id, borrowedAt },
    });
    const loanData = { dueAt: date('2026-10-15'), returnedAt: null };
    if (loan) await prisma.libraryLoan.update({ where: { id: loan.id }, data: loanData });
    else
      await prisma.libraryLoan.create({
        data: {
          schoolId: context.schoolId,
          bookId: books[0].id,
          enrollmentId: enrollments[0].id,
          borrowedAt,
          ...loanData,
        },
      });
  }
  for (const meal of [
    {
      date: date('2026-10-08'),
      menu: 'Riz sauce tomate, poisson et fruit',
      planned: 180,
      served: 172,
    },
    { date: date('2026-10-09'), menu: 'Haricots, plantains et yaourt', planned: 180, served: 0 },
  ]) {
    await prisma.canteenMeal.upsert({
      where: { schoolId_date: { schoolId: context.schoolId, date: meal.date } },
      update: meal,
      create: { schoolId: context.schoolId, ...meal },
    });
  }
  const route = await prisma.transportRoute.upsert({
    where: { schoolId_name: { schoolId: context.schoolId, name: 'Bonamoussadi – École' } },
    update: {
      vehicle: 'Bus LT-204-AA',
      driver: 'Martin Essomba',
      capacity: 32,
      stops: ['Carrefour Maetur', 'Denver', 'Tradex', 'École'],
      status: 'ACTIVE',
    },
    create: {
      schoolId: context.schoolId,
      name: 'Bonamoussadi – École',
      vehicle: 'Bus LT-204-AA',
      driver: 'Martin Essomba',
      capacity: 32,
      stops: ['Carrefour Maetur', 'Denver', 'Tradex', 'École'],
    },
  });
  for (const enrollment of enrollments.slice(0, 5)) {
    await prisma.transportEnrollment.upsert({
      where: { routeId_enrollmentId: { routeId: route.id, enrollmentId: enrollment.id } },
      update: {},
      create: { schoolId: context.schoolId, routeId: route.id, enrollmentId: enrollment.id },
    });
  }
  await prisma.transportRoute.update({
    where: { id: route.id },
    data: { enrolled: await prisma.transportEnrollment.count({ where: { routeId: route.id } }) },
  });
  for (const item of [
    { code: 'CRAIE-BLC', name: 'Craies blanches', unit: 'boîte', quantity: 48, reorderLevel: 10 },
    {
      code: 'PAPIER-A4',
      name: 'Ramettes papier A4',
      unit: 'ramette',
      quantity: 18,
      reorderLevel: 8,
    },
    { code: 'MARQ-BLEU', name: 'Marqueurs bleus', unit: 'pièce', quantity: 6, reorderLevel: 10 },
  ]) {
    const inventory = await prisma.inventoryItem.upsert({
      where: { schoolId_code: { schoolId: context.schoolId, code: item.code } },
      update: item,
      create: { schoolId: context.schoolId, ...item },
    });
    const movement = await prisma.inventoryMovement.findFirst({
      where: { itemId: inventory.id, reason: 'Stock initial de démonstration' },
    });
    if (!movement)
      await prisma.inventoryMovement.create({
        data: {
          schoolId: context.schoolId,
          itemId: inventory.id,
          quantity: item.quantity,
          reason: 'Stock initial de démonstration',
        },
      });
  }
  context.log('Services                 3 livres · 2 menus · 1 circuit · 3 articles de stock');
}

async function seedProcurement(prisma: PrismaClient, context: ExtendedSeedContext) {
  const adminId = requiredUser(context.users, '+237699000001', 'administrateur');
  const accountantId = requiredUser(context.users, '+237699000003', 'comptable');
  const supplier = await prisma.supplier.upsert({
    where: { schoolId_code: { schoolId: context.schoolId, code: 'FOURN-001' } },
    update: { name: 'Papeterie du Littoral', phone: '+237233445566', status: 'ACTIVE' },
    create: {
      schoolId: context.schoolId,
      code: 'FOURN-001',
      name: 'Papeterie du Littoral',
      phone: '+237233445566',
      email: 'contact@papeterie-demo.local',
      address: 'Akwa, Douala',
      paymentTermsDays: 30,
    },
  });
  const category = await prisma.expenseCategory.upsert({
    where: { schoolId_code: { schoolId: context.schoolId, code: 'FOURNITURES' } },
    update: { name: 'Fournitures scolaires', status: 'ACTIVE' },
    create: {
      schoolId: context.schoolId,
      code: 'FOURNITURES',
      name: 'Fournitures scolaires',
      description: 'Papeterie et consommables pédagogiques',
    },
  });
  const order = await prisma.purchaseOrder.upsert({
    where: { reference: 'BC-DEMO-2026-0001' },
    update: {
      supplierId: supplier.id,
      status: 'APPROVED',
      subtotal: 125_000n,
      totalAmount: 125_000n,
      expectedDate: date('2026-10-15'),
      approvedBy: adminId,
      approvedAt: date('2026-10-04T10:00:00Z'),
    },
    create: {
      schoolId: context.schoolId,
      reference: 'BC-DEMO-2026-0001',
      supplierId: supplier.id,
      status: 'APPROVED',
      subtotal: 125_000n,
      totalAmount: 125_000n,
      expectedDate: date('2026-10-15'),
      notes: 'Commande de rentrée',
      requestedBy: accountantId,
      approvedBy: adminId,
      submittedAt: date('2026-10-03T09:00:00Z'),
      approvedAt: date('2026-10-04T10:00:00Z'),
    },
  });
  const line = await prisma.purchaseOrderLine.findFirst({
    where: { purchaseOrderId: order.id, description: 'Ramettes papier A4' },
  });
  const lineData = { quantity: 25, unitPrice: 5_000n, lineTotal: 125_000n };
  if (line) await prisma.purchaseOrderLine.update({ where: { id: line.id }, data: lineData });
  else
    await prisma.purchaseOrderLine.create({
      data: {
        schoolId: context.schoolId,
        purchaseOrderId: order.id,
        description: 'Ramettes papier A4',
        ...lineData,
      },
    });
  const expense = await prisma.expense.upsert({
    where: { reference: 'DEP-DEMO-2026-0001' },
    update: {
      supplierId: supplier.id,
      categoryId: category.id,
      purchaseOrderId: order.id,
      amount: 125_000n,
      paidAmount: 75_000n,
      status: 'PARTIALLY_PAID',
    },
    create: {
      schoolId: context.schoolId,
      reference: 'DEP-DEMO-2026-0001',
      supplierId: supplier.id,
      categoryId: category.id,
      purchaseOrderId: order.id,
      invoiceNumber: 'FACT-DEMO-001',
      invoiceDate: date('2026-10-05'),
      dueDate: date('2026-11-04'),
      description: 'Achat de ramettes papier A4',
      amount: 125_000n,
      paidAmount: 75_000n,
      status: 'PARTIALLY_PAID',
      createdBy: accountantId,
      approvedBy: adminId,
      submittedAt: date('2026-10-05T09:00:00Z'),
      approvedAt: date('2026-10-05T11:00:00Z'),
    },
  });
  await prisma.supplierPayment.upsert({
    where: { reference: 'RF-DEMO-2026-0001' },
    update: { amount: 75_000n, status: 'SUCCESS' },
    create: {
      schoolId: context.schoolId,
      expenseId: expense.id,
      reference: 'RF-DEMO-2026-0001',
      amount: 75_000n,
      method: 'BANK_TRANSFER',
      externalReference: 'VIR-DEMO-001',
      paidAt: date('2026-10-06T10:00:00Z'),
      idempotencyKey: 'seed-supplier-payment-001',
      note: 'Acompte fournisseur de démonstration',
      createdBy: accountantId,
    },
  });
  context.log('Achats & dépenses        1 fournisseur · 1 bon · 1 dépense · 1 règlement');
}

async function seedImports(prisma: PrismaClient, context: ExtendedSeedContext) {
  const registrarId = requiredUser(context.users, '+237699000005', 'scolarité');
  const file = await prisma.file.upsert({
    where: {
      schoolId_storageKey: {
        schoolId: context.schoolId,
        storageKey: 'demo/imports/eleves-2026.csv',
      },
    },
    update: { originalName: 'eleves-demo.csv', sizeBytes: 1024n },
    create: {
      schoolId: context.schoolId,
      storageKey: 'demo/imports/eleves-2026.csv',
      originalName: 'eleves-demo.csv',
      mimeType: 'text/csv',
      sizeBytes: 1024n,
      kind: 'IMPORT_FILE',
      uploadedBy: registrarId,
    },
  });
  let batch = await prisma.importBatch.findFirst({ where: { fileId: file.id } });
  const batchData = {
    type: 'STUDENTS' as const,
    academicYearId: context.academicYearId,
    columnMapping: { nom: 'lastName', prenom: 'firstName', classe: 'className' },
    status: 'COMPLETED' as const,
    totalRows: 3,
    validRows: 2,
    errorRows: 1,
    importedRows: 2,
    createdBy: registrarId,
  };
  batch = batch
    ? await prisma.importBatch.update({ where: { id: batch.id }, data: batchData })
    : await prisma.importBatch.create({
        data: { schoolId: context.schoolId, fileId: file.id, ...batchData },
      });
  const rows = [
    {
      rowNumber: 1,
      rawData: { nom: 'Demo', prenom: 'Élève A', classe: '6e A' },
      status: 'IMPORTED' as const,
    },
    {
      rowNumber: 2,
      rawData: { nom: 'Demo', prenom: 'Élève B', classe: '6e A' },
      status: 'IMPORTED' as const,
    },
    {
      rowNumber: 3,
      rawData: { nom: '', prenom: 'Sans nom', classe: 'Classe inconnue' },
      status: 'ERROR' as const,
      errors: [{ field: 'nom', message: 'Le nom est obligatoire.' }],
    },
  ];
  for (const row of rows) {
    await prisma.importRow.upsert({
      where: { batchId_rowNumber: { batchId: batch.id, rowNumber: row.rowNumber } },
      update: row,
      create: { batchId: batch.id, errors: [], ...row },
    });
  }
  context.log('Imports                  1 lot terminé · 2 lignes valides · 1 erreur');
}

async function seedPaymentOperations(prisma: PrismaClient, context: ExtendedSeedContext) {
  const adminId = requiredUser(context.users, '+237699000001', 'administrateur');
  const accountantId = requiredUser(context.users, '+237699000003', 'comptable');
  const cashierId = requiredUser(context.users, '+237699000004', 'caissier');
  const parentId = requiredUser(context.users, '+237699123456', 'parent');
  const sessionOpenedAt = date('2026-10-08T07:30:00Z');
  let cashSession = await prisma.cashSession.findFirst({
    where: { schoolId: context.schoolId, cashierUserId: cashierId, openedAt: sessionOpenedAt },
  });
  const sessionData = {
    status: 'OPEN' as const,
    openingFloat: 25_000n,
    notes: 'Caisse de démonstration',
  };
  cashSession = cashSession
    ? await prisma.cashSession.update({ where: { id: cashSession.id }, data: sessionData })
    : await prisma.cashSession.create({
        data: {
          schoolId: context.schoolId,
          cashierUserId: cashierId,
          openedAt: sessionOpenedAt,
          ...sessionData,
        },
      });
  const openingMovement = await prisma.cashSessionMovement.findFirst({
    where: { sessionId: cashSession.id, type: 'OPENING_FLOAT' },
  });
  if (!openingMovement)
    await prisma.cashSessionMovement.create({
      data: {
        schoolId: context.schoolId,
        sessionId: cashSession.id,
        type: 'OPENING_FLOAT',
        amount: 25_000n,
        note: 'Fond de caisse initial',
        createdBy: cashierId,
      },
    });
  const enrollment = await prisma.enrollment.findFirstOrThrow({
    where: { schoolId: context.schoolId, academicYearId: context.academicYearId },
    include: { student: true },
    orderBy: { createdAt: 'asc' },
  });
  const cashPayments = [];
  for (const [index, amount] of [25_000n, 40_000n, 60_000n].entries()) {
    const reference = `CSBNK-CASH-DEMO-${String(index + 1).padStart(3, '0')}`;
    let payment = await prisma.payment.findUnique({ where: { reference } });
    payment ??= await prisma.payment.create({
      data: {
        schoolId: context.schoolId,
        reference,
        payerName: 'Parent démonstration',
        amount,
        paymentMethod: 'CASH',
        status: 'SUCCESS',
        channel: 'CASHIER',
        unallocatedAmount: amount,
        paidAt: date(`2026-10-0${index + 5}T10:00:00Z`),
        validatedAt: date(`2026-10-0${index + 5}T10:00:00Z`),
        validatedBy: cashierId,
        createdBy: cashierId,
        cashSessionId: cashSession.id,
        note: 'Encaissement de caisse de démonstration',
      },
    });
    cashPayments.push(payment);
    await prisma.paymentTarget.upsert({
      where: { paymentId_enrollmentId: { paymentId: payment.id, enrollmentId: enrollment.id } },
      update: {},
      create: {
        paymentId: payment.id,
        schoolId: context.schoolId,
        studentId: enrollment.studentId,
        enrollmentId: enrollment.id,
      },
    });
    await prisma.cashSessionMovement.upsert({
      where: { paymentId: payment.id },
      update: { sessionId: cashSession.id, amount: payment.amount, createdBy: cashierId },
      create: {
        schoolId: context.schoolId,
        sessionId: cashSession.id,
        paymentId: payment.id,
        type: 'PAYMENT',
        amount: payment.amount,
        note: 'Encaissement de démonstration',
        createdBy: cashierId,
      },
    });
    const preferredReceiptNumber = `REC-DEMO-2026-${String(index + 1).padStart(4, '0')}`;
    const receiptNumberCollision = await prisma.receipt.findFirst({
      where: {
        schoolId: context.schoolId,
        receiptNumber: preferredReceiptNumber,
        NOT: { paymentId: payment.id },
      },
      select: { id: true },
    });
    const receiptNumber = receiptNumberCollision
      ? `CSBNK-DEMO-${String(index + 1).padStart(4, '0')}-${payment.id.slice(0, 8)}`
      : preferredReceiptNumber;
    await prisma.receipt.upsert({
      where: { paymentId: payment.id },
      update: { issuedBy: cashierId },
      create: {
        schoolId: context.schoolId,
        paymentId: payment.id,
        receiptNumber,
        snapshot: {
          paymentReference: payment.reference,
          amount: payment.amount.toString(),
          currency: payment.currency,
          label: 'Reçu de paiement de démonstration',
        },
        issuedAt: date(`2026-10-0${index + 5}T10:00:00Z`),
        issuedBy: cashierId,
      },
    });
  }
  const bankPayment = await prisma.payment.upsert({
    where: { reference: 'SFA-EXT-DEMO-001' },
    update: { amount: 50_000n, status: 'AWAITING_VALIDATION' },
    create: {
      schoolId: context.schoolId,
      reference: 'SFA-EXT-DEMO-001',
      payerUserId: parentId,
      payerName: 'Jean Fotso',
      payerPhone: '+237699123456',
      amount: 50_000n,
      paymentMethod: 'BANK_DEPOSIT',
      externalReference: 'BICEC-DEMO-2026-001',
      status: 'AWAITING_VALIDATION',
      channel: 'PARENT_APP',
      unallocatedAmount: 50_000n,
      createdBy: parentId,
      note: 'Versement bancaire à valider',
    },
  });
  await prisma.paymentTarget.upsert({
    where: { paymentId_enrollmentId: { paymentId: bankPayment.id, enrollmentId: enrollment.id } },
    update: {},
    create: {
      paymentId: bankPayment.id,
      schoolId: context.schoolId,
      studentId: enrollment.studentId,
      enrollmentId: enrollment.id,
    },
  });
  const declaration = await prisma.externalPaymentDeclaration.upsert({
    where: { paymentId: bankPayment.id },
    update: { status: 'AWAITING_VALIDATION', decidedAt: null, decidedBy: null },
    create: {
      schoolId: context.schoolId,
      paymentId: bankPayment.id,
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      declaredByUserId: parentId,
      declaredAmount: 50_000n,
      bankName: 'BICEC',
      paymentDate: date('2026-10-07'),
      externalReference: 'BICEC-DEMO-2026-001',
      notes: 'Dépôt effectué au guichet Akwa',
    },
  });
  const proofFile = await prisma.file.upsert({
    where: {
      schoolId_storageKey: {
        schoolId: context.schoolId,
        storageKey: 'demo/payment-proofs/bicec-demo-001.jpg',
      },
    },
    update: { sizeBytes: 84_000n },
    create: {
      schoolId: context.schoolId,
      storageKey: 'demo/payment-proofs/bicec-demo-001.jpg',
      originalName: 'bordereau-bicec-demo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 84_000n,
      kind: 'PAYMENT_PROOF',
      uploadedBy: parentId,
    },
  });
  await prisma.externalPaymentProof.upsert({
    where: { fileId: proofFile.id },
    update: { declarationId: declaration.id, orderIndex: 0 },
    create: {
      schoolId: context.schoolId,
      declarationId: declaration.id,
      fileId: proofFile.id,
      orderIndex: 0,
    },
  });
  const mobilePayment = await prisma.payment.upsert({
    where: { reference: 'SFA-MOMO-DEMO-001' },
    update: { status: 'SUCCESS', amount: 35_000n },
    create: {
      schoolId: context.schoolId,
      reference: 'SFA-MOMO-DEMO-001',
      payerUserId: parentId,
      payerName: 'Jean Fotso',
      payerPhone: '+237699123456',
      amount: 35_000n,
      paymentMethod: 'MOBILE_MONEY',
      provider: 'MTN_MOMO',
      providerReference: 'MOMO-DEMO-001',
      providerFinancialId: 'FIN-DEMO-001',
      status: 'SUCCESS',
      channel: 'PARENT_APP',
      unallocatedAmount: 35_000n,
      initiatedAt: date('2026-10-07T15:00:00Z'),
      paidAt: date('2026-10-07T15:01:00Z'),
      validatedAt: date('2026-10-07T15:01:00Z'),
      validatedBy: accountantId,
      createdBy: parentId,
    },
  });
  await prisma.paymentTarget.upsert({
    where: { paymentId_enrollmentId: { paymentId: mobilePayment.id, enrollmentId: enrollment.id } },
    update: {},
    create: {
      paymentId: mobilePayment.id,
      schoolId: context.schoolId,
      studentId: enrollment.studentId,
      enrollmentId: enrollment.id,
    },
  });
  await prisma.paymentProviderEvent.upsert({
    where: { provider_eventId: { provider: 'MTN_MOMO', eventId: 'EVT-DEMO-001' } },
    update: { status: 'PROCESSED', signatureValid: true, paymentId: mobilePayment.id },
    create: {
      schoolId: context.schoolId,
      paymentId: mobilePayment.id,
      provider: 'MTN_MOMO',
      eventId: 'EVT-DEMO-001',
      status: 'PROCESSED',
      signatureValid: true,
      amount: 35_000n,
      rawPayload: { status: 'SUCCESS', reference: 'MOMO-DEMO-001' },
      headers: { 'x-demo-signature': 'valid' },
      processedAt: date('2026-10-07T15:01:00Z'),
    },
  });
  const reconciliation = await prisma.mobileMoneyReconciliation.findFirst({
    where: { provider: 'MTN_MOMO', providerReference: 'MOMO-DEMO-001' },
  });
  const reconciliationData = {
    schoolId: context.schoolId,
    paymentId: mobilePayment.id,
    status: 'MATCHED' as const,
    operatorAmount: 35_000n,
    localAmount: 35_000n,
    details: { source: 'seed', message: 'Montants rapprochés' },
    resolvedAt: date('2026-10-08T08:00:00Z'),
  };
  if (reconciliation)
    await prisma.mobileMoneyReconciliation.update({
      where: { id: reconciliation.id },
      data: reconciliationData,
    });
  else
    await prisma.mobileMoneyReconciliation.create({
      data: { provider: 'MTN_MOMO', providerReference: 'MOMO-DEMO-001', ...reconciliationData },
    });
  const feeAssignment = await prisma.studentFeeAssignment.findFirst({
    where: { enrollmentId: enrollment.id, feeType: { code: 'PENSION' } },
  });
  if (feeAssignment) {
    const discount = await prisma.discount.findFirst({
      where: {
        studentFeeAssignmentId: feeAssignment.id,
        reason: 'Remise fratrie de démonstration',
      },
    });
    if (!discount)
      await prisma.discount.create({
        data: {
          studentFeeAssignmentId: feeAssignment.id,
          type: 'PERCENTAGE',
          value: 10,
          amount: 17_500n,
          reason: 'Remise fratrie de démonstration',
          category: 'FRATRIE',
          status: 'PENDING_APPROVAL',
          createdBy: adminId,
        },
      });
  }
  context.log('Paiements étendus        1 caisse · 3 reçus · 1 dépôt · 1 Mobile Money · 1 remise');
}

async function seedReporting(prisma: PrismaClient, context: ExtendedSeedContext) {
  const adminId = requiredUser(context.users, '+237699000001', 'administrateur');
  await prisma.documentTemplate.upsert({
    where: { schoolId: context.schoolId },
    update: {
      headerText: 'CSB Noutcha KAMGUE — Apprendre, persévérer, réussir',
      footerText: 'Document généré par le CSB Noutcha KAMGUE',
      legalNotice: 'Document de démonstration sans valeur comptable.',
      defaultSignatory: 'Le Chef d’établissement',
    },
    create: {
      schoolId: context.schoolId,
      headerText: 'CSB Noutcha KAMGUE — Apprendre, persévérer, réussir',
      footerText: 'Document généré par le CSB Noutcha KAMGUE',
      legalNotice: 'Document de démonstration sans valeur comptable.',
      defaultSignatory: 'Le Chef d’établissement',
    },
  });
  const saved = await prisma.savedReportQuery.findFirst({
    where: { schoolId: context.schoolId, userId: adminId, name: 'Impayés du trimestre' },
  });
  const savedData = {
    criteria: { academicYearId: context.academicYearId, status: ['PENDING', 'PARTIALLY_PAID'] },
  };
  if (saved) await prisma.savedReportQuery.update({ where: { id: saved.id }, data: savedData });
  else
    await prisma.savedReportQuery.create({
      data: {
        schoolId: context.schoolId,
        userId: adminId,
        name: 'Impayés du trimestre',
        ...savedData,
      },
    });
  const exportFile = await prisma.file.upsert({
    where: {
      schoolId_storageKey: {
        schoolId: context.schoolId,
        storageKey: 'demo/exports/eleves-6e-a.csv',
      },
    },
    update: { sizeBytes: 2048n },
    create: {
      schoolId: context.schoolId,
      storageKey: 'demo/exports/eleves-6e-a.csv',
      originalName: 'eleves-6e-a.csv',
      mimeType: 'text/csv',
      sizeBytes: 2048n,
      kind: 'EXPORT',
      uploadedBy: adminId,
    },
  });
  const job = await prisma.exportJob.findFirst({ where: { fileId: exportFile.id } });
  const jobData = {
    type: 'STUDENTS_BY_CLASS' as const,
    format: 'CSV' as const,
    filters: { academicYearId: context.academicYearId, classId: context.classIds[0] },
    options: { includeGuardians: true },
    status: 'READY' as const,
    rowCount: 6,
    completedAt: date('2026-10-08T08:30:00Z'),
    expiresAt: date('2026-11-08T08:30:00Z'),
  };
  if (job) await prisma.exportJob.update({ where: { id: job.id }, data: jobData });
  else
    await prisma.exportJob.create({
      data: {
        schoolId: context.schoolId,
        userId: adminId,
        fileId: exportFile.id,
        requestedAt: date('2026-10-08T08:29:00Z'),
        ...jobData,
      },
    });
  context.log(
    'Reporting                1 filtre sauvegardé · 1 export prêt · 1 modèle documentaire',
  );
}

async function seedNotifications(prisma: PrismaClient, context: ExtendedSeedContext) {
  const parentId = requiredUser(context.users, '+237699123456', 'parent');
  await prisma.device.upsert({
    where: { pushToken: 'demo-parent-push-token-2026' },
    update: { userId: parentId, status: 'ACTIVE', appVersion: '1.0.0' },
    create: {
      userId: parentId,
      pushToken: 'demo-parent-push-token-2026',
      platform: 'ANDROID',
      deviceLabel: 'Téléphone de démonstration',
      appVersion: '1.0.0',
    },
  });
  await prisma.notificationPreference.upsert({
    where: { userId: parentId },
    update: { pushEnabled: true, smsEnabled: true, emailEnabled: true, newsEnabled: true },
    create: {
      userId: parentId,
      pushEnabled: true,
      smsEnabled: true,
      emailEnabled: true,
      paymentEnabled: true,
      reminderEnabled: true,
      newsEnabled: true,
    },
  });
  for (const channel of ['IN_APP', 'PUSH', 'SMS', 'EMAIL'] as const) {
    await prisma.notificationTemplate.upsert({
      where: {
        schoolId_type_channel: {
          schoolId: context.schoolId,
          type: 'PAYMENT_REMINDER',
          channel,
        },
      },
      update: { body: 'Un paiement scolaire arrive à échéance. Consultez votre espace famille.' },
      create: {
        schoolId: context.schoolId,
        type: 'PAYMENT_REMINDER',
        channel,
        title: channel === 'SMS' ? null : 'Rappel de paiement',
        body: 'Un paiement scolaire arrive à échéance. Consultez votre espace famille.',
      },
    });
  }
  let notification = await prisma.notification.findFirst({
    where: { userId: parentId, dedupKey: 'seed-payment-reminder-2026' },
  });
  const notificationData = {
    schoolId: context.schoolId,
    type: 'PAYMENT_REMINDER',
    title: 'Échéance de pension',
    body: 'La prochaine tranche de pension est attendue le 15 janvier 2027.',
    data: { academicYearId: context.academicYearId, route: '/parent/finances' },
    isCritical: false,
  };
  notification = notification
    ? await prisma.notification.update({ where: { id: notification.id }, data: notificationData })
    : await prisma.notification.create({
        data: {
          userId: parentId,
          dedupKey: 'seed-payment-reminder-2026',
          ...notificationData,
        },
      });
  for (const channel of ['IN_APP', 'PUSH', 'SMS', 'EMAIL'] as const) {
    await prisma.notificationDelivery.upsert({
      where: { notificationId_channel: { notificationId: notification.id, channel } },
      update: { status: 'DELIVERED', attempts: 1, deliveredAt: date('2026-10-08T09:00:00Z') },
      create: {
        notificationId: notification.id,
        schoolId: context.schoolId,
        channel,
        status: 'DELIVERED',
        attempts: 1,
        sentAt: date('2026-10-08T08:59:00Z'),
        deliveredAt: date('2026-10-08T09:00:00Z'),
      },
    });
  }
  context.log('Notifications            1 appareil · 4 modèles · 4 livraisons');
}

async function verifySeedCoverage(prisma: PrismaClient, context: ExtendedSeedContext) {
  const school = { schoolId: context.schoolId };
  const checks: Array<[string, Promise<number>]> = [
    ['modules', prisma.schoolModuleSetting.count({ where: school })],
    ['utilisateurs', prisma.userRole.count({ where: { schoolId: context.schoolId } })],
    ['personnel', prisma.staffProfile.count({ where: school })],
    ['congés', prisma.staffLeave.count({ where: school })],
    ['annonces', prisma.announcement.count({ where: school })],
    ['événements', prisma.schoolEvent.count({ where: school })],
    ['devoirs', prisma.homework.count({ where: school })],
    ['messages', prisma.schoolMessage.count({ where: school })],
    ['bibliothèque', prisma.libraryBook.count({ where: school })],
    ['prêts', prisma.libraryLoan.count({ where: school })],
    ['cantine', prisma.canteenMeal.count({ where: school })],
    ['transport', prisma.transportRoute.count({ where: school })],
    ['inscriptions transport', prisma.transportEnrollment.count({ where: school })],
    ['stock', prisma.inventoryItem.count({ where: school })],
    ['mouvements de stock', prisma.inventoryMovement.count({ where: school })],
    ['fournisseurs', prisma.supplier.count({ where: school })],
    ['catégories de dépense', prisma.expenseCategory.count({ where: school })],
    ['bons de commande', prisma.purchaseOrder.count({ where: school })],
    ['dépenses', prisma.expense.count({ where: school })],
    ['règlements fournisseurs', prisma.supplierPayment.count({ where: school })],
    ['années scolaires', prisma.academicYear.count({ where: school })],
    ['niveaux', prisma.gradeLevel.count({ where: school })],
    ['classes', prisma.class.count({ where: school })],
    ['élèves', prisma.student.count({ where: school })],
    ['inscriptions', prisma.enrollment.count({ where: school })],
    ['responsables', prisma.guardian.count({ where: school })],
    ['matières', prisma.subject.count({ where: school })],
    ['affectations', prisma.teachingAssignment.count({ where: school })],
    ['salles', prisma.timetableRoom.count({ where: school })],
    ['emplois du temps', prisma.timetableEntry.count({ where: school })],
    ['appels', prisma.attendanceSession.count({ where: school })],
    ['présences', prisma.attendanceRecord.count({ where: school })],
    ['périodes', prisma.academicPeriod.count({ where: school })],
    ['types d’évaluation', prisma.assessmentType.count({ where: school })],
    ['compétences', prisma.competency.count({ where: school })],
    ['évaluations', prisma.assessment.count({ where: school })],
    ['notes', prisma.grade.count({ where: school })],
    ['bulletins', prisma.reportCard.count({ where: school })],
    ['incidents', prisma.studentIncident.count({ where: school })],
    ['infirmerie', prisma.healthVisit.count({ where: school })],
    ['imports', prisma.importBatch.count({ where: school })],
    ['types de frais', prisma.feeType.count({ where: school })],
    ['structures tarifaires', prisma.feeStructure.count({ where: school })],
    ['dettes élèves', prisma.studentFeeAssignment.count({ where: school })],
    [
      'remises',
      prisma.discount.count({
        where: { assignment: { enrollment: { schoolId: context.schoolId } } },
      }),
    ],
    ['paiements', prisma.payment.count({ where: school })],
    ['déclarations externes', prisma.externalPaymentDeclaration.count({ where: school })],
    ['événements opérateur', prisma.paymentProviderEvent.count({ where: school })],
    ['rapprochements Mobile Money', prisma.mobileMoneyReconciliation.count({ where: school })],
    ['sessions de caisse', prisma.cashSession.count({ where: school })],
    ['reçus', prisma.receipt.count({ where: school })],
    ['rapports sauvegardés', prisma.savedReportQuery.count({ where: school })],
    ['exports', prisma.exportJob.count({ where: school })],
    ['notifications', prisma.notification.count({ where: school })],
    ['livraisons de notification', prisma.notificationDelivery.count({ where: school })],
    ['modèles de notification', prisma.notificationTemplate.count({ where: school })],
  ];
  const results = await Promise.all(
    checks.map(async ([label, pendingCount]) => [label, await pendingCount] as const),
  );
  const missing = results.filter(([, count]) => count === 0).map(([label]) => label);
  if (missing.length) throw new Error(`Seed incomplet : aucune donnée pour ${missing.join(', ')}.`);
  context.log(`Couverture vérifiée       ${results.length} familles de données non vides`);
}

export async function seedExtendedDemoData(
  prisma: PrismaClient,
  context: ExtendedSeedContext,
): Promise<void> {
  await seedModuleSettings(prisma, context);
  await seedStaff(prisma, context);
  await seedTimetableAndAttendance(prisma, context);
  await seedCompetencies(prisma, context);
  await seedCommunications(prisma, context);
  await seedStudentLife(prisma, context);
  await seedSchoolServices(prisma, context);
  await seedProcurement(prisma, context);
  await seedImports(prisma, context);
  await seedPaymentOperations(prisma, context);
  await seedReporting(prisma, context);
  await seedNotifications(prisma, context);
  await verifySeedCoverage(prisma, context);
}
