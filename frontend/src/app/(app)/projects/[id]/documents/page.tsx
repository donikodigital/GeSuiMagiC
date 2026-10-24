//frontend/src/app/(app)/projects/[id]/documents/page.tsx
'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { BarChart3, FileBadge2, FolderOpen } from 'lucide-react';
import { AttachmentsSection } from '@/components/shared/attachments-section';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Segmented } from '@/components/site/segmented';
import { RegulatorySection } from '@/components/site/documents/regulatory-section';
import { ReportSection } from '@/components/site/documents/report-section';
import { useProject } from '@/hooks/use-projects';
import { useProjectDocuments, useSitePermissions } from '@/hooks/use-site';

type View = 'regulatory' | 'report' | 'files';

/** Espace documentaire : documents reglementaires (avec echeances), rapport mensuel, fichiers generaux du projet. */
export default function ProjectDocumentsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { data: project } = useProject(projectId);
  const permissions = useSitePermissions(projectId);
  const { data: documents } = useProjectDocuments(projectId);
  const [view, setView] = React.useState<View>('regulatory');
  const alerts = (documents ?? []).filter((d) => d.status === 'EXPIRED' || d.status === 'EXPIRING').length;

  return (
    <div className="space-y-5">
      <Segmented<View>
        value={view}
        onChange={setView}
        options={[
          { value: 'regulatory', label: 'Réglementaires', icon: <FileBadge2 className="h-4 w-4" />, badge: alerts },
          { value: 'report', label: 'Rapport mensuel', icon: <BarChart3 className="h-4 w-4" /> },
          { value: 'files', label: 'Fichiers', icon: <FolderOpen className="h-4 w-4" /> },
        ]}
      />
      {view === 'regulatory' && <RegulatorySection projectId={projectId} permissions={permissions} />}
      {view === 'report' && <ReportSection projectId={projectId} projectName={project?.name ?? 'chantier'} />}
      {view === 'files' && (
        <Card>
          <CardHeader className="items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600">
              <FolderOpen className="h-4 w-4" />
            </span>
            <div>
              <CardTitle>Fichiers du projet</CardTitle>
              <CardDescription>Devis, plans, contrats et documents administratifs généraux (hors justificatifs de dépenses/dépôts).</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <AttachmentsSection
              target={{ projectId }}
              kindOptions={[
                { value: 'document', label: 'Documents administratifs' },
                { value: 'facture', label: 'Devis / Contrats' },
                { value: 'photo', label: 'Photos du chantier' },
              ]}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
