import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRightLeft, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import { Modal } from '@/components/ui/Modal'
import type { Company, CompanyAssignment } from '@/types'

interface Row extends CompanyAssignment {
  employees: {
    employee_code: string
    profiles?: { first_name: string; last_name: string; national_id?: string | null } | null
  } | null
}

const fmtName = (r: Row) =>
  `${r.employees?.profiles?.first_name ?? ''} ${r.employees?.profiles?.last_name ?? ''}`.trim() ||
  (r.employees?.employee_code ?? r.employee_id)

export default function Transfers() {
  const [rows, setRows] = useState<Row[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Row | null>(null)
  const [modal, setModal] = useState(false)
  const [targetCompany, setTargetCompany] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10))
  const [position, setPosition] = useState('')
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [okMessage, setOkMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: asg, error: e1 }, { data: comps, error: e2 }] = await Promise.all([
      supabase
        .from('company_employee_assignments')
        .select('*, employees(employee_code, profiles(first_name, last_name, national_id))')
        .order('start_date', { ascending: false }),
      supabase.from('companies').select('*').order('name'),
    ])
    if (e1) setError(e1.message)
    else setRows((asg as Row[]) ?? [])
    if (e2) setError(e2.message)
    else setCompanies((comps as Company[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const activeCompanies = useMemo(() => companies.filter(c => c.is_active), [companies])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const actives = rows.filter(r => r.status === 'ACTIVA' || r.status === 'FUTURA')
    if (!q) return actives
    return actives.filter(r => {
      const name = fmtName(r).toLowerCase()
      const code = (r.employees?.employee_code ?? '').toLowerCase()
      const id = (r.employees?.profiles?.national_id ?? '').toLowerCase()
      const company = (r.companies?.name ?? '').toLowerCase()
      return name.includes(q) || code.includes(q) || id.includes(q) || company.includes(q)
    })
  }, [rows, search])

  const openTransfer = (r: Row) => {
    setSelected(r)
    setTargetCompany('')
    setEffectiveDate(new Date().toISOString().slice(0, 10))
    setPosition(r.position ?? '')
    setReason('')
    setFormError(null)
    setModal(true)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selected) return
    if (!targetCompany) { setFormError('Seleccione la empresa destino.'); return }
    if (targetCompany === selected.company_id) { setFormError('La empresa destino debe ser diferente a la actual.'); return }
    if (!reason.trim()) { setFormError('El motivo del traslado es obligatorio.'); return }
    setSaving(true)
    setFormError(null)
    const { error: e2 } = await supabase.rpc('transfer_employee', {
      p_employee_id: selected.employee_id,
      p_target_company_id: targetCompany,
      p_effective_date: effectiveDate,
      p_reason: reason.trim(),
      p_position: position.trim() || null,
    })
    setSaving(false)
    if (e2) { setFormError(e2.message); return }
    const dest = companies.find(c => c.id === targetCompany)?.name ?? ''
    setOkMessage(`Traslado registrado: ${fmtName(selected)} → ${dest} (efectivo ${effectiveDate}).`)
    setModal(false)
    await load()
  }

  return (
    <div>
      <PageHeader title='Traslados' description='Movimiento de trabajadores entre empresas (sin duplicar identidad)' />
      {okMessage && (
        <div className='mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700' role='status'>
          {okMessage}
          <button type='button' className='ml-2 underline' onClick={() => setOkMessage(null)}>cerrar</button>
        </div>
      )}
      <div className='mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2'>
        <Search className='h-4 w-4 text-slate-400' />
        <input
          className='w-full bg-transparent text-sm outline-none'
          placeholder='Buscar por nombre, código, cédula o empresa…'
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className='card overflow-hidden p-0'>
        {loading ? <div className='p-8 text-center text-sm text-slate-500'>Cargando…</div> :
         error ? <div className='p-8 text-center text-sm text-red-600' role='alert'>{error}</div> :
         filtered.length === 0 ? <div className='p-8 text-center text-sm text-slate-500'>Sin asignaciones activas o futuras</div> :
         <div className='overflow-x-auto'>
           <table className='min-w-full divide-y divide-slate-200'>
             <thead className='bg-slate-50'>
               <tr>
                 <th className='table-th'>Empleado</th>
                 <th className='table-th'>Cédula</th>
                 <th className='table-th'>Empresa actual</th>
                 <th className='table-th'>Desde</th>
                 <th className='table-th'>Estado</th>
                 <th className='table-th'></th>
               </tr>
             </thead>
             <tbody className='divide-y divide-slate-100 bg-white'>
               {filtered.map(r => (
                 <tr key={r.id}>
                   <td className='table-td'>
                     <div className='font-medium text-slate-900'>{fmtName(r)}</div>
                     <div className='text-xs text-slate-500'>{r.employees?.employee_code}</div>
                   </td>
                   <td className='table-td font-mono text-xs'>{r.employees?.profiles?.national_id ?? '-'}</td>
                   <td className='table-td'>
                     <div>{r.companies?.name ?? '-'}</div>
                     <div className='text-xs text-slate-500'>RUC {r.companies?.tax_id ?? '-'}</div>
                   </td>
                   <td className='table-td'>{r.start_date}</td>
                   <td className='table-td'>
                     <span className={r.status === 'ACTIVA' ? 'badge bg-green-100 text-green-700' : 'badge bg-amber-100 text-amber-700'}>{r.status === 'ACTIVA' ? 'Activa' : 'Futura'}</span>
                   </td>
                   <td className='table-td text-right'>
                     <button type='button' onClick={() => openTransfer(r)} className='btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs'>
                       <ArrowRightLeft className='h-3.5 w-3.5' /> Trasladar
                     </button>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>}
      </div>
      <Modal
        open={modal}
        title='Trasladar trabajador'
        onClose={() => setModal(false)}
        footer={<><button className='btn-secondary' onClick={() => setModal(false)} disabled={saving}>Cancelar</button><button form='transfer-form' className='btn-primary' disabled={saving}>{saving ? 'Trasladando…' : 'Confirmar traslado'}</button></>}
      >
        <form id='transfer-form' onSubmit={submit} className='space-y-4'>
          {formError && <div className='rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700' role='alert'>{formError}</div>}
          {selected && (
            <div className='rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700'>
              <p className='font-medium'>{fmtName(selected)}</p>
              <p className='text-xs text-slate-500'>
                {selected.employees?.employee_code} · Empresa actual: {selected.companies?.name} (desde {selected.start_date})
              </p>
            </div>
          )}
          <div>
            <label className='label'>Empresa destino *</label>
            <select className='input' value={targetCompany} onChange={e => setTargetCompany(e.target.value)} required>
              <option value=''>Seleccione…</option>
              {activeCompanies.filter(c => c.id !== selected?.company_id).map(c => (
                <option key={c.id} value={c.id}>{c.name} (RUC {c.tax_id})</option>
              ))}
            </select>
          </div>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            <div>
              <label className='label'>Fecha efectiva *</label>
              <input type='date' className='input' required value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
              <p className='mt-1 text-xs text-slate-400'>Cierra la asignación actual el día anterior (fecha Ecuador).</p>
            </div>
            <div><label className='label'>Puesto en destino</label><input className='input' value={position} onChange={e => setPosition(e.target.value)} /></div>
          </div>
          <div>
            <label className='label'>Motivo *</label>
            <textarea className='input min-h-[80px]' required value={reason} onChange={e => setReason(e.target.value)} placeholder='Motivo institucional del traslado…' />
          </div>
          <div className='rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800'>
            Consecuencias: se cierra la asignación vigente, se crea la nueva y queda registro de auditoría.
            Las asistencias históricas <strong>no cambian</strong> (conservan la empresa del momento).
            Comisiones abiertas en la empresa origen quedan fuera de vigencia para el empleado.
          </div>
        </form>
      </Modal>
    </div>
  )
}
