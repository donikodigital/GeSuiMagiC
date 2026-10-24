<!-- backend/README.md -->
# Suivi de Chantier — Backend

API NestJS + Prisma + PostgreSQL pour la plateforme de gestion financiere et
de suivi de chantier (cahier des charges v1.0).

## Stack

- **NestJS 11** + TypeScript (Node.js 20 minimum)
- **Prisma 5** + PostgreSQL (pense pour **Neon**)
- **JWT** (access + refresh token avec rotation) via Passport
- **SMTP / nodemailer** pour les emails transactionnels (file d'envoi en arriere-plan)
- **PDFKit** / **ExcelJS** pour les exports
- Stockage fichiers compatible **S3 / R2 / Supabase Storage** (uploads directs via URL presignee, le backend ne stocke que les metadonnees)

## Demarrage rapide

```bash
npm install
cp .env.example .env        # renseigner DATABASE_URL, DIRECT_URL, JWT_*, SMTP_*, STORAGE_*
npm run prisma:generate
npx prisma migrate deploy   # applique les migrations (dont 20261020090000_catalogue_ownership)
npm run prisma:seed         # catalogue global + premier superadmin (voir ci-dessous)
npm run start:dev
```

Toutes les variables sont documentees dans `.env.example`. En production,
l'application refuse de demarrer si `JWT_SECRET` / `JWT_REFRESH_SECRET` sont
identiques, font moins de 32 caracteres ou gardent la valeur `change-me`.

### Premier superadmin (seed)

Le seed **ne cree plus d'identifiants par defaut**. Pour creer le premier
superadmin, definir dans l'environnement :

```bash
SEED_SUPERADMIN_EMAIL="admin@ton-domaine.com"
SEED_SUPERADMIN_PASSWORD="..."   # 12 caracteres minimum, une lettre et un chiffre
npm run prisma:seed
```

Si un SUPERADMIN existe deja, le seed ne touche pas aux comptes. Le mot de
passe n'est jamais affiche. Retirez ces deux variables une fois le compte
cree et changez le mot de passe a la premiere connexion.

## Structure

```
src/
  auth/            connexion, invitation securisee, refresh token (rotation), reset password
  clients/         gestion des clients (par le superadmin) + self-service
  supervisors/      gestion des superviseurs (par le client), renvoi d'invitation
  projects/         projets + affectation des superviseurs
  wallets/           LE MOTEUR FINANCIER : solde = depots valides - depenses validees
  deposits/          workflow PENDING -> APPROVED/REJECTED, verrouillage, correction admin
  expenses/           workflow d'approbation par seuil, verrouillage, correction admin
  categories/ materials/ units/   catalogue (global + entrees privees par client)
  budgets/            budget previsionnel par categorie + comparaison
  attachments/        justificatifs (upload direct vers le stockage objet)
  storage/            URL presignees S3/R2, verification HeadObject, URL signees en lecture
  notifications/      emails (SMTP) + notifications in-app
  messages/           messagerie client <-> superviseur rattachee a une operation
  attendance/         etapes du chantier + calendrier des jours travailles (effectif par jour)
  meals/              alimentation des ouvriers : enveloppe mensuelle, reliquat, reports, demandes de comptes
  audit/               journal d'audit inviolable
  anomalies/           signalement client -> traitement superadmin
  settings/            reglages globaux / par projet
  reports/             export PDF et Excel
  common/              guards RBAC + multi-tenant, filtres d'erreur, utilitaires Decimal
```

## Regles metier importantes

### Le solde est toujours un calcul, jamais une valeur ecrite a la main

`Wallet.balance` est recalcule dans **la meme transaction Postgres**
(isolation `Serializable`, avec nouvelle tentative sur conflit P2034) que
toute operation qui le modifie : validation d'un depot, validation/annulation
d'une depense, correction administrative. Voir `WalletsService.recompute()`.

Les decisions (valider / rejeter) sont des mises a jour conditionnelles
(`WHERE status = 'PENDING'`) : deux decisions concurrentes sur la meme
operation ne peuvent pas toutes deux aboutir.

### ⚠️ Deviation assumee par rapport au cahier des charges d'origine (section 20)

Le cahier des charges d'origine prevoyait de **bloquer** toute depense dont
le montant depasse le solde disponible. **Sur demande explicite du client,
cette regle a ete retiree** : une depense n'est jamais refusee pour cause de
solde insuffisant. Si son montant depasse le solde, **le solde du projet
devient simplement negatif**, ce qui reste visible sur le tableau de bord et
dans l'historique. Voir le commentaire en tete de `ExpensesService.create()`
et le test `expenses.service.spec.ts`.

Le workflow de **seuil de validation** (section 19) reste actif : en
dessous du seuil configure par projet (`expenseApprovalThreshold`), la
depense est validee automatiquement ; au-dessus, elle passe en attente de
confirmation du client — mais cette confirmation ne verifie jamais le
solde, seulement le montant.

Le seuil ne peut pas etre contourne par fractionnement : les depenses d'un
meme auteur sur le meme projet sont cumulees sur une fenetre glissante
(`EXPENSE_CUMULATIVE_WINDOW_HOURS`, 24 h par defaut).

### Verrouillage financier (section 15)

Un depot ou une depense passe en `isLocked = true` des sa validation. Toute
modification ulterieure doit passer par `correctAmount()` (section 16/53),
qui cree une ligne `FinancialCorrection` et une entree d'audit avant de
recalculer le solde — l'ancienne valeur n'est jamais silencieusement
ecrasee. La devise d'un projet est figee des qu'il existe une operation.
Un projet suspendu, termine ou archive n'accepte plus de nouveau depot ni
de nouvelle depense.

### Securite multi-tenant (section 77)

`ProjectAccessGuard` (dans `common/guards/`) verifie systematiquement la
chaine complete **Utilisateur -> Client/Superviseur -> Projet** avant de
laisser passer une requete sur une ressource de projet. Il ne suffit jamais
de verifier `userId` seul. Les filtres d'acces (`projectAccessFilter`,
`catalogueReadFilter`) sont **fermes par defaut** : un role inconnu ne voit
rien, jamais « tout ».

