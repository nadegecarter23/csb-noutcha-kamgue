# CSB-00.2 — Inventaire du cloisonnement interne

Date de vérification : **2026-10-11**  
Périmètre : schéma Prisma, API Fastify, web React et application parent Expo.

## 1. Résultat exécutif

Le système protège actuellement les données à deux niveaux : permission fonctionnelle et établissement (`schoolId`, contexte serveur et RLS PostgreSQL). Il ne représente pas encore le périmètre interne du CSB — cycle, section linguistique, filière, classe ou affectations propres.

L'inventaire couvre :

- **89 modèles Prisma** et **68 enums** ;
- **267 endpoints** répartis dans **27 modules de routes** ;
- **43 chemins web** déclarés, dont 37 routes métier, plus le profil authentifié ;
- **18 écrans mobiles parent** hors layout.

Constats structurants :

1. `EducationCycle` contient actuellement `MATERNELLE`, `PRIMAIRE`, `COLLEGE`, `LYCEE`, `AUTRE`. Il manque `CRECHE` et le secondaire est scindé à tort entre collège et lycée au regard des décisions CSB.
2. `GradeLevel` porte un cycle nullable ; `Class` ne porte ni section linguistique ni filière.
3. Il n'existe ni `StaffAssignment`, ni `UserAccessScope`, ni caisse/budget par cycle.
4. Les gardes serveur contrôlent la permission et l'établissement, mais pas encore le périmètre de données interne.
5. Le web sélectionne l'année scolaire, mais aucun sélecteur de cycle/section/filière n'existe.

## 2. Règle d'architecture retenue pour les phases suivantes

Le cloisonnement ne doit pas être matérialisé aveuglément sur chaque table. Chaque donnée appartient à l'une des catégories suivantes :

| Catégorie | Règle cible | Exemples |
|---|---|---|
| Ancrage organisationnel direct | Stocker explicitement l'unité/cycle et, selon le cas, section/filière | classe, affectation du personnel, caisse, session de caisse, budget, séquence documentaire |
| Héritage scolaire | Résoudre le périmètre par `classId`, `enrollmentId` ou une affectation pédagogique | présence, note, bulletin, incident, devoir |
| Héritage financier | Conserver un cycle explicite immuable sur l'écriture source et vérifier la cohérence des relations | paiement, allocation, reçu, dépense, règlement fournisseur |
| Ciblage de diffusion | Conserver une audience structurée, éventuellement multi-périmètre | annonce, événement, notification |
| Référentiel global au CSB | Autoriser la vue globale mais filtrer les usages locaux | année scolaire, catégorie d'élève, fournisseur, modèle documentaire |
| Donnée personnelle ou plateforme | Ne pas lui ajouter de cycle ; contrôler l'accès à travers ses relations | utilisateur, session, OTP, appareil parent |

Cette distinction évite les duplications incohérentes tout en rendant les écritures financières et les contrôles d'accès auditables.

## 3. Inventaire des tables

### 3.1 Nouveaux ancrages indispensables

| Entité cible | Rôle | Phases concernées |
|---|---|---|
| `SchoolUnit` ou `EducationCycle` relationnel | `CRECHE`, `MATERNELLE`, `PRIMAIRE`, `SECONDAIRE` | CSB-01 |
| `LanguageSection` | `FRANCOPHONE`, `ANGLOPHONE` | CSB-01 |
| `EducationTrack` | `GENERAL`, `TECHNIQUE`, uniquement au secondaire | CSB-01 |
| `StaffAssignment` | Affectations multiples d'un employé aux unités, sections, filières, classes ou services | CSB-02/04 |
| `UserAccessScope` | Portée des permissions d'un utilisateur/rôle, séparée du rôle fonctionnel | CSB-02 |
| `CycleCashDesk` ou équivalent | Caisse et numérotation propres à chaque cycle | CSB-06 |
| `CycleBudget` et lignes | Budget et dépenses ventilés par cycle | CSB-06 |
| Ciblage de communication | Audience par unité/section/filière/classe | CSB-03/07 |

