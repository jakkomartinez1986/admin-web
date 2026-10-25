export const validationStatusStyles: Record<string, string> = {
  PENDIENTE: 'bg-slate-100 text-slate-600',
  SINCRONIZANDO: 'bg-blue-100 text-blue-700',
  CONFIRMADO: 'bg-green-100 text-green-700',
  RECHAZADO: 'bg-red-100 text-red-700',
  REQUIERE_REVISION: 'bg-amber-100 text-amber-700',
}

export const validationStatusLabels: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  SINCRONIZANDO: 'Sincronizando',
  CONFIRMADO: 'Confirmado',
  RECHAZADO: 'Rechazado',
  REQUIERE_REVISION: 'En revisión',
}

export function validationStatusLabel(status: string): string {
  return validationStatusLabels[status] ?? status.replace(/_/g, ' ')
}

export function validationStatusClass(status: string): string {
  return validationStatusStyles[status] ?? 'bg-slate-100 text-slate-600'
}
