import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import type { AttendanceEvent } from '@/types'
import { formatDate, formatDateTime, formatTime } from '@/lib/utils'

const statusStyles: Record<string, string> = {
  PENDIENTE: 'bg-slate-100 text-slate-600',
  SINCRONIZANDO: 'bg-blue-100 text-blue-700',
  CONFIRMADO: 'bg-green-100 text-green-700',
  RECHAZADO: 'bg-red-100 text-red-700',
  REQUIERE_REVISION: 'bg-amber-100 text-amber-700',
}

const reportStatusStyles: Record<string, string> = {
  CON_REGISTROS: 'bg-green-100 text-green-700',
  VACACIONES: 'bg-blue-100 text-blue-700',
  NO_REPORTO: 'bg-red-100 text-red-700',
}

const reportStatusLabels: Record<string, string> = {
  CON_REGISTROS: 'Con registros',
  VACACIONES: 'Vacaciones',
  NO_REPORTO: 'No se reportó',
}

type Mode = 'day' | 'range'

interface RosterEmployee {
  id: string
  employee_code: string
  is_active: boolean
  office_id: string | null
  offices: { name: string; code: string } | null
  profiles: { first_name: string; last_name: string } | null
  company_employee_assignments?: { status: string; companies: { id: string; name: string } | null }[] | null
}

interface ReportRow {
  employee_id: string
  employee_code: string
  name: string
  company: string
  office: string
  active: boolean
  entradas: number
  salidas: number
  total: number
  status: 'CON_REGISTROS' | 'VACACIONES' | 'NO_REPORTO'
}

