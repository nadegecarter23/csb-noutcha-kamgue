# CSB-03 — Matrice de cloisonnement interne

Chaque ligne est filtrée par le résolveur central et, pour les tables sensibles, par PostgreSQL RLS. Les tests positifs utilisent une portée `SCHOOL`; les tests négatifs une portée `UNIT` et une cible hors périmètre.

| Domaine | Point d’ancrage | Listes / recherche / compteurs | Documents et traitements |
|---|---|---|---|
| Référentiel, classes | unité, section, filière, classe | RLS testée positive et négative | duplication hérite des ancres |
| Élèves, inscriptions, responsables | inscription → classe | RLS testée, accès parent explicite | invitations et demandes filtrées |
| Pédagogie, emploi du temps, présences | classe | politiques RLS communes | devoirs et séances filtrés |
| Notes, bulletins | inscription | politiques RLS communes | vue PDF alimentée par lignes filtrées |
| Vie scolaire, santé, services | inscription | politiques RLS communes | prêts, transport et incidents filtrés |
| Finance, paiements, preuves | cibles de paiement → inscription | toutes les cibles doivent être visibles | reçus et fichiers héritent du paiement |
| Personnel | affectations organisationnelles | soi-même ou intersection de portée | exports soumis aux mêmes lectures |
| Imports, exports, fichiers | auteur + entité rattachée | demandeur ou portée globale | fichiers résolus par leur usage |
| Communication, notifications | expéditeur / destinataire | utilisateur concerné ou portée globale | aucun envoi transversal implicite |
| Audit | auteur | soi-même ou portée globale | vues financières en `security_invoker` |

Le JWT ne contient ni listes de classes ni listes d’élèves. Les portées sont relues en base à chaque requête; leur modification révoque les sessions de l’utilisateur.
