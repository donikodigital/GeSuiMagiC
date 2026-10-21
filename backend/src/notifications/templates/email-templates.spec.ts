//backend/src/notifications/templates/email-templates.spec.ts
import { emailTemplates, esc } from './email-templates';

describe('esc', () => {
  it('echappe les caracteres HTML dangereux', () => {
    expect(esc(`<script>alert("x")</script> & 'y'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
  });

  it('gere null, undefined et les nombres', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc(48)).toBe('48');
  });
});

describe('emailTemplates - injection HTML (hameconnage)', () => {
  const evil = '<a href="https://evil.example">Cliquez ici</a><img src=x onerror=alert(1)>';

  it('echappe toutes les valeurs saisies par les utilisateurs', () => {
    const html = [
      emailTemplates.depositCreated(evil, evil, evil, 'https://app.example/x'),
      emailTemplates.depositApproved(evil, evil, evil, 'https://app.example/x'),
      emailTemplates.depositRejected(evil, evil, evil, evil, 'https://app.example/x'),
      emailTemplates.expensePendingApproval(evil, evil, evil, evil, 'https://app.example/x'),
      emailTemplates.adminCorrection(evil, 'Deposit', evil, evil, evil, 'https://app.example/x'),
      emailTemplates.anomalyReported(evil, evil, evil, 'https://app.example/x'),
      emailTemplates.newMessage(evil, evil, evil, 'https://app.example/x'),
      emailTemplates.broadcastMessage('x@y.z', evil, evil, 'https://app.example/x'),
      emailTemplates.passwordReset(evil, 'https://app.example/x'),
      emailTemplates.invitation(evil, 'https://app.example/x'),
    ];

    for (const body of html) {
      expect(body).not.toContain('<a href="https://evil.example">');
      expect(body).not.toContain('<img src=x');
      expect(body).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;');
    }
  });

  it('le sujet (titre) du message est lui aussi echappe', () => {
    expect(emailTemplates.newMessage('Moi', '<b>Sujet</b>', 'corps', 'https://app.example')).toContain('&lt;b&gt;Sujet&lt;/b&gt;');
  });
});

describe('emailTemplates - liens des boutons', () => {
  it('conserve un lien https', () => {
    const html = emailTemplates.passwordReset('Awa', 'https://app.example/reset?token=abc');
    expect(html).toContain('href="https://app.example/reset?token=abc"');
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>1</script>', 'ftp://x', 'pas une url', ''])('omet le bouton pour %j', (url) => {
    const html = emailTemplates.passwordReset('Awa', url);
    expect(html).not.toContain('<a href');
  });
});

describe('emailTemplates - invitation', () => {
  it("affiche la duree de validité reelle du lien (48 h par defaut, configurable)", () => {
    expect(emailTemplates.invitation('Awa', 'https://app.example/i')).toContain('48 heures');
    expect(emailTemplates.invitation('Awa', 'https://app.example/i', 72)).toContain('72 heures');
  });
});
