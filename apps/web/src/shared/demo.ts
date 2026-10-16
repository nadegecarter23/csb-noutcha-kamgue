import {
  PERMISSION_CODES,
  SCHOOL_MODULES,
  resolveModuleToggle,
  type AuthSession,
  type CashSessionDto,
  type ClassDto,
  type CurrentUser,
  type FeeStructureDto,
  type FeeTypeDto,
  type GradeLevelDto,
  type PaymentDto,
  type StudentDto,
  type SubjectDto,
  type TeachingAssignmentDto,
  type TimetableEntryDto,
  type TimetableRoomDto,
  type AttendanceSessionDto,
  type AssessmentOverviewDto,
  type AssessmentDto,
  type ReportCardDto,
  type IncidentDto,
  type HealthVisitDto,
  type StaffMemberDto,
  type StaffLeaveDto,
  type CommunicationsOverviewDto,
  type SchoolServicesOverviewDto,
  type PortalOverviewDto,
  type ProcurementOverviewDto,
  type SchoolModuleDto,
} from '@cplan/contracts';

export const DEMO_ACCESS_TOKEN = 'csbnk-demo-access';
export const DEMO_REFRESH_TOKEN = 'csbnk-demo-refresh';
export const DEMO_PASSWORD = 'CSBNoutchaDemo2026!';
export const DEMO_ADMIN_EMAIL = 'admin@csb-noutcha-kamgue.local';
export const DEMO_SCHOOL_ID = '01990000-0000-7000-8000-000000000001';
export const DEMO_YEAR_ID = '01990000-0000-7000-8000-000000000002';
export const DEMO_MODE_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_MODE === 'true';

const demoAdmin: CurrentUser = {
  id: '01990000-0000-7000-8000-000000000003',
  firstName: 'Awa',
  lastName: 'Ngo',
  phone: '+237699000001',
  phoneVerified: true,
  email: DEMO_ADMIN_EMAIL,
  status: 'ACTIVE',
  mustChangePassword: false,
  currentSchoolId: DEMO_SCHOOL_ID,
  roles: ['SCHOOL_ADMIN'],
  permissions: [...PERMISSION_CODES],
  accessScopes: [{ type: 'SCHOOL', label: "Tout l'établissement" }],
  schools: [
    {
      schoolId: DEMO_SCHOOL_ID,
      schoolName: 'Complexe Scolaire Bilingue Noutcha KAMGUE',
      roles: ['SCHOOL_ADMIN'],
    },
  ],
};

const uuid = (value: number) => `01990000-0000-7000-8000-${String(value).padStart(12, '0')}`;
// Cycles du référentiel de démonstration (voir l'arbre organisationnel plus bas).
const demoWritable = {
  units: [
    { id: uuid(87), code: 'CRECHE', name: 'Crèche' },
    { id: uuid(88), code: 'MATERNELLE', name: 'Maternelle' },
    { id: uuid(89), code: 'PRIMAIRE', name: 'Primaire' },
    { id: uuid(90), code: 'SECONDAIRE', name: 'Secondaire' },
  ],
  schoolWide: true,
};
const demoUnitName = (id: string | null | undefined) =>
  demoWritable.units.find((unit) => unit.id === id)?.name ?? null;
