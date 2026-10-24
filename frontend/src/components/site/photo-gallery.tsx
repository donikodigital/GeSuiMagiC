//frontend/src/components/site/photo-gallery.tsx
import { FileText } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import type { Attachment } from '@/types/models';

const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined);

/** Vignettes cliquables des pieces jointes d'une saisie, avec la date et l'heure de prise de vue. */
export function PhotoGallery({ attachments }: { attachments: Attachment[] }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {attachments.map((a) => {
        const isImage = a.mimeType.startsWith('image/');
        const when = a.capturedAt ?? a.createdAt;
        return (
          <li key={a.id}>
            <a href={safeHref(a.fileUrl)} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-xl border border-concrete bg-concrete-light shadow-card transition-transform hover:-translate-y-0.5">
              <div className="aspect-square">
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- image distante (stockage objet), taille inconnue
                  <img src={a.fileUrl} alt={a.fileName} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full flex-col items-center justify-center gap-1 px-1 text-center text-[10px] text-ink-500">
                    <FileText className="h-5 w-5" /> <span className="line-clamp-2">{a.fileName}</span>
                  </span>
                )}
              </div>
              <p className="truncate bg-white px-1.5 py-1 text-[10px] text-ink-400" title={formatDateTime(when)}>
                {formatDateTime(when)}
              </p>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
