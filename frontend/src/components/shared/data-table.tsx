// ============================================================================
// components/shared/data-table.tsx - v1.1
// Fix du scroll horizontal residuel : whitespace-nowrap forcait chaque
// cellule a rester sur une ligne, donc des qu'un contenu (montant + devise,
// badge de statut) depassait la largeur dispo, la table scrollait au lieu
// de laisser le texte revenir a la ligne. Retire sur th/td - les cellules
// peuvent desormais s'enrouler sur mobile plutot que forcer un scroll.
// Padding legerement reduit sur mobile pour recuperer un peu de place.
// ============================================================================

'use client';

import * as React from 'react';
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, PageSpinner } from '@/components/ui/misc';

interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  meta?: { page: number; limit: number; total: number; totalPages: number };
  onPageChange?: (page: number) => void;
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyTitle = 'Aucun element',
  emptyDescription,
  onRowClick,
  meta,
  onPageChange,
}: DataTableProps<T>) {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  if (isLoading) return <PageSpinner />;
  if (data.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <div className="overflow-hidden rounded-card border border-concrete bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-concrete-light/60 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-3 py-2.5 sm:px-4 sm:py-3">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-concrete">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row.original)}
                className={cn('transition-colors', onRowClick && 'cursor-pointer hover:bg-paper')}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2.5 text-ink-800 sm:px-4 sm:py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-concrete px-4 py-3">
          <p className="text-xs text-ink-400">
            {meta.total} resultat{meta.total > 1 ? 's' : ''} - page {meta.page} sur {meta.totalPages}
          </p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => onPageChange?.(meta.page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPageChange?.(meta.page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}