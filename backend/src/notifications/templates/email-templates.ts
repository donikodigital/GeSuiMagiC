//backend/src/notifications/templates/email-templates.ts
/**
 * Templates HTML minimalistes mais professionnels pour l'envoi par email.
 * Un seul layout de base pour garder une identite visuelle coherente.
 *
 * SECURITE : toutes les valeurs dynamiques (noms, libelles, motifs, corps de
 * messages saisis par des utilisateurs) sont echappees avec `esc()` avant
 * d'etre inserees dans le HTML. Sans cela, un utilisateur pouvait injecter du
 * HTML/des liens (hameconnage) dans des emails envoyes depuis la plateforme.
 * Les liens des boutons sont limites a http(s).
 */

/** Echappe les caracteres speciaux HTML d'une valeur dynamique. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** N'accepte que des liens http(s) ; sinon renvoie une chaine vide (le bouton est alors omis). */
function safeUrl(url?: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

/**
 * `title` et `bodyHtml` : `title` est echappe ici ; `bodyHtml` est du HTML
 * construit par les templates ci-dessous, dont chaque valeur dynamique est
 * deja passee par esc().
 */
function baseLayout(title: string, bodyHtml: string, ctaUrl?: string, ctaLabel?: string): string {
  const href = safeUrl(ctaUrl);
  return `
  <!DOCTYPE html>
  <html lang="fr">
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#0f172a;padding:20px 32px;">
                <span style="color:#ffffff;font-size:18px;font-weight:bold;">Suivi de Chantier</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
                <h2 style="margin-top:0;color:#0f172a;">${esc(title)}</h2>
                ${bodyHtml}
                ${
                  href
                    ? `<div style="text-align:center;margin:28px 0;">
                        <a href="${esc(href)}" style="background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;display:inline-block;">${esc(ctaLabel ?? 'Ouvrir')}</a>
                       </div>`
                    : ''
                }
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background:#f9fafb;color:#9ca3af;font-size:12px;">
                Cet email a été envoyé automatiquement par la plateforme GeSuiMagiC - Suivi de chantier. Merci de ne pas répondre à cet email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
}

export const emailTemplates = {
  invitation: (firstName: string, inviteUrl: string, expiresInHours = 48) =>
    baseLayout(
      `Bienvenue ${firstName}`,
      `<p>Un compte a été créé pour vous sur la plateforme GeSuiMagiC (suivi financier de chantier).</p>
       <p>Cliquez sur le bouton ci-dessous pour définir votre mot de passe et activer votre compte. Ce lien expire dans ${esc(expiresInHours)} heures.</p>`,
      inviteUrl,
      'Définir mon mot de passe',
    ),

  passwordReset: (firstName: string, resetUrl: string) =>
    baseLayout(
      `Réinitialisation du mot de passe`,
      `<p>Bonjour ${esc(firstName)},</p><p>Une demande de réinitialisation de mot de passe a été effectuée. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
      resetUrl,
      'Réinitialiser mon mot de passe',
    ),

  depositCreated: (supervisorName: string, projectName: string, amount: string, url: string) =>
    baseLayout(
      `Nouveau dépôt à valider`,
      `<p>Bonjour ${esc(supervisorName)},</p><p>Un dépôt de <strong>${esc(amount)}</strong> a été enregistré pour le projet <strong>${esc(projectName)}</strong>. Merci de le valider ou le refuser.</p>`,
      url,
      'Consulter le dépôt',
    ),

  depositApproved: (clientName: string, projectName: string, amount: string, url: string) =>
    baseLayout(
      `Dépôt validé`,
      `<p>Bonjour ${esc(clientName)},</p><p>Votre dépôt de <strong>${esc(amount)}</strong> pour le projet <strong>${esc(projectName)}</strong> a été validé par le superviseur.</p>`,
      url,
      'Voir le projet',
    ),

  depositRejected: (clientName: string, projectName: string, amount: string, reason: string, url: string) =>
    baseLayout(
      `Dépôt refusé`,
      `<p>Bonjour ${esc(clientName)},</p><p>Votre dépôt de <strong>${esc(amount)}</strong> pour le projet <strong>${esc(projectName)}</strong> a été refusé.</p><p><em>Motif : ${esc(reason)}</em></p>`,
      url,
      'Voir le projet',
    ),

  expensePendingApproval: (clientName: string, projectName: string, amount: string, label: string, url: string) =>
    baseLayout(
      `Dépense en attente de votre validation`,
      `<p>Bonjour ${esc(clientName)},</p><p>Une dépense importante <strong>${esc(label)}</strong> de <strong>${esc(amount)}</strong> a été enregistrée sur le projet <strong>${esc(projectName)}</strong> et dépasse le seuil configuré. Votre confirmation est requise.</p>`,
      url,
      'Valider la dépense',
    ),

  lowBalanceAlert: (clientName: string, projectName: string, balance: string, url: string) =>
    baseLayout(
      `Alerte : solde faible`,
      `<p>Bonjour ${esc(clientName)},</p><p>Le solde disponible du projet <strong>${esc(projectName)}</strong> est descendu à <strong>${esc(balance)}</strong> (moins de 10% du budget).</p>`,
      url,
      'Voir le tableau de bord',
    ),

  budgetExceededAlert: (clientName: string, projectName: string, category: string, url: string) =>
    baseLayout(
      `Alerte : dépassement de budget`,
      `<p>Bonjour ${esc(clientName)},</p><p>La catégorie <strong>${esc(category)}</strong> du projet <strong>${esc(projectName)}</strong> a dépassé le budget prévisionnel alloué.</p>`,
      url,
      'Voir le budget',
    ),

  adminCorrection: (clientName: string, entityType: string, oldValue: string, newValue: string, reason: string, url: string) =>
    baseLayout(
      `Correction administrative effectuée`,
      `<p>Bonjour ${esc(clientName)},</p><p>Une correction administrative a été appliquée sur ${entityType === 'Deposit' ? 'un dépôt' : 'une dépense'} de votre projet.</p>
       <p>Ancienne valeur : <strong>${esc(oldValue)}</strong><br/>Nouvelle valeur : <strong>${esc(newValue)}</strong><br/>Motif : ${esc(reason)}</p>`,
      url,
      'Voir le détail',
    ),

  anomalyReported: (superadminLabel: string, projectName: string, description: string, url: string) =>
    baseLayout(
      `Nouvelle anomalie signalée`,
      `<p>Une anomalie a été signalée sur le projet <strong>${esc(projectName)}</strong>.</p><p><em>${esc(description)}</em></p>`,
      url,
      'Traiter le signalement',
    ),

  newMessage: (senderLabel: string, subject: string, body: string, url: string) =>
    baseLayout(
      subject,
      `<p>Vous avez reçu un nouveau message de <strong>${esc(senderLabel)}</strong>.</p><p style="white-space:pre-wrap;">${esc(body)}</p>`,
      url,
      'Répondre sur la plateforme',
    ),

  broadcastMessage: (_recipientEmail: string, subject: string, body: string, url: string) =>
    baseLayout(subject, `<p style="white-space:pre-wrap;">${esc(body)}</p>`, url, 'Voir sur la plateforme'),

  adminFieldUpdate: (clientName: string, entityType: string, changedFields: string, url: string) =>
    baseLayout(
      `Modification administrative`,
      `<p>Bonjour ${esc(clientName)},</p><p>Le superadministrateur a modifié ${entityType === 'Deposit' ? 'un dépôt' : 'une dépense'} de votre projet.</p>
       <p>Champs modifiés : <strong>${esc(changedFields)}</strong></p>`,
      url,
      'Voir le détail',
    ),
};