function toLocalDateInput(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function employeeName(ev: AttendanceEvent): string {
  const profile = ev.employees?.profiles
  return profile ? `${profile.first_name} ${profile.last_name}` : ''
}

export default function Attendance() {
  const today = useMemo(() => toLocalDateInput(new Date()), [])
  const [mode, setMode] = useState<Mode>('day')
  const [date, setDate] = useState(today)
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [officeId, setOfficeId] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [events, setEvents] = useState<AttendanceEvent[]>([])
  const [roster, setRoster] = useState<RosterEmployee[]>([])
  const [vacationEmployeeIds, setVacationEmployeeIds] = useState<Set<string>>(new Set())
  const [offices, setOffices] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void supabase
      .from('offices')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setOffices((data as { id: string; name: string }[]) ?? []))
  }, [])

  const dateBounds = useMemo(() => {
    if (mode === 'day') return { startDate: date, endDate: date }
    return { startDate: from, endDate: to }
  }, [mode, date, from, to])

  const rangeInvalid = mode === 'range' && to < from

  useEffect(() => {
    if (rangeInvalid) {
      setEvents([])
      setRoster([])
      setVacationEmployeeIds(new Set())
      setLoading(false)
      return
    }

    async function load() {
      setLoading(true)
      setError(null)

      const start = new Date(`${dateBounds.startDate}T00:00:00`)
      const end = new Date(`${dateBounds.endDate}T00:00:00`)
      end.setDate(end.getDate() + 1)

      let eventsQuery = supabase
        .from('attendance_events')
        .select('*, employees(employee_code, profiles(first_name, last_name)), offices(name, code), companies(id, name, commercial_name, tax_id)')
        .gte('device_time', start.toISOString())
        .lt('device_time', end.toISOString())
        .order('device_time', { ascending: false })
      if (officeId) eventsQuery = eventsQuery.eq('office_id', officeId)

      let rosterQuery = supabase
        .from('employees')
        .select('id, employee_code, is_active, office_id, offices(name, code), profiles(first_name, last_name), company_employee_assignments(company_id, companies(id, name), status, start_date, end_date))')
        .order('last_name', { referencedTable: 'profiles', ascending: true })
      if (!includeInactive) rosterQuery = rosterQuery.eq('is_active', true)
      if (officeId) rosterQuery = rosterQuery.eq('office_id', officeId)

      const vacationsQuery = supabase
        .from('employee_vacations')
        .select('employee_id')
        .lte('start_date', dateBounds.endDate)
        .gte('end_date', dateBounds.startDate)

      const [eventsRes, rosterRes, vacationsRes] = await Promise.all([eventsQuery, rosterQuery, vacationsQuery])

      const loadError = eventsRes.error ?? rosterRes.error ?? vacationsRes.error
      if (loadError) {
        setError(loadError.message)
      } else {
        setEvents((eventsRes.data as AttendanceEvent[]) ?? [])
        setRoster((rosterRes.data as unknown as RosterEmployee[]) ?? [])
        setVacationEmployeeIds(new Set((vacationsRes.data ?? []).map((v: { employee_id: string }) => v.employee_id)))
      }
      setLoading(false)
    }

    void load()
  }, [dateBounds, officeId, includeInactive, rangeInvalid])

  const summary = useMemo(() => {
    const entradas = events.filter((e) => e.event_type === 'ENTRADA').length
    const salidas = events.filter((e) => e.event_type === 'SALIDA').length
    const uniqueEmployees = new Set(events.map((e) => e.employee_id)).size
    return { total: events.length, entradas, salidas, uniqueEmployees }
  }, [events])

  const reportRows = useMemo<ReportRow[]>(() => {
    const counts = new Map<string, { entradas: number; salidas: number }>()
    for (const ev of events) {
      const current = counts.get(ev.employee_id) ?? { entradas: 0, salidas: 0 }
      if (ev.event_type === 'ENTRADA') current.entradas++
      else current.salidas++
      counts.set(ev.employee_id, current)
    }

    const rows: ReportRow[] = roster.map((emp) => {
      const c = counts.get(emp.id) ?? { entradas: 0, salidas: 0 }
      const total = c.entradas + c.salidas
      let status: ReportRow['status'] = 'NO_REPORTO'
      if (total > 0) status = 'CON_REGISTROS'
      else if (vacationEmployeeIds.has(emp.id)) status = 'VACACIONES'
      const activeAssignment =
        (emp.company_employee_assignments ?? []).find((a) => a.status === 'ACTIVA') ??
        (emp.company_employee_assignments ?? []).find((a) => a.status === 'FUTURA')
      return {
        employee_id: emp.id,
        employee_code: emp.employee_code,
        name: emp.profiles ? `${emp.profiles.first_name} ${emp.profiles.last_name}` : '—',
        company: activeAssignment?.companies?.name ?? '—',
        office: emp.offices?.name ?? '—',
        active: emp.is_active,
        entradas: c.entradas,
        salidas: c.salidas,
        total,
        status,
      }
    })

    rows.sort((a, b) => {
      const companyCompare = a.company.localeCompare(b.company, 'es')
      if (companyCompare !== 0) return companyCompare
      const officeCompare = a.office.localeCompare(b.office, 'es')
      if (officeCompare !== 0) return officeCompare
      return a.name.localeCompare(b.name, 'es')
    })
    return rows
  }, [roster, events, vacationEmployeeIds])

  const notReported = useMemo(() => reportRows.filter((r) => r.status === 'NO_REPORTO').length, [reportRows])

  const rangeLabel = () => (mode === 'day' ? date : `${from} a ${to}`)

  const officeName = (id: string) => (id ? offices.find((o) => o.id === id)?.name ?? 'Oficina' : 'Todas las oficinas')

  const exportReport = (format: 'excel' | 'pdf' = 'excel') => {
    const meta = [
      ['Reporte de asistencia'],
      [`Rango: ${rangeLabel()}`],
      [`Oficina: ${officeName(officeId)}`],
      [`Incluye inactivos: ${includeInactive ? 'Sí' : 'No'}`],
      [`Total eventos: ${summary.total}`],
      [`Entradas: ${summary.entradas}`],
      [`Salidas: ${summary.salidas}`],
      [`Empleados en nómina: ${reportRows.length}`],
      [`No se reportaron: ${notReported}`],
      [`Generado: ${formatDateTime(new Date().toISOString())}`],
      [],
    ]

    const summaryColumns = ['Empresa', 'Oficina', 'Código', 'Empleado', 'Activo', 'Entradas', 'Salidas', 'Total', 'Estado']
    const summaryRows = reportRows.map((r) => [
      r.company,
      r.office,
      r.employee_code,
      r.name,
      r.active ? 'Sí' : 'No',
      r.entradas,
      r.salidas,
      r.total,
      reportStatusLabels[r.status],
    ])

    const detailColumns = ['Empresa', 'Oficina', 'Código', 'Empleado', 'Fecha (servidor)', 'Hora (servidor)', 'Hora dispositivo', 'Tipo', 'Estado', 'Motivo']
    const detailSorted = [...events]
      .sort((a, b) => {
        const companyCompare = (a.companies?.name ?? '').localeCompare(b.companies?.name ?? '', 'es')
        if (companyCompare !== 0) return companyCompare
        const officeCompare = (a.offices?.name ?? '').localeCompare(b.offices?.name ?? '', 'es')
        if (officeCompare !== 0) return officeCompare
        const nameCompare = employeeName(a).localeCompare(employeeName(b), 'es')
        if (nameCompare !== 0) return nameCompare
        return a.server_time_received.localeCompare(b.server_time_received)
      })
    const detailRows = detailSorted.map((ev) => [
      ev.companies?.commercial_name ?? ev.companies?.name ?? '',
      ev.offices?.name ?? '',
      ev.employees?.employee_code ?? '',
      employeeName(ev),
      formatDate(ev.server_time_received),
      formatTime(ev.server_time_received),
      formatTime(ev.device_time),
      ev.event_type,
      ev.validation_status,
      ev.rejection_reason ?? '',
    ])

    const lines: (string | number)[][] = [
      ...meta,
      ['RESUMEN POR EMPLEADO'],
      summaryColumns,
      ...summaryRows,
      [],
      ['DETALLE DE EVENTOS'],
      detailColumns,
      ...detailRows,
    ]

    if (format === 'excel') {
      ;(async () => {
        try {
          const ExcelJS = (await import('exceljs')).default
          const wb = new ExcelJS.Workbook()
          const ws = wb.addWorksheet('Reporte de asistencia')
          ws.addRows(lines as any)
          ws.columns.forEach((col) => { col.width = 18 })
          const buffer = await wb.xlsx.writeBuffer()
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `reporte_asistencia_${mode === 'day' ? date : `${from}_${to}`}.xlsx`
          link.click()
          URL.revokeObjectURL(url)
        } catch (e) {
          console.error(e)
        }
      })()
      return
    }

    // PDF: una hoja por empresa (primera hoja = resumen global)
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    doc.setFontSize(14)
    doc.text('Reporte de asistencia', 14, 15)
    doc.setFontSize(9)
    doc.text(`Rango: ${rangeLabel()}`, 14, 22)
    doc.text(`Oficina: ${officeName(officeId)}`, 14, 26)
    doc.text(`Generado: ${formatDateTime(new Date().toISOString())}`, 14, 30)
    autoTable(doc, {
      head: [summaryColumns],
      body: summaryRows as any,
      startY: 35,
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [16, 185, 129] },
    })
    autoTable(doc, {
      head: [detailColumns],
      body: detailRows as any,
      startY: (doc as any).lastAutoTable?.finalY + 5 || 50,
      styles: { fontSize: 7, cellPadding: 1 },
      headStyles: { fillColor: [14, 165, 233] },
      pageBreak: 'auto',
    })

    // Hojas por empresa
    const byCompany = new Map<string, { summary: ReportRow[]; detail: AttendanceEvent[] }>()
    const companyKey = (name: string) => name || '—'
    for (const r of reportRows) {
      const key = companyKey(r.company)
      const bucket = byCompany.get(key) ?? { summary: [], detail: [] }
      bucket.summary.push(r)
      byCompany.set(key, bucket)
    }
    for (const ev of events) {
      const key = companyKey(ev.companies?.name ?? '')
      const bucket = byCompany.get(key) ?? { summary: [], detail: [] }
      bucket.detail.push(ev)
      byCompany.set(key, bucket)
    }

    for (const [companyName, bucket] of byCompany) {
      doc.addPage()
      doc.setFontSize(13)
      doc.text(`Empresa: ${companyName}`, 14, 15)
      doc.setFontSize(9)
      doc.text(
        `Empleados: ${bucket.summary.length} · Eventos: ${bucket.detail.length} · Rango: ${rangeLabel()}`,
        14,
        22,
      )
      autoTable(doc, {
        head: [summaryColumns],
        body: bucket.summary
          .map((r) => [
            r.company,
            r.office,
            r.employee_code,
            r.name,
            r.active ? 'Sí' : 'No',
            r.entradas,
            r.salidas,
            r.total,
            reportStatusLabels[r.status],
          ]) as any,
        startY: 27,
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [16, 185, 129] },
      })
      const companyDetail = [...bucket.detail].sort((a, b) => {
        const officeCompare = (a.offices?.name ?? '').localeCompare(b.offices?.name ?? '', 'es')
        if (officeCompare !== 0) return officeCompare
        const nameCompare = employeeName(a).localeCompare(employeeName(b), 'es')
        if (nameCompare !== 0) return nameCompare
        return a.server_time_received.localeCompare(b.server_time_received)
      })
      if (companyDetail.length > 0) {
        autoTable(doc, {
          head: [detailColumns],
          body: companyDetail.map((ev) => [
            ev.companies?.commercial_name ?? ev.companies?.name ?? '',
            ev.offices?.name ?? '',
            ev.employees?.employee_code ?? '',
            employeeName(ev),
            formatDate(ev.server_time_received),
            formatTime(ev.server_time_received),
            formatTime(ev.device_time),
            ev.event_type,
            ev.validation_status,
            ev.rejection_reason ?? '',
          ]) as any,
          startY: (doc as any).lastAutoTable?.finalY + 5 || 60,
          styles: { fontSize: 7, cellPadding: 1 },
          headStyles: { fillColor: [14, 165, 233] },
          pageBreak: 'auto',
        })
      }
    }

    doc.save(`reporte_asistencia_${mode === 'day' ? date : `${from}_${to}`}.pdf`)
  }

  return (
    <div>
      <PageHeader
        title="Asistencia"
        description="Eventos de entrada y salida"
        action={
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => exportReport('excel')} disabled={reportRows.length === 0 && events.length === 0}>
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </button>
            <button type="button" className="btn-primary" onClick={() => exportReport('pdf')} disabled={reportRows.length === 0 && events.length === 0}>
              <Download className="h-4 w-4" />
              PDF
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div>
          <label htmlFor="mode" className="label">
            Modo
          </label>
          <select id="mode" className="input" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="day">Por día</option>
            <option value="range">Por rango de fechas</option>
          </select>
        </div>

        {mode === 'day' ? (
          <div>
            <label htmlFor="date" className="label">
              Fecha
            </label>
            <input id="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="from" className="label">
                Desde
              </label>
              <input id="from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label htmlFor="to" className="label">
                Hasta
              </label>
              <input id="to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        )}

        <div className="sm:w-64">
          <label htmlFor="office" className="label">
            Oficina
          </label>
          <select id="office" className="input" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
            <option value="">Todas</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Incluir empleados inactivos
        </label>
      </div>

      {rangeInvalid && (
        <div role="alert" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          La fecha "Hasta" debe ser posterior o igual a "Desde".
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total eventos</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.total}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-400">Entradas</p>
          <p className="mt-1 text-2xl font-semibold text-brand-600">{summary.entradas}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-400">Salidas</p>
          <p className="mt-1 text-2xl font-semibold text-orange-600">{summary.salidas}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-400">En nómina</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{reportRows.length}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-400">No reportaron</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{notReported}</p>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Resumen por empleado</h2>
        <div className="card overflow-hidden p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Cargando…</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-red-600" role="alert">
              {error}
            </div>
          ) : reportRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No hay empleados para los filtros seleccionados.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="table-th">Empresa</th>
                    <th className="table-th">Oficina</th>
                    <th className="table-th">Código</th>
                    <th className="table-th">Empleado</th>
                    <th className="table-th">Entradas</th>
                    <th className="table-th">Salidas</th>
                    <th className="table-th">Total</th>
                    <th className="table-th">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {reportRows.map((row) => (
                    <tr key={row.employee_id} className={row.active ? undefined : 'opacity-60'}>
                      <td className="table-td">{row.company}</td>
                      <td className="table-td">{row.office}</td>
                      <td className="table-td font-mono text-xs">{row.employee_code}</td>
                      <td className="table-td">
                        {row.name}
                        {!row.active && <span className="ml-2 text-xs text-slate-400">(inactivo)</span>}
                      </td>
                      <td className="table-td">{row.entradas}</td>
                      <td className="table-td">{row.salidas}</td>
                      <td className="table-td">{row.total}</td>
                      <td className="table-td">
                        <span className={`badge ${reportStatusStyles[row.status]}`}>{reportStatusLabels[row.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Detalle de eventos</h2>
        <div className="card overflow-hidden p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Cargando…</div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500">
              <FileSpreadsheet className="h-6 w-6 text-slate-300" />
              No hay eventos para el período seleccionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="table-th">Fecha y hora (servidor)</th>
                    <th className="table-th">Empleado</th>
                    <th className="table-th">Tipo</th>
                    <th className="table-th">Empresa</th>
                    <th className="table-th">Oficina</th>
                    <th className="table-th">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {events.map((ev) => (
                    <tr key={ev.id}>
                      <td className="table-td whitespace-nowrap">{formatDateTime(ev.server_time_received)}</td>
                      <td className="table-td">
                        {ev.employees?.profiles
                          ? `${ev.employees.profiles.first_name} ${ev.employees.profiles.last_name}`
                          : '—'}
                      </td>
                      <td className="table-td">
                        <span
                          className={
                            ev.event_type === 'ENTRADA'
                              ? 'badge bg-brand-50 text-brand-700'
                              : 'badge bg-orange-100 text-orange-700'
                          }
                        >
                          {ev.event_type}
                        </span>
                      </td>
                      <td className="table-td">{ev.companies?.name ?? '—'}</td>
                      <td className="table-td">{ev.offices?.name ?? '—'}</td>
                      <td className="table-td">
                        <span className={`badge ${statusStyles[ev.validation_status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {ev.validation_status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
