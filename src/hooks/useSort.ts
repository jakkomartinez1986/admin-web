import { useMemo, useState } from 'react'

export type SortDirection = 'asc' | 'desc'

type SortValue = string | number | null | undefined

export function useSort<T>(
  items: T[],
  accessors: Record<string, (item: T) => SortValue>,
  defaultKey: string,
  defaultDirection: SortDirection = 'asc',
) {
  const [sortKey, setSortKey] = useState(defaultKey)
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection)

  const sorted = useMemo(() => {
    const accessor = accessors[sortKey]
    if (!accessor) return items

    const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })

    return [...items].sort((a, b) => {
      const aValue = accessor(a)
      const bValue = accessor(b)

      if (aValue == null && bValue == null) return 0
      if (aValue == null) return 1
      if (bValue == null) return -1

      const result =
        typeof aValue === 'number' && typeof bValue === 'number'
          ? aValue - bValue
          : collator.compare(String(aValue), String(bValue))

      return sortDirection === 'asc' ? result : -result
    })
  }, [accessors, items, sortDirection, sortKey])

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection('asc')
  }

  return { sorted, sortKey, sortDirection, toggleSort }
}
