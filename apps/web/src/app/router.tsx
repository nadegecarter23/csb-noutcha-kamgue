import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { useAuthStore } from '@/features/auth/auth-store';
import { homeRouteFor } from '@/features/auth/home-route';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { ProfilePage } from '@/features/auth/pages/ProfilePage';
import { UsersPage } from '@/features/admin/UsersPage';
import { RolesPage } from '@/features/admin/RolesPage';
import { StatusPage } from '@/features/system/StatusPage';
import { NotFoundPage } from './NotFoundPage';
import { AnyPermissionRoute, AppLayout, PermissionRoute } from './AppLayout';
import {
  AcademicYearsPage,
  ClassDetailPage,
  ClassesPage,
  GradeLevelsPage,
  OrganizationPage,
  SchoolDashboardPage,
  SettingsPage,
} from '@/features/academic/AcademicPages';
import {
  CreateStudentPage,
  GuardianRequestsPage,
  StudentDetailPage,
  StudentsListPage,
} from '@/features/students/StudentsPages';
import { FeeStructuresPage, PaymentsPage } from '@/features/finance/FinancePages';
import { ImportStudentsPage, ReenrollmentPage } from '@/features/imports/ImportStudentsPage';
import { CashierPage } from '@/features/cash/CashierPage';
import { MobileMoneyPage } from '@/features/finance/MobileMoneyPage';
import { ExternalPaymentsPage } from '@/features/finance/ExternalPaymentsPage';
import { NotificationsPage } from '@/features/admin/NotificationsPage';
const AccountantDashboardPage = lazy(() =>
  import('@/features/reporting/ReportingPages').then((m) => ({
    default: m.AccountantDashboardPage,
  })),
);
const DirectorDashboardPage = lazy(() =>
  import('@/features/reporting/ReportingPages').then((m) => ({ default: m.DirectorDashboardPage })),
);
const ClassPaymentStatusPage = lazy(() =>
  import('@/features/reporting/ReportingPages').then((m) => ({
    default: m.ClassPaymentStatusPage,
  })),
);
const AdvancedReportsPage = lazy(() =>
  import('@/features/reporting/ReportingPages').then((m) => ({ default: m.AdvancedReportsPage })),
);
const ExportsPage = lazy(() =>
  import('@/features/reporting/ReportingPages').then((m) => ({ default: m.ExportsPage })),
);
const AuditPage = lazy(() => import('@/features/audit/AuditPage'));
const PedagogyPage = lazy(() =>
  import('@/features/pedagogy/PedagogyPage').then((m) => ({ default: m.PedagogyPage })),
);
const TimetablePage = lazy(() =>
  import('@/features/timetable/TimetablePage').then((m) => ({ default: m.TimetablePage })),
);
const AttendancePage = lazy(() =>
  import('@/features/attendance/AttendancePage').then((m) => ({ default: m.AttendancePage })),
);
const AssessmentsPage = lazy(() =>
  import('@/features/assessments/AssessmentsPage').then((m) => ({ default: m.AssessmentsPage })),
);
const ReportCardsPage = lazy(() =>
  import('@/features/report-cards/ReportCardsPage').then((m) => ({ default: m.ReportCardsPage })),
);
const StudentLifePage = lazy(() =>
  import('@/features/student-life/StudentLifePage').then((m) => ({ default: m.StudentLifePage })),
);
const StaffPage = lazy(() =>
  import('@/features/staff/StaffPage').then((m) => ({ default: m.StaffPage })),
);
const CommunicationsPage = lazy(() =>
  import('@/features/communications/CommunicationsPage').then((m) => ({
    default: m.CommunicationsPage,
  })),
);
const SchoolServicesPage = lazy(() =>
  import('@/features/school-services/SchoolServicesPage').then((m) => ({
    default: m.SchoolServicesPage,
  })),
);
const PortalPage = lazy(() =>
  import('@/features/portal/PortalPage').then((m) => ({ default: m.PortalPage })),
);
const ProcurementPage = lazy(() =>
  import('@/features/procurement/ProcurementPage').then((m) => ({ default: m.ProcurementPage })),
);
const PlatformDashboardPage = lazy(() =>
  import('@/features/platform/PlatformDashboardPage').then((m) => ({
    default: m.PlatformDashboardPage,
  })),
);
const suspense = (element: React.ReactNode) => (
  <Suspense fallback={<p>Chargement…</p>}>{element}</Suspense>
);

/**
 * Routage du dashboard.
 *
 * Les quatre espaces (Scolarité, Comptabilité, Direction, Administration) sont
 * une seule application dont les routes sont gardées par des permissions
 * (ADR-008). Les gardes arrivent en Phase 01 ; la structure est posée ici.
 *
 *   Phase 01 → /login fonctionnel, /users, /roles
 *   Phase 02 → /academic-years, /grade-levels, /classes
 *   Phase 03 → /students
 *   Phase 06 → /fees
 *   Phase 08 → /cashier
 *   Phase 14 → /reports
 */
