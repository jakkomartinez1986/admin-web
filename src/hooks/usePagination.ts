import { useEffect, useMemo, useState } from 'react'

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

export function usePagination<T>(items: T[], initialPageSize = 10, resetKey = '') {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => {
    setPage(1)
  }, [resetKey, pageSize])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, page, pageSize])

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
    start: total === 0 ? 0 : (page - 1) * pageSize + 1,
    end: Math.min(page * pageSize, total),
  }
}
