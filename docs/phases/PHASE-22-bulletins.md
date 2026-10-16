# Phase 22 — Bulletins

Statut : **Terminé** — 2026-10-02.

Les bulletins sont calculés à partir des évaluations publiées ou verrouillées. Le calcul respecte le mode configuré (`WEIGHTED_AVERAGE` ou `POINTS_TOTAL`), la règle d’absence et l’arrondi. La moyenne générale applique les coefficients des matières ; les ex æquo partagent le même rang lorsque le classement est activé. Les appréciations par matière, l’appréciation générale et la décision restent modifiables avant publication et sont conservées lors d’un recalcul.

La publication n’est possible qu’après clôture de la période et si toutes les moyennes sont calculées. Elle fige un instantané complet : les consultations et le PDF continuent d’utiliser cet instantané même si les données sources changent ensuite. Toutes les opérations sensibles sont auditées.

Les tests d’intégration couvrent les deux modes de calcul, les coefficients de matière, les absences, l’arrondi, le classement, la conservation des appréciations, le cycle de vie des périodes et l’immuabilité après publication.
