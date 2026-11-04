import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { SortDirection } from '@/hooks/useSort'

interface SortableHeaderProps {
  label: string
  column: string
  sortKey: string
  direction: SortDirection
  onSort: (key: string) => void
  className?: string
}

export function SortableHeader({
  label,
  column,
  sortKey,
  direction,
  onSort,
  className = '',
}: SortableHeaderProps) {
  const active = column === sortKey

  return (
    <th
      className={`table-th ${className}`}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="group inline-flex items-center gap-1.5 uppercase tracking-wide text-slate-500 transition hover:text-slate-700"
        title={`Ordenar por ${label.toLowerCase()}`}
      >
        {label}
        {active ? (
          direction === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-400" />
        )}
      </button>
    </th>
  )
}
