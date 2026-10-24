//frontend/src/components/site/category-select.tsx
'use client';

import * as React from 'react';
import { Select } from '@/components/ui/input';
import { useCategories } from '@/hooks/use-catalog';

/** Categories de depense ; `guess` preselectionne la premiere dont le nom correspond (ex. « Main-d'oeuvre »). */
export function CategorySelect({ value, onChange, guess, id }: { value: string; onChange: (value: string) => void; guess?: RegExp; id?: string }) {
  const { data: categories } = useCategories();
  const active = (categories ?? []).filter((c) => c.isActive);

  React.useEffect(() => {
    if (value || !guess || active.length === 0) return;
    const match = active.find((c) => guess.test(c.name));
    if (match) onChange(match.id);
  }, [value, guess, active, onChange]);

  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choisir une catégorie</option>
      {active.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}
