// frontend/src/app/(app)/projects/[id]/documents/page.tsx - v1.1
'use client';

import { useParams } from 'next/navigation';
import { FolderOpen } from 'lucide-react';
import { AttachmentsSection } from '@/components/shared/attachments-section';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

/** Espace documentaire du projet (section 63) : devis, plans, contrats, documents administratifs. */
export default function ProjectDocumentsPage() {
  const params = useParams<{ id: string }>();

  return (
    <Card>
      <CardHeader className="items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600">
          <FolderOpen className="h-4 w-4" />
        </span>
        <div>
          <CardTitle>Documents du projet</CardTitle>
          <CardDescription>Dévis, plans, contrats et documents administratifs généraux (hors justificatifs de dépenses/dépôts).</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <AttachmentsSection
          target={{ projectId: params.id }}
          kindOptions={[
            { value: 'document', label: 'Documents administratifs' },
            { value: 'facture', label: 'Dévis / Contrats' },
            { value: 'photo', label: 'Photos du chantier' },
          ]}
        />
      </CardContent>
    </Card>
  );
}