import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { usePagination } from '@/hooks/usePagination'
import {
  validationStatusClass,
  validationStatusLabel,
} from '@/lib/attendanceStatus'
import type { AttendanceEvent, Company } from '@/types'
import { formatDateTime } from '@/lib/utils'

export default function History() {
  const [events, setEvents] = useState<AttendanceEvent[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [status, setStatus] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pagination = usePagination(events, 25, `${status}|${companyId}`)

  useEffect(() => {
    void supabase
      .from('companies')
      .select('*')
      .order('name')
      .then(({ data }) => setCompanies((data as Company[]) ?? []))
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      let query = supabase
        .from('attendance_events')
        .select('*, employees(employee_code, profiles(first_name, last_name)), offices(name, code), companies(id, name, commercial_name, tax_id)')
        .order('server_time_received', { ascending: false })
        .limit(500)

      if (status) {
        query = query.eq('validation_status', status)
      }
      if (companyId) {
        query = query.eq('company_id', companyId)
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
  }, [status, companyId])

  const exportCsv = () => {
    const header = [
      'operation_uuid',
      'employee_code',
      'employee',
      'event_type',
      'company',
      'device_id',
      'device_shared',
      'device_time',
      'server_time_received',
      'office',
      'status',
      'rejection_reason',
    ]
    const rows = events.map((ev) => [
      ev.operation_uuid,
      ev.employees?.employee_code ?? '',
      ev.employees?.profiles ? `${ev.employees.profiles.first_name} ${ev.employees.profiles.last_name}` : '',
      ev.event_type,
      ev.companies?.name ?? '',
      ev.device_id ?? '',
      ev.device_shared ? 'Sí' : 'No',
      ev.device_time,
      ev.server_time_received,
      ev.offices?.name ?? '',
      validationStatusLabel(ev.validation_status),
      [ev.rejection_reason, ev.device_review_reason].filter(Boolean).join(' · '),
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

  const selectedCompany = companies.find((company) => company.id === companyId)

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

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-xs">
          <label htmlFor="status" className="label">
            Estado
          </label>
          <select id="status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="SINCRONIZANDO">Sincronizando</option>
            <option value="CONFIRMADO">Confirmado</option>
            <option value="RECHAZADO">Rechazado</option>
            <option value="REQUIERE_REVISION">En revisión</option>
          </select>
        </div>
        <div className="w-full sm:max-w-sm">
          <label htmlFor="history-company" className="label">
            Empresa
          </label>
          <select
            id="history-company"
            className="input"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">Todas las empresas</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
        {selectedCompany && (
          <p className="pb-2 text-xs text-slate-500">
            Mostrando registros de <span className="font-medium text-slate-700">{selectedCompany.name}</span>
            {selectedCompany.tax_id ? ` · RUC ${selectedCompany.tax_id}` : ''}
          </p>
        )}
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
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="table-th">Empleado</th>
                    <th className="table-th">Tipo</th>
                    <th className="table-th">Empresa</th>
                    <th className="table-th">ID de equipo</th>
                    <th className="table-th">Hora dispositivo</th>
                    <th className="table-th">Recepción servidor</th>
                    <th className="table-th">Estado</th>
                    <th className="table-th">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {pagination.pageItems.map((ev) => {
                    const requiresReview = ev.validation_status === 'REQUIERE_REVISION' || ev.device_shared
                    const reason = [ev.rejection_reason, ev.device_review_reason].filter(Boolean).join(' · ')
                    return (
                      <tr key={ev.id} className={ev.device_shared ? 'bg-amber-50/50' : undefined}>
                        <td className="table-td">
                          {ev.employees?.profiles
                            ? `${ev.employees.profiles.first_name} ${ev.employees.profiles.last_name}`
                            : '—'}
                          <div className="font-mono text-xs text-slate-400">{ev.employees?.employee_code}</div>
                        </td>
                        <td className="table-td">{ev.event_type}</td>
                        <td className="table-td">{ev.companies?.name ?? '—'}</td>
                        <td className="table-td">
                          <span className="font-mono text-xs">{ev.device_id ?? '—'}</span>
                          {ev.device_shared && (
                            <span className="badge ml-2 bg-amber-100 text-amber-700" title={ev.device_review_reason ?? undefined}>
                              Compartido
                            </span>
                          )}
                        </td>
                        <td className="table-td whitespace-nowrap">{formatDateTime(ev.device_time)}</td>
                        <td className="table-td whitespace-nowrap">{formatDateTime(ev.server_time_received)}</td>
                        <td className="table-td">
                          <span className={`badge ${requiresReview ? 'bg-amber-100 text-amber-700' : validationStatusClass(ev.validation_status)}`}>
                            {requiresReview ? 'En revisión' : validationStatusLabel(ev.validation_status)}
                          </span>
                        </td>
                        <td className="table-td text-xs text-slate-500">{reason || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={pagination.page}
              pageSize={pagination.pageSize}
              total={pagination.total}
              totalPages={pagination.totalPages}
              start={pagination.start}
              end={pagination.end}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              noun="eventos"
            />
          </>
        )}
      </div>
    </div>
  )
}
