import type { AuthSession, CurrentUser } from '@cplan/contracts';
import { create } from 'zustand';
import { api, ApiError, NetworkError } from '@/shared/api/client';
import {
  createDemoAdminSession,
  DEMO_ACCESS_TOKEN,
  DEMO_MODE_ENABLED,
  isDemoAdminCredentials,
} from '@/shared/demo';

const ACCESS_KEY = 'cplan.access-token';
const REFRESH_KEY = 'cplan.refresh-token';
const USER_KEY = 'cplan.current-user';

function readUser(): CurrentUser | null {
  try {
    const value = localStorage.getItem(USER_KEY);
    return value ? (JSON.parse(value) as CurrentUser) : null;
  } catch {
    return null;
  }
}

export function persistSession(session: AuthSession): void {
  localStorage.setItem(ACCESS_KEY, session.tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, session.tokens.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearPersistedSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

interface AuthState {
  user: CurrentUser | null;
  ready: boolean;
  signIn(identifier: string, password: string): Promise<void>;
  hydrate(): Promise<void>;
  signOut(): Promise<void>;
  setUser(user: CurrentUser): void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: readUser(),
  ready: false,
  async signIn(identifier, password) {
    let session: AuthSession;
    try {
      session = await api.post<AuthSession>(
        '/auth/login',
        {
          identifier,
          password,
          deviceLabel: 'Navigateur web',
        },
        { timeoutMs: 4_000 },
      );
    } catch (cause) {
      const apiUnavailable =
        cause instanceof NetworkError || (cause instanceof ApiError && cause.status >= 500);
      if (!DEMO_MODE_ENABLED || !apiUnavailable || !isDemoAdminCredentials(identifier, password))
        throw cause;
      session = createDemoAdminSession();
    }
    persistSession(session);
    set({ user: session.user, ready: true });
  },
  async hydrate() {
    if (!localStorage.getItem(REFRESH_KEY)) {
      set({ user: null, ready: true });
      return;
    }
    if (DEMO_MODE_ENABLED && localStorage.getItem(ACCESS_KEY) === DEMO_ACCESS_TOKEN) {
      const session = createDemoAdminSession();
      persistSession(session);
      set({ user: session.user, ready: true });
      return;
    }
    try {
      const user = await api.get<CurrentUser>('/auth/me');
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      set({ user, ready: true });
    } catch {
      clearPersistedSession();
      set({ user: null, ready: true });
    }
  },
  async signOut() {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    try {
      if (refreshToken && localStorage.getItem(ACCESS_KEY) !== DEMO_ACCESS_TOKEN) {
        await api.post('/auth/logout', { refreshToken });
      }
    } finally {
      clearPersistedSession();
      set({ user: null, ready: true });
    }
  },
  setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user });
  },
}));

export const authStorage = {
  accessKey: ACCESS_KEY,
  refreshKey: REFRESH_KEY,
  clear: clearPersistedSession,
};