const demoPrimaryUnit = { organizationalUnitId: uuid(89), organizationalUnitName: 'Primaire' };
const levelDefinitions = [
  ['6e', '6E', 'SECONDAIRE'],
  ['5e', '5E', 'SECONDAIRE'],
  ['4e', '4E', 'SECONDAIRE'],
  ['3e', '3E', 'SECONDAIRE'],
  ['2nde', '2NDE', 'SECONDAIRE'],
  ['1re', '1RE', 'SECONDAIRE'],
  ['Terminale', 'TLE', 'SECONDAIRE'],
] as const;
const demoLevels: GradeLevelDto[] = levelDefinitions.map(([name, code, cycle], index) => ({
  id: uuid(100 + index),
  name,
  code,
  orderIndex: index,
  cycle,
  organizationalUnitId: uuid(90),
  organizationalUnitName: 'Secondaire',
  status: 'ACTIVE',
  classCount: index < 2 ? 2 : 1,
}));
const classDefinitions = [
  [0, '6e A'],
  [0, '6e B'],
  [1, '5e A'],
  [1, '5e B'],
  [2, '4e A'],
  [3, '3e A'],
  [4, '2nde A'],
  [5, '1re A'],
  [6, 'Terminale A'],
] as const;
const classSizes = [6, 6, 6, 6, 6, 5, 5, 5, 5];
const demoClasses: ClassDto[] = classDefinitions.map(([levelIndex, name], index) => ({
  id: uuid(200 + index),
  academicYearId: DEMO_YEAR_ID,
  gradeLevelId: demoLevels[levelIndex]?.id ?? uuid(100),
  gradeLevelName: demoLevels[levelIndex]?.name ?? '6e',
  organizationalUnitId: uuid(90),
  organizationalUnitName: 'Secondaire',
  languageSectionId: uuid(91),
  languageSectionName: 'Francophone',
  educationTrackId: uuid(92),
  educationTrackName: 'Enseignement général',
  name,
  capacity: 60,
  headTeacherUserId: null,
  headTeacherName:
    index % 3 === 0 ? (['Mme Ngo', 'M. Mbarga', 'Mme Fouda'][index / 3] ?? null) : null,
  status: 'ACTIVE',
  enrollmentCount: classSizes[index] ?? 0,
  fillRate: (classSizes[index] ?? 0) / 60,
}));
let demoSubjects: SubjectDto[] = [
  { id: uuid(700), code: 'FR', name: 'Français', color: '#2B6CB0', status: 'ACTIVE' },
  { id: uuid(701), code: 'MATH', name: 'Mathématiques', color: '#4C51BF', status: 'ACTIVE' },
  { id: uuid(702), code: 'ANG', name: 'Anglais', color: '#2F855A', status: 'ACTIVE' },
  { id: uuid(703), code: 'HG', name: 'Histoire-Géographie', color: '#B7791F', status: 'ACTIVE' },
];
const demoTeachers = [
  { id: uuid(750), name: 'Mme Ngo Mbarga', jobTitle: 'Professeure de français' },
  { id: uuid(751), name: 'M. Njambe', jobTitle: 'Professeur de mathématiques' },
  { id: uuid(752), name: 'Mme Tchoua', jobTitle: 'Professeure d’anglais' },
];
let demoStaff: StaffMemberDto[] = demoTeachers.map((teacher, index) => ({
  id: uuid(760 + index),
  userId: teacher.id,
  employeeNumber: `ENS-${String(index + 1).padStart(3, '0')}`,
  fullName: teacher.name,
  phone: `+23769910000${index}`,
  email: `enseignant${index + 1}@csb-noutcha-kamgue.local`,
  jobTitle: teacher.jobTitle,
  employmentType: index === 2 ? 'FIXED_TERM' : 'PERMANENT',
  hiredAt: `202${index + 1}-09-01`,
  contractEnd: index === 2 ? '2027-08-31' : null,
  weeklyWorkload: index === 0 ? 4 : 18,
  status: 'ACTIVE',
  teachingHours: [8, 5, 3][index] ?? 0,
}));
let demoStaffLeaves: StaffLeaveDto[] = [
  {
    id: uuid(770),
    staffProfileId: uuid(761),
    staffName: demoTeachers[1]?.name ?? 'M. Njambe',
    type: 'Congé annuel',
    startsAt: '2026-10-12',
    endsAt: '2026-10-16',
    reason: 'Repos annuel planifié',
    status: 'PENDING',
  },
];
let demoCommunications: CommunicationsOverviewDto = {
  writable: demoWritable,
  announcements: [
    {
      id: uuid(780),
      title: 'Réunion de rentrée',
      body: 'La réunion avec les responsables aura lieu samedi à 9 h dans la grande salle.',
      audience: 'FAMILIES',
      organizationalUnitId: null,
      organizationalUnitName: null,
      publishedAt: '2026-10-01T08:00:00.000Z',
      expiresAt: '2026-10-20T18:00:00.000Z',
    },
  ],
  events: [
    {
      id: uuid(781),
      title: 'Conseil pédagogique',
      description: 'Bilan du premier mois et harmonisation des évaluations.',
      location: 'Salle des professeurs',
      audience: 'STAFF',
      startsAt: '2026-10-08T14:00:00.000Z',
      endsAt: '2026-10-08T16:00:00.000Z',
    },
  ],
  homework: [
    {
      id: uuid(782),
      academicYearId: DEMO_YEAR_ID,
      classId: uuid(200),
      className: '6e A',
      subjectId: uuid(701),
      subjectName: 'Mathématiques',
      title: 'Fractions et proportionnalité',
      instructions: 'Faire les exercices 4 à 8 de la fiche distribuée en classe.',
      dueAt: '2026-10-09T07:00:00.000Z',
      status: 'PUBLISHED',
    },
  ],
  messages: [
    {
      id: uuid(783),
      senderUserId: uuid(750),
      senderName: 'Mme Ngo Mbarga',
      recipientUserId: demoAdmin.id,
      recipientName: `${demoAdmin.firstName} ${demoAdmin.lastName}`,
      subject: 'Manuels de français',
      body: 'Il manque trois exemplaires pour la classe de 6e A.',
      sentAt: '2026-10-02T09:15:00.000Z',
      readAt: null,
    },
  ],
};
const demoPortal: PortalOverviewDto = {
  mode: 'TEACHER',
  displayName: `${demoAdmin.firstName} ${demoAdmin.lastName}`,
  cards: [
    { label: 'Classes suivies', value: '2', hint: 'affectations actives' },
    { label: 'Enseignements', value: '4', hint: 'matières et classes' },
    { label: 'Prochains cours', value: '3', hint: 'emploi du temps publié' },
  ],
  schedule: [
    {
      id: uuid(850),
      title: 'Français',
      detail: '6e A · 08:00-09:00',
      startsAt: '2026-10-05T08:00:00.000Z',
    },
    {
      id: uuid(851),
      title: 'Mathématiques',
      detail: '6e B · 10:00-11:00',
      startsAt: '2026-10-05T10:00:00.000Z',
    },
  ],
  learners: [],
  announcements: [
    {
      id: uuid(784),
      title: 'Conseil pédagogique',
      body: 'Réunion mercredi à 14 h dans la salle des professeurs.',
      audience: 'STAFF',
      organizationalUnitId: null,
      organizationalUnitName: null,
      publishedAt: '2026-10-01T08:00:00.000Z',
      expiresAt: null,
    },
  ],
  homework: demoCommunications.homework,
};
let demoAssignments: TeachingAssignmentDto[] = demoSubjects.flatMap((subject, index) => {
  const classroom = demoClasses[index] ?? demoClasses[0];
  const teacher = demoTeachers[index % demoTeachers.length];
  if (!classroom || !teacher) return [];
  return [
    {
      id: uuid(800 + index),
      academicYearId: DEMO_YEAR_ID,
      classId: classroom.id,
      className: classroom.name,
      subjectId: subject.id,
      subjectName: subject.name,
      subjectColor: subject.color,
      teacherUserId: teacher.id,
      teacherName: teacher.name,
      weeklyHours: index < 2 ? 5 : 3,
      coefficient: index === 0 ? 4 : 2,
      status: 'ACTIVE' as const,
    },
  ];
});
let demoRooms: TimetableRoomDto[] = [
  { id: uuid(850), code: 'S101', name: 'Salle 101', capacity: 60, status: 'ACTIVE' },
  { id: uuid(851), code: 'LAB', name: 'Laboratoire', capacity: 36, status: 'ACTIVE' },
];
let demoTimetable: TimetableEntryDto[] = demoAssignments.flatMap((assignment, index) => {
  const room = demoRooms[index % demoRooms.length];
  if (!room) return [];
  return [
    {
      id: uuid(860 + index),
      academicYearId: DEMO_YEAR_ID,
      teachingAssignmentId: assignment.id,
      classId: assignment.classId,
      className: assignment.className,
      subjectId: assignment.subjectId,
      subjectName: assignment.subjectName,
      subjectColor: assignment.subjectColor,
      teacherUserId: assignment.teacherUserId,
      teacherName: assignment.teacherName,
      roomId: room.id,
      roomName: room.name,
      dayOfWeek: index + 1,
      startTime: index % 2 ? '10:00' : '08:00',
      endTime: index % 2 ? '11:00' : '09:00',
      status: index < 2 ? ('PUBLISHED' as const) : ('DRAFT' as const),
    },
  ];
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
];
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
];
const featured = [
  ['Nathan', 'Fotso', '2014-03-12', 'M'],
  ['Sarah', 'Fotso', '2012-06-18', 'F'],
  ['Estelle', 'Fotso', '2010-11-04', 'F'],
] as const;
const demoStudents: StudentDto[] = Array.from({ length: 50 }, (_, index) => {
  const classroom = demoClasses[index % demoClasses.length];
  if (!classroom) throw new Error('Les classes de démonstration sont absentes.');
  const identity = featured[index];
  const firstName = identity?.[0] ?? firstNames[index % firstNames.length] ?? 'Élève';
  const lastName = identity?.[1] ?? lastNames[(index * 3) % lastNames.length] ?? 'Démo';
  const gender = identity?.[3] ?? (index % 2 === 0 ? 'M' : 'F');
  const studentId = uuid(1_000 + index);
  return {
    id: studentId,
    studentNumber: `SFA-${String(index + 1).padStart(5, '0')}`,
    firstName,
    lastName,
    dateOfBirth:
      identity?.[2] ?? `${2009 + (index % 7)}-${String((index % 12) + 1).padStart(2, '0')}-15`,
    placeOfBirth: 'Douala',
    gender,
    photoFileId: null,
    status: 'ACTIVE',
    guardianCount: index < 3 ? 1 : 0,
    currentEnrollment: {
      id: uuid(2_000 + index),
      studentId,
      academicYearId: DEMO_YEAR_ID,
      academicYearName: '2026/2027',
      classId: classroom.id,
      className: classroom.name,
      gradeLevelId: classroom.gradeLevelId,
      gradeLevelName: classroom.gradeLevelName,
      studentCategoryId: uuid(300),
      studentCategoryName: 'Externe',
      enrollmentDate: '2026-09-01',
      enrollmentType: 'NEW',
      status: 'ACTIVE',
    },
  };
});
let demoAttendance: AttendanceSessionDto[] = [];
const makeDemoAttendance = (entry: TimetableEntryDto, date: string): AttendanceSessionDto => {
  const roster = demoStudents.filter(
    (student) => student.currentEnrollment?.classId === entry.classId,
  );
  const records = roster.map((student, index) => ({
    id: uuid(9_200 + index),
    enrollmentId: student.currentEnrollment?.id ?? uuid(9_500 + index),
    studentId: student.id,
    studentNumber: student.studentNumber,
    studentName: `${student.lastName} ${student.firstName}`,
    mark: (index === 1 ? 'ABSENT' : index === 2 ? 'LATE' : 'PRESENT') as
      'PRESENT' | 'ABSENT' | 'LATE',
    minutesLate: index === 2 ? 10 : 0,
    note: null,
    justificationStatus: 'NONE' as const,
    justificationNote: null,
  }));
  return {
    id: uuid(9_100 + demoAttendance.length),
    academicYearId: entry.academicYearId,
    timetableEntryId: entry.id,
    classId: entry.classId,
    className: entry.className,
    subjectName: entry.subjectName,
    teacherName: entry.teacherName,
    date,
    startTime: entry.startTime,
    endTime: entry.endTime,
    status: 'DRAFT',
    validatedAt: null,
    records,
    summary: {
      present: records.filter((item) => item.mark === 'PRESENT').length,
      absent: records.filter((item) => item.mark === 'ABSENT').length,
      late: records.filter((item) => item.mark === 'LATE').length,
      excused: 0,
    },
  };
};
let demoPeriods: AssessmentOverviewDto['periods'] = [
  {
    id: uuid(9_600),
    academicYearId: DEMO_YEAR_ID,
    name: 'Trimestre 1',
    orderIndex: 1,
    startDate: '2026-09-01',
    endDate: '2026-12-18',
    status: 'OPEN',
  },
];
let demoAssessmentTypes: AssessmentOverviewDto['types'] = [
  { id: uuid(9_610), code: 'DEVOIR', name: 'Devoir surveillé', defaultWeight: 2, status: 'ACTIVE' },
  {
    id: uuid(9_611),
    code: 'CONTROLE',
    name: 'Contrôle continu',
    defaultWeight: 1,
    status: 'ACTIVE',
  },
];
let demoCompetencies: AssessmentOverviewDto['competencies'] = [
  {
    id: uuid(9_620),
    code: 'EXPR',
    name: 'Expression écrite',
    description: 'Structurer et rédiger un texte.',
    status: 'ACTIVE',
  },
];
let demoPolicies: AssessmentOverviewDto['policies'] = [
  {
    id: uuid(9_630),
    academicYearId: DEMO_YEAR_ID,
    cycle: null,
    version: 1,
    roundingDigits: 2,
    weightingMode: 'WEIGHTED_AVERAGE',
    absenceHandling: 'EXCLUDE',
    rankingEnabled: true,
    isActive: true,
  },
];
let demoAssessments: AssessmentDto[] = [];
const seedAssessment = demoAssignments[0];
const seedPeriod = demoPeriods[0];
const seedType = demoAssessmentTypes[0];
if (seedAssessment && seedPeriod && seedType) {
  const roster = demoStudents.filter(
    (student) => student.currentEnrollment?.classId === seedAssessment.classId,
  );
  demoAssessments = [
    {
      id: uuid(9_640),
      academicYearId: DEMO_YEAR_ID,
      periodId: seedPeriod.id,
      periodName: seedPeriod.name,
      teachingAssignmentId: seedAssessment.id,
      classId: seedAssessment.classId,
      className: seedAssessment.className,
      subjectName: seedAssessment.subjectName,
      typeId: seedType.id,
      typeName: seedType.name,
      title: 'Rédaction : récit court',
      date: '2026-09-28',
      maxScore: 20,
      weight: 2,
      status: 'DRAFT',
      competencies: demoCompetencies,
      grades: roster.map((student, index) => ({
        id: uuid(9_700 + index),
        enrollmentId: student.currentEnrollment?.id ?? uuid(9_800 + index),
        studentId: student.id,
        studentNumber: student.studentNumber,
        studentName: `${student.lastName} ${student.firstName}`,
        score: index < 3 ? 12 + index : null,
        isAbsent: false,
        comment: null,
      })),
    },
  ];
}
let demoReportCards: ReportCardDto[] = [];
let demoIncidents: IncidentDto[] = [];
let demoHealthVisits: HealthVisitDto[] = [];
let demoServices: SchoolServicesOverviewDto = {
  books: [
    {
      id: uuid(790),
      isbn: '978-2-07-036822-8',
      title: 'Le Petit Prince',
      author: 'Antoine de Saint-Exupéry',
      stock: 12,
      available: 11,
    },
    {
      id: uuid(791),
      isbn: null,
      title: 'Mathématiques 6e',
      author: 'Collectif',
      stock: 30,
      available: 30,
    },
  ],
  loans: [
    {
      id: uuid(792),
      bookId: uuid(790),
      bookTitle: 'Le Petit Prince',
      enrollmentId: uuid(600),
      studentName: 'Mvondo Nathan',
      borrowedAt: '2026-09-25',
      dueAt: '2026-10-09',
      returnedAt: null,
      status: 'BORROWED',
    },
  ],
  meals: [
    {
      id: uuid(793),
      date: '2026-10-02',
      menu: 'Riz sauté, poulet et fruits',
      planned: 180,
      served: 172,
    },
  ],
  routes: [
    {
      id: uuid(794),
      name: 'Ligne Bonamoussadi',
      vehicle: 'Bus LT-204',
      driver: 'M. Etoundi',
      capacity: 45,
      enrolled: 38,
      stops: ['Rond-point Maetur', 'Denver', 'École'],
      feeStructureId: null,
      status: 'ACTIVE',
    },
  ],
  inventory: [
    {
      id: uuid(795),
      code: 'PAP-A4',
      name: 'Papier A4',
      unit: 'ramette',
      quantity: 8,
      reorderLevel: 10,
      status: 'LOW',
    },
    {
      id: uuid(796),
      code: 'CRAIE',
      name: 'Craies blanches',
      unit: 'boîte',
      quantity: 24,
      reorderLevel: 5,
      status: 'OK',
    },
  ],
};
const buildDemoReportCards = (periodId: string, classId: string) => {
  const period = demoPeriods.find((item) => item.id === periodId);
  const assessments = demoAssessments.filter(
    (item) => item.periodId === periodId && item.classId === classId,
  );
  const roster = demoStudents.filter((item) => item.currentEnrollment?.classId === classId);
  demoReportCards = roster.map((student, index) => {
    const subjects = assessments.flatMap((assessment) => {
      const grade = assessment.grades.find(
        (item) => item.enrollmentId === student.currentEnrollment?.id,
      );
      return grade?.score === null || grade?.score === undefined
        ? []
        : [
            {
              subjectId: assessment.teachingAssignmentId,
              subjectName: assessment.subjectName,
              average: Math.round((grade.score / assessment.maxScore) * 2000) / 100,
              coefficient: assessment.weight,
              teacherComment: null,
            },
          ];
    });
    const average = subjects.length
      ? Math.round(
          (subjects.reduce((sum, item) => sum + (item.average ?? 0), 0) * 100) / subjects.length,
        ) / 100
      : null;
    return {
      id: uuid(10_000 + index),
      enrollmentId: student.currentEnrollment?.id ?? uuid(10_100 + index),
      studentId: student.id,
      studentNumber: student.studentNumber,
      studentName: `${student.lastName} ${student.firstName}`,
      className: student.currentEnrollment?.className ?? '',
      periodId,
      periodName: period?.name ?? '',
      overallAverage: average,
      rank: average === null ? null : index + 1,
      generalComment: null,
      decision: null,
      status: 'DRAFT' as const,
      publishedAt: null,
      subjects,
    };
  });
};
const demoFeeTypes: FeeTypeDto[] = [
  {
    id: uuid(400),
    code: 'INSCRIPTION',
    name: "Frais d'inscription",
    description: null,
    isMandatory: true,
    priority: 10,
    status: 'ACTIVE',
  },
  {
    id: uuid(401),
    code: 'PENSION',
    name: 'Pension scolaire',
    description: null,
    isMandatory: true,
    priority: 20,
    status: 'ACTIVE',
  },
  {
    id: uuid(402),
    code: 'APE',
    name: 'Association des parents d’élèves',
    description: null,
    isMandatory: true,
    priority: 30,
    status: 'ACTIVE',
  },
];
const demoFeeStructures: FeeStructureDto[] = [
  {
    id: uuid(500),
    academicYearId: DEMO_YEAR_ID,
    feeTypeId: uuid(400),
    feeTypeName: "Frais d'inscription",
    gradeLevelId: null,
    classId: null,
    studentCategoryId: null,
    name: 'Inscription annuelle',
    amount: 25_000,
    isMandatory: true,
    allowPartialPayment: true,
    allowFullPayment: true,
    allowFreeAmount: true,
    enforceInstallmentOrder: false,
    opensAt: null,
    dueDate: '2026-09-30',
    status: 'ACTIVE',
    installments: [],
  },
  {
    id: uuid(501),
    academicYearId: DEMO_YEAR_ID,
    feeTypeId: uuid(401),
    feeTypeName: 'Pension scolaire',
    gradeLevelId: null,
    classId: null,
    studentCategoryId: null,
    name: 'Pension tous niveaux',
    amount: 175_000,
    isMandatory: true,
    allowPartialPayment: true,
    allowFullPayment: true,
    allowFreeAmount: true,
    enforceInstallmentOrder: false,
    opensAt: null,
    dueDate: null,
    status: 'ACTIVE',
    installments: [
      { id: uuid(510), name: '1ère tranche', amount: 75_000, dueDate: '2026-09-30', orderIndex: 0 },
      { id: uuid(511), name: '2e tranche', amount: 60_000, dueDate: '2027-01-15', orderIndex: 1 },
      { id: uuid(512), name: '3e tranche', amount: 40_000, dueDate: '2027-03-31', orderIndex: 2 },
    ],
  },
  {
    id: uuid(502),
    academicYearId: DEMO_YEAR_ID,
    feeTypeId: uuid(402),
    feeTypeName: 'Association des parents d’élèves',
    gradeLevelId: null,
    classId: null,
    studentCategoryId: null,
    name: 'Cotisation APE',
    amount: 10_000,
    isMandatory: true,
    allowPartialPayment: true,
    allowFullPayment: true,
    allowFreeAmount: true,
    enforceInstallmentOrder: false,
    opensAt: null,
    dueDate: null,
    status: 'ACTIVE',
    installments: [],
  },
];
const demoPayments: PaymentDto[] = demoStudents.slice(0, 35).map((student, index) => ({
  id: uuid(3_000 + index),
  reference: `SFA-DEMO-${student.studentNumber}-2026`,
  amount: index < 20 ? 210_000 : 100_000,
  paymentMethod: index % 4 === 0 ? 'MOBILE_MONEY' : 'CASH',
  provider: index % 4 === 0 ? 'MTN_MOMO' : null,
  providerReference: index % 4 === 0 ? `MOMO-${String(index + 1).padStart(5, '0')}` : null,
  status: 'SUCCESS',
  statusReason: null,
  channel: index % 4 === 0 ? 'PARENT_APP' : 'BACKOFFICE',
  unallocatedAmount: 0,
  paidAt: `2026-09-${String((index % 10) + 1).padStart(2, '0')}T09:00:00.000Z`,
  studentNames: [`${student.firstName} ${student.lastName}`],
  receiptId: uuid(4_000 + index),
  receiptNumber: `CSBNK-RCT-2026-${String(index + 1).padStart(6, '0')}`,
}));
const paidForStudent = (index: number) => (index < 20 ? 210_000 : index < 35 ? 100_000 : 0);
const totals = {
  students: demoStudents.length,
  expected: demoStudents.length * 210_000,
  collected: demoStudents.reduce((sum, _student, index) => sum + paidForStudent(index), 0),
};
const classCollections = demoClasses.map((classroom) => {
  const students = demoStudents.filter(
    (student) => student.currentEnrollment?.classId === classroom.id,
  );
  const collected = students.reduce(
    (sum, student) => sum + paidForStudent(demoStudents.indexOf(student)),
    0,
  );
  const expected = students.length * 210_000;
  return {
    id: classroom.id,
    name: classroom.name,
    students: students.length,
    expected,
    collected,
    balance: expected - collected,
    collectionRate: expected ? Math.round((collected * 10_000) / expected) / 100 : 0,
  };
});
const dashboardBase = {
  ...totals,
  balance: totals.expected - totals.collected,
  collectionRate: Math.round((totals.collected * 10_000) / totals.expected) / 100,
};
const trends = Array.from({ length: 10 }, (_, index) => ({
  period: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
  amount: demoPayments
    .filter((payment) =>
      payment.paidAt?.startsWith(`2026-09-${String(index + 1).padStart(2, '0')}`),
    )
    .reduce((sum, payment) => sum + payment.amount, 0),
}));
let demoCashSession: CashSessionDto | null = {
  id: uuid(6_000),
  cashierUserId: demoAdmin.id,
  cashierName: 'Awa Ngo',
  status: 'OPEN',
  openingFloat: 50_000,
  openedAt: '2026-09-11T07:30:00.000Z',
  closedAt: null,
  expectedAmounts: null,
  declaredAmounts: null,
  variance: null,
  varianceReason: null,
  paymentCount: demoPayments.length,
  collectedTotal: totals.collected,
  recentPayments: demoPayments.slice(0, 5),
};
let demoModules: SchoolModuleDto[] = SCHOOL_MODULES.map((module) => ({
  ...module,
  dependencies: [...module.dependencies],
  enabled: true,
  updatedAt: null,
}));
const toggleDemoModule = (code: SchoolModuleDto['code'], enabled: boolean) => {
  const state = resolveModuleToggle(
    new Map(demoModules.map((module) => [module.code, module.enabled])),
    code,
    enabled,
  );
  const now = new Date().toISOString();
  demoModules = demoModules.map((module) =>
    module.enabled === (state.get(module.code) ?? true)
      ? module
      : { ...module, enabled: state.get(module.code) ?? true, updatedAt: now },
  );
  return demoModules;
};