### 3.2 Fondations et sécurité — 14 modèles

| Modèles | État actuel | Action de cloisonnement |
|---|---|---|
| `School`, `SchoolSettings`, `SchoolModuleSetting` | Niveau établissement | Restent globaux au CSB ; les modules pourront avoir une configuration locale uniquement si un besoin métier est validé |
| `NumberSequence` | Portée école/type | Ajouter une portée par cycle pour reçus, caisses et documents financiers |
| `File` | Isolé par école | Ajouter/valider le périmètre hérité de l'objet propriétaire lors de toute lecture ou URL signée |
| `User`, `Session`, `OtpCode` | Utilisateur plateforme, multi-école | Ne pas ajouter de cycle ; résoudre les périmètres depuis les affectations et invalider les sessions lors d'un changement |
| `Role`, `Permission`, `RolePermission`, `UserRole` | RBAC fonctionnel par école | Conserver la permission séparée de la portée ; relier `UserRole` ou une nouvelle entité à `UserAccessScope` |
| `StaffProfile`, `StaffLeave` | Personnel rattaché seulement à l'école | Introduire `StaffAssignment`; les congés restent RH et ne doivent pas devenir visibles via une simple portée pédagogique |

### 3.3 Référentiel scolaire et pédagogie — 20 modèles

| Modèles | Source de périmètre cible | Action |
|---|---|---|
| `AcademicYear` | Établissement | Global au CSB, avec structures/classes ventilées en dessous |
| `GradeLevel` | Cycle + section/filière selon la modélisation retenue | Remplacer le cycle nullable et corriger l'enum actuel ; décider si la section/filière appartient au niveau ou à l'offre de niveau |
| `Class` | Cycle, section linguistique, filière, année | Ancrage principal obligatoire ; aucune classe active sans combinaison valide |
| `StudentCategory` | Établissement | Référentiel global, utilisable dans tous les périmètres |
| `Subject` | Établissement ou offre pédagogique | Ajouter une association permettant les matières communes ou spécifiques à une section/filière |
| `TeachingAssignment` | Classe + enseignant | Hérite de la classe ; vérifier aussi que l'enseignant possède une affectation compatible |
| `TimetableRoom` | Établissement ou unité | Ajouter une unité optionnelle si les salles sont réservées à un cycle |
| `TimetableEntry` | Affectation pédagogique + classe | Héritage strict ; refuser les salles/enseignants incompatibles |
| `AttendanceSession`, `AttendanceRecord` | Classe puis inscription | Héritage strict ; listes, saisie et validation limitées aux classes autorisées |
| `AcademicPeriod` | Année et éventuellement cycle/parcours | Prévoir des calendriers distincts si les périodes diffèrent par cycle |
| `AssessmentType`, `Competency` | Établissement ou offre pédagogique | Prévoir une portée optionnelle par cycle/section/filière |
| `GradingPolicy` | Année + cycle | Étendre aux sections/filières et aux évaluations qualitatives crèche/maternelle |
| `Assessment`, `AssessmentCompetency`, `Grade` | Classe/évaluation/inscription | Héritage strict, y compris pour saisie, publication et statistiques |
| `ReportCard`, `ReportCardSubject` | Inscription + période | Héritage strict et conservation du périmètre dans l'instantané publié |
| `Homework` | Classe | Héritage strict ; diffusion seulement aux familles de la classe |

### 3.4 Élèves, responsables et vie scolaire — 11 modèles