### Catalogue : entrees globales et entrees privees

Categories, materiaux et unites ont un `ownerClientId` :

- `null` : entree **globale**, geree par le superadmin, visible de tous ;
- un client : entree **privee** de ce client, visible de lui et de ses
  superviseurs uniquement.

Un client gere uniquement ses propres entrees, le superadmin gere tout, un
superviseur peut creer mais pas modifier. L'unicite des noms est verifiee
par le service (insensible a la casse, par proprietaire) car Postgres
considere les `NULL` comme distincts dans un index unique. Un materiau
global ne peut pas referencer une categorie ou une unite privee. Une entree
invisible repond 404 ; visible mais non modifiable, 403 `CATALOGUE_FORBIDDEN`.

Les entrees deja presentes avant la migration restent **globales**.

### Authentification

- Access token 15 min, refresh token 30 jours, secrets distincts, `jti` unique par jeton.
- Le refresh token est hache (argon2) ; la rotation est atomique (compare-and-swap) et tolere un rejeu immediat (10 s) pour les onglets concurrents.
- A chaque requete, l'utilisateur est recharge depuis la base (cache d'identite de 15 s) : un compte desactive ou un superviseur revoque perd l'acces sans attendre l'expiration du jeton.
- Les jetons d'invitation et de reinitialisation sont a usage unique.
- Temps de reponse egalise entre « email inconnu » et « mauvais mot de passe ».

### Jours travailles et alimentation des ouvriers

