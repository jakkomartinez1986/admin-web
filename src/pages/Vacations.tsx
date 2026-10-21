import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, CalendarOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import { Modal } from '@/components/ui/Modal'
import type { Employee, EmployeeVacation } from '@/types'
import { formatDate } from '@/lib/utils'

interface VacationRow extends EmployeeVacation {
  employees?: {
    employee_code: string
    offices?: { name: string } | null
    profiles?: { first_name: string; last_name: string } | null
  } | null
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function Vacations() {
  const [vacations, setVacations] = useState<VacationRow[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [empQuery, setEmpQuery] = useState('')
  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [vacRes, empRes] = await Promise.all([
      supabase
        .from('employee_vacations')
        .select('*, employees(employee_code, offices(name), profiles(first_name, last_name))')
        .order('start_date', { ascending: false }),
      supabase
        .from('employees')
        .select('*, profiles(first_name, last_name)')
        .eq('is_active', true)
        .order('last_name', { referencedTable: 'profiles' }),
    ])
    if (vacRes.error) setError(vacRes.error.message)
    else setVacations((vacRes.data as VacationRow[]) ?? [])
    setEmployees((empRes.data as Employee[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const today = todayIso()
  const activeCount = useMemo(
    () => vacations.filter((v) => v.status === 'APROBADA' && v.start_date <= today && v.end_date >= today).length,
    [vacations, today],
  )

  const filteredEmployees = useMemo(() => {
    const q = empQuery.trim().toLowerCase()
    if (!q) return employees
    return employees.filter((emp) => {
      const full = `${emp.profiles?.first_name ?? ''} ${emp.profiles?.last_name ?? ''}`.toLowerCase()
      const code = emp.employee_code.toLowerCase()
      const email = (emp.profiles?.email ?? '').toLowerCase()
      return full.includes(q) || code.includes(q) || email.includes(q)
    })
  }, [employees, empQuery])

  const filteredVacations = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return vacations
    return vacations.filter((v) => {
      const p = v.employees?.profiles
      const full = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.toLowerCase()
      const code = (v.employees?.employee_code ?? '').toLowerCase()
      const office = (v.employees?.offices?.name ?? '').toLowerCase()
      return full.includes(q) || code.includes(q) || office.includes(q)
    })
  }, [vacations, search])

  const selectedEmployee = employees.find((e) => e.id === employeeId)

  const openCreate = () => {
    setEmployeeId('')
    setEmpQuery('')
    setStartDate(today)
    setEndDate(today)
    setReason('')
    setError(null)
    setModalOpen(true)
  }

  const submit = async () => {
    if (!employeeId || !startDate || !endDate) {
      setError('Selecciona un empleado y el rango de fechas.')
      return
    }
    if (endDate < startDate) {
      setError('La fecha de fin debe ser igual o posterior a la de inicio.')
      return
    }
    setSaving(true)
    setError(null)
    const { error: insErr } = await supabase.from('employee_vacations').insert({
      employee_id: employeeId,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim() || null,
      status: 'APROBADA',
    })
    if (insErr) {
      setError(insErr.message)
      setSaving(false)
      return
    }
    setSaving(false)
    setModalOpen(false)
    await load()
  }

  const remove = async (id: string) => {
    const { error: delErr } = await supabase.from('employee_vacations').delete().eq('id', id)
    if (delErr) setError(delErr.message)
    else setVacations((prev) => prev.filter((v) => v.id !== id))
  }

  const statusOf = (v: VacationRow) => {
    if (v.status !== 'APROBADA') return { label: v.status, cls: 'bg-slate-100 text-slate-600' }
    if (v.start_date > today) return { label: 'Programada', cls: 'bg-blue-100 text-blue-700' }
    if (v.end_date < today) return { label: 'Finalizada', cls: 'bg-slate-100 text-slate-600' }
    return { label: 'De vacaciones', cls: 'bg-amber-100 text-amber-700' }
  }

  return (
    <div>
      <PageHeader
        title="Vacaciones"
        description={`Empleados en vacaciones: ${activeCount}`}
        action={
          <button type="button" className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Asignar vacaciones
          </button>
        }
      />

      <div className="mb-4">
        <input
          type="text"
          className="input max-w-sm"
          placeholder="Buscar por empleado, código u oficina..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-600" role="alert">
            {error}
          </div>
        ) : vacations.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No hay vacaciones registradas.</div>
        ) : filteredVacations.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Sin resultados para "{search}".</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="table-th">Empleado</th>
                  <th className="table-th">Código</th>
                  <th className="table-th">Oficina</th>
                  <th className="table-th">Primer día sin registrar</th>
                  <th className="table-th">Último día sin registrar</th>
                  <th className="table-th">Motivo</th>
                  <th className="table-th">Estado</th>
                  <th className="table-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredVacations.map((v) => {
                  const st = statusOf(v)
                  const p = v.employees?.profiles
                  return (
                    <tr key={v.id}>
                      <td className="table-td">{p ? `${p.first_name} ${p.last_name}` : '—'}</td>
                      <td className="table-td font-mono text-xs">{v.employees?.employee_code ?? '—'}</td>
                      <td className="table-td">{v.employees?.offices?.name ?? '—'}</td>
                      <td className="table-td">{formatDate(v.start_date)}</td>
                      <td className="table-td">{formatDate(v.end_date)}</td>
                      <td className="table-td">{v.reason ?? '—'}</td>
                      <td className="table-td">
                        <span className={`badge ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="table-td">
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => remove(v.id)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Eliminar"
                            aria-label="Eliminar vacaciones"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        title="Asignar vacaciones"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={submit} disabled={saving}>
              {saving ? 'Guardando…' : 'Asignar'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="label" htmlFor="v-emp-search">Empleado</label>
            {selectedEmployee ? (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <span>
                  {selectedEmployee.profiles?.first_name} {selectedEmployee.profiles?.last_name} (
                  {selectedEmployee.employee_code})
                </span>
                <button
                  type="button"
                  className="text-xs text-brand-700 hover:text-brand-800"
                  onClick={() => { setEmployeeId(''); setEmpQuery('') }}
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <>
                <input
                  id="v-emp-search"
                  className="input mb-2"
                  placeholder="Buscar por nombre, código o correo..."
                  value={empQuery}
                  onChange={(e) => setEmpQuery(e.target.value)}
                />
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                  {filteredEmployees.length === 0 ? (
                    <p className="p-3 text-xs text-slate-400">Sin resultados</p>
                  ) : (
                    filteredEmployees.map((emp) => (
                      <button
                        key={emp.id}
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        onClick={() => { setEmployeeId(emp.id); setEmpQuery('') }}
                      >
                        <span>
                          {emp.profiles?.first_name} {emp.profiles?.last_name}
                        </span>
                        <span className="font-mono text-xs text-slate-400">{emp.employee_code}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="v-start">Primer día sin registrar</label>
              <input id="v-start" type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="v-end">Último día sin registrar</label>
              <input id="v-end" type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="v-reason">Motivo (opcional)</label>
            <input id="v-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <p className="flex items-center gap-2 text-xs text-slate-400">
            <CalendarOff className="h-3.5 w-3.5" />
            Durante este rango el empleado no podrá registrar asistencia.
          </p>
        </div>
      </Modal>
    </div>
  )
}