| Modèles | Source de périmètre cible | Action |
|---|---|---|
| `Student` | Dossier permanent | Ne pas figer un cycle sur l'élève ; la portée vient des inscriptions visibles |
| `Enrollment` | Classe/année | Hérite de la classe et constitue l'ancrage historique des changements de périmètre |
| `StudentClassChange` | Inscription + classes origine/destination | Vérifier les deux périmètres et conserver l'historique sans réécriture |
| `Guardian`, `StudentGuardian` | Enfants liés | Accès personnel parent inchangé ; accès staff limité aux élèves visibles |
| `GuardianInvite`, `GuardianInviteUse`, `GuardianLinkRequest` | Élève ciblé | Filtrer traitement, impression et litiges par périmètre de l'élève |
| `StudentIncident`, `DisciplinaryAction` | Inscription | Héritage strict ; séparer accès disciplinaire et santé |
| `HealthVisit` | Inscription | Héritage strict plus permission médicale dédiée, sans visibilité induite pour les fonctions globales non médicales |

### 3.5 Finance, caisse et paiements — 16 modèles

| Modèles | Source de périmètre cible | Action |
|---|---|---|
| `FeeType` | Établissement | Référentiel global possible |
| `FeeStructure`, `FeeInstallment` | Année + niveau/classe | Rendre le cycle explicite ou dérivable sans ambiguïté ; vérifier section/filière |
| `StudentFeeAssignment`, `StudentFeeInstallment`, `Discount` | Inscription | Héritage via inscription, contrôlé lors de toute remise ou recalcul |
| `Payment` | **Cycle explicite obligatoire** | Interdire les paiements couvrant plusieurs cycles ; préserver le cycle lors des webhooks et contrepassations |
| `PaymentTarget`, `PaymentAllocation` | Paiement + inscription | Vérifier que toutes les cibles appartiennent au cycle immuable du paiement |
| `ExternalPaymentDeclaration`, `ExternalPaymentProof` | Inscription + paiement | Hériter et vérifier le cycle à la soumission et à la validation |
| `PaymentProviderEvent`, `MobileMoneyReconciliation` | Paiement | Conserver le cycle d'origine, y compris pour événements orphelins résolus plus tard |
| `CashSession`, `CashSessionMovement` | **Caisse/cycle explicite obligatoire** | Une session appartient à une caisse de cycle ; le caissier doit être affecté à ce cycle |
| `Receipt` | **Cycle explicite obligatoire** | Numérotation indépendante par cycle ; cycle copié dans l'instantané |

### 3.6 Achats et dépenses — 6 modèles

| Modèles | Source de périmètre cible | Action |
|---|---|---|
| `Supplier`, `ExpenseCategory` | Établissement | Référentiels globaux, consultables selon permission |
| `PurchaseOrder`, `PurchaseOrderLine` | Cycle demandeur | Ajouter un cycle obligatoire sur le bon et vérifier ses lignes |
| `Expense` | **Cycle explicite obligatoire** | Ajouter cycle et budget/ligne budgétaire ; validations dans le même périmètre |
| `SupplierPayment` | Dépense + caisse | Vérifier l'identité de cycle entre dépense, règlement et session de caisse |

### 3.7 Communication et services — 10 modèles

| Modèles | Source de périmètre cible | Action |
|---|---|---|
| `Announcement`, `SchoolEvent` | Audience structurée | Permettre établissement, cycle, section, filière et classe ; le chargé de communication peut publier globalement sans obtenir d'autres lectures sensibles |
| `SchoolMessage` | Expéditeur/destinataire | Vérifier que le destinataire est joignable dans le mandat de l'expéditeur |
| `LibraryBook`, `CanteenMeal`, `TransportRoute`, `InventoryItem` | Établissement ou unité opérationnelle | Décider par service si la ressource est globale ou rattachée à un cycle ; ne jamais déduire une visibilité globale de la permission de gestion seule |
| `LibraryLoan`, `TransportEnrollment` | Inscription | Hériter du cycle de l'élève et vérifier la ressource de service |
| `InventoryMovement` | Article | Hériter de l'article et tracer le cycle lorsqu'il existe |

### 3.8 Imports, reporting, notifications et audit — 12 modèles

