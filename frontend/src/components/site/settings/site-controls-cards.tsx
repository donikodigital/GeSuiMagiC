//frontend/src/components/site/settings/site-controls-cards.tsx
'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Crosshair, FileCheck2, MapPin } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/input';
import { projectsService } from '@/services/projects.service';
import { ApiError } from '@/lib/api-client';
import { getPosition } from '@/lib/geo';
import type { Project } from '@/types/models';

function Header({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <CardHeader>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600 ring-1 ring-blueprint-100">{icon}</div>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </div>
    </CardHeader>
  );
}

function Unsaved({ dirty }: { dirty: boolean }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-400">
      {dirty && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-safety-400" />}
      {dirty ? 'Modification non enregistrée.' : 'Aucune modification en attente.'}
    </p>
  );
}

const numText = (v: string | null | undefined) => (v === null || v === undefined ? '' : String(parseFloat(v)));
const errorMessage = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

/** Anti-fraude : au-dessus de ces montants, un justificatif est obligatoire / une validation technique est demandee. */
export function ControlThresholdsCard({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const [receipt, setReceipt] = React.useState('');
  const [technical, setTechnical] = React.useState('');
  React.useEffect(() => {
    setReceipt(numText(project.receiptRequiredAbove));
    setTechnical(numText(project.technicalReviewAbove));
  }, [project.receiptRequiredAbove, project.technicalReviewAbove]);

  const dirty = receipt !== numText(project.receiptRequiredAbove) || technical !== numText(project.technicalReviewAbove);
  const mutation = useMutation({
    mutationFn: () => projectsService.updateFinancials(project.id, { receiptRequiredAbove: receipt.trim() ? Number(receipt) : null, technicalReviewAbove: technical.trim() ? Number(technical) : null }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', project.id] });
      toast.success('Seuils de contrôle mis à jour.');
    },
    onError: (error) => toast.error(errorMessage(error, 'Mise à jour impossible.')),
  });

  return (
    <Card className="animate-card-in overflow-hidden" style={{ animationDelay: '120ms' }}>
      <div className="h-1 w-full bg-gradient-to-r from-safety-500 to-safety-300" />
      <Header icon={<FileCheck2 className="h-4 w-4" />} title="Contrôles anti-fraude" description="Laissez un champ vide pour désactiver le contrôle correspondant." />
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <FormField label="Justificatif obligatoire au-dessus de" htmlFor="receiptRequiredAbove" hint="Sans facture ni reçu joint, une dépense supérieure à ce montant ne peut pas être validée.">
            <div className="relative">
              <Input id="receiptRequiredAbove" type="number" inputMode="decimal" min={0} className="pr-16 font-ledger" value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="Aucun seuil" />
              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center rounded-full bg-concrete-light px-2 text-[11px] font-semibold text-ink-500">{project.currency}</span>
            </div>
          </FormField>
          <FormField label="Validation technique au-dessus de" htmlFor="technicalReviewAbove" hint="Le conducteur de travaux ou l'architecte (s'il y en a un sur le chantier) valide la dépense avant vous.">
            <div className="relative">
              <Input id="technicalReviewAbove" type="number" inputMode="decimal" min={0} className="pr-16 font-ledger" value={technical} onChange={(e) => setTechnical(e.target.value)} placeholder="Aucun seuil" />
              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center rounded-full bg-concrete-light px-2 text-[11px] font-semibold text-ink-500">{project.currency}</span>
            </div>
          </FormField>
          <div className="flex items-center justify-between border-t border-concrete pt-4">
            <Unsaved dirty={dirty} />
            <Button type="submit" disabled={!dirty} loading={mutation.isPending}>
              <Check className="h-4 w-4" /> Enregistrer
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Position du chantier : les saisies faites a plus de `rayon` metres sont signalees « hors du chantier ». */
export function SiteLocationCard({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const [lat, setLat] = React.useState('');
  const [lng, setLng] = React.useState('');
  const [radius, setRadius] = React.useState('150');
  const [locating, setLocating] = React.useState(false);
  React.useEffect(() => {
    setLat(numText(project.siteLatitude));
    setLng(numText(project.siteLongitude));
    setRadius(String(project.geoFenceMeters ?? 150));
  }, [project.siteLatitude, project.siteLongitude, project.geoFenceMeters]);

  const dirty = lat !== numText(project.siteLatitude) || lng !== numText(project.siteLongitude) || radius !== String(project.geoFenceMeters ?? 150);
  const latN = Number(lat);
  const lngN = Number(lng);
  const radiusN = Number(radius);
  const valid = lat.trim() !== '' && lng.trim() !== '' && Number.isFinite(latN) && Number.isFinite(lngN) && latN >= -90 && latN <= 90 && lngN >= -180 && lngN <= 180 && Number.isInteger(radiusN) && radiusN >= 20 && radiusN <= 5000;

  const mutation = useMutation({
    mutationFn: () => projectsService.update(project.id, { siteLatitude: latN, siteLongitude: lngN, geoFenceMeters: radiusN }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', project.id] });
      toast.success('Position du chantier enregistrée.');
    },
    onError: (error) => toast.error(errorMessage(error, 'Mise à jour impossible.')),
  });

  const useHere = async () => {
    setLocating(true);
    const position = await getPosition(8000);
    setLocating(false);
    if (!position) {
      toast.error("Position indisponible : autorisez la localisation ou saisissez les coordonnées.");
      return;
    }
    setLat(String(position.latitude));
    setLng(String(position.longitude));
  };

  return (
    <Card className="animate-card-in overflow-hidden" style={{ animationDelay: '160ms' }}>
      <div className="h-1 w-full bg-gradient-to-r from-moss-500 to-moss-300" />
      <Header icon={<MapPin className="h-4 w-4" />} title="Position du chantier" description="Placez-vous sur le chantier et utilisez votre position. Les présences, livraisons et dépenses saisies loin du chantier sont signalées." />
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) mutation.mutate();
          }}
        >
          <Button type="button" variant="outline" className="w-full" onClick={useHere} loading={locating}>
            <Crosshair className="h-4 w-4" /> Utiliser ma position actuelle
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Latitude" htmlFor="siteLatitude">
              <Input id="siteLatitude" inputMode="decimal" className="font-ledger" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="9.641185" />
            </FormField>
            <FormField label="Longitude" htmlFor="siteLongitude">
              <Input id="siteLongitude" inputMode="decimal" className="font-ledger" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-13.578401" />
            </FormField>
          </div>
          <FormField label="Rayon de contrôle (mètres)" htmlFor="geoFenceMeters" hint="Entre 20 et 5000 m. Un rayon trop faible signale à tort les saisies faites en bordure de chantier.">
            <Input id="geoFenceMeters" type="number" inputMode="numeric" min={20} max={5000} className="font-ledger" value={radius} onChange={(e) => setRadius(e.target.value)} />
          </FormField>
          <div className="flex items-center justify-between border-t border-concrete pt-4">
            <Unsaved dirty={dirty} />
            <Button type="submit" disabled={!dirty || !valid} loading={mutation.isPending}>
              <Check className="h-4 w-4" /> Enregistrer
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
