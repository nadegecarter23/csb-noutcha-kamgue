import { describe, expect, it } from 'vitest';
import { normalizeApiBaseUrl } from './base-url';

describe('normalizeApiBaseUrl', () => {
  it('utilise le proxy local sans configuration', () => {
    expect(normalizeApiBaseUrl(undefined)).toBe('/api/v1');
  });

  it('conserve une base relative', () => {
    expect(normalizeApiBaseUrl('/api/v1/')).toBe('/api/v1');
  });

  it('corrige un domaine Railway sans protocole ni préfixe API', () => {
    expect(normalizeApiBaseUrl('schoolfeesnaapi-production.up.railway.app')).toBe(
      'https://schoolfeesnaapi-production.up.railway.app/api/v1',
    );
  });

  it('ajoute le préfixe API à une origine absolue', () => {
    expect(normalizeApiBaseUrl('https://api.example.com')).toBe('https://api.example.com/api/v1');
  });

  it('conserve une URL absolue déjà complète', () => {
    expect(normalizeApiBaseUrl('https://api.example.com/api/v1/')).toBe(
      'https://api.example.com/api/v1',
    );
  });
});
