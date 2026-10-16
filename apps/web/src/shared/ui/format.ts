const labels: Record<string, string> = {
  PENDING: 'En attente',
  AWAITING_VALIDATION: 'À valider',
  SUCCESS: 'Payé',
  PAID: 'Payé',
  FAILED: 'Échoué',
  REVERSED: 'Annulé',
  READY: 'Prêt',
  PROCESSING: 'En préparation',
  ON_TRACK: 'À jour',
  PARTIAL: 'Paiement partiel',
  UNPAID: 'Non payé',
  OVERDUE: 'En retard',
  CASH: 'Espèces',
  MTN_MOMO: 'MTN Mobile Money',
  ORANGE_MONEY: 'Orange Money',
  BANK_TRANSFER: 'Virement bancaire',
  BANK_DEPOSIT: 'Dépôt bancaire',
  CHEQUE: 'Chèque',
  OTHER: 'Autre',
  STUDENTS_LIST: 'Liste des élèves',
  STUDENTS_BY_CLASS: 'Élèves par classe',
  PAID_STUDENTS: 'Élèves à jour',
  UNPAID_STUDENTS: 'Élèves avec impayés',
  STUDENT_FINANCIAL_STATEMENT: 'Situation financière d’un élève',
  PAYMENTS_BY_PERIOD: 'Paiements par période',
  PAYMENTS_BY_OPERATOR: 'Paiements par opérateur',
  PAYMENTS_BY_CLASS: 'Paiements par classe',
  RECEIPTS: 'Reçus',
  OUTSTANDING: 'Restes à recouvrer',
};

export function humanLabel(value: string | null | undefined) {
  if (!value) return '—';
  return (
    labels[value] ??
    value
      .replaceAll('_', ' ')
      .toLocaleLowerCase('fr-CM')
      .replace(/^./, (letter) => letter.toLocaleUpperCase('fr-CM'))
  );
}
