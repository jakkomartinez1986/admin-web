import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { usePagination } from '@/hooks/usePagination'
import {
  validationStatusClass,
  validationStatusLabel,
} from '@/lib/attendanceStatus'
import type { AttendanceEvent, Company } from '@/types'
import { formatDate, formatDateTime, formatTime } from '@/lib/utils'

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
  company_employee_assignments?: {
    company_id: string
    status: string
    start_date: string
    end_date: string | null
    companies: { id: string; name: string; commercial_name: string | null; tax_id: string } | null
  }[] | null
}

interface ReportRow {
  employee_id: string
  employee_code: string
  name: string
  companyId: string | null
  company: string
  companyRuc: string
  office: string
  active: boolean
  entradas: number
  salidas: number
  total: number
  status: 'CON_REGISTROS' | 'VACACIONES' | 'NO_REPORTO'
}

function activeAssignment(employee: RosterEmployee) {
  const assignments = employee.company_employee_assignments ?? []
  return assignments.find((assignment) => assignment.status === 'ACTIVA')
    ?? assignments.find((assignment) => assignment.status === 'FUTURA')
    ?? null
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
  const [companyId, setCompanyId] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [events, setEvents] = useState<AttendanceEvent[]>([])
  const [roster, setRoster] = useState<RosterEmployee[]>([])
  const [vacationEmployeeIds, setVacationEmployeeIds] = useState<Set<string>>(new Set())
  const [offices, setOffices] = useState<{ id: string; name: string }[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      supabase
        .from('offices')
        .select('id, name')
        .eq('is_active', true)
        .order('name'),
      supabase.from('companies').select('*').order('name'),
    ]).then(([officesRes, companiesRes]) => {
      setOffices((officesRes.data as { id: string; name: string }[]) ?? [])
      setCompanies((companiesRes.data as Company[]) ?? [])
    })
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
      if (companyId) eventsQuery = eventsQuery.eq('company_id', companyId)

      let rosterQuery = supabase
        .from('employees')
        .select('id, employee_code, is_active, office_id, offices(name, code), profiles(first_name, last_name), company_employee_assignments(company_id, companies(id, name, commercial_name, tax_id), status, start_date, end_date)')
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
  }, [dateBounds, officeId, companyId, includeInactive, rangeInvalid])

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
      const assignment = activeAssignment(emp)
      return {
        employee_id: emp.id,
        employee_code: emp.employee_code,
        name: emp.profiles ? `${emp.profiles.first_name} ${emp.profiles.last_name}` : '—',
        companyId: assignment?.company_id ?? null,
        company: assignment?.companies?.name ?? '—',
        companyRuc: assignment?.companies?.tax_id ?? '',
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
    return companyId ? rows.filter((row) => row.companyId === companyId) : rows
  }, [roster, events, vacationEmployeeIds, companyId])

  const reportPagination = usePagination(
    reportRows,
    10,
    `${mode}|${date}|${from}|${to}|${officeId}|${companyId}|${includeInactive}`,
  )
  const eventPagination = usePagination(
    events,
    10,
    `${mode}|${date}|${from}|${to}|${officeId}|${companyId}|${includeInactive}`,
  )

  const notReported = useMemo(() => reportRows.filter((r) => r.status === 'NO_REPORTO').length, [reportRows])

  const officeName = (id: string) => (id ? offices.find((o) => o.id === id)?.name ?? 'Oficina' : 'Todas las oficinas')

  const exportReport = (format: 'excel' | 'pdf' = 'excel') => {
    const selectedCompany = companies.find((company) => company.id === companyId)
    const companyLine = selectedCompany
      ? `${selectedCompany.name}${selectedCompany.tax_id ? ` · RUC ${selectedCompany.tax_id}` : ''}`
      : 'Consolidado de todas las empresas'
    const periodLabel = mode === 'day' ? formatDate(`${date}T12:00:00`) : `${from} a ${to}`
    const generated = formatDateTime(new Date().toISOString())
    const fileName = `reporte_asistencia_${(selectedCompany?.name ?? 'todas').toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${mode === 'day' ? date : `${from}_${to}`}`

    const eventStatus = (ev: AttendanceEvent) =>
      ev.device_shared || ev.validation_status === 'REQUIERE_REVISION'
        ? 'En revisión'
        : validationStatusLabel(ev.validation_status)
    const eventReason = (ev: AttendanceEvent) =>
      [ev.rejection_reason, ev.device_review_reason].filter(Boolean).join(' · ')

    interface CompanyGroup {
      key: string
      name: string
      ruc: string
      rows: ReportRow[]
      events: AttendanceEvent[]
    }

    const groups = new Map<string, CompanyGroup>()
    const ensureGroup = (id: string | null, name: string, ruc: string) => {
      const key = id ?? 'sin-empresa'
      const existing = groups.get(key)
      if (existing) {
        if (name && name !== '—' && existing.name === 'Sin empresa') existing.name = name
        if (ruc && !existing.ruc) existing.ruc = ruc
        return existing
      }
      const group = { key, name: name || 'Sin empresa', ruc, rows: [], events: [] }
      groups.set(key, group)
      return group
    }

    for (const row of reportRows) {
      const group = ensureGroup(row.companyId, row.company, row.companyRuc)
      group.rows.push(row)
    }
    for (const event of events) {
      const group = ensureGroup(
        event.company_id,
        event.companies?.name ?? 'Sin empresa',
        event.companies?.tax_id ?? '',
      )
      group.events.push(event)
    }

    const groupList = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
    const sortDetail = (list: AttendanceEvent[]) =>
      [...list].sort((a, b) => {
        const officeCompare = (a.offices?.name ?? '').localeCompare(b.offices?.name ?? '', 'es')
        if (officeCompare !== 0) return officeCompare
        const nameCompare = employeeName(a).localeCompare(employeeName(b), 'es')
        if (nameCompare !== 0) return nameCompare
        return a.server_time_received.localeCompare(b.server_time_received)
      })

    const summaryColumnsCompany = ['Oficina', 'Código', 'Empleado', 'Activo', 'Entradas', 'Salidas', 'Total', 'Estado']
    const detailColumnsCompany = ['Oficina', 'Código', 'Empleado', 'Fecha', 'Hora servidor', 'Hora dispositivo', 'Tipo', 'ID equipo', 'Estado', 'Motivo']

    const summaryRowCompany = (row: ReportRow) => [
      row.office,
      row.employee_code,
      row.name,
      row.active ? 'Sí' : 'No',
      row.entradas,
      row.salidas,
      row.total,
      reportStatusLabels[row.status],
    ]
    const detailRowCompany = (event: AttendanceEvent) => [
      event.offices?.name ?? '',
      event.employees?.employee_code ?? '',
      employeeName(event),
      formatDate(event.server_time_received),
      formatTime(event.server_time_received),
      formatTime(event.device_time),
      event.event_type,
      event.device_id ?? '—',
      eventStatus(event),
      eventReason(event),
    ]

    if (format === 'excel') {
      ;(async () => {
        try {
          const ExcelJS = (await import('exceljs')).default
          const wb = new ExcelJS.Workbook()
          wb.creator = 'Sistema de Asistencia'
          wb.created = new Date()

          const styleTitle = (ws: any, range: string, value: string) => {
            ws.mergeCells(range)
            const cell = ws.getCell(range.split(':')[0])
            cell.value = value
            cell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C5DF5' } }
            cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
            ws.getRow(1).height = 30
          }
          const styleHeader = (row: any, fill = 'FF1C5DF5') => {
            row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
            row.alignment = { vertical: 'middle' }
            row.height = 18
          }
          const addSummarySheet = (name: string, title: string, subtitle: string, rows: ReportRow[], columns: string[], values: (row: ReportRow) => (string | number)[], detailEvents: AttendanceEvent[], detailColumns: string[], detailValues: (event: AttendanceEvent) => (string | number)[]) => {
            const ws = wb.addWorksheet(name, {
              views: [{ state: 'frozen', ySplit: 1 }],
              pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
            })
            styleTitle(ws, `A1:${String.fromCharCode(64 + columns.length)}1`, title)
            ws.addRow([])
            ws.addRow([subtitle])
            ws.addRow(['Período', periodLabel, 'Oficina', officeName(officeId), 'Generado', generated])
            ws.addRow(['Empleados', rows.length, 'Eventos', detailEvents.length, 'Entradas', detailEvents.filter((event) => event.event_type === 'ENTRADA').length, 'Salidas', detailEvents.filter((event) => event.event_type === 'SALIDA').length, 'No reportaron', rows.filter((row) => row.status === 'NO_REPORTO').length])
            ws.addRow([])
            const summaryHeader = ws.addRow(['RESUMEN POR EMPLEADO'])
            summaryHeader.font = { bold: true, size: 11, color: { argb: 'FF1C5DF5' } }
            const headerRow = ws.addRow(columns)
            styleHeader(headerRow)
            for (const row of rows) ws.addRow(values(row))
            ws.addRow([])
            const detailHeader = ws.addRow(['DETALLE DE EVENTOS'])
            detailHeader.font = { bold: true, size: 11, color: { argb: 'FF1C5DF5' } }
            const detailHeaderRow = ws.addRow(detailColumns)
            styleHeader(detailHeaderRow, 'FF0EA5E9')
            for (const event of sortDetail(detailEvents)) ws.addRow(detailValues(event))
            const widths = [24, 18, 18, 14, 26, 8, 10, 10, 10, 14, 16, 30]
            ws.columns.forEach((column, index) => { column.width = widths[index] ?? 14 })
          }

          if (!selectedCompany) {
            const overview = wb.addWorksheet('Resumen general', {
              views: [{ state: 'frozen', ySplit: 1 }],
              pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
            })
            styleTitle(overview, 'A1:G1', 'REPORTE DE ASISTENCIA')
            overview.addRow([])
            overview.addRow(['Consolidado de todas las empresas'])
            overview.addRow(['Período', periodLabel, 'Oficina', officeName(officeId), 'Generado', generated])
            overview.addRow(['Empleados', reportRows.length, 'Eventos', summary.total, 'Entradas', summary.entradas, 'Salidas', summary.salidas, 'No reportaron', notReported])
            overview.addRow([])
            const overviewHeader = overview.addRow(['Empresa', 'RUC', 'Empleados', 'Eventos', 'Entradas', 'Salidas', 'No reportaron'])
            styleHeader(overviewHeader)
            for (const group of groupList) {
              overview.addRow([
                group.name,
                group.ruc,
                group.rows.length,
                group.events.length,
                group.events.filter((event) => event.event_type === 'ENTRADA').length,
                group.events.filter((event) => event.event_type === 'SALIDA').length,
                group.rows.filter((row) => row.status === 'NO_REPORTO').length,
              ])
            }
            overview.columns.forEach((column, index) => { column.width = [28, 18, 12, 12, 12, 12, 14][index] ?? 14 })
          }

          for (const group of groupList) {
            const baseName = (group.name || 'Empresa').replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 28)
            let sheetName = baseName || 'Empresa'
            let suffix = 2
            while (wb.getWorksheet(sheetName)) sheetName = `${baseName.slice(0, 26)} ${suffix++}`
            addSummarySheet(
              sheetName,
              `REPORTE DE ASISTENCIA · ${group.name}`,
              `${group.name}${group.ruc ? ` · RUC ${group.ruc}` : ''} · ${periodLabel}`,
              group.rows,
              summaryColumnsCompany,
              summaryRowCompany,
              group.events,
              detailColumnsCompany,
              detailRowCompany,
            )
          }

          const buffer = await wb.xlsx.writeBuffer()
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `${fileName}.xlsx`
          link.click()
          URL.revokeObjectURL(url)
        } catch (e) {
          console.error(e)
        }
      })()
      return
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    let firstPage = true

    const drawHeader = () => {
      doc.setFillColor(28, 93, 245)
      doc.rect(0, 0, pageWidth, 27, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(15)
      doc.text('REPORTE DE ASISTENCIA', 14, 11)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(companyLine, 14, 18)
      doc.text(`Período: ${periodLabel}`, 14, 23)
      doc.text(`Generado: ${generated}`, pageWidth - 14, 23, { align: 'right' })
      doc.setTextColor(30, 41, 59)
    }

    const startPage = () => {
      if (!firstPage) doc.addPage()
      firstPage = false
      drawHeader()
    }

    const drawStats = (stats: [string, string][]) => {
      const gap = 3
      const boxWidth = (pageWidth - 28 - gap * 3) / 4
      stats.forEach(([label, value], index) => {
        const x = 14 + index * (boxWidth + gap)
        doc.setFillColor(248, 250, 252)
        doc.setDrawColor(226, 232, 240)
        doc.roundedRect(x, 32, boxWidth, 14, 2, 2, 'FD')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(100, 116, 139)
        doc.text(label.toUpperCase(), x + 3, 37)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(12)
        doc.setTextColor(30, 41, 59)
        doc.text(value, x + 3, 43)
      })
      doc.setFont('helvetica', 'normal')
      return 51
    }

    const tableStyles = {
      styles: { fontSize: 7.5, cellPadding: 1.4, overflow: 'linebreak' as const },
      headStyles: { fillColor: [28, 93, 245] as [number, number, number], textColor: 255, fontStyle: 'bold' as const },
      alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
      margin: { left: 14, right: 14, bottom: 14 },
    }

    if (!selectedCompany) {
      startPage()
      let cursor = drawStats([
        ['Empleados', String(reportRows.length)],
        ['Eventos', String(summary.total)],
        ['Entradas', String(summary.entradas)],
        ['No reportaron', String(notReported)],
      ])
      autoTable(doc, {
        ...tableStyles,
        head: [['Empresa', 'RUC', 'Empleados', 'Eventos', 'Entradas', 'Salidas', 'No reportaron']],
        body: groupList.map((group) => [
          group.name,
          group.ruc,
          group.rows.length,
          group.events.length,
          group.events.filter((event) => event.event_type === 'ENTRADA').length,
          group.events.filter((event) => event.event_type === 'SALIDA').length,
          group.rows.filter((row) => row.status === 'NO_REPORTO').length,
        ]),
        startY: cursor,
      })
      cursor = ((doc as any).lastAutoTable?.finalY ?? cursor) + 6
      doc.setFontSize(9)
      doc.setTextColor(100, 116, 139)
      doc.text('El detalle por empresa se presenta en las páginas siguientes.', 14, cursor)
    }

    for (const group of groupList) {
      startPage()
      let cursor = drawStats([
        ['Empleados', String(group.rows.length)],
        ['Eventos', String(group.events.length)],
        ['Entradas', String(group.events.filter((event) => event.event_type === 'ENTRADA').length)],
        ['Salidas', String(group.events.filter((event) => event.event_type === 'SALIDA').length)],
      ])
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(28, 93, 245)
      doc.text(`Empresa: ${group.name}`, 14, cursor)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(100, 116, 139)
      doc.text(
        [group.ruc ? `RUC ${group.ruc}` : '', `Oficina: ${officeName(officeId)}`, `Empleados: ${group.rows.length}`].filter(Boolean).join(' · '),
        14,
        cursor + 5,
      )
      cursor += 10
      doc.setTextColor(30, 41, 59)

      autoTable(doc, {
        ...tableStyles,
        head: [summaryColumnsCompany],
        body: group.rows.map(summaryRowCompany),
        startY: cursor,
      })
      cursor = ((doc as any).lastAutoTable?.finalY ?? cursor) + 6
      if (group.events.length > 0) {
        autoTable(doc, {
          ...tableStyles,
          head: [detailColumnsCompany],
          body: sortDetail(group.events).map(detailRowCompany),
          startY: cursor,
          styles: { ...tableStyles.styles, fontSize: 6.8 },
        })
      }
    }

    const pageCount = doc.getNumberOfPages()
    for (let page = 1; page <= pageCount; page++) {
      doc.setPage(page)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(148, 163, 184)
      doc.text('Sistema de Asistencia', 14, pageHeight - 6)
      doc.text(`Página ${page} de ${pageCount}`, pageWidth - 14, pageHeight - 6, { align: 'right' })
    }

    doc.save(`${fileName}.pdf`)
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

        <div className="sm:w-64">
          <label htmlFor="company" className="label">
            Empresa
          </label>
          <select id="company" className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Todas</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
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
            <>
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
                  {reportPagination.pageItems.map((row) => (
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
            <Pagination
              page={reportPagination.page}
              pageSize={reportPagination.pageSize}
              total={reportPagination.total}
              totalPages={reportPagination.totalPages}
              start={reportPagination.start}
              end={reportPagination.end}
              onPageChange={reportPagination.setPage}
              onPageSizeChange={reportPagination.setPageSize}
              noun="empleados"
            />
            </>
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
            <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="table-th">Fecha y hora (servidor)</th>
                    <th className="table-th">Empleado</th>
                    <th className="table-th">Tipo</th>
                    <th className="table-th">Empresa</th>
                    <th className="table-th">Oficina</th>
                    <th className="table-th">ID de equipo</th>
                    <th className="table-th">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {eventPagination.pageItems.map((ev) => {
                    const requiresReview = ev.validation_status === 'REQUIERE_REVISION' || ev.device_shared
                    return (
                      <tr key={ev.id} className={ev.device_shared ? 'bg-amber-50/50' : undefined}>
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
                          <span className="font-mono text-xs">{ev.device_id ?? '—'}</span>
                          {ev.device_shared && (
                            <span className="badge ml-2 bg-amber-100 text-amber-700">Compartido</span>
                          )}
                        </td>
                        <td className="table-td">
                          <span className={`badge ${requiresReview ? 'bg-amber-100 text-amber-700' : validationStatusClass(ev.validation_status)}`}>
                            {requiresReview ? 'En revisión' : validationStatusLabel(ev.validation_status)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={eventPagination.page}
              pageSize={eventPagination.pageSize}
              total={eventPagination.total}
              totalPages={eventPagination.totalPages}
              start={eventPagination.start}
              end={eventPagination.end}
              onPageChange={eventPagination.setPage}
              onPageSizeChange={eventPagination.setPageSize}
              noun="eventos"
            />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
