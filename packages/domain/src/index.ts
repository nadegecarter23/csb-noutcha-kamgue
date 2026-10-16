/**
 * @cplan/domain — logique métier pure, SANS AUCUNE I/O.
 *
 * Règle d'architecture (docs/06-CONVENTIONS-DEV.md §3) : ce paquet ne connaît
 * ni base de données, ni HTTP, ni système de fichiers. Il ne contient que des
 * fonctions déterministes, testables en millisecondes, réutilisables aussi bien
 * par l'API que par l'application mobile (simulation hors ligne).
 *
 * Contenu prévu au fil des phases :
 *   Phase 00 → arithmétique FCFA, normalisation des numéros   ✓
 *   Phase 06 → résolution du tarif applicable, prorata des remises
 *   Phase 07 → moteur d'allocation, machine à états des paiements
 */

export * from './money/index.js';
export * from './phone/index.js';
export * from './billing/resolve-fee.js';
export * from './payments/allocation.js';
export * from './payments/state-machine.js';
