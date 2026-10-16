# Migration et validation des données

1. Geler les écritures de la source et conserver son export signé SHA-256.
2. Charger dans des tables de transit, jamais directement dans les tables métier.
3. Normaliser UTF-8, dates ISO, montants entiers XAF et téléphones E.164.
4. Dédupliquer élèves, responsables, références de paiement et couples opérateur/référence.
5. Importer référentiels, élèves, inscriptions, responsables, frais, puis paiements.
6. Représenter le passé par des paiements d’ouverture `SUCCESS` datés et référencés `OPENING-*`; ne jamais écrire directement un solde.
7. Affecter ces paiements avec le moteur normal et générer le journal d’audit d’import.
8. Exécuter les contrôles ci-dessous, signer, puis archiver transit et rapport.

Contrôles bloquants : effectifs par classe et totaux, frais dus et encaissés par classe, solde global, unicité matricules/références, téléphones E.164, allocations égales aux paiements moins reliquat, absence de paiement réussi négatif, et contrôle §88 sur 20 élèves aléatoires. Le rollback restaure le snapshot pré-import ; une correction financière est une extourne suivie d’un nouveau paiement.