| Modèles | Source de périmètre cible | Action |
|---|---|---|
| `ImportBatch`, `ImportRow` | Année + périmètre déclaré par ligne | Exiger cycle, section, filière et classe ; rapports d'erreurs filtrés comme les données importées |
| `SavedReportQuery`, `ExportJob` | Utilisateur + portée au moment de la demande | Sauvegarder le périmètre autorisé et le revalider à l'exécution/téléchargement |
| `DocumentTemplate` | Établissement | Modèle global, rendu avec données déjà filtrées |
| `IdempotencyKey` | Utilisateur/opération | Ne pas ajouter de cycle ; inclure la portée dans le hash métier si l'opération est cloisonnée |
| `Device`, `NotificationPreference` | Utilisateur | Personnel, sans cycle direct |
| `Notification`, `NotificationDelivery`, `NotificationTemplate` | Destinataire/campagne | Conserver la provenance de cycle pour les envois métier et filtrer les statistiques |
| `AuditLog` | Acteur + objet | Ajouter le périmètre résolu aux métadonnées afin de démontrer les refus et accès croisés |

Les 89 modèles existants sont ainsi couverts par l'inventaire. Les tables enfants sans `schoolId` direct (`AssessmentCompetency`, `DisciplinaryAction`, `ImportRow`, `FeeInstallment`, `StudentFeeInstallment`, `Discount`, etc.) doivent rester protégées par leur parent et ne jamais être chargées sans jointure ou prédicat de portée.

## 4. Inventaire des endpoints API

### 4.1 Situation actuelle

Les routes staff utilisent généralement `authenticate`, `requireSchoolContext` et `requirePermission`. Ce triplet répond à « qui est connecté, dans quelle école, et que peut-il faire ? », mais pas à « sur quelles données internes peut-il le faire ? ».

La cible commune des 267 endpoints est un résolveur serveur central produisant un contexte de portée autorisé. Les identifiants reçus (`class_id`, `enrollment_id`, `payment_id`, etc.) devront être revalidés contre ce contexte avant toute lecture ou mutation. Les filtres transmis par le client ne constituent jamais une barrière.

### 4.2 Matrice complète par module de routes

| Module | Endpoints | Portée dominante | Adaptation requise |
|---|---:|---|---|
| `academic` | 19 | année, niveau, classe | Filtrer niveaux/classes et valider les combinaisons cycle-section-filière |
| `assessments` | 9 | classe, affectation, période | Limiter paramétrage, saisie et publication aux classes autorisées |
| `attendance` | 5 | classe, affectation enseignant | Restreindre listes, appels, validations et justificatifs |
| `audit` | 1 | portée de l'objet audité | Filtrer les journaux ; conserver une vue globale seulement pour les rôles autorisés |
| `cash` | 9 | caisse/cycle | Exiger le cycle à l'ouverture, la recherche élève, l'encaissement, la clôture et le PDF |
| `communications` | 5 | audience/mandat | Ajouter ciblage et filtrage sans ouvrir notes, santé ou finances |
| `exports` | 13 | mêmes données que la source | Propager exactement la portée aux impressions, exports et téléchargements |
| `external-payments` | 11 | inscription/paiement/cycle | Parent limité à ses enfants ; staff limité aux cycles financiers autorisés |
| `finance` | 23 | inscription, structure de frais, paiement, reçu | Appliquer cycle explicite et cohérence de bout en bout |
| `guardians` | 20 | élève/classe | Filtrer responsables, invitations, impressions de classe et litiges |
| `health` | 3 | plateforme | `/health` et `/metrics` hors portée métier ; aucune donnée scolaire exposée |
| `identity` | 27 | école, rôle, affectation | Ajouter gestion des affectations/périmètres et révocation de sessions ; auth/OTP restent personnels |
| `imports` | 11 | année, classe, portée de chaque ligne | Modèles, validation, exécution, rapports et réinscription doivent imposer le périmètre |
| `mobile-money` | 8 | paiement/cycle | Préserver le cycle dans initiation, suivi, investigation, événements et rapprochement |
| `notifications` | 14 | destinataire/campagne | Parent personnel ; administration et statistiques filtrées par portée |
| `parent` | 8 | enfants liés | Aucun sélecteur staff ; portée dérivée des associations acceptées |
| `pedagogy` | 5 | classe, matière, enseignant | Filtrer aperçu/matières et valider les affectations croisées |
| `portal` | 1 | utilisateur et affectations | Composer le portail uniquement avec les données autorisées |
| `procurement` | 14 | cycle demandeur/dépense | Ajouter cycle, budget et validations cohérentes |
| `report-cards` | 5 | classe/inscription/période | Restreindre génération, édition, publication et PDF |
| `reporting` | 13 | agrégats multi-périmètre | Appliquer la portée aux compteurs, tendances, recherche et requêtes sauvegardées |
| `school-modules` | 2 | établissement | Reste global sauf décision ultérieure de configuration par cycle |
| `school-services` | 9 | ressource de service ou inscription | Définir la portée propre à bibliothèque, cantine, transport et stocks |
| `staff` | 5 | RH et affectations | Séparer visibilité RH, organigramme et données d'affectation |
| `student-life` | 6 | inscription | Restreindre discipline et santé avec permissions distinctes |
| `students` | 15 | inscription/classe | Filtrer recherche, dossiers, inscriptions, transferts, suppressions et dashboard |
| `timetable` | 6 | classe, enseignant, salle | Filtrer listes et publication ; vérifier toutes les références croisées |
| **Total** | **267** | | |

