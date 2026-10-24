//frontend/src/components/site/subcontracting/suppliers-section.tsx
'use client';

import * as React from 'react';
import { Building2, Mail, MapPin, Pencil, Phone, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/misc';
import { Segmented } from '@/components/site/segmented';
import { SectionHeader } from '@/components/site/section-header';
import { useSiteMutation, useSuppliers } from '@/hooks/use-site';
import { siteService } from '@/services/site.service';
import { supplierKindLabels } from '@/lib/site-format';
import type { SitePermissions } from '@/lib/site-access';
import type { Supplier, SupplierKind, SupplierPayload } from '@/types/site';

type Filter = 'all' | SupplierKind;

/** Annuaire des fournisseurs et sous-traitants du chantier. */
export function SuppliersSection({ projectId, permissions }: { projectId: string; permissions: SitePermissions }) {
  const [filter, setFilter] = React.useState<Filter>('all');
  const { data, isLoading, isError } = useSuppliers(projectId, filter === 'all' ? undefined : filter, true);
  const [editing, setEditing] = React.useState<Supplier | 'new' | null>(null);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Annuaire"
        description="Fournisseurs de matériaux et entreprises sous-traitantes : leurs coordonnées servent aux commandes, aux devis et aux marchés."
        action={
          permissions.createSupplier && (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Ajouter
            </Button>
          )
        }
      />
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Tous' },
          { value: 'SUBCONTRACTOR', label: 'Sous-traitants' },
          { value: 'SUPPLIER', label: 'Fournisseurs' },
        ]}
      />
      {isLoading ? (
        <PageSpinner />
      ) : isError || !data ? (
        <ErrorState message="Impossible de charger l'annuaire." />
      ) : data.length === 0 ? (
        <EmptyState icon={<Building2 className="h-6 w-6" />} title="Annuaire vide" description="Ajoutez vos fournisseurs et sous-traitants pour les retrouver en un geste." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((s, i) => (
            <Card key={s.id} style={{ animationDelay: `${i * 40}ms` }} className={`animate-card-in rounded-2xl p-4 ${s.isActive ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{s.name}</p>
                  <p className="truncate text-xs text-ink-400">{s.trade ?? 'Métier non précisé'}</p>
                </div>
                <StatusBadge label={supplierKindLabels[s.kind]} tone={s.kind === 'SUBCONTRACTOR' ? 'blueprint' : 'safety'} />
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-ink-600">
                {s.phone && (
                  <li className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-ink-300" />
                    <a href={`tel:${s.phone.replace(/\s/g, '')}`} className="truncate hover:text-blueprint-600">
                      {s.phone}
                    </a>
                  </li>
                )}
                {s.email && (
                  <li className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-ink-300" />
                    <a href={`mailto:${s.email}`} className="truncate hover:text-blueprint-600">
                      {s.email}
                    </a>
                  </li>
                )}
                {s.address && (
                  <li className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-300" />
                    <span className="truncate">{s.address}</span>
                  </li>
                )}
              </ul>
              {(permissions.editSupplier || !s.isActive) && (
                <div className="mt-3 flex items-center justify-between border-t border-concrete pt-2.5">
                  {!s.isActive ? <span className="text-xs text-ink-400">Désactivé</span> : <span />}
                  {permissions.editSupplier && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                      <Pencil className="h-4 w-4" /> Modifier
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <SupplierDialog supplier={editing} onClose={() => setEditing(null)} projectId={projectId} />
    </div>
  );
}

function SupplierDialog({ supplier, onClose, projectId }: { supplier: Supplier | 'new' | null; onClose: () => void; projectId: string }) {
  const isNew = supplier === 'new';
  const existing = supplier && supplier !== 'new' ? supplier : null;
  const save = useSiteMutation(
    projectId,
    (payload: SupplierPayload) => (existing ? siteService.updateSupplier(projectId, existing.id, payload) : siteService.createSupplier(projectId, payload)),
    { success: isNew ? 'Fiche créée.' : 'Fiche mise à jour.', error: "Impossible d'enregistrer la fiche." },
  );
  const [form, setForm] = React.useState({ name: '', kind: 'SUBCONTRACTOR' as SupplierKind, trade: '', phone: '', email: '', address: '', taxId: '', notes: '', isActive: true });
  React.useEffect(() => {
    if (!supplier) return;
    setForm({
      name: existing?.name ?? '',
      kind: existing?.kind ?? 'SUBCONTRACTOR',
      trade: existing?.trade ?? '',
      phone: existing?.phone ?? '',
      email: existing?.email ?? '',
      address: existing?.address ?? '',
      taxId: existing?.taxId ?? '',
      notes: existing?.notes ?? '',
      isActive: existing?.isActive ?? true,
    });
  }, [supplier, existing]);
  if (!supplier) return null;
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const clean = (v: string) => v.trim() || undefined;
  const valid = form.name.trim().length >= 2;

  return (
    <Dialog open onClose={onClose} title={isNew ? 'Nouvelle fiche' : `Modifier ${existing?.name}`} maxWidth="max-w-xl">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          await save.mutateAsync({
            name: form.name.trim(),
            kind: form.kind,
            trade: clean(form.trade),
            phone: clean(form.phone),
            email: clean(form.email),
            address: clean(form.address),
            taxId: clean(form.taxId),
            notes: clean(form.notes),
            ...(existing ? { isActive: form.isActive } : {}),
          });
          onClose();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Nom" required>
            <Input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={150} />
          </FormField>
          <FormField label="Type">
            <Select value={form.kind} onChange={(e) => set({ kind: e.target.value as SupplierKind })}>
              <option value="SUBCONTRACTOR">Sous-traitant</option>
              <option value="SUPPLIER">Fournisseur</option>
            </Select>
          </FormField>
          <FormField label="Métier / spécialité">
            <Input value={form.trade} onChange={(e) => set({ trade: e.target.value })} maxLength={100} placeholder="Ex. : électricité, plomberie" />
          </FormField>
          <FormField label="Téléphone">
            <Input type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={40} />
          </FormField>
          <FormField label="E-mail">
            <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} maxLength={150} />
          </FormField>
          <FormField label="N° d'identification fiscale">
            <Input value={form.taxId} onChange={(e) => set({ taxId: e.target.value })} maxLength={60} />
          </FormField>
        </div>
        <FormField label="Adresse">
          <Input value={form.address} onChange={(e) => set({ address: e.target.value })} maxLength={250} />
        </FormField>
        <FormField label="Notes">
          <Textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={1000} />
        </FormField>
        {existing && (
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="h-4 w-4 rounded border-concrete text-blueprint-600" />
            Fiche active (proposée dans les listes)
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!valid}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
