//backend/src/notifications/messaging.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type MessagingChannel = 'WHATSAPP' | 'SMS';

/** Numero au format international : + puis 8 a 15 chiffres, sans espace. */
export const E164_REGEX = /^\+[1-9]\d{7,14}$/;

/**
 * Envoi de messages WhatsApp et SMS via l'API REST de Twilio (aucune dependance supplementaire).
 * Facultatif : sans identifiants, `isAvailable()` vaut false et `send()` ne fait rien.
 * `send()` ne leve JAMAIS d'exception : un echec de messagerie ne doit pas faire echouer l'operation metier.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(private readonly config: ConfigService) {}

  isAvailable(channel: MessagingChannel): boolean {
    const sid = this.config.get<string>('messaging.twilioAccountSid');
    const token = this.config.get<string>('messaging.twilioAuthToken');
    if (!sid || !token) return false;
    return channel === 'WHATSAPP' ? !!this.config.get<string>('messaging.whatsappFrom') : !!this.config.get<string>('messaging.smsFrom');
  }

  /** Vrai si le message a ete accepte par le fournisseur. */
  async send(channel: MessagingChannel, to: string, body: string): Promise<boolean> {
    if (!this.isAvailable(channel) || !E164_REGEX.test(to)) return false;

    const sid = this.config.get<string>('messaging.twilioAccountSid')!;
    const token = this.config.get<string>('messaging.twilioAuthToken')!;
    const rawFrom = this.config.get<string>(channel === 'WHATSAPP' ? 'messaging.whatsappFrom' : 'messaging.smsFrom')!;
    const timeoutMs = this.config.get<number>('messaging.timeoutMs') ?? 5000;

    const from = channel === 'WHATSAPP' && !rawFrom.startsWith('whatsapp:') ? `whatsapp:${rawFrom}` : rawFrom;
    const target = channel === 'WHATSAPP' ? `whatsapp:${to}` : to;

    try {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: target, From: from, Body: body.slice(0, 1500) }).toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        this.logger.warn(`Echec d'envoi ${channel} (HTTP ${response.status})`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`Echec d'envoi ${channel} : ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }
}
