//backend/src/common/utils/file-name.util.spec.ts
import { attachmentDisposition, toSafeFileName } from './file-name.util';

describe('toSafeFileName', () => {
  it('retire les accents et remplace les separateurs par "_"', () => {
    expect(toSafeFileName('Villa Hamidou - Phase 2')).toBe('Villa_Hamidou_Phase_2');
    expect(toSafeFileName('Résidence Éléonore')).toBe('Residence_Eleonore');
  });

  it("neutralise les guillemets, retours a la ligne et caracteres hors Latin-1 (injection d'en-tete)", () => {
    const result = toSafeFileName('Projet"\r\nSet-Cookie: x=1; 日本語');

    expect(result).toMatch(/^[A-Za-z0-9_]+$/);
    expect(result).not.toMatch(/[\r\n"]/);
  });

  it('utilise le repli quand rien d\'exploitable ne reste', () => {
    expect(toSafeFileName('日本語')).toBe('projet');
    expect(toSafeFileName('???', 'rapport')).toBe('rapport');
  });

  it('limite la longueur a 60 caracteres', () => {
    expect(toSafeFileName('a'.repeat(200))).toHaveLength(60);
  });
});

describe('attachmentDisposition', () => {
  it('produit un en-tete attachment avec un nom ASCII sur et la version UTF-8 encodee', () => {
    const header = attachmentDisposition('Bilan été "final".pdf');

    expect(header).toBe(`attachment; filename="Bilan__t___final_.pdf"; filename*=UTF-8''${encodeURIComponent('Bilan été "final".pdf')}`);
    expect(header.split('\n')).toHaveLength(1);
  });
});
