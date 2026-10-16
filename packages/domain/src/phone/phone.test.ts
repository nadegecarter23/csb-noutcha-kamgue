import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  requirePhone,
  isValidPhone,
  maskPhone,
  guessCameroonOperator,
  PhoneError,
} from './index.js';

/**
 * Table de test des formats réellement rencontrés.
 *
 * Risque « critique » identifié en Phase 01 : si ces formats ne convergent pas
 * vers la même chaîne E.164, la détection automatique des enfants (§8) ne
 * fonctionne pas et l'application parent perd sa raison d'être.
 */
describe('normalizePhone — convergence des formats camerounais', () => {
  const EXPECTED = '+237699123456';

  it.each([
    ['699123456', 'national brut'],
    ['699 12 34 56', 'national espacé'],
    ['699-12-34-56', 'national tirets'],
    ['699.12.34.56', 'national points'],
    ['+237699123456', 'E.164'],
    ['+237 699 12 34 56', 'international espacé'],
    ['+237 6 99 12 34 56', 'international groupé'],
    ['237699123456', 'indicatif sans +'],
    ['00237699123456', 'préfixe international 00'],
    ['00237 699 12 34 56', 'préfixe 00 espacé'],
    ['  699123456  ', 'espaces parasites'],
    ['(237) 699-12-34-56', 'parenthèses'],
    ['237/699/12/34/56', 'barres obliques'],
  ])('« %s » (%s) → +237699123456', (input) => {
    expect(normalizePhone(input)?.e164).toBe(EXPECTED);
  });

  it('produit un format international lisible pour l’affichage', () => {
    expect(normalizePhone('699123456')?.international).toBe('+237 6 99 12 34 56');
  });

  it('renseigne le pays', () => {
    expect(normalizePhone('699123456')?.country).toBe('CM');
  });
});

describe('normalizePhone — rejets', () => {
  it.each([
    ['', 'chaîne vide'],
    ['   ', 'espaces seuls'],
    ['abc', 'lettres'],
    ['12', 'trop court'],
    ['6991234', 'incomplet'],
    ['69912345678901', 'trop long'],
  ])('rejette « %s » (%s)', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('rejette null et undefined', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it('isValidPhone reflète le résultat', () => {
    expect(isValidPhone('699123456')).toBe(true);
    expect(isValidPhone('abc')).toBe(false);
  });
});

describe('requirePhone', () => {
  it('renvoie le numéro normalisé', () => {
    expect(requirePhone('699 12 34 56').e164).toBe('+237699123456');
  });

  it('lève une erreur explicite mentionnant la saisie fautive', () => {
    expect(() => requirePhone('abc')).toThrow(PhoneError);
    expect(() => requirePhone('abc')).toThrow(/abc/);
  });
});

describe('maskPhone', () => {
  it('conserve indicatif et 4 derniers chiffres', () => {
    expect(maskPhone('+237699123456')).toBe('+237•••••3456');
  });

  it('masque intégralement un numéro trop court', () => {
    expect(maskPhone('1234567')).toBe('•••••••');
  });
});

describe('guessCameroonOperator', () => {
  it('reconnaît les plages MTN', () => {
    expect(guessCameroonOperator('+237670123456')).toBe('MTN');
    expect(guessCameroonOperator('+237650123456')).toBe('MTN');
  });

  it('reconnaît les plages Orange', () => {
    expect(guessCameroonOperator('+237699123456')).toBe('ORANGE');
    expect(guessCameroonOperator('+237655123456')).toBe('ORANGE');
  });

  it('renvoie UNKNOWN hors Cameroun', () => {
    expect(guessCameroonOperator('+33612345678')).toBe('UNKNOWN');
  });

  it('renvoie UNKNOWN sur une longueur inattendue', () => {
    expect(guessCameroonOperator('+23769912')).toBe('UNKNOWN');
  });
});