- Le superviseur declare chaque jour (`PUT /projects/:id/work-days/:date`) : travaille ou non, nombre d'ouvriers, etape du chantier. Il ne peut saisir que les 14 derniers jours et jamais un jour futur ; le superadmin corrige tout. Chaque saisie est tracee dans l'audit.
- Les etapes (`/projects/:id/phases`) sont propres a chaque projet ; `POST .../phases/defaults` ajoute Fondation, Murs, Toiture, etc. (cree aussi a la creation d'un projet).
- Alimentation (`/projects/:id/meals/...`) : le client definit l'enveloppe du mois et le cout d'un repas par ouvrier et par jour. Justifie = jours-ouvriers x cout du repas ; depense = depenses validees de la categorie liee ; reliquat = disponible - depense. Le client peut demander des comptes au superviseur (notification + email) et reporter le reliquat sur un mois suivant (plafonne, transactionnel, trace).

## Tests

```bash
npm test              # tests unitaires + test de fumee de l'application (~530 tests)
npx tsc --noEmit      # verification des types
npm run test:e2e       # squelette e2e (a completer avec une base Postgres de test)
```

Les tests unitaires mockent Prisma ; il faut simplement que `npm run prisma:generate`
ait ete execute.

## Operations

- **Fichiers orphelins** : un fichier televerse mais jamais rattache a une
  operation reste dans le bucket. Une regle de cycle de vie seule ne peut pas
  les distinguer des justificatifs enregistres (meme prefixe) : il faut un
  nettoyage qui compare le bucket a la table `Attachment`, ou un dossier
  temporaire `tmp/` avec expiration.
- **Superviseur revoque** : ses depots `PENDING` ne sont pas rejetes
  automatiquement ; `revokeSupervisor` renvoie le nombre de depots en
  attente (`pendingDeposits`) pour que le client les traite.
- **Proxy** : derriere un reverse proxy, definir `TRUST_PROXY` (voir `.env.example`)
  pour que le rate-limit et l'audit voient la vraie IP.

## Suivi de chantier BTP

Fonctions (toutes sous `/projects/:projectId/...`, controle d'acces par fonction sur le chantier) :

| Domaine | Ressources |
|---|---|
| Cout et avancement par etape | `phases` (budget, planning), `phase-costs`, `progress` (avancement valide par un conducteur de travaux / architecte / client), `planning` (retards, raisons d'arret) |
| Journal de chantier | `site-logs` (meteo, effectifs, incidents, photos horodatees) |
| Materiaux | `purchase-orders`, `deliveries`, `stock` (articles, mouvements, consommation par etape, pertes) |
| Ouvriers | `workers`, `worker-presences`, `workers/:id/advances`, `pay-runs` (paie par periode, marche a la tache, avances) |
| Devis et sous-traitance | `suppliers`, `quote-lots` (metre, devis, comparaison, attribution), `contracts` (situations de travaux, retenue de garantie, acomptes, paiements) |
| Avenants | `change-orders` (valides par le client, impact budget et delai) |
| Qualite | `snags` (reserves), `receptions` (PV de reception, PDF) |
| Documents | `documents` reglementaires avec alertes d'expiration, `monthly-report` (+ PDF) |
| Anti-fraude | justificatif obligatoire au-dessus d'un seuil, validation technique prealable, geolocalisation des saisies, rejeu hors ligne sans doublon (`clientRef`) |
| Devises | depots en devise etrangere : montant envoye, taux, frais, taux reel moyen (`deposits/currency-summary`) |
| Messages | WhatsApp / SMS via Twilio (`/notifications/preferences`) |

Regles a connaitre :

- Fonctions sur un chantier : `SUPERVISOR` (saisie), `SITE_MANAGER` (conducteur de travaux), `ARCHITECT`, en plus du client et du superadmin. L'architecte ne depense pas et ne recoit pas de depot.
- Un paiement de marche ou une paie cree toujours une **depense** : les regles de justificatif, de validation technique et de validation du client s'appliquent donc a tout l'argent qui sort.
- Un avenant approuve ajoute son surcout au budget et ses jours a la date de fin (l'annulation par le superadmin les retire).
- Les saisies de terrain portent un `clientRef` : un renvoi apres coupure reseau ne cree jamais de doublon.

### Taches planifiees

`GET /api/cron/daily` (header `Authorization: Bearer <CRON_SECRET>`) envoie le rapport mensuel au client, les alertes
d'expiration de documents (60 / 30 / 14 / 7 jours et a l'echeance) et les rappels. Sur Vercel, ajouter dans
`backend/vercel.json` : `{"crons":[{"path":"/api/cron/daily","schedule":"0 6 * * *"}]}` et definir `CRON_SECRET`.

### Variables d'environnement ajoutees

`CRON_SECRET` (obligatoire pour le planificateur), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`,
`TWILIO_SMS_FROM`, `MESSAGING_TIMEOUT_MS` (facultatives : sans Twilio, emails et notifications dans l'application seulement).

## Ce qui n'est PAS encore dans cette livraison

- Paiement Mobile Money (Orange Money / MTN), signature electronique, OCR de factures, IA
- Application mobile native (le frontend est une application web installable, utilisable hors ligne)
- Les PDF generes (rapport mensuel, PV de reception) sont en texte seul, sans logo ni photos
