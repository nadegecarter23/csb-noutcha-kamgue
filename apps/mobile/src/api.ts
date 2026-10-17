import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
const localApiBase = expoHost ? `http://${expoHost}:3000/api/v1` : 'http://localhost:3000/api/v1';
export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? localApiBase;
const REFRESH_KEY = 'cplan.refresh-token';
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const CURRENT_PAYMENT_KEY = 'cplan.current-mobile-money-payment';
const memoryCache = new Map<string, { data: unknown; cachedAt: string }>();
export type MobileMoneyPayment = {
  id: string;
  reference: string;
  provider: 'MTN_MOMO' | 'ORANGE_MONEY' | 'FAKE';
  providerReference: string | null;
  amount: number;
  status: string;
  statusReason: string | null;
  receiptId: string | null;
  balanceAfter: number | null;
  confirmedNoDebit: boolean;
  uncertain: boolean;
  trackingAbandonedAt: string | null;
};
export class MobileApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}
async function renew() {
  refreshing ??= (async () => {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!refreshToken) return false;
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      await clearTokens();
      return false;
    }
    const tokens = (await response.json()) as { accessToken: string; refreshToken: string };
    await saveTokens(tokens);
    return true;
  })()
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}
export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; form?: FormData; idempotencyKey?: string } = {},
): Promise<T> {
  const execute = () =>
    fetch(`${API_BASE}${path}`, {
      method:
        options.method ??
        (options.body === undefined && options.form === undefined ? 'GET' : 'POST'),
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      },
      ...(options.form
        ? { body: options.form }
        : options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
    });
  let response: Response;
  try {
    response = await execute();
  } catch {
    throw new MobileApiError('Connexion indisponible. Les dernières données restent consultables.');
  }
  if (response.status === 401 && (await renew())) response = await execute();
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  if (!response.ok)
    throw new MobileApiError(
      payload?.error?.message ?? 'Une erreur est survenue.',
      response.status,
    );
  return payload as T;
}
export const request = <T>(path: string, body?: unknown) =>
  apiRequest<T>(path, { method: 'POST', body });
export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};
export async function saveTokens(tokens: { accessToken: string; refreshToken: string }) {
  accessToken = tokens.accessToken;
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
  await SecureStore.deleteItemAsync('cplan.access-token');
}
export async function restoreSession() {
  if (accessToken) return true;
  return renew();
}
export async function clearTokens() {
  accessToken = null;
  memoryCache.clear();
  await Promise.all([
    SecureStore.deleteItemAsync(REFRESH_KEY),
    SecureStore.deleteItemAsync(CURRENT_PAYMENT_KEY),
  ]);
  await Promise.all(
    ['parent.dashboard', 'parent.payments', 'parent.notifications', CURRENT_PAYMENT_KEY].map(
      (key) => AsyncStorage.removeItem(key),
    ),
  );
}
export async function saveCurrentPayment(payment: MobileMoneyPayment) {
  await SecureStore.setItemAsync(CURRENT_PAYMENT_KEY, JSON.stringify(payment));
  await AsyncStorage.removeItem(CURRENT_PAYMENT_KEY);
}
export async function getCurrentPayment() {
  const raw = await SecureStore.getItemAsync(CURRENT_PAYMENT_KEY);
  return raw ? (JSON.parse(raw) as MobileMoneyPayment) : null;
}
export async function clearCurrentPayment() {
  await Promise.all([
    SecureStore.deleteItemAsync(CURRENT_PAYMENT_KEY),
    AsyncStorage.removeItem(CURRENT_PAYMENT_KEY),
  ]);
}
export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
): Promise<{ data: T; cachedAt: string; offline: boolean }> {
  try {
    const data = await loader();
    const cachedAt = new Date().toISOString();
    memoryCache.set(key, { data, cachedAt });
    return { data, cachedAt, offline: false };
  } catch (error) {
    const cachedValue = memoryCache.get(key);
    if (cachedValue)
      return { data: cachedValue.data as T, cachedAt: cachedValue.cachedAt, offline: true };
    throw error;
  }
}
async function downloadPdf(path: string, dialogTitle: string) {
  const file = await api.get<{ filename: string; base64: string }>(path);
  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new MobileApiError('Stockage local indisponible.');
  const uri = `${directory}${file.filename}`;
  await FileSystem.writeAsStringAsync(uri, file.base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (await Sharing.isAvailableAsync())
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle });
  return uri;
}
export function downloadReceipt(receiptId: string) {
  return downloadPdf(`/parent/receipts/${receiptId}/download`, 'Reçu CSB Noutcha KAMGUE');
}
/** Bulletin publié, nommé par élève et période pour être retrouvé facilement. */
export function downloadReportCard(reportCardId: string) {
  return downloadPdf(
    `/parent/report-cards/${reportCardId}/download`,
    'Bulletin CSB Noutcha KAMGUE',
  );
}
