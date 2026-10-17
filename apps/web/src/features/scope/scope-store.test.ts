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

  it('propose à un périmètre global chaque cycle, section et filière', () => {
    const organization = [
      {
        id: 'u1',
        name: 'Primaire',
        status: 'ACTIVE',
        languageSections: [{ id: 's1', name: 'Francophone', status: 'ACTIVE' }],
        educationTracks: [],
      },
      {
        id: 'u2',
        name: 'Secondaire',
        status: 'ACTIVE',
        languageSections: [],
        educationTracks: [{ id: 't1', name: 'Technique', status: 'ACTIVE' }],
      },
    ];
    const options = availableScopes([{ type: 'SCHOOL', label: 'CSB' }], organization);
    expect(options.map((scope) => [scope.type, scope.group ?? null, scope.label])).toEqual([
      ['SCHOOL', null, 'Tout l’établissement'],
      ['UNIT', 'Primaire', 'Tout le cycle primaire'],
      ['LANGUAGE_SECTION', 'Primaire', 'Primaire francophone'],
      ['UNIT', 'Secondaire', 'Tout le cycle secondaire'],
      ['TRACK', 'Secondaire', 'Secondaire · technique'],
    ]);
  });

  it('réduit une portée établissement à un choix global explicite', () => {
    expect(availableScopes([{ type: 'SCHOOL', label: 'CSB' }])).toEqual([
      { type: 'SCHOOL', label: 'Tout l’établissement' },
    ]);
  });
});
