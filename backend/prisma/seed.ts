/**
 * Seed du catalogue initial (marche guinéen) - sections 21 a 31 du cahier des charges.
 * Idempotent : peut etre relance sans dupliquer (upsert par nom unique).
 *
 * Usage: npm run prisma:seed
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

async function main() {
  console.log('Seed: unites...');
  const unitMap = new Map<string, string>();
  for (const u of UNITS) {
    const unit = await prisma.unit.upsert({
      where: { name: u.name },
      update: { symbol: u.symbol },
      create: { name: u.name, symbol: u.symbol },
    });
    unitMap.set(u.name, unit.id);
  }

  console.log('Seed: categories et materiaux...');
  for (const entry of CATALOG) {
    const category = await prisma.expenseCategory.upsert({
      where: { name: entry.category },
      update: { group: entry.group },
      create: { name: entry.category, group: entry.group },
    });

    for (const materialName of entry.materials) {
      await prisma.material.upsert({
        where: { name_categoryId: { name: materialName, categoryId: category.id } },
        update: {},
        create: { name: materialName, categoryId: category.id },
      });
    }
  }

  // Categorie generique pour les elements personnalises (section 30)
  await prisma.expenseCategory.upsert({
    where: { name: 'Element personnalise' },
    update: {},
    create: { name: 'Element personnalise', group: 'Autre' },
  });

  console.log('Seed: superadmin par defaut...');
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL || 'superadmin@chantier.local';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD || 'ChangeMoi123!';
  const existing = await prisma.user.findUnique({ where: { email: superadminEmail } });
  if (!existing) {
    const passwordHash = await argon2.hash(superadminPassword);
    await prisma.user.create({
      data: {
        email: superadminEmail,
        passwordHash,
        role: 'SUPERADMIN',
        status: 'ACTIVE',
      },
    });
    console.log(`   -> Superadmin cree : ${superadminEmail} / ${superadminPassword} (A CHANGER IMMEDIATEMENT)`);
  } else {
    console.log('   -> Superadmin deja present, ignore.');
  }

  console.log('Seed termine.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
