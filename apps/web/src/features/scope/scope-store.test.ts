import { describe, expect, it } from 'vitest';
import type { AccessScopeDto } from '@cplan/contracts';
import { availableScopes } from './scope-store';

describe('sélecteur de périmètre CSB', () => {
  it('présente chaque cycle autorisé sans exposer la portée affectations propres', () => {
    const scopes: AccessScopeDto[] = [
      {
        type: 'UNIT',
        organizationalUnitId: '00000000-0000-7000-8000-000000000001',
        label: 'Primaire',
      },
      {
        type: 'UNIT',
        organizationalUnitId: '00000000-0000-7000-8000-000000000002',
        label: 'Secondaire',
      },
      { type: 'OWN_ASSIGNMENTS', label: 'Mes affectations' },
    ];
    expect(availableScopes(scopes).map((scope) => scope.label)).toEqual(['Primaire', 'Secondaire']);
  });

  it('réduit une portée établissement à un choix global explicite', () => {
    expect(availableScopes([{ type: 'SCHOOL', label: 'CSB' }])).toEqual([
      { type: 'SCHOOL', label: 'Tout l’établissement' },
    ]);
  });
});
