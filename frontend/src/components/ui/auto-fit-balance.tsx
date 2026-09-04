// frontend/src/components/ui/auto-fit-balance.tsx
// Affiche un montant sur UNE seule ligne, en toute circonstance : ne le
// laisse jamais retourner a la ligne ni se faire couper au milieu (ex.
// "GNF" scinde en "GN"/"F", vu avec break-all sur de grands soldes GNF).
// Mesure la largeur reelle du texte rendu et reduit la taille de police
// pas a pas jusqu'a ce qu'il tienne dans son conteneur, avec un plancher
// pour rester lisible. Se re-ajuste automatiquement si le conteneur
// change de largeur (rotation, redimensionnement, sidebar) via
// ResizeObserver. useLayoutEffect (avec garde SSR) pour eviter tout
// flash a la taille max avant l'ajustement.

'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function AutoFitBalance({
  children,
  maxSize,
  minSize = 14,
  className,
  style,
}: {
  children: React.ReactNode;
  /** Taille de police ideale en px, utilisee quand le montant tient sans reduction. */
  maxSize: number;
  /** Taille de police minimale en px - jamais reduite en dessous, pour rester lisible. */
  minSize?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(maxSize);

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const fit = () => {
      const containerWidth = container.clientWidth;
      if (containerWidth === 0) return;

      let size = maxSize;
      text.style.fontSize = `${size}px`;

      while (text.scrollWidth > containerWidth && size > minSize) {
        size -= 1;
        text.style.fontSize = `${size}px`;
      }

      setFontSize(size);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [children, maxSize, minSize]);

  return (
    <div ref={containerRef} className="min-w-0 max-w-full overflow-hidden">
      <span ref={textRef} className={cn('inline-block whitespace-nowrap', className)} style={{ ...style, fontSize }}>
        {children}
      </span>
    </div>
  );
}