import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import type { AttendanceEvent } from '@/types'
import { formatDateTime } from '@/lib/utils'

const statusStyles: Record<string, string> = {
  PENDIENTE: 'bg-slate-100 text-slate-600',
  SINCRONIZANDO: 'bg-blue-100 text-blue-700',
  CONFIRMADO: 'bg-green-100 text-green-700',
  RECHAZADO: 'bg-red-100 text-red-700',
  REQUIERE_REVISION: 'bg-amber-100 text-amber-700',
}

export default function History() {
  const [events, setEvents] = useState<AttendanceEvent[]>([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      let query = supabase
        .from('attendance_events')
        .select('*, employees(employee_code, profiles(first_name, last_name)), offices(name, code), companies(id, name, commercial_name, tax_id)')
        .order('server_time_received', { ascending: false })
        .limit(200)

      if (status) {
        query = query.eq('validation_status', status)
      }

      const { data, error: loadError } = await query

      if (loadError) {
        setError(loadError.message)
      } else {
        setEvents((data as AttendanceEvent[]) ?? [])
      }
      setLoading(false)
    }

    void load()
  }, [status])

  const exportCsv = () => {
    const header = ['operation_uuid', 'employee_code', 'employee', 'event_type', 'company', 'device_time', 'server_time_received', 'office', 'status', 'rejection_reason']
    const rows = events.map((ev) => [
      ev.operation_uuid,
      ev.employees?.employee_code ?? '',
      ev.employees?.profiles ? `${ev.employees.profiles.first_name} ${ev.employees.profiles.last_name}` : '',
      ev.event_type,
      ev.companies?.name ?? '',
      ev.device_time,
      ev.server_time_received,
      ev.offices?.name ?? '',
      ev.validation_status,
      ev.rejection_reason ?? '',
    ])

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `historial_asistencia_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageHeader
        title="Historial y sincronización"
        description="Eventos sincronizados, rechazados o en revisión"
        action={
          <button type="button" className="btn-secondary" onClick={exportCsv} disabled={events.length === 0}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
        }
      />

      <div className="mb-4 max-w-xs">
        <label htmlFor="status" className="label">
          Estado
        </label>
        <select id="status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="SINCRONIZANDO">Sincronizando</option>
          <option value="CONFIRMADO">Confirmado</option>
          <option value="RECHAZADO">Rechazado</option>
          <option value="REQUIERE_REVISION">Requiere revisión</option>
        </select>
      </div>

      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-600" role="alert">
            {error}
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No hay eventos con los filtros aplicados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="table-th">Empleado</th>
                  <th className="table-th">Tipo</th>
                  <th className="table-th">Empresa</th>
                  <th className="table-th">Hora dispositivo</th>
                  <th className="table-th">Recepción servidor</th>
                  <th className="table-th">Estado</th>
                  <th className="table-th">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td className="table-td">
                      {ev.employees?.profiles
                        ? `${ev.employees.profiles.first_name} ${ev.employees.profiles.last_name}`
                        : '—'}
                    </td>
                    <td className="table-td">{ev.event_type}</td>
                    <td className="table-td">{ev.companies?.name ?? '—'}</td>
                    <td className="table-td whitespace-nowrap">{formatDateTime(ev.device_time)}</td>
                    <td className="table-td whitespace-nowrap">{formatDateTime(ev.server_time_received)}</td>
                    <td className="table-td">
                      <span className={`badge ${statusStyles[ev.validation_status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {ev.validation_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="table-td text-xs text-slate-500">{ev.rejection_reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
