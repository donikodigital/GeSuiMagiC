<!-- frontend/README.md -->
# Suivi de Chantier — Frontend

Next.js 14 (App Router) + TypeScript + Tailwind CSS, consommant l'API du
backend NestJS.

## Demarrage rapide

```bash
npm install
cp .env.example .env.local     # renseigner NEXT_PUBLIC_API_URL
npm run dev
```

Le backend doit tourner (voir son propre README) et `NEXT_PUBLIC_API_URL`
doit pointer dessus, prefixe `/api` inclus (`http://localhost:4000/api` par defaut).

> Les polices (Fraunces, Inter, IBM Plex Mono) sont chargees via
> `next/font/google`, qui les televerse depuis Google Fonts au moment du
> build. Un environnement sans acces internet sortant echouera sur `next
> build` / `next dev` pour cette seule raison — c'est attendu sur
> Vercel/local avec acces internet normal.

## Identite visuelle

"Carnet de chantier" : bleu ardoise profond (`ink`/`blueprint`, coherent
avec l'en-tete des PDF generes cote backend), fond papier chaud
(`paper`/`concrete`), accent rouille (`rebar`) et jaune securite
(`safety`) pour les etats d'attente/alerte. **Tous les montants financiers
passent par la classe `.font-ledger`** (IBM Plex Mono, chiffres
tabulaires) — c'est la signature recurrente de l'interface, comme des
ecritures dans un registre.

## Structure

```
src/
  app/
    (auth)/            login, mot de passe oublie, invitation, reset password
    (app)/              coquille authentifiee (sidebar + topbar)
      dashboard/         tableau de bord (branche par role)
      projects/           liste, creation, [id]/ avec sous-onglets :
                            apercu, depots, depenses, budgets, avancement, journal,
                            achats, ouvriers, sous-traitance, qualite, documents,
                            presences, alimentation, superviseurs, anomalies, reglages
      clients/             gestion clients (superadmin)
      supervisors/         gestion superviseurs (client)
      materials/           catalogue (categories/materiaux/unites : global = superadmin,
                            entrees privees modifiables par leur client)
      anomalies/           signalements (vue superadmin)
      audit/               journal d'audit (lecture seule, superadmin)
      settings/            profil, mot de passe, reglages globaux
  components/
    ui/                 primitives (Button, Card, Dialog, DataTable...)
    layout/              Sidebar, Topbar, notifications
    shared/               PageHeader, ReasonDialog, CorrectionDialog, AttachmentsSection
    dashboard/            un composant par role
  hooks/                 React Query hooks (use-projects, use-deposits, use-expenses...)
  services/               un fichier par ressource API, miroir des endpoints backend
  lib/                   api-client (fetch + refresh auto), auth-store (zustand), format.ts,
                          offline/ (file d'attente IndexedDB + service worker), geo.ts, site-access.ts
  types/models.ts        miroir des enums/entites Prisma du backend
```

## Authentification

JWT (access + refresh) stockes via `zustand/persist` (localStorage).
`lib/api-client.ts` rafraichit automatiquement le token sur une 401 et
rejoue la requete une fois. Le refresh token est **tourne** a chaque
rafraichissement : les deux jetons sont donc enregistres, et synchronises
entre onglets. Les jetons restent dans localStorage (pas de cookie httpOnly). La garde de route est cote client
(`app/(app)/layout.tsx`) : pas de session cote serveur, adapte a une SPA
consommant une API stateless.

## Regle metier a connaitre : depenses jamais bloquees

Le formulaire de nouvelle depense affiche un avertissement quand le
montant depasse le seuil de validation automatique du projet, mais
**n'empeche jamais l'enregistrement** meme si le solde est insuffisant —
conformement a la regle definie cote backend, le solde peut devenir
negatif et reste visible tel quel sur le tableau de bord.

## Fonctionnement hors ligne

L'application est installable (PWA). Sans reseau, les saisies de terrain (depenses, journal, avancement, reserves,
livraisons, presences, paiements de marche) et leurs photos sont gardees sur l'appareil (IndexedDB) puis envoyees
automatiquement au retour du reseau, sans doublon (`clientRef`). Le panneau « Saisies hors ligne » permet de
corriger ou d'abandonner une saisie refusee par le serveur. Le cache de l'API est vide a la connexion et a la deconnexion.

## Ce qui n'est pas encore couvert

Paiement Mobile Money, signature electronique, OCR de factures, IA. Voir le README du backend pour le detail.
