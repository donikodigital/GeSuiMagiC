//backend/prisma/seed.ts
/**
 * Seed du catalogue GLOBAL initial (marche guinéen) - sections 21 a 31 du cahier des charges
 * + creation du premier superadmin.
 *
 * Idempotent : peut etre relance sans dupliquer. Les entrees globales ont
 * `ownerClientId = null` ; comme PostgreSQL considere les NULL comme distincts
 * dans un index unique, on ne peut pas utiliser `upsert` : on cherche puis on cree.
 *
 * SECURITE : aucun identifiant par defaut. SEED_SUPERADMIN_EMAIL et
 * SEED_SUPERADMIN_PASSWORD sont OBLIGATOIRES a la creation du superadmin (avant,
 * un email et un mot de passe etaient ecrits en dur dans le depot). Le mot de
 * passe n'est jamais affiche.
 *
 * Usage: SEED_SUPERADMIN_EMAIL=... SEED_SUPERADMIN_PASSWORD=... npm run prisma:seed
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// --------------------------------------------------------------------------
// Unites (section 31)
// --------------------------------------------------------------------------
const UNITS: { name: string; symbol: string }[] = [
  { name: 'Sac', symbol: 'sac' },
  { name: 'Tonne', symbol: 't' },
  { name: 'Kilogramme', symbol: 'kg' },
  { name: 'Metre cube', symbol: 'm3' },
  { name: 'Metre carre', symbol: 'm2' },
  { name: 'Metre lineaire', symbol: 'm' },
  { name: 'Litre', symbol: 'L' },
  { name: 'Camion', symbol: 'camion' },
  { name: 'Voyage', symbol: 'voyage' },
  { name: 'Journee', symbol: 'j' },
  { name: 'Forfait', symbol: 'forfait' },
  { name: 'Piece', symbol: 'pc' },
  { name: 'Barre', symbol: 'barre' },
  { name: 'Paquet', symbol: 'paquet' },
  { name: 'Rouleau', symbol: 'rouleau' },
];

// --------------------------------------------------------------------------
// Categories + materiaux (sections 21 a 30)
// group sert uniquement a organiser l'affichage cote frontend.
// --------------------------------------------------------------------------
const CATALOG: { category: string; group: string; materials: string[] }[] = [
  {
    category: 'Agregats',
    group: 'Gros oeuvre',
    materials: [
      'Sable de riviere',
      'Sable de carriere',
      'Gravier 5/15',
      'Gravier 15/25',
      'Laterite',
      'Moellons',
      'Pierres',
      'Tout-venant',
      'Agregat - Autre',
    ],
  },
  {
    category: 'Blocs et briques',
    group: 'Gros oeuvre',
    materials: [
      'Brique ciment',
      'Brique terre cuite',
      'Agglos',
      'Parpaings',
      'Bloc plein',
      'Bloc creux',
      'Hourdis',
      'Bloc - Autre',
    ],
  },
  {
    category: 'Ciment',
    group: 'Gros oeuvre',
    materials: ['Ciment 32,5', 'Ciment 42,5', 'Ciment 52,5', 'Ciment ordinaire', 'Ciment - Autre'],
  },
  {
    category: 'Fer / acier',
    group: 'Gros oeuvre',
    materials: [
      'Fer 6',
      'Fer 7',
      'Fer 8',
      'Fer 10',
      'Fer 12',
      'Fer 14',
      'Fer 16',
      'Fer 20',
      'Fil recuit',
      'Treillis soude',
      'Corniere',
      'Profile metallique',
      'Fer - Autre',
    ],
  },
  {
    category: 'Bois',
    group: 'Charpente / coffrage',
    materials: [
      'Planche',
      'Madrier',
      'Bastaing',
      'Chevron',
      'Poteau bois',
      'Contreplaque',
      'Coffrage',
      'Bois - Autre',
    ],
  },
  {
    category: 'Toiture',
    group: 'Couverture',
    materials: [
      'Tole bac',
      'Tole ondulee',
      'Tole aluminium',
      'Faitiere',
      'Gouttiere',
      'Tuile',
      'Charpente',
      'Vis',
      'Clous',
      'Toiture - Autre',
    ],
  },
  {
    category: 'Electricite',
    group: 'Second oeuvre',
    materials: [
      'Cable',
      'Fil electrique',
      'Gaine',
      'Interrupteur',
      'Prise',
      'Disjoncteur',
      'Tableau electrique',
      'Ampoule',
      'Douille',
      'Boite electrique',
      'Mise a la terre',
      'Electricite - Accessoires',
    ],
  },
  {
    category: 'Plomberie',
    group: 'Second oeuvre',
    materials: [
      'Tuyau PVC',
      'Tuyau PPR',
      'Raccord',
      'Robinet',
      'Vanne',
      'Evier',
      'WC',
      'Lavabo',
      'Douche',
      'Chauffe-eau',
      'Pompe',
      'Reservoir',
      'Plomberie - Accessoires',
    ],
  },
  {
    category: 'Carrelage et finition',
    group: 'Finitions',
    materials: [
      'Carrelage sol',
      'Carrelage mural',
      'Faience',
      'Colle',
      'Joint',
      'Peinture',
      'Enduit',
      'Platre',
      'Sous-couche',
      'Vernis',
      'Papier abrasif',
      'Solvant',
      'Finition - Accessoires',
    ],
  },
  {
    category: 'Portes et fenetres',
    group: 'Menuiserie',
    materials: [
      'Porte metallique',
      'Porte bois',
      'Porte aluminium',
      'Porte PVC',
      'Fenetre aluminium',
      'Fenetre PVC',
      'Vitre',
      'Serrure',
      'Poignee',
      'Charniere',
      'Menuiserie - Accessoires',
    ],
  },
  {
    category: "Main-d'oeuvre",
    group: 'Personnel',
    materials: [
      'Macon',
      'Aide-macon',
      'Ferrailleur',
      'Coffreur',
      'Electricien',
      'Plombier',
      'Carreleur',
      'Peintre',
      'Menuisier',
      'Soudeur',
      'Charpentier',
      'Manoeuvre',
      'Gardien',
      "Conducteur d'engins",
      'Architecte',
      'Ingenieur',
      'Geometre',
      "Main-d'oeuvre - Autre",
    ],
  },
  {
    category: 'Services et frais',
    group: 'Services',
    materials: [
      'Transport',
      'Location vehicule',
      'Location betonniere',
      'Location engin',
      'Livraison',
      'Architecte (etude)',
      'Etude',
      'Permis',
      'Geometre (prestation)',
      "Main-d'oeuvre (prestation externe)",
      'Hebergement',
      'Communication',
      'Frais administratifs',
      'Frais divers',
      'Service - Autre',
    ],
  },
];

/** Mot de passe du superadmin : 12 caracteres minimum, au moins une lettre et un chiffre. */
function assertStrongPassword(password: string) {
  if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('SEED_SUPERADMIN_PASSWORD doit contenir au moins 12 caracteres, dont une lettre et un chiffre.');
  }
}