function RootRedirect() {
  const user = useAuthStore((state) => state.user);
  return <Navigate to={homeRouteFor(user)} replace />;
}

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/status', element: <StatusPage /> },
  {
    element: <AppLayout />,
    children: [
      { path: '/profile', element: <ProfilePage /> },
      {
        element: <PermissionRoute permission="schools.manage" />,
        children: [{ path: '/platform', element: suspense(<PlatformDashboardPage />) }],
      },
      {
        element: <PermissionRoute permission="academic_years.read" />,
        children: [
          { path: '/school', element: <SchoolDashboardPage /> },
          { path: '/academic-years', element: <AcademicYearsPage /> },
        ],
      },
      {
        element: <PermissionRoute permission="grade_levels.read" />,
        children: [
          { path: '/organization', element: <OrganizationPage /> },
          { path: '/grade-levels', element: <GradeLevelsPage /> },
        ],
      },
      {
        element: <PermissionRoute permission="classes.read" />,
        children: [
          { path: '/classes', element: <ClassesPage /> },
          { path: '/classes/:id', element: <ClassDetailPage /> },
        ],
      },
      {
        element: <PermissionRoute permission="pedagogy.read" />,
        children: [{ path: '/pedagogy', element: suspense(<PedagogyPage />) }],
      },
      {
        element: <PermissionRoute permission="timetable.read" />,
        children: [{ path: '/timetable', element: suspense(<TimetablePage />) }],
      },
      {
        element: <PermissionRoute permission="attendance.read" />,
        children: [{ path: '/attendance', element: suspense(<AttendancePage />) }],
      },
      {
        element: <PermissionRoute permission="assessments.read" />,
        children: [{ path: '/assessments', element: suspense(<AssessmentsPage />) }],
      },
      {
        element: <PermissionRoute permission="report_cards.read" />,
        children: [{ path: '/report-cards', element: suspense(<ReportCardsPage />) }],
      },
      {
        element: <PermissionRoute permission="student_life.read" />,
        children: [{ path: '/student-life', element: suspense(<StudentLifePage />) }],
      },
      {
        element: <PermissionRoute permission="staff.read" />,
        children: [{ path: '/staff', element: suspense(<StaffPage />) }],
      },
      {
        element: <PermissionRoute permission="communications.read" />,
        children: [{ path: '/communications', element: suspense(<CommunicationsPage />) }],
      },
      {
        element: <PermissionRoute permission="school_services.read" />,
        children: [{ path: '/services', element: suspense(<SchoolServicesPage />) }],
      },
      {
        element: <PermissionRoute permission="portal.read" />,
        children: [{ path: '/portal', element: suspense(<PortalPage />) }],
      },
      {
        element: <PermissionRoute permission="settings.read" />,
        children: [{ path: '/settings', element: <SettingsPage /> }],
      },
      {
        element: <PermissionRoute permission="students.read" />,
        children: [
          { path: '/students', element: <StudentsListPage /> },
          { path: '/students/new', element: <CreateStudentPage /> },
          { path: '/students/:id', element: <StudentDetailPage /> },
        ],
      },
      {
        element: <PermissionRoute permission="guardian_requests.handle" />,
        children: [{ path: '/guardian-requests', element: <GuardianRequestsPage /> }],
      },
      {
        element: <PermissionRoute permission="imports.students.run" />,
        children: [
          { path: '/students/import', element: <ImportStudentsPage /> },
          { path: '/students/reenroll', element: <ReenrollmentPage /> },
        ],
      },
      {
        element: <PermissionRoute permission="fee_structures.read" />,
        children: [{ path: '/fees', element: <FeeStructuresPage /> }],
      },
      {
        element: <PermissionRoute permission="payments.read" />,
        children: [
          { path: '/payments', element: <PaymentsPage /> },
          { path: '/mobile-money', element: <MobileMoneyPage /> },
        ],
      },
      {
        element: (
          <AnyPermissionRoute permissions={['suppliers.read', 'purchases.read', 'expenses.read']} />
        ),
        children: [{ path: '/procurement', element: suspense(<ProcurementPage />) }],
      },
      {
        element: <PermissionRoute permission="payments.validate_external" />,
        children: [{ path: '/external-payments', element: <ExternalPaymentsPage /> }],
      },
      {
        element: <PermissionRoute permission="notifications.manage" />,
        children: [{ path: '/notifications-admin', element: <NotificationsPage /> }],
      },
      {
        element: <PermissionRoute permission="reports.financial.read" />,
        children: [
          { path: '/accounting', element: suspense(<AccountantDashboardPage />) },
          { path: '/reports/class-status', element: suspense(<ClassPaymentStatusPage />) },
          { path: '/reports/advanced', element: suspense(<AdvancedReportsPage />) },
        ],
      },
      {
        element: <PermissionRoute permission="reports.director.read" />,
        children: [{ path: '/direction', element: suspense(<DirectorDashboardPage />) }],
      },
      {
        element: <PermissionRoute permission="reports.export" />,
        children: [{ path: '/exports', element: suspense(<ExportsPage />) }],
      },
      {
        element: <AnyPermissionRoute permissions={['audit.read', 'audit.read_financial']} />,
        children: [{ path: '/audit', element: suspense(<AuditPage />) }],
      },
      {
        element: <PermissionRoute permission="payments.create_cash" />,
        children: [{ path: '/cashier', element: <CashierPage /> }],
      },
      {
        element: <PermissionRoute permission="users.read" />,
        children: [{ path: '/users', element: <UsersPage /> }],
      },
      {
        element: <PermissionRoute permission="roles.read" />,
        children: [{ path: '/roles', element: <RolesPage /> }],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