const demoSupplierIds = [uuid(11_000), uuid(11_001), uuid(11_002)];
const demoCategoryIds = [uuid(11_010), uuid(11_011), uuid(11_012)];
const demoPaperSupplier = demoSupplierIds[0] ?? uuid(11_000),
  demoTechSupplier = demoSupplierIds[1] ?? uuid(11_001),
  demoCleanSupplier = demoSupplierIds[2] ?? uuid(11_002);
const demoSuppliesCategory = demoCategoryIds[0] ?? uuid(11_010),
  demoTechCategory = demoCategoryIds[1] ?? uuid(11_011),
  demoMaintenanceCategory = demoCategoryIds[2] ?? uuid(11_012);
let demoProcurement: ProcurementOverviewDto = {
  writable: demoWritable,
  budgets: [
    {
      id: uuid(11_900),
      ...demoPrimaryUnit,
      fiscalYear: 2026,
      name: 'Budget de fonctionnement du primaire',
      plannedTotal: 2_500_000,
      committedTotal: 1_125_000,
      paidTotal: 360_000,
      lines: [
        {
          categoryId: demoSuppliesCategory,
          categoryName: 'Fournitures scolaires',
          plannedAmount: 1_500_000,
          committedAmount: 650_000,
          paidAmount: 0,
          remainingAmount: 850_000,
        },
        {
          categoryId: demoMaintenanceCategory,
          categoryName: 'Entretien',
          plannedAmount: 1_000_000,
          committedAmount: 475_000,
          paidAmount: 360_000,
          remainingAmount: 525_000,
        },
      ],
    },
  ],
  summary: {
    supplierCount: 3,
    pendingApprovalCount: 2,
    payableAmount: 875000,
    overdueAmount: 225000,
    paidThisMonth: 360000,
  },
  suppliers: [
    {
      id: demoPaperSupplier,
      code: 'PAPCAM',
      name: 'Papeterie du Cameroun',
      taxId: 'M012345678901A',
      phone: '+237 699 12 34 56',
      email: 'commandes@papcam.cm',
      address: 'Akwa, Douala',
      paymentTermsDays: 30,
      status: 'ACTIVE',
      outstandingAmount: 650000,
    },
    {
      id: demoTechSupplier,
      code: 'TECH-EDU',
      name: 'Tech Éducation SARL',
      taxId: 'M098765432109B',
      phone: '+237 677 44 22 11',
      email: 'contact@techedu.cm',
      address: 'Bonapriso, Douala',
      paymentTermsDays: 15,
      status: 'ACTIVE',
      outstandingAmount: 225000,
    },
    {
      id: demoCleanSupplier,
      code: 'CLEAN+',
      name: 'Clean Plus Services',
      taxId: null,
      phone: '+237 655 70 80 90',
      email: null,
      address: 'Deido, Douala',
      paymentTermsDays: 7,
      status: 'ACTIVE',
      outstandingAmount: 0,
    },
  ],
  categories: [
    {
      id: demoSuppliesCategory,
      code: 'FOURNITURES',
      name: 'Fournitures scolaires',
      description: 'Papeterie et consommables',
      status: 'ACTIVE',
    },
    {
      id: demoTechCategory,
      code: 'INFORMATIQUE',
      name: 'Informatique',
      description: 'Matériel et maintenance',
      status: 'ACTIVE',
    },
    {
      id: demoMaintenanceCategory,
      code: 'ENTRETIEN',
      name: 'Entretien',
      description: 'Hygiène et maintenance des locaux',
      status: 'ACTIVE',
    },
  ],
  purchaseOrders: [
    {
      id: uuid(11_020),
      reference: 'BC-2026-00012',
      ...demoPrimaryUnit,
      supplierId: demoPaperSupplier,
      supplierName: 'Papeterie du Cameroun',
      status: 'SUBMITTED',
      subtotal: 540000,
      totalAmount: 540000,
      expectedDate: '2026-10-10',
      notes: 'Rentrée du second trimestre',
      requestedByName: 'Awa Ngo',
      approvedByName: null,
      submittedAt: '2026-10-02T08:00:00.000Z',
      approvedAt: null,
      receivedAt: null,
      createdAt: '2026-10-02T07:30:00.000Z',
      lines: [
        {
          id: uuid(11_021),
          description: 'Ramettes papier A4',
          quantity: 60,
          unitPrice: 6000,
          lineTotal: 360000,
        },
        {
          id: uuid(11_022),
          description: 'Cartouches imprimante',
          quantity: 6,
          unitPrice: 30000,
          lineTotal: 180000,
        },
      ],
    },
    {
      id: uuid(11_023),
      reference: 'BC-2026-00011',
      ...demoPrimaryUnit,
      supplierId: demoTechSupplier,
      supplierName: 'Tech Éducation SARL',
      status: 'RECEIVED',
      subtotal: 850000,
      totalAmount: 850000,
      expectedDate: '2026-09-25',
      notes: null,
      requestedByName: 'Marc Essomba',
      approvedByName: 'Awa Ngo',
      submittedAt: '2026-09-17T10:00:00.000Z',
      approvedAt: '2026-09-18T08:00:00.000Z',
      receivedAt: '2026-09-25T12:00:00.000Z',
      createdAt: '2026-09-17T09:00:00.000Z',
      lines: [
        {
          id: uuid(11_024),
          description: 'Vidéoprojecteur',
          quantity: 2,
          unitPrice: 425000,
          lineTotal: 850000,
        },
      ],
    },
  ],
  expenses: [
    {
      id: uuid(11_030),
      reference: 'DEP-2026-00018',
      ...demoPrimaryUnit,
      supplierId: demoPaperSupplier,
      supplierName: 'Papeterie du Cameroun',
      categoryId: demoSuppliesCategory,
      categoryName: 'Fournitures scolaires',
      purchaseOrderId: uuid(11_020),
      purchaseOrderReference: 'BC-2026-00012',
      invoiceNumber: 'FAC-1847',
      invoiceDate: '2026-10-01',
      dueDate: '2026-10-31',
      description: 'Commande papeterie du trimestre',
      amount: 650000,
      paidAmount: 0,
      balance: 650000,
      status: 'APPROVED',
      attachmentFileId: uuid(11_040),
      createdByName: 'Marc Essomba',
      approvedByName: 'Awa Ngo',
      submittedAt: '2026-10-01T11:00:00.000Z',
      approvedAt: '2026-10-02T09:00:00.000Z',
      createdAt: '2026-10-01T10:00:00.000Z',
      payments: [],
    },
    {
      id: uuid(11_031),
      reference: 'DEP-2026-00017',
      ...demoPrimaryUnit,
      supplierId: demoTechSupplier,
      supplierName: 'Tech Éducation SARL',
      categoryId: demoTechCategory,
      categoryName: 'Informatique',
      purchaseOrderId: uuid(11_023),
      purchaseOrderReference: 'BC-2026-00011',
      invoiceNumber: 'TE-2026-94',
      invoiceDate: '2026-09-18',
      dueDate: '2026-09-30',
      description: 'Solde vidéoprojecteurs',
      amount: 585000,
      paidAmount: 360000,
      balance: 225000,
      status: 'PARTIALLY_PAID',
      attachmentFileId: null,
      createdByName: 'Marc Essomba',
      approvedByName: 'Awa Ngo',
      submittedAt: '2026-09-18T10:00:00.000Z',
      approvedAt: '2026-09-18T14:00:00.000Z',
      createdAt: '2026-09-18T09:00:00.000Z',
      payments: [
        {
          id: uuid(11_050),
          reference: 'PAF-2026-00009',
          amount: 360000,
          method: 'BANK_TRANSFER',
          externalReference: 'VIR-0926-117',
          paidAt: '2026-10-01T08:00:00.000Z',
          status: 'SUCCESS',
        },
      ],
    },
    {
      id: uuid(11_032),
      reference: 'DEP-2026-00019',
      ...demoPrimaryUnit,
      supplierId: demoCleanSupplier,
      supplierName: 'Clean Plus Services',
      categoryId: demoMaintenanceCategory,
      categoryName: 'Entretien',
      purchaseOrderId: null,
      purchaseOrderReference: null,
      invoiceNumber: 'CP-203',
      invoiceDate: '2026-10-02',
      dueDate: '2026-10-09',
      description: 'Nettoyage général des salles',
      amount: 175000,
      paidAmount: 0,
      balance: 175000,
      status: 'SUBMITTED',
      attachmentFileId: null,
      createdByName: 'Awa Ngo',
      approvedByName: null,
      submittedAt: '2026-10-02T15:00:00.000Z',
      approvedAt: null,
      createdAt: '2026-10-02T14:00:00.000Z',
      payments: [],
    },
  ],
};
const refreshProcurementSummary = () => {
  const payable = demoProcurement.expenses.filter((x) =>
    ['APPROVED', 'PARTIALLY_PAID'].includes(x.status),
  );
  demoProcurement = {
    ...demoProcurement,
    summary: {
      supplierCount: demoProcurement.suppliers.filter((x) => x.status === 'ACTIVE').length,
      pendingApprovalCount:
        demoProcurement.purchaseOrders.filter((x) => x.status === 'SUBMITTED').length +
        demoProcurement.expenses.filter((x) => x.status === 'SUBMITTED').length,
      payableAmount: payable.reduce((s, x) => s + x.balance, 0),
      overdueAmount: payable
        .filter((x) => x.dueDate < new Date().toISOString().slice(0, 10))
        .reduce((s, x) => s + x.balance, 0),
      paidThisMonth: demoProcurement.expenses
        .flatMap((x) => x.payments)
        .filter((x) => x.paidAt.startsWith(new Date().toISOString().slice(0, 7)))
        .reduce((s, x) => s + x.amount, 0),
    },
  };
};

