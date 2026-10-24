//frontend/src/components/site/phase-select.tsx
'use client';

import { Select } from '@/components/ui/input';
import { usePhases } from '@/hooks/use-attendance';

/** Liste des etapes actives du chantier ; `value` vide = aucune etape. */
export function PhaseSelect({
  projectId,
  value,
  onChange,
  emptyLabel = 'Aucune étape',
  id,
  required,
}: {
  projectId: string;
  value: string;
  onChange: (value: string) => void;
  emptyLabel?: string;
  id?: string;
  required?: boolean;
}) {
  const { data: phases } = usePhases(projectId);
  const options = (phases ?? []).filter((p) => p.isActive || p.id === value);
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{emptyLabel}</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}
