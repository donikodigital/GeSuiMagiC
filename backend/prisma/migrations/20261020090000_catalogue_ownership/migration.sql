-- Catalogue par client : categories, materiaux et unites peuvent desormais appartenir a un client.
-- ownerClientId NULL = entree GLOBALE (comportement actuel, aucune donnee existante n'est modifiee).

-- 1) Colonnes
ALTER TABLE "expense_categories" ADD COLUMN "ownerClientId" TEXT;
ALTER TABLE "materials" ADD COLUMN "ownerClientId" TEXT;
ALTER TABLE "units" ADD COLUMN "ownerClientId" TEXT;

-- 2) Unicite : le nom n'est plus unique au niveau global mais par proprietaire
DROP INDEX "expense_categories_name_key";
DROP INDEX "materials_name_categoryId_key";
DROP INDEX "units_name_key";

CREATE UNIQUE INDEX "expense_categories_ownerClientId_name_key" ON "expense_categories"("ownerClientId", "name");
CREATE UNIQUE INDEX "materials_ownerClientId_categoryId_name_key" ON "materials"("ownerClientId", "categoryId", "name");
CREATE UNIQUE INDEX "units_ownerClientId_name_key" ON "units"("ownerClientId", "name");

-- 3) Index de lecture
CREATE INDEX "expense_categories_ownerClientId_idx" ON "expense_categories"("ownerClientId");
CREATE INDEX "materials_ownerClientId_idx" ON "materials"("ownerClientId");
CREATE INDEX "units_ownerClientId_idx" ON "units"("ownerClientId");

-- 4) Cles etrangeres (la suppression d'un client supprime son catalogue prive)
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_ownerClientId_fkey" FOREIGN KEY ("ownerClientId") REFERENCES "client_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "materials" ADD CONSTRAINT "materials_ownerClientId_fkey" FOREIGN KEY ("ownerClientId") REFERENCES "client_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "units" ADD CONSTRAINT "units_ownerClientId_fkey" FOREIGN KEY ("ownerClientId") REFERENCES "client_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
