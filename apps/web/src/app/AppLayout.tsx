import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import { useAcademicYear } from '@/features/academic/use-academic-year';
import { GlobalStudentSearch } from '@/features/students/GlobalStudentSearch';
import { moduleForPath, useSchoolModules } from '@/shared/use-school-modules';
import { ScopeSelector } from '@/features/scope/ScopeSelector';
import { homeRouteFor } from '@/features/auth/home-route';

type IconName =
  | 'home'
  | 'students'
  | 'classes'
  | 'pedagogy'
  | 'calendar'
  | 'fees'
  | 'payments'
  | 'cash'
  | 'reports'
  | 'exports'
  | 'users'
  | 'audit'
  | 'settings'
  | 'bell'
  | 'search'
  | 'menu'
  | 'logout'
  | 'profile';
const paths: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v10h13V10M9 20v-6h6v6" />
    </>
  ),
  students: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  classes: (
    <>
      <path d="m3 10 9-5 9 5-9 5-9-5Z" />
      <path d="M7 12.5V17c3 2 7 2 10 0v-4.5M21 10v6" />
    </>
  ),
  pedagogy: (
    <>
      <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23V5.5Z" />
      <path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23V5.5Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </>
  ),
  fees: (
    <>
      <path d="M6 2h12l3 6-9 14L3 8l3-6Z" />
      <path d="M3 8h18M8 2l-2 6 6 14 6-14-2-6" />
    </>
  ),
  payments: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
  cash: (
    <>
      <path d="M3 10h18M5 10V7l7-4 7 4v3M5 14v5M9 14v5M15 14v5M19 14v5M3 21h18" />
    </>
  ),
  reports: (
    <>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
    </>
  ),
  exports: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M18 8v6M21 11h-6" />
    </>
  ),
  audit: (
    <>
      <path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h3" />
      <circle cx="17" cy="17" r="3" />
      <path d="m19.2 19.2 2 2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 15a2 2 0 0 0 .4 2l-2.5 2.5a2 2 0 0 0-2-.4 2 2 0 0 0-1.2 1.9h-3.5A2 2 0 0 0 9 19.1a2 2 0 0 0-2 .4L4.5 17a2 2 0 0 0 .4-2A2 2 0 0 0 3 13.8v-3.5A2 2 0 0 0 4.9 9a2 2 0 0 0-.4-2L7 4.5a2 2 0 0 0 2 .4A2 2 0 0 0 10.2 3h3.5A2 2 0 0 0 15 4.9a2 2 0 0 0 2-.4L19.5 7a2 2 0 0 0-.4 2 2 2 0 0 0 1.9 1.2v3.5A2 2 0 0 0 19 15Z" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  logout: (
    <>
      <path d="M10 17l5-5-5-5M15 12H3M15 4h5v16h-5" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
};
export function AppIcon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

const groups = [
  {
    label: '',
    links: [
      {
        to: '/platform',
        label: 'Pilotage du complexe',
        icon: 'home',
        permission: 'schools.manage',
      },
      { to: '/school', label: 'Vue d’ensemble', icon: 'home', permission: 'academic_years.read' },
      { to: '/portal', label: 'Mon espace', icon: 'profile', permission: 'portal.read' },
    ],
  },
  {
    label: 'Scolarité',
    links: [
      { to: '/students', label: 'Élèves', icon: 'students', permission: 'students.read' },
      { to: '/classes', label: 'Classes', icon: 'classes', permission: 'classes.read' },
      { to: '/pedagogy', label: 'Pédagogie', icon: 'pedagogy', permission: 'pedagogy.read' },
      {
        to: '/timetable',
        label: 'Emplois du temps',
        icon: 'calendar',
        permission: 'timetable.read',
      },
      { to: '/attendance', label: 'Présences', icon: 'students', permission: 'attendance.read' },
      { to: '/assessments', label: 'Évaluations', icon: 'audit', permission: 'assessments.read' },
      { to: '/report-cards', label: 'Bulletins', icon: 'reports', permission: 'report_cards.read' },
      { to: '/student-life', label: 'Vie scolaire', icon: 'bell', permission: 'student_life.read' },
      { to: '/staff', label: 'Personnel', icon: 'users', permission: 'staff.read' },
      {
        to: '/communications',
        label: 'Communication',
        icon: 'bell',
        permission: 'communications.read',
      },
      { to: '/services', label: 'Services', icon: 'classes', permission: 'school_services.read' },
      {
        to: '/academic-years',
        label: 'Années scolaires',
        icon: 'calendar',
        permission: 'academic_years.read',
      },
      {
        to: '/organization',
        label: 'Organisation',
        icon: 'classes',
        permission: 'grade_levels.read',
      },
      {
        to: '/students/import',
        label: 'Inscriptions & imports',
        icon: 'exports',
        permission: 'imports.students.run',
      },
      {
        to: '/guardian-requests',
        label: 'Associations parents',
        icon: 'users',
        permission: 'guardian_requests.handle',
      },
    ],
  },
  {
    label: 'Finances',
    links: [
      { to: '/fees', label: 'Frais scolaires', icon: 'fees', permission: 'fee_structures.read' },
      { to: '/payments', label: 'Paiements', icon: 'payments', permission: 'payments.read' },
      {
        to: '/procurement',
        label: 'Dépenses & achats',
        icon: 'cash',
        permissions: ['suppliers.read', 'purchases.read', 'expenses.read'],
      },
      {
        to: '/external-payments',
        label: 'Paiements externes',
        icon: 'exports',
        permission: 'payments.validate_external',
      },
      { to: '/cashier', label: 'Caisse', icon: 'cash', permission: 'payments.create_cash' },
    ],
  },
  {
    label: 'Pilotage',
    links: [
      {
        to: '/accounting',
        label: 'Vue comptable',
        icon: 'reports',
        permission: 'reports.financial.read',
      },
      {
        to: '/direction',
        label: 'Vue direction',
        icon: 'reports',
        permission: 'reports.director.read',
      },
      {
        to: '/reports/class-status',
        label: 'Suivi par classe',
        icon: 'classes',
        permission: 'reports.financial.read',
      },
      {
        to: '/exports',
        label: 'Exports & impressions',
        icon: 'exports',
        permission: 'reports.export',
      },
    ],
  },
  {
    label: 'Administration',
    links: [
      { to: '/users', label: 'Utilisateurs', icon: 'users', permission: 'users.read' },
      {
        to: '/audit',
        label: 'Journal d’audit',
        icon: 'audit',
        permissions: ['audit.read', 'audit.read_financial'],
      },
      { to: '/settings', label: 'Paramètres', icon: 'settings', permission: 'settings.read' },
      { to: '/profile', label: 'Mon profil', icon: 'profile', permission: null },
    ],
  },
] as const;

export function AppLayout() {
  const { user, ready, hydrate, signOut } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const academic = useAcademicYear();
  const modules = useSchoolModules(Boolean(user?.currentSchoolId && !user.mustChangePassword));
  const enabledModules = useMemo(
    () => new Set(modules.data?.filter((module) => module.enabled).map((module) => module.code)),
    [modules.data],
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => {
    if (!ready) void hydrate();
  }, [hydrate, ready]);
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const moduleCode = moduleForPath(location.pathname);
    if (modules.data && moduleCode && !enabledModules.has(moduleCode))
      navigate('/profile', { replace: true });
  }, [enabledModules, location.pathname, modules.data, navigate]);
  if (!ready)
    return (
      <div className="app-loading">
        <img src="/brand/csb-nk-logo.png" alt="" />
        <span>Préparation de votre espace…</span>
      </div>
    );
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword && location.pathname !== '/profile')
    return <Navigate to="/profile" replace />;
  const isPlatformUser = user.permissions.includes('schools.manage') && !user.currentSchoolId;
  const allowed = (item: {
    to: string;
    permission?: string | null;
    permissions?: readonly string[];
  }) => {
    if (isPlatformUser) return item.to === '/platform' || item.to === '/profile';
    const moduleCode = moduleForPath(item.to);
    const moduleAllowed = !moduleCode || !modules.data || enabledModules.has(moduleCode);
    const permissionAllowed =
      item.permission === null ||
      (item.permission
        ? user.permissions.includes(item.permission)
        : item.permissions?.some((permission) => user.permissions.includes(permission)));
    return moduleAllowed && permissionAllowed;
  };
  const school =
    user.schools.find((item) => item.schoolId === user.currentSchoolId)?.schoolName ??
    (isPlatformUser ? 'Super administration CSB' : 'CSB Noutcha KAMGUE');
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();
  return (
    <div className="app-shell">
      {isPlatformUser ? null : <GlobalStudentSearch />}
      {menuOpen ? (
        <button
          className="mobile-scrim"
          aria-label="Fermer le menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <aside className={`app-sidebar print:hidden ${menuOpen ? 'is-open' : ''}`}>
        <div className="brand-lockup">
          <img src="/brand/csb-nk-logo.png" alt="Logo officiel du CSB Noutcha KAMGUE" />
          <div>
            <strong>CSB Noutcha KAMGUE</strong>
            <span>Dogpassi · Douala</span>
          </div>
        </div>
        <nav aria-label="Navigation principale" className="nav-groups">
          {groups.map((group) => {
            const links = group.links.filter(allowed);
            if (!links.length) return null;
            return (
              <div className="nav-group" key={group.label || 'main'}>
                {group.label ? <p>{group.label}</p> : null}
                {links.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}
                  >
                    <AppIcon name={item.icon} />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-year">
          <AppIcon name="classes" />
          <div>
            <span>{isPlatformUser ? 'Périmètre' : 'Année scolaire'}</span>
            <strong>
              {isPlatformUser
                ? 'Tous les cycles'
                : (academic.selectedYear?.name ?? 'À sélectionner')}
            </strong>
          </div>
        </div>
      </aside>
      <div className="app-workspace">
        <header className="topbar print:hidden">
          <button
            className="icon-button mobile-menu"
            aria-label="Ouvrir le menu"
            onClick={() => setMenuOpen(true)}
          >
            <AppIcon name="menu" />
          </button>
          {isPlatformUser ? (
            <button className="search-trigger" onClick={() => navigate(homeRouteFor(user))}>
              <AppIcon name="home" />
              <span>Vue consolidée du complexe</span>
            </button>
          ) : (
            <>
              <button
                className="search-trigger"
                onClick={() => window.dispatchEvent(new Event('cplan:search'))}
              >
                <AppIcon name="search" />
                <span>Rechercher un élève, un reçu…</span>
                <kbd>Ctrl K</kbd>
              </button>
              <ScopeSelector scopes={user.accessScopes} />
            </>
          )}
          <div className="topbar-actions">
            {academic.years.length ? (
              <select
                aria-label="Année scolaire"
                className="year-select"
                value={academic.selectedYear?.id ?? ''}
                onChange={(event) => academic.selectYear(event.target.value)}
              >
                {academic.years.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </select>
            ) : null}
            {isPlatformUser ? null : (
              <button
                className="icon-button"
                aria-label="Notifications"
                onClick={() => navigate('/notifications-admin')}
              >
                <AppIcon name="bell" />
              </button>
            )}
            <div className="profile-menu">
              <button
                className="profile-trigger"
                onClick={() => setProfileOpen((value) => !value)}
                aria-expanded={profileOpen}
              >
                <span className="avatar">{initials}</span>
                <span>
                  <strong>
                    {user.firstName} {user.lastName}
                  </strong>
                  <small>{school}</small>
                </span>
              </button>
              {profileOpen ? (
                <div className="profile-popover">
                  <button onClick={() => navigate('/profile')}>
                    <AppIcon name="profile" />
                    Mon profil
                  </button>
                  <button onClick={() => void signOut().then(() => navigate('/login'))}>
                    <AppIcon name="logout" />
                    Se déconnecter
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        {academic.isReadOnly ? (
          <div className="readonly-banner">
            Année clôturée — les informations sont disponibles en consultation uniquement.
          </div>
        ) : null}
        <main className="app-content">
          <Outlet />
        </main>
        <footer className="app-footer print:hidden">
          <span>CSB Noutcha KAMGUE</span>
          <span>Apprendre · Persévérer · Réussir</span>
        </footer>
      </div>
    </div>
  );
}
export function PermissionRoute({ permission }: { permission: string }) {
  const user = useAuthStore((state) => state.user);
  return user?.permissions.includes(permission) ? (
    <Outlet />
  ) : (
    <Navigate to={homeRouteFor(user)} replace />
  );
}
export function AnyPermissionRoute({ permissions }: { permissions: readonly string[] }) {
  const user = useAuthStore((state) => state.user);
  return permissions.some((permission) => user?.permissions.includes(permission)) ? (
    <Outlet />
  ) : (
    <Navigate to={homeRouteFor(user)} replace />
  );
}
