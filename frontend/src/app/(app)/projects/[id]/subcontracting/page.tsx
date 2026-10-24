//frontend/src/app/(app)/projects/[id]/subcontracting/page.tsx
'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Building2, Handshake, Scale } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useContracts, useSitePermissions } from '@/hooks/use-site';
import { Segmented } from '@/components/site/segmented';
import { SuppliersSection } from '@/components/site/subcontracting/suppliers-section';
import { QuotesSection } from '@/components/site/subcontracting/quotes-section';
import { ContractsSection } from '@/components/site/subcontracting/contracts-section';

type View = 'contracts' | 'quotes' | 'directory';

export default function ProjectSubcontractingPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { data: project } = useProject(projectId);
  const permissions = useSitePermissions(projectId);
  const { data: contracts } = useContracts(projectId);
  const [view, setView] = React.useState<View>('contracts');
  const currency = project?.currency ?? 'GNF';
  const pending = (contracts ?? []).reduce((sum, c) => sum + c.summary.pendingStatements, 0);

  return (
    <div className="space-y-5">
      <Segmented<View>
        value={view}
        onChange={setView}
        options={[
          { value: 'contracts', label: 'Marchés', icon: <Handshake className="h-4 w-4" />, badge: pending },
          { value: 'quotes', label: 'Devis', icon: <Scale className="h-4 w-4" /> },
          { value: 'directory', label: 'Annuaire', icon: <Building2 className="h-4 w-4" /> },
        ]}
      />
      {view === 'contracts' && <ContractsSection projectId={projectId} currency={currency} permissions={permissions} />}
      {view === 'quotes' && <QuotesSection projectId={projectId} currency={currency} permissions={permissions} />}
      {view === 'directory' && <SuppliersSection projectId={projectId} permissions={permissions} />}
    </div>
  );
}
