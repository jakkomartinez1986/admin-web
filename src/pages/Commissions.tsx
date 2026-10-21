import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { Commission, CommissionApprovalStatus, Employee, Role } from '@/types'
import { describeDeleteError, formatDate } from '@/lib/utils'

export default function Commissions() {
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)
  const [reasonModal, setReasonModal] = useState<{ id: string; status: 'RECHAZADA' | 'REVOCADA'; label: string } | null>(null)
  const [reason, setReason] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [detail, setDetail] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [employees, setEmployees] = useState<Employee[]>([])
  const [query, setQuery] = useState('')
  const [deleting, setDeleting] = useState<Commission | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)


  const load = useCallback(async () => {
    setLoading(true)
    const [commissionsRes, employeesRes] = await Promise.all([
      supabase.from('commissions').select('*, commission_members(employee_id)').order('start_date', { ascending: false }),
      supabase.from('employees').select('*, profiles(first_name, last_name)').eq('is_active', true).order('last_name', { referencedTable: 'profiles' }),
    ])
    if (commissionsRes.error) setError(commissionsRes.error.message)
    else setCommissions((commissionsRes.data as Commission[]) ?? [])
    if (employeesRes.error) setError(employeesRes.error.message)
    else setEmployees((employeesRes.data as Employee[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) return
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
      setRole((prof?.role as Role | undefined) ?? null)
    })()
  }, [])

  const canApprove = role === 'ADMINISTRADOR' || role === 'RECURSOS_HUMANOS'

  const changeStatus = async (id: string, status: CommissionApprovalStatus, reasonText?: string) => {
    setActionId(id)
    setError(null)
    const { error: rpcErr } = await supabase.rpc('set_commission_status', {
      p_commission_id: id,
      p_new_status: status,
      p_reason: reasonText ?? null,
    })
    setActionId(null)
    if (rpcErr) {
      setError(rpcErr.message)
      return
    }
    await load()
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError(null)
    const { error: deleteErr } = await supabase.from('commissions').delete().eq('id', deleting.id)
    setDeleteBusy(false)
    if (deleteErr) {
      setDeleteError(describeDeleteError(deleteErr, 'esta comisión'))
      return
    }
    setDeleting(null)
    await load()
  }

  const openReason = (id: string, status: 'RECHAZADA' | 'REVOCADA', label: string) => {
    setReason('')
    setError(null)
    setReasonModal({ id, status, label })
  }

  const submitReason = async (e: FormEvent) => {
    e.preventDefault()
    if (!reasonModal) return
    if (!reason.trim()) return
    await changeStatus(reasonModal.id, reasonModal.status, reason.trim())
    setReasonModal(null)
  }


  const openCreate = () => {
    setName(''); setDetail(''); setStartDate(''); setEndDate(''); setSelected(new Set()); setQuery(''); setError(null); setModalOpen(true)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !startDate || !endDate) return
    if (endDate < startDate) {
      setError('La fecha de fin debe ser posterior o igual a la de inicio.')
      return
    }
    setSaving(true)
    const { data: com, error: insErr } = await supabase
      .from('commissions')
      .insert({ name: name.trim(), detail: detail.trim() || null, start_date: startDate, end_date: endDate })
      .select('id')
      .single()
    if (insErr || !com) {
      setError(insErr?.message ?? 'No se pudo crear la comisión')
      setSaving(false); return
    }
    if (selected.size > 0) {
      await supabase.from('commission_members').insert(
        Array.from(selected).map((empId) => ({ commission_id: com.id, employee_id: empId }))
      )
    }
    setSaving(false)
    setModalOpen(false)
    await load()
  }

  const toggleEmployee = (id: string) => {
    const s = new Set(selected)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSelected(s)
  }

  const toggleAll = () => {
    if (filteredEmployees.length === 0) return
    const s = new Set(selected)
    const allSelected = filteredEmployees.every((e) => s.has(e.id))
    if (allSelected) {
      filteredEmployees.forEach((e) => s.delete(e.id))
    } else {
      filteredEmployees.forEach((e) => s.add(e.id))
    }
    setSelected(s)
  }

  const filteredEmployees = employees.filter((emp: Employee) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    const full = `${emp.profiles?.first_name ?? ''} ${emp.profiles?.last_name ?? ''}`.toLowerCase()
    const code = emp.employee_code.toLowerCase()
    const email = (emp.profiles?.email ?? '').toLowerCase()
    return full.includes(q) || code.includes(q) || email.includes(q)
  })

  const today = new Date().toISOString().slice(0, 10)

  const effectiveStatus = (c: Commission) => {
    switch (c.status) {
      case 'PENDIENTE_APROBACION':
        return { label: 'Pendiente de aprobación', cls: 'bg-amber-100 text-amber-700', title: c.rejection_reason ?? undefined }
      case 'RECHAZADA':
        return { label: 'Rechazada', cls: 'bg-red-100 text-red-700', title: c.rejection_reason ?? undefined }
      case 'REVOCADA':
        return { label: 'Revocada', cls: 'bg-rose-100 text-rose-700', title: c.rejection_reason ?? undefined }
      case 'FINALIZADA':
        return { label: 'Finalizada', cls: 'bg-slate-100 text-slate-600', title: undefined }
      default:
        if (c.closed_at || c.end_date < today) return { label: 'Cerrada', cls: 'bg-slate-100 text-slate-600', title: undefined }
        if (!c.is_active) return { label: 'Inactiva', cls: 'bg-slate-100 text-slate-600', title: undefined }
        if (c.start_date > today) return { label: 'Aprobada · programada', cls: 'bg-blue-100 text-blue-700', title: undefined }
        return { label: 'Activa', cls: 'bg-green-100 text-green-700', title: undefined }
    }
  }

  const rowActions = (c: Commission) => {
    if (!canApprove) return null
    const busy = actionId === c.id
    const disabled = actionId !== null
    const btn = 'rounded-md px-2 py-1 text-xs font-medium transition disabled:opacity-50'

    if (c.status === 'PENDIENTE_APROBACION') {
      return (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`${btn} bg-green-600 text-white hover:bg-green-700`}
            disabled={disabled}
            onClick={() => void changeStatus(c.id, 'APROBADA')}
          >
            {busy ? '...' : 'Aprobar'}
          </button>
          <button
            type="button"
            className={`${btn} border border-red-200 text-red-700 hover:bg-red-50`}
            disabled={disabled}
            onClick={() => openReason(c.id, 'RECHAZADA', `Rechazar « ${c.name} »`)}
          >
            Rechazar
          </button>
        </div>
      )
    }

    if (c.status === 'APROBADA' && !c.closed_at && c.is_active) {
      return (
        <button
          type="button"
          className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-100`}
          disabled={disabled}
          onClick={() => openReason(c.id, 'REVOCADA', `Revocar « ${c.name} »`)}
        >
          {busy ? '...' : 'Revocar'}
        </button>
      )
    }

    if (c.status === 'RECHAZADA' || c.status === 'REVOCADA') {
      return (
        <button
          type="button"
          className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-100`}
          disabled={disabled}
          onClick={() => void changeStatus(c.id, 'PENDIENTE_APROBACION')}
        >
          {busy ? '...' : 'Reenviar'}
        </button>
      )
    }

    return null
  }

  return (
    <div>
      <PageHeader
        title="Comisiones"
        description="Registra comisiones y asigna empleados"
        action={
          <button type="button" className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nueva comisión
          </button>
        }
      />

      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-600" role="alert">{error}</div>
        ) : commissions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No hay comisiones registradas.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="table-th">Nombre</th>
                  <th className="table-th">Detalle</th>
                  <th className="table-th">Desde</th>
                  <th className="table-th">Hasta</th>
                  <th className="table-th">Empleados</th>
                  <th className="table-th">Estado</th>
                  {canApprove && <th className="table-th">Acción</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {commissions.map((c) => (
                  <tr key={c.id}>
                    <td className="table-td">{c.name}</td>
                    <td className="table-td">{c.detail ?? '—'}</td>
                    <td className="table-td">{formatDate(c.start_date)}</td>
                    <td className="table-td">{formatDate(c.end_date)}</td>
                    <td className="table-td">{(c.commission_members as { employee_id: string }[] | null)?.length ?? 0}</td>
                    <td className="table-td">
                      <span className={`badge ${effectiveStatus(c).cls}`} title={effectiveStatus(c).title}>
                        {effectiveStatus(c).label}
                      </span>
                    </td>
                    {canApprove && (
                      <td className="table-td">
                        <div className="flex items-center justify-end gap-2">
                          {rowActions(c)}
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null)
                              setDeleting(c)
                            }}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Eliminar comisión"
                            aria-label={`Eliminar ${c.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        title="Nueva comisión"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" form="commission-form" className="btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Crear comisión'}
            </button>
          </>
        }
      >
        <form id="commission-form" onSubmit={submit} className="space-y-4">
          {error && (
            <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            La comisión se creará como <strong>Pendiente de aprobación</strong> y deberá ser aprobada por RRHH antes de registrar asistencia con ella.
          </p>
          <div>
            <label className="label" htmlFor="c-name">Nombre</label>
            <input id="c-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="c-detail">Detalle</label>
            <input id="c-detail" className="input" value={detail} onChange={(e) => setDetail(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="c-start">Fecha de inicio</label>
              <input id="c-start" type="date" className="input" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="c-end">Fecha de fin</label>
              <input id="c-end" type="date" className="input" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Asignar empleados ({selected.size} seleccionados)</label>
            <input
              type="text"
              className="input mb-2"
              placeholder="Buscar por nombre, código o correo..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="mb-2 flex items-center justify-between px-1">
              <button type="button" className="text-xs text-brand-700 hover:text-brand-800" onClick={toggleAll}>
                {filteredEmployees.length > 0 && filteredEmployees.every((e) => selected.has(e.id))
                  ? 'Deseleccionar todos'
                  : 'Seleccionar todos'}
              </button>
              {query && (
                <span className="text-xs text-slate-400">
                  {filteredEmployees.length} de {employees.length}
                </span>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {filteredEmployees.length === 0 ? (
                <p className="p-3 text-xs text-slate-400">Sin resultados</p>
              ) : (
                filteredEmployees.map((emp) => (
                  <label key={emp.id} className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700">
                    <input type="checkbox" checked={selected.has(emp.id)} onChange={() => toggleEmployee(emp.id)} />
                    {emp.profiles?.first_name} {emp.profiles?.last_name} ({emp.employee_code})
                  </label>
                ))
              )}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={reasonModal !== null}
        title={reasonModal?.label ?? ''}
        onClose={() => setReasonModal(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setReasonModal(null)} disabled={actionId !== null}>
              Cancelar
            </button>
            <button type="submit" form="commission-reason-form" className="btn-primary" disabled={actionId !== null || !reason.trim()}>
              {actionId !== null ? 'Guardando…' : 'Confirmar'}
            </button>
          </>
        }
      >
        <form id="commission-reason-form" onSubmit={submitReason} className="space-y-4">
          {error && (
            <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className="label" htmlFor="c-reason">Motivo (obligatorio)</label>
            <textarea
              id="c-reason"
              className="input min-h-[96px]"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Indica el motivo del rechazo o de la revocación..."
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Eliminar comisión"
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
        onClose={() => {
          setDeleting(null)
          setDeleteError(null)
        }}
        message={
          <>
            ¿Eliminar la comisión <strong>{deleting?.name}</strong>? Se quitarán sus empleados asignados y
            no podrá usarse para registrar asistencias. Esta acción no se puede deshacer.
          </>
        }
      />
    </div>
  )
}

