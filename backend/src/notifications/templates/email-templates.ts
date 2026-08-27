//backend/src/notifications/templates/email-templates.ts
/**
 * Templates HTML minimalistes mais professionnels pour l'envoi par email.
 * Un seul layout de base pour garder une identite visuelle coherente.
 */

function baseLayout(title: string, bodyHtml: string, ctaUrl?: string, ctaLabel?: string): string {
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
                <h2 style="margin-top:0;color:#0f172a;">${title}</h2>
                ${bodyHtml}
                ${
                  ctaUrl
                    ? `<div style="text-align:center;margin:28px 0;">
                        <a href="${ctaUrl}" style="background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;display:inline-block;">${ctaLabel ?? 'Ouvrir'}</a>
                       </div>`
                    : ''
                }
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background:#f9fafb;color:#9ca3af;font-size:12px;">
                Cet email a ete envoye automatiquement par la plateforme de suivi de chantier. Ne pas repondre a cet email.
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
  invitation: (firstName: string, inviteUrl: string) =>
    baseLayout(
      `Bienvenue ${firstName}`,
      `<p>Un compte a ete cree pour vous sur la plateforme de suivi financier de chantier.</p>
       <p>Cliquez sur le bouton ci-dessous pour definir votre mot de passe et activer votre compte. Ce lien expire dans 48 heures.</p>`,
      inviteUrl,
      'Definir mon mot de passe',
    ),

  passwordReset: (firstName: string, resetUrl: string) =>
    baseLayout(
      `Reinitialisation du mot de passe`,
      `<p>Bonjour ${firstName},</p><p>Une demande de reinitialisation de mot de passe a ete effectuee. Si vous n'etes pas a l'origine de cette demande, ignorez cet email.</p>`,
      resetUrl,
      'Reinitialiser mon mot de passe',
    ),

  depositCreated: (supervisorName: string, projectName: string, amount: string, url: string) =>
    baseLayout(
      `Nouveau depot a valider`,
      `<p>Bonjour ${supervisorName},</p><p>Un depot de <strong>${amount}</strong> a ete enregistre pour le projet <strong>${projectName}</strong>. Merci de le valider ou le refuser.</p>`,
      url,
      'Consulter le depot',
    ),

  depositApproved: (clientName: string, projectName: string, amount: string, url: string) =>
    baseLayout(
      `Depot valide`,
      `<p>Bonjour ${clientName},</p><p>Votre depot de <strong>${amount}</strong> pour le projet <strong>${projectName}</strong> a ete valide par le superviseur.</p>`,
      url,
      'Voir le projet',
    ),

  depositRejected: (clientName: string, projectName: string, amount: string, reason: string, url: string) =>
    baseLayout(
      `Depot refuse`,
      `<p>Bonjour ${clientName},</p><p>Votre depot de <strong>${amount}</strong> pour le projet <strong>${projectName}</strong> a ete refuse.</p><p><em>Motif : ${reason}</em></p>`,
      url,
      'Voir le projet',
    ),

  expensePendingApproval: (clientName: string, projectName: string, amount: string, label: string, url: string) =>
    baseLayout(
      `Depense en attente de votre validation`,
      `<p>Bonjour ${clientName},</p><p>Une depense importante <strong>${label}</strong> de <strong>${amount}</strong> a ete enregistree sur le projet <strong>${projectName}</strong> et depasse le seuil configure. Votre confirmation est requise.</p>`,
      url,
      'Valider la depense',
    ),

  lowBalanceAlert: (clientName: string, projectName: string, balance: string, url: string) =>
    baseLayout(
      `Alerte : solde faible`,
      `<p>Bonjour ${clientName},</p><p>Le solde disponible du projet <strong>${projectName}</strong> est descendu a <strong>${balance}</strong> (moins de 10% du budget).</p>`,
      url,
      'Voir le tableau de bord',
    ),

  budgetExceededAlert: (clientName: string, projectName: string, category: string, url: string) =>
    baseLayout(
      `Alerte : depassement de budget`,
      `<p>Bonjour ${clientName},</p><p>La categorie <strong>${category}</strong> du projet <strong>${projectName}</strong> a depasse le budget previsionnel alloue.</p>`,
      url,
      'Voir le budget',
    ),

  adminCorrection: (clientName: string, entityType: string, oldValue: string, newValue: string, reason: string, url: string) =>
    baseLayout(
      `Correction administrative effectuee`,
      `<p>Bonjour ${clientName},</p><p>Une correction administrative a ete appliquee sur ${entityType === 'Deposit' ? 'un depot' : 'une depense'} de votre projet.</p>
       <p>Ancienne valeur : <strong>${oldValue}</strong><br/>Nouvelle valeur : <strong>${newValue}</strong><br/>Motif : ${reason}</p>`,
      url,
      'Voir le detail',
    ),

  anomalyReported: (superadminLabel: string, projectName: string, description: string, url: string) =>
    baseLayout(
      `Nouvelle anomalie signalee`,
      `<p>Une anomalie a ete signalee sur le projet <strong>${projectName}</strong>.</p><p><em>${description}</em></p>`,
      url,
      'Traiter le signalement',
    ),

  newMessage: (senderLabel: string, subject: string, body: string, url: string) =>
    baseLayout(
      subject,
      `<p>Vous avez recu un nouveau message de <strong>${senderLabel}</strong>.</p><p style="white-space:pre-wrap;">${body}</p>`,
      url,
      'Repondre sur la plateforme',
    ),

  broadcastMessage: (recipientEmail: string, subject: string, body: string, url: string) =>
    baseLayout(
      subject,
      `<p style="white-space:pre-wrap;">${body}</p>`,
      url,
      'Voir sur la plateforme',
    ),

  adminFieldUpdate: (clientName: string, entityType: string, changedFields: string, url: string) =>
    baseLayout(
      `Modification administrative`,
      `<p>Bonjour ${clientName},</p><p>Le superadministrateur a modifie ${entityType === 'Deposit' ? 'un depot' : 'une depense'} de votre projet.</p>
       <p>Champs modifies : <strong>${changedFields}</strong></p>`,
      url,
      'Voir le detail',
    ),
};