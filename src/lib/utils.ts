import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Guayaquil',
  }).format(date)
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeZone: 'America/Guayaquil' }).format(date)
}

export function describeDeleteError(error: { message: string; code?: string } | null | undefined, subject: string): string {
  const message = error?.message ?? 'No se pudo completar la eliminación.'
  const code = error?.code ?? ''
  if (code === '23503' || /foreign key|still referenced/i.test(message)) {
    return `No se puede eliminar ${subject}: tiene registros relacionados (por ejemplo asistencias o historial). Desactívalo en su lugar.`
  }
  if (code === '42501' || /permission denied|row-level security|insufficient/i.test(message)) {
    return `No tienes permisos para eliminar ${subject}.`
  }
  return message
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-EC', { timeStyle: 'short', timeZone: 'America/Guayaquil' }).format(date)
}
