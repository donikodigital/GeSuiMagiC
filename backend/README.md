# Suivi de Chantier — Backend

API NestJS + Prisma + PostgreSQL pour la plateforme de gestion financiere et
de suivi de chantier (cahier des charges v1.0).

## Stack

- **NestJS 10** + TypeScript
- **Prisma 5** + PostgreSQL (pense pour **Neon**)
- **JWT** (access + refresh token avec rotation) via Passport
- **Resend** pour les emails transactionnels
- **PDFKit** / **ExcelJS** pour les exports
- Stockage fichiers compatible **S3 / R2 / Supabase Storage** (uploads directs via URL presignee, le backend ne stocke que les metadonnees)

## Demarrage rapide

```bash
npm install
cp .env.example .env        # renseigner DATABASE_URL, DIRECT_URL, JWT_SECRET, etc.
npm run prisma:migrate      # cree les tables
npm run prisma:seed         # catalogue materiaux/categories/unites + superadmin par defaut
npm run start:dev
```

Le superadmin par defaut est cree par le seed (`SEED_SUPERADMIN_EMAIL` /
`SEED_SUPERADMIN_PASSWORD` dans `.env`, valeurs par defaut sinon). **Changez
ce mot de passe immediatement en production.**

## Structure

```
src/
  auth/            connexion, invitation securisee, refresh token, reset password
  clients/         gestion des clients (par le superadmin) + self-service
  supervisors/      gestion des superviseurs (par le client)
  projects/         projets + affectation des superviseurs
  wallets/           LE MOTEUR FINANCIER : solde = depots valides - depenses validees
  deposits/          workflow PENDING -> APPROVED/REJECTED, verrouillage, correction admin
  expenses/           workflow d'approbation par seuil, verrouillage, correction admin
  categories/ materials/ units/   catalogue administrable
  budgets/            budget previsionnel par categorie + comparaison
  attachments/        justificatifs (upload direct vers le stockage objet)
  notifications/      emails (Resend) + notifications in-app
  audit/               journal d'audit inviolable
  anomalies/           signalement client -> traitement superadmin
  settings/            reglages globaux / par projet
  reports/             export PDF et Excel
  common/              guards RBAC + multi-tenant, filtres d'erreur, utilitaires Decimal
```

## Regles metier importantes

### Le solde est toujours un calcul, jamais une valeur ecrite a la main

`Wallet.balance` est recalcule dans **la meme transaction Postgres**
(isolation `Serializable`) que toute operation qui le modifie : validation
d'un depot, validation/annulation d'une depense, correction administrative.
Voir `WalletsService.recompute()`.

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

### Verrouillage financier (section 15)

Un depot ou une depense passe en `isLocked = true` des sa validation. Toute
modification ulterieure doit passer par `correctAmount()` (section 16/53),
qui cree une ligne `FinancialCorrection` et une entree d'audit avant de
recalculer le solde — l'ancienne valeur n'est jamais silencieusement
ecrasee.

### Securite multi-tenant (section 77)

`ProjectAccessGuard` (dans `common/guards/`) verifie systematiquement la
chaine complete **Utilisateur -> Client/Superviseur -> Projet** avant de
laisser passer une requete sur une ressource de projet. Il ne suffit jamais
de verifier `userId` seul.

## Tests

```bash
npm test              # tests unitaires (money.util, expenses workflow)
npm run test:e2e       # squelette e2e (a completer avec une base Postgres de test)
```

## Ce qui n'est PAS encore dans cette livraison (V2/V3 du cahier des charges)

- Journal de chantier avec photos horodatees (section 33)
- Etapes de progression du chantier avec dates/photos (section 60)
- Messagerie client <-> superviseur attachee a une transaction (section 61)
- Paiement Mobile Money (Orange Money / MTN), signature electronique, OCR de factures, IA (sections 80-81)
- Application mobile native

Le frontend (Next.js) sera livre dans un second temps.
