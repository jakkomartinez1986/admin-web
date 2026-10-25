import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PAGE_SIZE_OPTIONS } from '@/hooks/usePagination'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  totalPages: number
  start: number
  end: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  noun?: string
}

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  start,
  end,
  onPageChange,
  onPageSizeChange,
  noun = 'registros',
}: PaginationProps) {
  if (total === 0) return null

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500">
        Mostrando <span className="font-medium text-slate-700">{start}</span>–
        <span className="font-medium text-slate-700">{end}</span> de{' '}
        <span className="font-medium text-slate-700">{total}</span> {noun}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Filas
            <select
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[90px] text-center text-xs text-slate-600">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Página siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
