//frontend/src/components/site/settings/notification-channels-card.tsx
'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, MessageCircle, MessageSquareText, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/input';
import { useNotificationPreferences } from '@/hooks/use-site';
import { siteService } from '@/services/site.service';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const E164 = /^\+[1-9]\d{7,14}$/;

function Toggle({ checked, onChange, disabled, title, hint, icon }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; title: string; hint: string; icon: React.ReactNode }) {
  return (
    <label className={cn('flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer', checked ? 'border-moss-200 bg-moss-50' : 'border-concrete bg-paper/60')}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-ink-500 shadow-card">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-800">{title}</p>
          <p className="text-xs text-ink-500">{hint}</p>
        </div>
      </div>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-concrete-dark transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-moss peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-blueprint-400 peer-focus-visible:ring-offset-2" />
    </label>
  );
}

/** Alertes par WhatsApp et SMS : numero au format international, canaux a activer, message d'essai. */
export function NotificationChannelsCard() {
  const queryClient = useQueryClient();
  const { data: prefs, isLoading } = useNotificationPreferences();
  const [phone, setPhone] = React.useState('');
  const [whatsapp, setWhatsapp] = React.useState(false);
  const [sms, setSms] = React.useState(false);

  React.useEffect(() => {
    if (!prefs) return;
    setPhone(prefs.messagingPhone ?? '');
    setWhatsapp(prefs.whatsappOptIn);
    setSms(prefs.smsOptIn);
  }, [prefs]);

  const save = useMutation({
    mutationFn: () => siteService.updateNotificationPreferences({ messagingPhone: phone.trim() || null, whatsappOptIn: phone.trim() ? whatsapp : false, smsOptIn: phone.trim() ? sms : false }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast.success('Préférences enregistrées.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Impossible d'enregistrer les préférences."),
  });
  const test = useMutation({
    mutationFn: (channel: 'WHATSAPP' | 'SMS') => siteService.sendTestMessage(channel),
    onSuccess: (result) => (result.sent ? toast.success("Message d'essai envoyé.") : toast.error("Le message d'essai n'a pas pu être envoyé.")),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Le message d'essai n'a pas pu être envoyé."),
  });

  if (isLoading || !prefs) return null;
  const phoneValid = !phone.trim() || E164.test(phone.trim());
  const dirty = (phone.trim() || null) !== prefs.messagingPhone || whatsapp !== prefs.whatsappOptIn || sms !== prefs.smsOptIn;
  const anyChannel = prefs.whatsappAvailable || prefs.smsAvailable;
  const saved = !dirty && !!prefs.messagingPhone;

  return (
    <Card>
      <CardHeader className="items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blueprint-50 text-blueprint-600">
          <BellRing className="h-4 w-4" />
        </span>
        <div>
          <CardTitle>Alertes WhatsApp et SMS</CardTitle>
          <CardDescription>Recevez sur votre téléphone les validations en attente, les retards, les documents qui expirent et les dépôts reçus.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (phoneValid) save.mutate();
          }}
        >
          {!anyChannel && <p className="rounded-xl bg-concrete-light px-3 py-2.5 text-sm text-ink-600">L&apos;envoi de messages n&apos;est pas encore activé sur ce serveur : vos alertes restent visibles dans l&apos;application.</p>}
          <FormField label="Numéro de téléphone" htmlFor="messagingPhone" error={phoneValid ? undefined : 'Format international requis, par exemple +224620000000.'} hint="Avec l'indicatif du pays, sans espace ni tiret.">
            <Input id="messagingPhone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+224620000000" className="font-ledger" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
          <Toggle checked={whatsapp && !!phone.trim()} onChange={setWhatsapp} disabled={!prefs.whatsappAvailable || !phone.trim()} title="WhatsApp" hint={prefs.whatsappAvailable ? 'Messages sur votre WhatsApp.' : "Pas encore disponible sur ce serveur."} icon={<MessageCircle className="h-4 w-4" />} />
          <Toggle checked={sms && !!phone.trim()} onChange={setSms} disabled={!prefs.smsAvailable || !phone.trim()} title="SMS" hint={prefs.smsAvailable ? 'Messages texte classiques.' : "Pas encore disponible sur ce serveur."} icon={<MessageSquareText className="h-4 w-4" />} />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-concrete pt-4">
            <div className="flex gap-2">
              {saved && prefs.whatsappOptIn && (
                <Button type="button" variant="ghost" size="sm" loading={test.isPending && test.variables === 'WHATSAPP'} onClick={() => test.mutate('WHATSAPP')}>
                  <Send className="h-4 w-4" /> Essai WhatsApp
                </Button>
              )}
              {saved && prefs.smsOptIn && (
                <Button type="button" variant="ghost" size="sm" loading={test.isPending && test.variables === 'SMS'} onClick={() => test.mutate('SMS')}>
                  <Send className="h-4 w-4" /> Essai SMS
                </Button>
              )}
            </div>
            <Button type="submit" disabled={!dirty || !phoneValid} loading={save.isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