async function seedCatalogue() {
  console.log('Seed: unites...');
  const unitMap = new Map<string, string>();
  for (const u of UNITS) {
    const existing = await prisma.unit.findFirst({ where: { ownerClientId: null, name: u.name } });
    const unit = existing
      ? await prisma.unit.update({ where: { id: existing.id }, data: { symbol: u.symbol } })
      : await prisma.unit.create({ data: { name: u.name, symbol: u.symbol, ownerClientId: null } });
    unitMap.set(u.name, unit.id);
  }

  console.log('Seed: categories et materiaux...');
  const ensureCategory = async (name: string, group: string) => {
    const existing = await prisma.expenseCategory.findFirst({ where: { ownerClientId: null, name } });
    return existing
      ? prisma.expenseCategory.update({ where: { id: existing.id }, data: { group } })
      : prisma.expenseCategory.create({ data: { name, group, ownerClientId: null } });
  };

  for (const entry of CATALOG) {
    const category = await ensureCategory(entry.category, entry.group);

    for (const materialName of entry.materials) {
      const existing = await prisma.material.findFirst({
        where: { ownerClientId: null, categoryId: category.id, name: materialName },
        select: { id: true },
      });
      if (!existing) {
        await prisma.material.create({ data: { name: materialName, categoryId: category.id, ownerClientId: null } });
      }
    }
  }

  // Categorie generique pour les elements personnalises (section 30)
  await ensureCategory('Element personnalise', 'Autre');
}

async function seedSuperadmin() {
  console.log('Seed: superadmin...');
  const email = process.env.SEED_SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPERADMIN_PASSWORD;

  const alreadyHasSuperadmin = (await prisma.user.count({ where: { role: 'SUPERADMIN' } })) > 0;
  if (alreadyHasSuperadmin) {
    console.log('   -> Un superadmin existe deja, ignore.');
    return;
  }

  if (!email || !password) {
    throw new Error(
      'Aucun superadmin en base : definissez SEED_SUPERADMIN_EMAIL et SEED_SUPERADMIN_PASSWORD pour le creer (aucune valeur par defaut).',
    );
  }
  assertStrongPassword(password);

  const passwordHash = await argon2.hash(password);
  await prisma.user.create({ data: { email, passwordHash, role: 'SUPERADMIN', status: 'ACTIVE' } });
  console.log(`   -> Superadmin cree : ${email}`);
}

async function main() {
  await seedCatalogue();
  await seedSuperadmin();
  console.log('Seed termine.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
