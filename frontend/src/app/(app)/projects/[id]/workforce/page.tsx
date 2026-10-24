//frontend/src/app/(app)/projects/[id]/workforce/page.tsx
'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { CalendarCheck2, HardHat, Wallet } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useSitePermissions } from '@/hooks/use-site';
import { Segmented } from '@/components/site/segmented';
import { WorkersSection } from '@/components/site/workforce/workers-section';
import { PresenceSection } from '@/components/site/workforce/presence-section';
import { PaySection } from '@/components/site/workforce/pay-section';

type View = 'workers' | 'presence' | 'pay';

export default function ProjectWorkforcePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { data: project } = useProject(projectId);
  const permissions = useSitePermissions(projectId);
  const [view, setView] = React.useState<View>('presence');
  const currency = project?.currency ?? 'GNF';

  return (
    <div className="space-y-5">
      <Segmented<View>
        value={view}
        onChange={setView}
        options={[
          { value: 'presence', label: 'Appel du jour', icon: <CalendarCheck2 className="h-4 w-4" /> },
          { value: 'workers', label: 'Ouvriers', icon: <HardHat className="h-4 w-4" /> },
          { value: 'pay', label: 'Paie', icon: <Wallet className="h-4 w-4" /> },
        ]}
      />
      {view === 'presence' && <PresenceSection projectId={projectId} permissions={permissions} />}
      {view === 'workers' && <WorkersSection projectId={projectId} currency={currency} permissions={permissions} />}
      {view === 'pay' && <PaySection projectId={projectId} currency={currency} permissions={permissions} />}
    </div>
  );
}
