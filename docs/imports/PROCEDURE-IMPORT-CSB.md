# Reprise contrôlée des données CSB

## Séquence obligatoire

1. Sauvegarder la base et le stockage objet, puis relever les compteurs de contrôle.
2. Copier le modèle CSV ou télécharger le modèle Excel depuis `GET /api/v1/imports/template`.
3. Utiliser exactement les libellés de classes configurés. Une classe détermine son cycle, sa section et, au secondaire, sa filière.
4. Charger le fichier en prévisualisation et corriger toutes les erreurs. Les avertissements signalent notamment homonymes et responsables déjà partagés.
5. Télécharger le rapport d’anomalies. La validation ne modifie aucune donnée métier.
6. Exécuter l’import. Il progresse par lots de 100 lignes ; une reprise traite uniquement les lignes encore `VALID`.
7. Comparer les compteurs avant/après : élèves créés, inscriptions, responsables, liens et frais affectés. Rapprocher le nombre de lignes `IMPORTED`.

Une interruption laisse le lot en état `IMPORTING`. Relancer le même lot reprend les lignes restantes sans recréer celles déjà marquées `IMPORTED`. Un matricule existant ou dupliqué est bloquant. Le téléphone normalisé permet de partager un même responsable entre plusieurs enfants.

Les fichiers CSV dans ce dossier s’ouvrent directement dans Excel (séparateur point-virgule). L’API produit le classeur `.xlsx` final avec listes contrôlées à partir du référentiel réel de l’année choisie.