### 4.3 Endpoints à risque prioritaire

Les familles suivantes doivent recevoir des tests négatifs avant toute ouverture multi-périmètre :

1. recherches globales et rapides : `/search`, `/students`, `/students/quick-search`, `/guardians`, `/staff` ;
2. agrégats et tableaux de bord : `/dashboard/registrar`, `/reports/*`, `/procurement/overview`, `/portal` ;
3. exports, PDF et fichiers : `/exports/*`, `/print/*`, reçus, bulletins, fiches d'association, justificatifs privés ;
4. opérations financières : sessions de caisse, paiements, allocations, reçus, remises, dépenses et règlements ;
5. opérations de masse : imports, réinscriptions, génération/publication de bulletins, publication d'emplois du temps, diffusions ;
6. tâches asynchrones : notifications, webhooks Mobile Money, rapprochements et exports différés.

## 5. Inventaire des écrans web

### 5.1 Shell applicatif

`AppLayout` affiche actuellement l'établissement courant et un sélecteur d'année scolaire. Il devra recevoir :

- un périmètre actif visible (cycle, puis section/filière si applicable) ;
- une option « Tous mes périmètres » uniquement quand l'utilisateur y est autorisé ;
- des clés de cache incluant la portée ;
- une navigation filtrée par permission **et** disponibilité réelle dans le périmètre ;
- un blocage explicite des formulaires financiers ou scolaires sans portée résolue.

### 5.2 Écrans concernés

| Groupe | Routes web | Adaptation |
|---|---|---|
| Référentiel | `/school`, `/academic-years`, `/grade-levels`, `/classes`, `/classes/:id`, `/settings` | Administrer la structure CSB et afficher cycle/section/filière |
| Scolarité | `/students`, `/students/new`, `/students/:id`, `/guardian-requests`, `/students/import`, `/students/reenroll` | Filtrer élèves/classes et sécuriser toutes les mutations/transferts |
| Pédagogie | `/pedagogy`, `/timetable`, `/attendance`, `/assessments`, `/report-cards` | Afficher seulement affectations/classes autorisées ; montrer le contexte actif |
| Vie scolaire et RH | `/student-life`, `/staff` | Séparer discipline, santé, organigramme et données RH confidentielles |
| Communication et services | `/communications`, `/services`, `/notifications-admin` | Ciblage par périmètre ; services globaux ou locaux clairement identifiés |
| Finance | `/fees`, `/payments`, `/mobile-money`, `/external-payments`, `/cashier`, `/procurement` | Cycle obligatoire, caisse active visible, aucune fusion implicite |
| Pilotage | `/accounting`, `/reports/class-status`, `/reports/advanced`, `/direction`, `/exports`, `/audit` | Agrégats ventilés, consolidé égal à la somme des périmètres autorisés |
| Administration | `/users`, `/roles` | Gérer séparément rôles et périmètres ; prévisualiser les accès effectifs |
| Portail acteur | `/portal` | Composer les données depuis les affectations propres de l'utilisateur |
| Neutres | `/login`, `/forgot-password`, `/profile`, `/status`, redirections `/` et `*` | Pas de filtre métier direct ; le profil doit montrer les affectations utiles |

