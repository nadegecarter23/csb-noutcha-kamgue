import { describe, expect, it } from 'vitest';
import { reportCardFileName } from './report-cards.js';

describe('reportCardFileName', () => {
  it('nomme le bulletin avec l’élève, la période et le matricule', () => {
    expect(
      reportCardFileName({
        studentName: 'NGO BIYONG Marie-Clarisse Émilienne',
        periodName: 'Trimestre 1',
        studentNumber: 'CSB-2026-00142',
      }),
    ).toBe('Bulletin_NGO-BIYONG-Marie-Clarisse-Emilienne_Trimestre-1_CSB-2026-00142.pdf');
  });

  it('neutralise les caractères interdits dans un nom de fichier', () => {
    expect(
      reportCardFileName({ studentName: 'Zoë / "Ünal"', periodName: '', studentNumber: 'A:1' }),
    ).toBe('Bulletin_Zoe-Unal_A-1.pdf');
  });
});