export function isDemoAdminCredentials(identifier: string, password: string): boolean {
  return (
    import.meta.env.DEV &&
    identifier.trim().toLowerCase() === DEMO_ADMIN_EMAIL &&
    password === DEMO_PASSWORD
  );
}

export function createDemoAdminSession(): AuthSession {
  return {
    tokens: {
      accessToken: DEMO_ACCESS_TOKEN,
      refreshToken: DEMO_REFRESH_TOKEN,
      expiresIn: 86_400,
      tokenType: 'Bearer',
    },
    user: demoAdmin,
  };
}

export function demoApiResponse(path: string, method: string, body?: unknown): unknown | undefined {
  if (!DEMO_MODE_ENABLED || localStorage.getItem('cplan.access-token') !== DEMO_ACCESS_TOKEN)
    return undefined;

  if (method === 'GET' && path === '/auth/me') return demoAdmin;
  if (method === 'GET' && path === '/modules') return demoModules;
  if (method === 'PATCH' && /^\/modules\/[^/]+$/.test(path)) {
    const code = path.split('/')[2] as SchoolModuleDto['code'];
    return toggleDemoModule(code, Boolean((body as { enabled?: boolean })?.enabled));
  }
  if (method === 'GET' && path === '/cash-sessions/current') return demoCashSession;
  if (method === 'GET' && path === '/procurement/overview') return demoProcurement;
  if (method === 'PUT' && path === '/budgets') {
    const input = body as {
      organizationalUnitId: string;
      fiscalYear: number;
      name: string;
      lines: Array<{ categoryId: string; plannedAmount: number }>;
    };
    const lines = input.lines.map((line) => ({
      categoryId: line.categoryId,
      categoryName:
        demoProcurement.categories.find((category) => category.id === line.categoryId)?.name ??
        'Catégorie',
      plannedAmount: line.plannedAmount,
      committedAmount: 0,
      paidAmount: 0,
      remainingAmount: line.plannedAmount,
    }));
    const existing = demoProcurement.budgets.find(
      (budget) =>
        budget.organizationalUnitId === input.organizationalUnitId &&
        budget.fiscalYear === input.fiscalYear,
    );
    const row = {
      id: existing?.id ?? uuid(11_910 + demoProcurement.budgets.length),
      organizationalUnitId: input.organizationalUnitId,
      organizationalUnitName: demoUnitName(input.organizationalUnitId) ?? 'Cycle',
      fiscalYear: input.fiscalYear,
      name: input.name,
      plannedTotal: lines.reduce((sum, line) => sum + line.plannedAmount, 0),
      committedTotal: 0,
      paidTotal: 0,
      lines,
    };
    demoProcurement = {
      ...demoProcurement,
      budgets: [row, ...demoProcurement.budgets.filter((budget) => budget.id !== row.id)],
    };
    return row;
  }
  if (method === 'POST' && path === '/expense-documents')
    return {
      id: uuid(11_900),
      originalName: 'justificatif.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 125000,
    };
  if (method === 'POST' && path === '/suppliers') {
    const input = body as {
      code: string;
      name: string;
      taxId?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      paymentTermsDays: number;
    };
    const row = {
      id: uuid(11_100 + demoProcurement.suppliers.length),
      status: 'ACTIVE' as const,
      outstandingAmount: 0,
      ...input,
      taxId: input.taxId ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
    };
    demoProcurement = { ...demoProcurement, suppliers: [row, ...demoProcurement.suppliers] };
    refreshProcurementSummary();
    return row;
  }
  if (method === 'PATCH' && /^\/suppliers\/[^/]+$/.test(path)) {
    const id = path.split('/')[2] ?? '',
      input = body as Partial<ProcurementOverviewDto['suppliers'][number]>;
    let result: ProcurementOverviewDto['suppliers'][number] | undefined;
    demoProcurement = {
      ...demoProcurement,
      suppliers: demoProcurement.suppliers.map((x) => {
        if (x.id !== id) return x;
        result = { ...x, ...input, id: x.id, outstandingAmount: x.outstandingAmount };
        return result;
      }),
    };
    refreshProcurementSummary();
    return result;
  }
  if (method === 'POST' && path === '/expense-categories') {
    const input = body as { code: string; name: string; description?: string | null };
    const row = {
      id: uuid(11_200 + demoProcurement.categories.length),
      status: 'ACTIVE' as const,
      ...input,
      description: input.description ?? null,
    };
    demoProcurement = { ...demoProcurement, categories: [...demoProcurement.categories, row] };
    return row;
  }
  if (method === 'POST' && path === '/purchase-orders') {
    const input = body as {
      organizationalUnitId: string;
      supplierId: string;
      expectedDate?: string | null;
      notes?: string | null;
      lines: Array<{ description: string; quantity: number; unitPrice: number }>;
    };
    const supplier = demoProcurement.suppliers.find((x) => x.id === input.supplierId);
    if (!supplier) throw new Error('Fournisseur de démonstration introuvable.');
    const total = input.lines.reduce((s, x) => s + x.quantity * x.unitPrice, 0);
    const row: ProcurementOverviewDto['purchaseOrders'][number] = {
      id: uuid(11_300 + demoProcurement.purchaseOrders.length),
      reference: `BC-2026-${String(13 + demoProcurement.purchaseOrders.length).padStart(5, '0')}`,
      organizationalUnitId: input.organizationalUnitId,
      organizationalUnitName: demoUnitName(input.organizationalUnitId),
      supplierId: supplier.id,
      supplierName: supplier.name,
      status: 'DRAFT',
      subtotal: total,
      totalAmount: total,
      expectedDate: input.expectedDate ?? null,
      notes: input.notes ?? null,
      requestedByName: 'Awa Ngo',
      approvedByName: null,
      submittedAt: null,
      approvedAt: null,
      receivedAt: null,
      createdAt: new Date().toISOString(),
      lines: input.lines.map((x, i) => ({
        id: uuid(11_400 + i),
        ...x,
        lineTotal: x.quantity * x.unitPrice,
      })),
    };
    demoProcurement = {
      ...demoProcurement,
      purchaseOrders: [row, ...demoProcurement.purchaseOrders],
    };
    return row;
  }
  if (method === 'POST' && /^\/purchase-orders\/[^/]+\/(submit|decision|receive)$/.test(path)) {
    const id = path.split('/')[2] ?? '',
      action = path.split('/')[3];
    let result: ProcurementOverviewDto['purchaseOrders'][number] | undefined;
    demoProcurement = {
      ...demoProcurement,
      purchaseOrders: demoProcurement.purchaseOrders.map((x) => {
        if (x.id !== id) return x;
        const status =
          action === 'submit'
            ? 'SUBMITTED'
            : action === 'receive'
              ? 'RECEIVED'
              : (body as { decision: string }).decision === 'APPROVE'
                ? 'APPROVED'
                : 'REJECTED';
        result = {
          ...x,
          status,
          submittedAt: action === 'submit' ? new Date().toISOString() : x.submittedAt,
          approvedAt: action === 'decision' ? new Date().toISOString() : x.approvedAt,
          approvedByName: action === 'decision' ? 'Awa Ngo' : x.approvedByName,
          receivedAt: action === 'receive' ? new Date().toISOString() : x.receivedAt,
        };
        return result;
      }),
    };
    refreshProcurementSummary();
    return result;
  }
  if (method === 'POST' && path === '/expenses') {
    const input = body as {
      supplierId: string;
      categoryId: string;
      purchaseOrderId?: string | null;
      invoiceNumber?: string | null;
      invoiceDate: string;
      dueDate: string;
      description: string;
      amount: number;
      attachmentFileId?: string | null;
      organizationalUnitId: string;
    };
    const supplier = demoProcurement.suppliers.find((x) => x.id === input.supplierId),
      category = demoProcurement.categories.find((x) => x.id === input.categoryId),
      order = demoProcurement.purchaseOrders.find((x) => x.id === input.purchaseOrderId);
    if (!supplier || !category) throw new Error('Référentiel de démonstration incomplet.');
    const row: ProcurementOverviewDto['expenses'][number] = {
      id: uuid(11_500 + demoProcurement.expenses.length),
      reference: `DEP-2026-${String(20 + demoProcurement.expenses.length).padStart(5, '0')}`,
      organizationalUnitId: input.organizationalUnitId,
      organizationalUnitName: demoUnitName(input.organizationalUnitId),
      supplierId: supplier.id,
      supplierName: supplier.name,
      categoryId: category.id,
      categoryName: category.name,
      purchaseOrderId: order?.id ?? null,
      purchaseOrderReference: order?.reference ?? null,
      invoiceNumber: input.invoiceNumber ?? null,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      description: input.description,
      amount: input.amount,
      paidAmount: 0,
      balance: input.amount,
      status: 'DRAFT',
      attachmentFileId: input.attachmentFileId ?? null,
      createdByName: 'Awa Ngo',
      approvedByName: null,
      submittedAt: null,
      approvedAt: null,
      createdAt: new Date().toISOString(),
      payments: [],
    };
    demoProcurement = { ...demoProcurement, expenses: [row, ...demoProcurement.expenses] };
    refreshProcurementSummary();
    return row;
  }
  if (method === 'POST' && /^\/expenses\/[^/]+\/(submit|decision|pay)$/.test(path)) {
    const id = path.split('/')[2] ?? '',
      action = path.split('/')[3];
    let output: unknown;
    demoProcurement = {
      ...demoProcurement,
      expenses: demoProcurement.expenses.map((x) => {
        if (x.id !== id) return x;
        if (action === 'pay') {
          const input = body as {
            amount: number;
            method: ProcurementOverviewDto['expenses'][number]['payments'][number]['method'];
            externalReference?: string | null;
            paidAt: string;
          };
          const payment = {
            id: uuid(11_600 + x.payments.length),
            reference: `PAF-2026-${String(10 + x.payments.length).padStart(5, '0')}`,
            amount: input.amount,
            method: input.method,
            externalReference: input.externalReference ?? null,
            paidAt: input.paidAt,
            status: 'SUCCESS' as const,
          };
          output = payment;
          const paidAmount = x.paidAmount + input.amount;
          const paymentStatus: ProcurementOverviewDto['expenses'][number]['status'] =
            paidAmount >= x.amount ? 'PAID' : 'PARTIALLY_PAID';
          return {
            ...x,
            paidAmount,
            balance: x.amount - paidAmount,
            status: paymentStatus,
            payments: [payment, ...x.payments],
          };
        }
        const status: ProcurementOverviewDto['expenses'][number]['status'] =
          action === 'submit'
            ? 'SUBMITTED'
            : (body as { decision: string }).decision === 'APPROVE'
              ? 'APPROVED'
              : 'REJECTED';
        const row = {
          ...x,
          status,
          submittedAt: action === 'submit' ? new Date().toISOString() : x.submittedAt,
          approvedAt: action === 'decision' ? new Date().toISOString() : x.approvedAt,
          approvedByName: action === 'decision' ? 'Awa Ngo' : x.approvedByName,
        };
        output = row;
        return row;
      }),
    };
    refreshProcurementSummary();
    return output;
  }
  if (method === 'GET' && /^\/expenses\/[^/]+\/document$/.test(path))
    return { url: 'data:application/pdf;base64,JVBERi0xLjQK', expiresIn: 300 };
  if (method === 'GET' && path.startsWith('/search?')) {
    const query =
      new URL(path, 'http://demo.local').searchParams.get('q')?.trim().toLowerCase() ?? '';
    const matches = (...values: Array<string | null | undefined>) =>
      values.some((value) => value?.toLowerCase().includes(query));

    return {
      students: demoStudents
        .filter((student) => matches(student.firstName, student.lastName, student.studentNumber))
        .slice(0, 8)
        .map((student) => ({
          id: student.id,
          label: `${student.firstName} ${student.lastName}`,
          subtitle: student.studentNumber,
        })),
      guardians: [
        {
          id: uuid(5_100),
          label: 'Chantal Fotso',
          subtitle: '+237 699 123 456',
        },
      ].filter((guardian) => matches(guardian.label, guardian.subtitle)),
      payments: demoPayments
        .filter((payment) => matches(payment.reference, payment.providerReference))
        .slice(0, 8)
        .map((payment) => ({
          id: payment.id,
          label: payment.reference,
          subtitle: payment.providerReference ?? 'Paiement',
        })),
      receipts: demoPayments
        .filter((payment) => matches(payment.receiptNumber))
        .slice(0, 8)
        .map((payment) => ({
          id: payment.receiptId ?? payment.id,
          label: payment.receiptNumber ?? 'Reçu',
          subtitle: 'Reçu',
        })),
    };
  }
  if (method === 'GET' && path.startsWith('/students/quick-search?')) {
    const query = new URL(path, 'http://demo.local').searchParams.get('q')?.toLowerCase() ?? '';
    return demoStudents
      .map((student, index) => {
        const totalPaid = paidForStudent(index);
        return {
          studentId: student.id,
          enrollmentId: student.currentEnrollment?.id ?? uuid(2_000 + index),
          studentNumber: student.studentNumber,
          fullName: `${student.firstName} ${student.lastName}`,
          className: student.currentEnrollment?.className ?? null,
          guardianPhones: index < 3 ? ['+237699123456'] : [],
          balance: { totalDue: 210_000, totalPaid, balance: 210_000 - totalPaid },
        };
      })
      .filter((student) =>
        `${student.studentNumber} ${student.fullName} ${student.guardianPhones.join(' ')}`
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 10);
  }
  if (method === 'GET' && path.startsWith('/payments/simulate-allocation?')) {
    const url = new URL(path, 'http://demo.local');
    const amount = Number(url.searchParams.get('amount') ?? 0);
    return {
      allocations:
        amount > 0
          ? [
              {
                studentFeeAssignmentId: uuid(7_000),
                studentFeeInstallmentId: null,
                label: 'Frais scolaires',
                amount,
              },
            ]
          : [],
      unallocatedAmount: 0,
    };
  }
  if (method === 'POST' && path === '/cash-sessions/open') {
    const openingFloat = Number((body as { openingFloat?: number } | undefined)?.openingFloat ?? 0);
    demoCashSession = {
      id: uuid(6_000),
      cashierUserId: demoAdmin.id,
      cashierName: 'Awa Ngo',
      status: 'OPEN',
      openingFloat,
      openedAt: new Date().toISOString(),
      closedAt: null,
      expectedAmounts: null,
      declaredAmounts: null,
      variance: null,
      varianceReason: null,
      paymentCount: 0,
      collectedTotal: 0,
      recentPayments: [],
    };
    return demoCashSession;
  }
  if (method === 'POST' && path === '/payments/cash') {
    const input = body as {
      enrollmentId?: string;
      amount?: number;
      paymentMethod?: PaymentDto['paymentMethod'];
    };
    const student =
      demoStudents.find((item) => item.currentEnrollment?.id === input.enrollmentId) ??
      demoStudents[35];
    if (!student) throw new Error('Les élèves de démonstration sont absents.');
    const payment: PaymentDto = {
      id: uuid(8_000 + demoPayments.length),
      reference: `CSBNK-CASH-${String(demoPayments.length + 1).padStart(6, '0')}`,
      amount: Number(input.amount ?? 0),
      paymentMethod: input.paymentMethod ?? 'CASH',
      provider: null,
      providerReference: null,
      status: 'SUCCESS',
      statusReason: null,
      channel: 'CASHIER',
      unallocatedAmount: 0,
      paidAt: new Date().toISOString(),
      studentNames: [`${student.firstName} ${student.lastName}`],
      receiptId: uuid(9_000 + demoPayments.length),
      receiptNumber: `CSBNK-RCT-2026-${String(demoPayments.length + 1).padStart(6, '0')}`,
    };
    demoPayments.unshift(payment);
    if (demoCashSession) {
      demoCashSession = {
        ...demoCashSession,
        paymentCount: demoCashSession.paymentCount + 1,
        collectedTotal: demoCashSession.collectedTotal + payment.amount,
        recentPayments: [payment, ...demoCashSession.recentPayments].slice(0, 5),
      };
    }
    return payment;
  }
  if (method === 'POST' && path === '/subjects') {
    const input = body as { code: string; name: string; color: string };
    const created: SubjectDto = {
      id: uuid(700 + demoSubjects.length),
      code: input.code.toUpperCase(),
      name: input.name,
      color: input.color,
      status: 'ACTIVE',
    };
    demoSubjects = [...demoSubjects, created];
    return created;
  }
  if (method === 'POST' && path === '/teaching-assignments') {
    const input = body as {
      academicYearId: string;
      classId: string;
      subjectId: string;
      teacherUserId: string | null;
      weeklyHours: number;
      coefficient: number;
    };
    const subject = demoSubjects.find((item) => item.id === input.subjectId);
    const classroom = demoClasses.find((item) => item.id === input.classId);
    if (!subject || !classroom) throw new Error('Matière ou classe de démonstration introuvable.');
    const teacher = demoTeachers.find((item) => item.id === input.teacherUserId) ?? null;
    const created: TeachingAssignmentDto = {
      id: uuid(900 + demoAssignments.length),
      academicYearId: input.academicYearId,
      classId: input.classId,
      className: classroom.name,
      subjectId: input.subjectId,
      subjectName: subject.name,
      subjectColor: subject.color,
      teacherUserId: teacher?.id ?? null,
      teacherName: teacher?.name ?? null,
      weeklyHours: input.weeklyHours,
      coefficient: input.coefficient,
      status: teacher ? 'ACTIVE' : 'PLANNED',
    };
    demoAssignments = [
      ...demoAssignments.filter(
        (item) => item.classId !== input.classId || item.subjectId !== input.subjectId,
      ),
      created,
    ];
    return created;
  }
  if (method === 'POST' && path === '/timetable/rooms') {
    const input = body as { code: string; name: string; capacity: number | null };
    const created: TimetableRoomDto = {
      id: uuid(850 + demoRooms.length),
      code: input.code.toUpperCase(),
      name: input.name,
      capacity: input.capacity,
      status: 'ACTIVE',
    };
    demoRooms = [...demoRooms, created];
    return created;
  }
  if (method === 'POST' && path === '/timetable/entries') {
    const input = body as {
      academicYearId: string;
      teachingAssignmentId: string;
      roomId: string | null;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
    };
    const assignment = demoAssignments.find((item) => item.id === input.teachingAssignmentId);
    const room = demoRooms.find((item) => item.id === input.roomId) ?? null;
    if (!assignment) throw new Error('Affectation de démonstration introuvable.');
    const conflict = demoTimetable.find(
      (item) =>
        item.dayOfWeek === input.dayOfWeek &&
        item.status !== 'CANCELLED' &&
        item.startTime < input.endTime &&
        item.endTime > input.startTime &&
        (item.classId === assignment.classId ||
          (room && item.roomId === room.id) ||
          (assignment.teacherUserId && item.teacherUserId === assignment.teacherUserId)),
    );
    if (conflict) throw new Error('Ce créneau chevauche déjà une ressource.');
    const created: TimetableEntryDto = {
      id: uuid(900 + demoTimetable.length),
      academicYearId: input.academicYearId,
      teachingAssignmentId: assignment.id,
      classId: assignment.classId,
      className: assignment.className,
      subjectId: assignment.subjectId,
      subjectName: assignment.subjectName,
      subjectColor: assignment.subjectColor,
      teacherUserId: assignment.teacherUserId,
      teacherName: assignment.teacherName,
      roomId: room?.id ?? null,
      roomName: room?.name ?? null,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      status: 'DRAFT',
    };
    demoTimetable = [...demoTimetable, created];
    return created;
  }
  if (method === 'POST' && /^\/timetable\/entries\/[^/]+\/cancel$/.test(path)) {
    const id = path.split('/')[3];
    demoTimetable = demoTimetable.map((item) =>
      item.id === id ? { ...item, status: 'CANCELLED' } : item,
    );
    return undefined;
  }
  if (method === 'POST' && path === '/timetable/publish') {
    const published = demoTimetable.filter((item) => item.status === 'DRAFT').length;
    demoTimetable = demoTimetable.map((item) =>
      item.status === 'DRAFT' ? { ...item, status: 'PUBLISHED' } : item,
    );
    return { published };
  }
  if (method === 'POST' && path === '/attendance/sessions') {
    const input = body as { timetableEntryId: string; date: string };
    const existing = demoAttendance.find(
      (item) => item.timetableEntryId === input.timetableEntryId && item.date === input.date,
    );
    if (existing) return existing;
    const entry = demoTimetable.find((item) => item.id === input.timetableEntryId);
    if (!entry) throw new Error('Cours de démonstration introuvable.');
    const created = makeDemoAttendance(entry, input.date);
    demoAttendance = [...demoAttendance, created];
    return created;
  }
  if (method === 'PUT' && /^\/attendance\/sessions\/[^/]+\/records$/.test(path)) {
    const id = path.split('/')[3];
    const input = body as {
      records: Array<{
        enrollmentId: string;
        mark: AttendanceSessionDto['records'][number]['mark'];
        minutesLate: number;
        note: string | null;
      }>;
    };
    demoAttendance = demoAttendance.map((session) =>
      session.id !== id
        ? session
        : {
            ...session,
            records: session.records.map((record) => {
              const update = input.records.find(
                (item) => item.enrollmentId === record.enrollmentId,
              );
              return update ? { ...record, ...update } : record;
            }),
          },
    );
    return demoAttendance.find((item) => item.id === id);
  }
  if (method === 'POST' && /^\/attendance\/sessions\/[^/]+\/validate$/.test(path)) {
    const id = path.split('/')[3];
    let alertsQueued = 0;
    demoAttendance = demoAttendance.map((session) => {
      if (session.id !== id) return session;
      alertsQueued = session.records.filter(
        (record) => record.mark === 'ABSENT' || record.mark === 'LATE',
      ).length;
      return { ...session, status: 'VALIDATED', validatedAt: new Date().toISOString() };
    });
    return { session: demoAttendance.find((item) => item.id === id), alertsQueued };
  }
  if (method === 'PATCH' && /^\/attendance\/records\/[^/]+\/justification$/.test(path)) {
    const id = path.split('/')[3];
    const input = body as { status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; note: string };
    let result: AttendanceSessionDto | undefined;
    demoAttendance = demoAttendance.map((session) => {
      if (!session.records.some((record) => record.id === id)) return session;
      result = {
        ...session,
        records: session.records.map((record) =>
          record.id === id
            ? {
                ...record,
                justificationStatus: input.status,
                justificationNote: input.note,
                mark:
                  input.status === 'ACCEPTED' && record.mark === 'ABSENT' ? 'EXCUSED' : record.mark,
              }
            : record,
        ),
      };
      return result;
    });
    return result;
  }
  if (method === 'POST' && path === '/assessments') {
    const input = body as {
      academicYearId: string;
      periodId: string;
      teachingAssignmentId: string;
      typeId: string;
      title: string;
      date: string;
      maxScore: number;
      weight: number;
      competencyIds: string[];
    };
    const assignment = demoAssignments.find((item) => item.id === input.teachingAssignmentId);
    const period = demoPeriods.find((item) => item.id === input.periodId);
    const type = demoAssessmentTypes.find((item) => item.id === input.typeId);
    if (!assignment || !period || !type)
      throw new Error('Configuration de démonstration incomplète.');
    const roster = demoStudents.filter(
      (student) => student.currentEnrollment?.classId === assignment.classId,
    );
    const created: AssessmentDto = {
      id: uuid(9_650 + demoAssessments.length),
      academicYearId: input.academicYearId,
      periodId: period.id,
      periodName: period.name,
      teachingAssignmentId: assignment.id,
      classId: assignment.classId,
      className: assignment.className,
      subjectName: assignment.subjectName,
      typeId: type.id,
      typeName: type.name,
      title: input.title,
      date: input.date,
      maxScore: input.maxScore,
      weight: input.weight,
      status: 'DRAFT',
      competencies: demoCompetencies.filter((item) => input.competencyIds.includes(item.id)),
      grades: roster.map((student, index) => ({
        id: uuid(9_750 + index),
        enrollmentId: student.currentEnrollment?.id ?? uuid(9_850 + index),
        studentId: student.id,
        studentNumber: student.studentNumber,
        studentName: `${student.lastName} ${student.firstName}`,
        score: null,
        isAbsent: false,
        comment: null,
      })),
    };
    demoAssessments = [created, ...demoAssessments];
    return created;
  }
  if (method === 'POST' && path === '/academic-periods') {
    const input = body as {
      academicYearId: string;
      name: string;
      orderIndex: number;
      startDate: string;
      endDate: string;
    };
    const created: AssessmentOverviewDto['periods'][number] = {
      id: uuid(9_900 + demoPeriods.length),
      academicYearId: input.academicYearId,
      name: input.name,
      orderIndex: input.orderIndex,
      startDate: input.startDate,
      endDate: input.endDate,
      status: 'DRAFT',
    };
    demoPeriods = [...demoPeriods, created];
    return created;
  }
  if (method === 'PATCH' && /^\/academic-periods\/[^/]+\/status$/.test(path)) {
    const id = path.split('/')[2];
    const input = body as { status: 'OPEN' | 'CLOSED' };
    demoPeriods = demoPeriods.map((period) =>
      period.id === id ? { ...period, status: input.status } : period,
    );
    return demoPeriods.find((period) => period.id === id);
  }
  if (method === 'POST' && path === '/assessment-types') {
    const input = body as { code: string; name: string; defaultWeight: number };
    const created: AssessmentOverviewDto['types'][number] = {
      id: uuid(9_910 + demoAssessmentTypes.length),
      code: input.code.toUpperCase(),
      name: input.name,
      defaultWeight: input.defaultWeight,
      status: 'ACTIVE',
    };
    demoAssessmentTypes = [...demoAssessmentTypes, created];
    return created;
  }
  if (method === 'POST' && path === '/competencies') {
    const input = body as { code: string; name: string; description: string | null };
    const created: AssessmentOverviewDto['competencies'][number] = {
      id: uuid(9_920 + demoCompetencies.length),
      code: input.code.toUpperCase(),
      name: input.name,
      description: input.description,
      status: 'ACTIVE',
    };
    demoCompetencies = [...demoCompetencies, created];
    return created;
  }
  if (method === 'POST' && path === '/grading-policies') {
    const input = body as {
      academicYearId: string;
      roundingDigits: number;
      weightingMode: 'WEIGHTED_AVERAGE' | 'POINTS_TOTAL';
      absenceHandling: 'EXCLUDE' | 'ZERO';
      rankingEnabled: boolean;
    };
    demoPolicies = demoPolicies.map((item) => ({ ...item, isActive: false }));
    const created: AssessmentOverviewDto['policies'][number] = {
      id: uuid(9_930 + demoPolicies.length),
      academicYearId: input.academicYearId,
      cycle: null,
      version: Math.max(0, ...demoPolicies.map((item) => item.version)) + 1,
      roundingDigits: input.roundingDigits,
      weightingMode: input.weightingMode,
      absenceHandling: input.absenceHandling,
      rankingEnabled: input.rankingEnabled,
      isActive: true,
    };
    demoPolicies = [created, ...demoPolicies];
    return created;
  }
  if (method === 'PUT' && /^\/assessments\/[^/]+\/grades$/.test(path)) {
    const id = path.split('/')[2];
    const input = body as {
      grades: Array<{
        enrollmentId: string;
        score: number | null;
        isAbsent: boolean;
        comment: string | null;
      }>;
    };
    demoAssessments = demoAssessments.map((assessment) =>
      assessment.id !== id
        ? assessment
        : {
            ...assessment,
            grades: assessment.grades.map((grade) => {
              const update = input.grades.find((item) => item.enrollmentId === grade.enrollmentId);
              return update ? { ...grade, ...update } : grade;
            }),
          },
    );
    return demoAssessments.find((item) => item.id === id);
  }
  if (method === 'POST' && /^\/assessments\/[^/]+\/publish$/.test(path)) {
    const id = path.split('/')[2];
    const input = body as { lock?: boolean };
    demoAssessments = demoAssessments.map((item) =>
      item.id === id ? { ...item, status: input.lock ? 'LOCKED' : 'PUBLISHED' } : item,
    );
    return demoAssessments.find((item) => item.id === id);
  }
  if (method === 'POST' && path === '/report-cards/generate') {
    const input = body as { periodId: string; classId: string };
    buildDemoReportCards(input.periodId, input.classId);
    return { generated: demoReportCards.length };
  }
  if (method === 'PATCH' && /^\/report-cards\/[^/]+$/.test(path)) {
    const id = path.split('/')[2];
    const input = body as {
      generalComment?: string | null;
      decision?: string | null;
      subjectComments?: Array<{ subjectId: string; comment: string | null }>;
    };
    demoReportCards = demoReportCards.map((card) =>
      card.id !== id
        ? card
        : {
            ...card,
            generalComment: input.generalComment ?? card.generalComment,
            decision: input.decision ?? card.decision,
            subjects: card.subjects.map((subject) => ({
              ...subject,
              teacherComment:
                input.subjectComments?.find((item) => item.subjectId === subject.subjectId)
                  ?.comment ?? subject.teacherComment,
            })),
          },
    );
    return demoReportCards.find((item) => item.id === id);
  }
  if (method === 'POST' && path === '/report-cards/publish') {
    const input = body as { reportCardIds: string[] };
    demoReportCards = demoReportCards.map((card) =>
      input.reportCardIds.includes(card.id)
        ? { ...card, status: 'PUBLISHED', publishedAt: new Date().toISOString() }
        : card,
    );
    return { published: input.reportCardIds.length };
  }
  if (method === 'POST' && path === '/student-life/incidents') {
    const input = body as {
      enrollmentId: string;
      occurredAt: string;
      category: string;
      severity: IncidentDto['severity'];
      description: string;
    };
    const student = demoStudents.find((item) => item.currentEnrollment?.id === input.enrollmentId);
    if (!student) throw new Error('Élève introuvable.');
    const created: IncidentDto = {
      id: uuid(10_300 + demoIncidents.length),
      enrollmentId: input.enrollmentId,
      studentNumber: student.studentNumber,
      studentName: `${student.lastName} ${student.firstName}`,
      className: student.currentEnrollment?.className ?? null,
      occurredAt: input.occurredAt,
      category: input.category,
      severity: input.severity,
      description: input.description,
      status: 'OPEN',
      sanctions: [],
    };
    demoIncidents = [created, ...demoIncidents];
    return created;
  }
  if (method === 'POST' && /^\/student-life\/incidents\/[^/]+\/close$/.test(path)) {
    const id = path.split('/')[3];
    demoIncidents = demoIncidents.map((item) =>
      item.id === id ? { ...item, status: 'CLOSED' } : item,
    );
    return undefined;
  }
  if (method === 'POST' && /^\/student-life\/incidents\/[^/]+\/sanctions$/.test(path)) {
    const id = path.split('/')[3];
    const input = body as {
      type: string;
      description: string;
      startsAt: string;
      endsAt?: string | null;
    };
    demoIncidents = demoIncidents.map((item) =>
      item.id === id
        ? {
            ...item,
            sanctions: [
              ...item.sanctions,
              {
                id: uuid(10_400 + item.sanctions.length),
                type: input.type,
                description: input.description,
                startsAt: input.startsAt,
                endsAt: input.endsAt ?? null,
              },
            ],
          }
        : item,
    );
    return demoIncidents.find((item) => item.id === id);
  }
  if (method === 'POST' && path === '/student-life/health-visits') {
    const input = body as {
      enrollmentId: string;
      visitedAt: string;
      symptoms: string;
      actionTaken: string;
      guardianNotified: boolean;
      followUpAt?: string | null;
    };
    const student = demoStudents.find((item) => item.currentEnrollment?.id === input.enrollmentId);
    if (!student) throw new Error('Élève introuvable.');
    const created: HealthVisitDto = {
      id: uuid(10_500 + demoHealthVisits.length),
      enrollmentId: input.enrollmentId,
      studentNumber: student.studentNumber,
      studentName: `${student.lastName} ${student.firstName}`,
      visitedAt: input.visitedAt,
      symptoms: input.symptoms,
      actionTaken: input.actionTaken,
      guardianNotified: input.guardianNotified,
      followUpAt: input.followUpAt ?? null,
    };
    demoHealthVisits = [created, ...demoHealthVisits];
    return created;
  }
  if (method === 'PATCH' && /^\/staff\/[^/]+$/.test(path)) {
    const id = path.split('/')[2];
    const input = body as Partial<StaffMemberDto>;
    demoStaff = demoStaff.map((item) => (item.id === id ? { ...item, ...input } : item));
    return demoStaff.find((item) => item.id === id);
  }
  if (method === 'POST' && path === '/staff-leaves') {
    const input = body as {
      staffProfileId: string;
      type: string;
      startsAt: string;
      endsAt: string;
      reason: string;
    };
    const member = demoStaff.find((item) => item.id === input.staffProfileId);
    if (!member) throw new Error('Collaborateur introuvable.');
    const created: StaffLeaveDto = {
      id: uuid(10_600 + demoStaffLeaves.length),
      staffName: member.fullName,
      status: 'PENDING',
      ...input,
    };
    demoStaffLeaves = [created, ...demoStaffLeaves];
    return created;
  }
  if (method === 'POST' && /^\/staff-leaves\/[^/]+\/decision$/.test(path)) {
    const id = path.split('/')[2];
    const input = body as { status: 'APPROVED' | 'REJECTED' };
    demoStaffLeaves = demoStaffLeaves.map((item) =>
      item.id === id ? { ...item, status: input.status } : item,
    );
    return demoStaffLeaves.find((item) => item.id === id);
  }
  if (method === 'POST' && path === '/announcements') {
    const input = body as {
      title: string;
      body: string;
      audience: 'ALL' | 'STAFF' | 'FAMILIES' | 'STUDENTS';
      expiresAt?: string | null;
      organizationalUnitId?: string | null;
    };
    const row = {
      id: uuid(10_700 + demoCommunications.announcements.length),
      publishedAt: new Date().toISOString(),
      ...input,
      expiresAt: input.expiresAt ?? null,
      organizationalUnitId: input.organizationalUnitId ?? null,
      organizationalUnitName: demoUnitName(input.organizationalUnitId),
    };
    demoCommunications = {
      ...demoCommunications,
      announcements: [row, ...demoCommunications.announcements],
    };
    return row;
  }
  if (method === 'POST' && path === '/school-events') {
    const input = body as CommunicationsOverviewDto['events'][number];
    const row = { ...input, id: uuid(10_710 + demoCommunications.events.length) };
    demoCommunications = { ...demoCommunications, events: [row, ...demoCommunications.events] };
    return row;
  }
  if (method === 'POST' && path === '/homework') {
    const input = body as {
      academicYearId: string;
      classId: string;
      subjectId: string;
      title: string;
      instructions: string;
      dueAt: string;
      status: 'DRAFT' | 'PUBLISHED';
    };
    const row = {
      ...input,
      id: uuid(10_720 + demoCommunications.homework.length),
      className: demoClasses.find((x) => x.id === input.classId)?.name ?? 'Classe',
      subjectName: demoSubjects.find((x) => x.id === input.subjectId)?.name ?? 'Matière',
    };
    demoCommunications = { ...demoCommunications, homework: [row, ...demoCommunications.homework] };
    return row;
  }
  if (method === 'POST' && path === '/school-messages') {
    const input = body as { recipientUserId: string; subject: string; body: string };
    const recipient = demoStaff.find((x) => x.userId === input.recipientUserId);
    const row = {
      ...input,
      id: uuid(10_730 + demoCommunications.messages.length),
      senderUserId: demoAdmin.id,
      senderName: `${demoAdmin.firstName} ${demoAdmin.lastName}`,
      recipientName: recipient?.fullName ?? 'Collaborateur',
      sentAt: new Date().toISOString(),
      readAt: null,
    };
    demoCommunications = { ...demoCommunications, messages: [row, ...demoCommunications.messages] };
    return row;
  }
  if (method === 'POST' && path === '/library/books') {
    const input = body as { isbn?: string | null; title: string; author: string; stock: number };
    const row = {
      id: uuid(10_800 + demoServices.books.length),
      available: input.stock,
      ...input,
      isbn: input.isbn ?? null,
    };
    demoServices = { ...demoServices, books: [row, ...demoServices.books] };
    return row;
  }
  if (method === 'POST' && path === '/library/loans') {
    const input = body as { bookId: string; enrollmentId: string; dueAt: string };
    const book = demoServices.books.find((x) => x.id === input.bookId);
    const student = demoStudents.find((x) => x.currentEnrollment?.id === input.enrollmentId);
    const row = {
      id: uuid(10_810 + demoServices.loans.length),
      bookId: input.bookId,
      bookTitle: book?.title ?? 'Livre',
      enrollmentId: input.enrollmentId,
      studentName: student ? `${student.lastName} ${student.firstName}` : 'Élève',
      borrowedAt: new Date().toISOString().slice(0, 10),
      dueAt: input.dueAt,
      returnedAt: null,
      status: 'BORROWED' as const,
    };
    demoServices = {
      ...demoServices,
      books: demoServices.books.map((x) =>
        x.id === input.bookId ? { ...x, available: x.available - 1 } : x,
      ),
      loans: [row, ...demoServices.loans],
    };
    return row;
  }
  if (method === 'POST' && /^\/library\/loans\/[^/]+\/return$/.test(path)) {
    const id = path.split('/')[3];
    const loan = demoServices.loans.find((x) => x.id === id);
    demoServices = {
      ...demoServices,
      books: demoServices.books.map((x) =>
        x.id === loan?.bookId ? { ...x, available: x.available + 1 } : x,
      ),
      loans: demoServices.loans.map((x) =>
        x.id === id
          ? { ...x, status: 'RETURNED', returnedAt: new Date().toISOString().slice(0, 10) }
          : x,
      ),
    };
    return undefined;
  }
  if (method === 'POST' && path === '/canteen/meals') {
    const input = body as SchoolServicesOverviewDto['meals'][number];
    const row = { ...input, id: uuid(10_820 + demoServices.meals.length) };
    demoServices = {
      ...demoServices,
      meals: [row, ...demoServices.meals.filter((x) => x.date !== row.date)],
    };
    return row;
  }
  if (method === 'POST' && path === '/transport/routes') {
    const input = body as Omit<
      SchoolServicesOverviewDto['routes'][number],
      'id' | 'enrolled' | 'status'
    >;
    const row = {
      ...input,
      id: uuid(10_830 + demoServices.routes.length),
      feeStructureId: input.feeStructureId ?? null,
      enrolled: 0,
      status: 'ACTIVE' as const,
    };
    demoServices = { ...demoServices, routes: [row, ...demoServices.routes] };
    return row;
  }
  if (method === 'POST' && path === '/transport/enrollments') {
    const input = body as { routeId: string };
    demoServices = {
      ...demoServices,
      routes: demoServices.routes.map((x) =>
        x.id === input.routeId ? { ...x, enrolled: x.enrolled + 1 } : x,
      ),
    };
    return demoServices.routes.find((x) => x.id === input.routeId);
  }
  if (method === 'POST' && path === '/inventory/items') {
    const input = body as Omit<SchoolServicesOverviewDto['inventory'][number], 'id' | 'status'>;
    const row = {
      ...input,
      id: uuid(10_840 + demoServices.inventory.length),
      status:
        input.quantity <= 0
          ? ('OUT' as const)
          : input.quantity <= input.reorderLevel
            ? ('LOW' as const)
            : ('OK' as const),
    };
    demoServices = { ...demoServices, inventory: [row, ...demoServices.inventory] };
    return row;
  }
  if (method === 'POST' && /^\/inventory\/items\/[^/]+\/movements$/.test(path)) {
    const id = path.split('/')[3];
    const input = body as { quantity: number };
    demoServices = {
      ...demoServices,
      inventory: demoServices.inventory.map((x) => {
        if (x.id !== id) return x;
        const quantity = x.quantity + input.quantity;
        return {
          ...x,
          quantity,
          status: quantity <= 0 ? 'OUT' : quantity <= x.reorderLevel ? 'LOW' : 'OK',
        };
      }),
    };
    return demoServices.inventory.find((x) => x.id === id);
  }
  if (method === 'POST' && /^\/cash-sessions\/[^/]+\/close$/.test(path)) {
    const closed = demoCashSession
      ? { ...demoCashSession, status: 'CLOSED' as const, closedAt: new Date().toISOString() }
      : null;
    demoCashSession = null;
    return closed;
  }
  if (method !== 'GET') return undefined;

  if (path === '/organization') {
    return [
      {
        id: uuid(87),
        code: 'CRECHE',
        name: 'Crèche',
        orderIndex: 0,
        status: 'ACTIVE',
        languageSections: [],
        educationTracks: [],
      },
      {
        id: uuid(88),
        code: 'MATERNELLE',
        name: 'Maternelle',
        orderIndex: 1,
        status: 'ACTIVE',
        languageSections: [
          { id: uuid(93), code: 'FRANCOPHONE', name: 'Francophone', status: 'ACTIVE' },
          { id: uuid(94), code: 'ANGLOPHONE', name: 'Anglophone', status: 'ACTIVE' },
        ],
        educationTracks: [],
      },
      {
        id: uuid(89),
        code: 'PRIMAIRE',
        name: 'Primaire',
        orderIndex: 2,
        status: 'ACTIVE',
        languageSections: [
          { id: uuid(95), code: 'FRANCOPHONE', name: 'Francophone', status: 'ACTIVE' },
          { id: uuid(96), code: 'ANGLOPHONE', name: 'Anglophone', status: 'ACTIVE' },
        ],
        educationTracks: [],
      },
      {
        id: uuid(90),
        code: 'SECONDAIRE',
        name: 'Secondaire',
        orderIndex: 3,
        status: 'ACTIVE',
        languageSections: [
          { id: uuid(91), code: 'FRANCOPHONE', name: 'Francophone', status: 'ACTIVE' },
          { id: uuid(97), code: 'ANGLOPHONE', name: 'Anglophone', status: 'ACTIVE' },
        ],
        educationTracks: [
          { id: uuid(92), code: 'GENERAL', name: 'Enseignement général', status: 'ACTIVE' },
          { id: uuid(98), code: 'TECHNIQUE', name: 'Enseignement technique', status: 'ACTIVE' },
        ],
      },
    ];
  }
  if (path === '/settings') {
    return {
      schoolId: DEMO_SCHOOL_ID,
      schoolName: 'Complexe Scolaire Bilingue Noutcha KAMGUE',
      schoolCode: 'CSB-NK',
      address: 'Douala, Cameroun',
      phone: '+237 699 000 001',
      email: 'contact@csb-noutcha-kamgue.local',
      timezone: 'Africa/Douala',
      currency: 'XAF',
      studentNumberPrefix: 'CSBNK',
      studentNumberPadding: 5,
      receiptNumberFormat: 'CSBNK-RCT-{YEAR}-{SEQ}',
      paymentRefFormat: 'CSBNK-PAY-{YEAR}-{SEQ}',
      allocationStrategy: 'BY_PRIORITY_THEN_DUE_DATE',
      allowOverpayment: false,
      reminderDaysBefore: [7, 3],
      reminderDaysAfter: [1, 7, 14],
      externalPaymentSlaHours: 24,
      smsEnabled: true,
      smsAllowedTypes: ['PAYMENT_RECEIPT', 'PAYMENT_REMINDER', 'ABSENCE_ALERT'],
      smsMonthlyLimit: 100_000,
      notificationStartHour: 7,
      notificationEndHour: 20,
      balanceReminderEnabled: true,
      inviteTokenTtlDays: 7,
      discountApprovalThreshold: 50_000,
    };
  }
  if (path.startsWith('/guardian-requests?')) return [];
  if (path === '/payments/pending-investigation') return [];
  if (path === '/admin/provider-events') return [];
  if (path.startsWith('/external-payments?')) return [];
  if (path === '/notification-templates') return [];
  if (path === '/notifications/stats') return { total: 0, delivered: 0, failed: 0, smsCost: 0 };
  if (path.startsWith('/users?')) return { data: [], meta: { total: 0 } };
  if (path === '/roles') return [];
  if (path === '/permissions') return [];
  if (path === '/auth/sessions') return [];

  if (path === '/academic-years') {
    return [
      {
        id: DEMO_YEAR_ID,
        name: '2026/2027',
        startDate: '2026-09-01',
        endDate: '2027-07-31',
        status: 'ACTIVE',
        isCurrent: true,
        classCount: 9,
      },
    ];
  }
  if (path.startsWith('/dashboard/registrar')) {
    return {
      activeStudents: 50,
      newEnrollments: 50,
      reenrollments: 0,
      unassignedStudents: 0,
      pendingGuardianLinks: 0,
    };
  }
  if (path.startsWith('/reports/accountant-dashboard?')) {
    return {
      ...dashboardBase,
      paymentsToday: 625_000,
      awaitingValidation: 2,
      overdueValidation: 1,
      trends,
      methods: [
        { method: 'CASH', provider: null, count: 26, amount: 4_160_000 },
        { method: 'MOBILE_MONEY', provider: 'MTN_MOMO', count: 9, amount: 1_540_000 },
      ],
    };
  }
  if (path.startsWith('/reports/director-dashboard?')) {
    return {
      ...dashboardBase,
      trends,
      byClass: classCollections.map((row) => ({
        ...row,
        warning: row.collectionRate < dashboardBase.collectionRate - 10,
      })),
      byLevel: demoLevels.map((level) => {
        const rows = classCollections.filter(
          (row) => demoClasses.find((item) => item.id === row.id)?.gradeLevelId === level.id,
        );
        const expected = rows.reduce((sum, row) => sum + row.expected, 0);
        const collected = rows.reduce((sum, row) => sum + row.collected, 0);
        return {
          id: level.id,
          name: level.name,
          students: rows.reduce((sum, row) => sum + row.students, 0),
          expected,
          collected,
          balance: expected - collected,
          collectionRate: expected ? Math.round((collected * 10_000) / expected) / 100 : 0,
        };
      }),
    };
  }
  if (path.startsWith('/reports/class-payment-status?')) {
    const url = new URL(path, 'http://demo.local');
    const classId = url.searchParams.get('class_id');
    const situation = url.searchParams.get('situation');
    const rows = demoStudents.flatMap((student, index) => {
      if (student.currentEnrollment?.classId !== classId) return [];
      const collected = paidForStudent(index);
      const currentSituation =
        collected === 0 ? 'UNPAID' : collected >= 210_000 ? 'ON_TRACK' : 'PARTIAL';
      if (situation && situation !== currentSituation) return [];
      return [
        {
          enrollmentId: student.currentEnrollment.id,
          studentId: student.id,
          studentNumber: student.studentNumber,
          studentName: `${student.lastName} ${student.firstName}`,
          className: student.currentEnrollment.className ?? '',
          expected: 210_000,
          collected,
          balance: 210_000 - collected,
          situation: currentSituation,
        },
      ];
    });
    const expected = rows.length * 210_000;
    const collected = rows.reduce((sum, row) => sum + row.collected, 0);
    return {
      data: rows,
      totals: {
        students: rows.length,
        expected,
        collected,
        balance: expected - collected,
        collectionRate: expected ? Math.round((collected * 10_000) / expected) / 100 : 0,
      },
    };
  }
  if (path === '/grade-levels') return demoLevels;
  if (path.startsWith('/classes?')) return demoClasses;
  if (path === '/subjects') return demoSubjects;
  if (path.startsWith('/pedagogy/overview?'))
    return {
      subjectCount: demoSubjects.filter((item) => item.status === 'ACTIVE').length,
      teacherCount: new Set(
        demoAssignments.flatMap((item) => (item.teacherUserId ? [item.teacherUserId] : [])),
      ).size,
      coveredClassCount: new Set(demoAssignments.map((item) => item.classId)).size,
      totalClassCount: demoClasses.length,
      weeklyHours: demoAssignments.reduce((sum, item) => sum + item.weeklyHours, 0),
      assignments: demoAssignments,
      teachers: demoTeachers,
    };
  if (path === '/timetable/rooms') return demoRooms;
  if (path.startsWith('/timetable/entries?')) {
    const url = new URL(path, 'http://demo.local');
    const classId = url.searchParams.get('class_id');
    const teacherId = url.searchParams.get('teacher_user_id');
    return demoTimetable.filter(
      (item) =>
        item.status !== 'CANCELLED' &&
        (!classId || item.classId === classId) &&
        (!teacherId || item.teacherUserId === teacherId),
    );
  }
  if (path.startsWith('/attendance/sessions?')) {
    const url = new URL(path, 'http://demo.local');
    const classId = url.searchParams.get('class_id');
    const date = url.searchParams.get('date');
    return demoAttendance.filter(
      (item) => (!classId || item.classId === classId) && item.date === date,
    );
  }
  if (path.startsWith('/assessments/overview?')) {
    const url = new URL(path, 'http://demo.local');
    const classId = url.searchParams.get('class_id');
    const periodId = url.searchParams.get('period_id');
    return {
      periods: demoPeriods,
      types: demoAssessmentTypes,
      competencies: demoCompetencies,
      policies: demoPolicies,
      assessments: demoAssessments.filter(
        (item) =>
          (!classId || item.classId === classId) && (!periodId || item.periodId === periodId),
      ),
    };
  }
  if (path.startsWith('/report-cards?')) {
    const url = new URL(path, 'http://demo.local');
    const periodId = url.searchParams.get('period_id');
    const classId = url.searchParams.get('class_id');
    return demoReportCards.filter(
      (item) =>
        item.periodId === periodId &&
        (!classId || item.className === demoClasses.find((entry) => entry.id === classId)?.name),
    );
  }
  if (path.startsWith('/student-life/incidents?')) return demoIncidents;
  if (path.startsWith('/student-life/health-visits?')) return demoHealthVisits;
  if (path.startsWith('/staff?')) return demoStaff;
  if (path === '/staff-leaves') return demoStaffLeaves;
  if (path.startsWith('/communications?')) return demoCommunications;
  if (path === '/school-services') return demoServices;
  if (path.startsWith('/portal?')) return demoPortal;
  if (path === '/student-categories') {
    return [
      { id: uuid(300), code: 'EXTERNE', name: 'Externe', status: 'ACTIVE' },
      { id: uuid(301), code: 'DEMI_PENSIONNAIRE', name: 'Demi-pensionnaire', status: 'ACTIVE' },
      { id: uuid(302), code: 'INTERNE', name: 'Interne', status: 'ACTIVE' },
    ];
  }
  if (path === '/fee-types') return demoFeeTypes;
  if (path.startsWith('/fee-structures?')) return demoFeeStructures;
  if (path.startsWith('/students?')) {
    const url = new URL(path, 'http://demo.local');
    const query = url.searchParams.get('q')?.trim().toLowerCase() ?? '';
    const classId = url.searchParams.get('class_id');
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const pageSize = Math.max(1, Number(url.searchParams.get('page_size') ?? 25));
    const filtered = demoStudents.filter((student) => {
      const matchesQuery =
        !query ||
        `${student.studentNumber} ${student.firstName} ${student.lastName}`
          .toLowerCase()
          .includes(query);
      const matchesClass = !classId || classId === student.currentEnrollment?.classId;
      return matchesQuery && matchesClass;
    });
    return {
      data: filtered.slice((page - 1) * pageSize, page * pageSize),
      meta: {
        page,
        page_size: pageSize,
        total: filtered.length,
        total_pages: Math.ceil(filtered.length / pageSize),
      },
    };
  }
  if (path.startsWith('/payments?')) {
    const url = new URL(path, 'http://demo.local');
    const status = url.searchParams.get('status');
    const rows = status
      ? demoPayments.filter((payment) => payment.status === status)
      : demoPayments;
    return {
      data: rows,
      meta: { page: 1, page_size: 50, total: rows.length, total_pages: rows.length ? 1 : 0 },
    };
  }
  const paymentMatch = path.match(/^\/payments\/(0199[0-9a-f-]+)$/);
  if (paymentMatch) {
    const payment = demoPayments.find((item) => item.id === paymentMatch[1]);
    return payment
      ? {
          ...payment,
          allocations: [
            {
              id: uuid(5_000),
              label: 'Frais scolaires',
              amount: payment.amount,
              studentName: payment.studentNames[0],
            },
          ],
        }
      : undefined;
  }
  return undefined;
}
