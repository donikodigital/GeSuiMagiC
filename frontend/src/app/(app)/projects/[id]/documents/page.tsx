'use client';

import { useParams } from 'next/navigation';
import { AttachmentsSection } from '@/components/shared/attachments-section';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

/** Espace documentaire du projet (section 63) : devis, plans, contrats, documents administratifs. */
export default function ProjectDocumentsPage() {
  const params = useParams<{ id: string }>();

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Documents du projet</CardTitle>
          <CardDescription>Devis, plans, contrats et documents administratifs generaux (hors justificatifs de depenses/depots).</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <AttachmentsSection target={{ projectId: params.id }} kindOptions={[
          { value: 'document', label: 'Document administratif' },
          { value: 'facture', label: 'Devis / Contrat' },
          { value: 'photo', label: 'Photo du chantier' },
        ]} />
      </CardContent>
    </Card>
  );
}