## 6. Inventaire de l'application parent

| Écrans | Portée | Adaptation |
|---|---|---|
| `login`, `register`, `verify`, `profile`, `index` | Utilisateur | Pas de cycle direct |
| `add-child`, `scanner`, `associations` | Enfant/association | Préserver le cycle de l'élève sans l'utiliser comme autorisation parent |
| `home`, `children`, `child/[id]` | Enfants acceptés | Afficher cycle, section et classe pour lever toute ambiguïté |
| `payments`, `pay/[id]`, `external-payment` | Inscription/paiement | Empêcher un paiement multi-cycle et afficher clairement le cycle bénéficiaire |
| `payment-waiting`, `payment-success`, `payment-failed` | Paiement initié | Conserver le cycle dans tout le suivi de statut |
| `notifications` | Destinataire | Présenter la provenance du cycle lorsque le message est ciblé |

Le parent ne doit pas recevoir un sélecteur de portée équivalent au back-office : son autorisation vient exclusivement des associations enfant-parent acceptées.

## 7. Points transversaux hors écrans

| Surface | Risque | Exigence |
|---|---|---|
| `withSchoolScope` et RLS | Isolation limitée à l'école | Étendre la stratégie sans affaiblir la barrière actuelle ; privilégier un contexte serveur central |
| Contrats Zod | DTO sans structure CSB | Ajouter identifiants/labels de cycle, section, filière et portées effectives |
| Cache React Query | Collision entre périmètres | Inclure la portée active dans les `queryKey` et invalider lors d'un changement |
| Seed | Données concentrées sur 7 niveaux/9 classes | Créer un jeu cohérent dans les quatre cycles et les deux sections |
| Workers/webhooks | Contexte utilisateur absent | Transporter ou résoudre le cycle depuis l'écriture source immuable |
| Stockage privé | URL obtenue via un identifiant | Autoriser après résolution du périmètre de l'objet propriétaire |
| Audit | Difficulté à prouver le cloisonnement | Enregistrer portée demandée, portée effective et motif de refus |
| Indexation | Filtres supplémentaires | Ajouter des index composites selon les requêtes réelles, après choix du modèle CSB-01 |

## 8. Ordre de traitement recommandé

1. `CSB-01` : créer le référentiel organisationnel et rattacher niveaux/classes.
2. `CSB-02` : créer affectations et portées, puis un résolveur serveur unique.
3. `CSB-03` : appliquer le résolveur module par module, en commençant par recherche/export/reporting et mutations financières.
4. `CSB-04` à `CSB-06` : spécialiser RH, pédagogie et finances sans dupliquer la logique de sécurité.
5. `CSB-07` : exposer le périmètre effectif dans le shell et les formulaires.

## 9. Critères de clôture de CSB-00.2

- [x] Tous les modèles Prisma existants sont classés.
- [x] Les 267 endpoints sont comptés et regroupés par module avec leur adaptation cible.
- [x] Les 43 chemins web et les 18 écrans mobiles sont couverts.
- [x] Les zones à risque transversal sont identifiées.
- [x] Aucun changement de schéma, de contrat ou de comportement métier n'a été appliqué.

La prochaine tâche est `CSB-00.3` : ajouter des tests de caractérisation du comportement actuel, en donnant la priorité aux recherches, rapports, exports, écritures scolaires et flux financiers qui devront ensuite être cloisonnés.
