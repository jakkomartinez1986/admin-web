import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { describeDeleteError } from '@/lib/utils'
import { PageHeader } from '@/components/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { Department, Office } from '@/types'

interface Form {
  code: string
  name: string
  office_id: string
  is_active: boolean
}

const empty: Form = { code: '', name: '', office_id: '', is_active: true }

export default function Departments() {
  const [items, setItems] = useState<Department[]>([])
  const [offices, setOffices] = useState<Office[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [form, setForm] = useState<Form>(empty)
  const [saving, setSaving] = useState(false)
  const [toggleId, setToggleId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Department | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: deps, error: e1 }, { data: offs, error: e2 }] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('offices').select('*').order('name'),
    ])
    if (e1) setError(e1.message)
    else {
      const depsData = (deps as Department[]) ?? []
      const offsData = (offs as Office[]) ?? []
      const map = new Map(offsData.map((o) => [o.id, o]))
      setItems(depsData.map((d) => ({ ...d, offices: d.office_id ? (map.get(d.office_id) as Office | null) ?? null : null })))
    }
    if (!e1 && e2) setError(e2.message)
    setOffices((offs as Office[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const openCreate = () => {
    setEditing(null); setForm(empty); setModal(true)
  }

  const openEdit = (d: Department) => {
    setEditing(d); setForm({ code: d.code, name: d.name, office_id: d.office_id ?? '', is_active: d.is_active }); setModal(true)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const code = form.code.trim().toUpperCase()
    const payload = {
      // Si se deja vacío, el código se genera automáticamente (DEP-001, DEP-002, …).
      ...(code ? { code } : {}),
      name: form.name.trim(),
      office_id: form.office_id || null,
      is_active: form.is_active,
    }
    const res = editing
      ? await supabase.from('departments').update(payload).eq('id', editing.id)
      : await supabase.from('departments').insert(payload)
    if (res.error) { setError(res.error.message); setSaving(false); return }
    setSaving(false); setModal(false); await load()
  }

  const toggle = async (d: Department) => {
    setToggleId(d.id)
    const { error: e } = await supabase.from('departments').update({ is_active: !d.is_active }).eq('id', d.id)
    if (e) setError(e.message)
    setToggleId(null); await load()
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true); setDeleteError(null)
    const { error: e } = await supabase.from('departments').delete().eq('id', deleting.id)
    setDeleteBusy(false)
    if (e) { setDeleteError(describeDeleteError(e, 'este departamento')); return }
    setDeleting(null); await load()
  }

  return (
    <div>
      <PageHeader title='Departamentos' description='Estructura organizativa por oficina' action={
        <button className='btn-primary' onClick={openCreate}><Plus className='h-4 w-4'/>Nuevo departamento</button>
      } />
      <div className='card overflow-hidden p-0'>
        {loading ? <div className='p-8 text-center text-sm text-slate-500'>Cargando…</div> :
         error ? <div className='p-8 text-center text-sm text-red-600' role='alert'>{error}</div> :
         items.length === 0 ? <div className='p-8 text-center text-sm text-slate-500'>Sin departamentos</div> :
         <div className='overflow-x-auto'>
           <table className='min-w-full divide-y divide-slate-200'>
             <thead className='bg-slate-50'>
               <tr>
                 <th className='table-th'>Código</th>
                 <th className='table-th'>Nombre</th>
                 <th className='table-th'>Oficina</th>
                 <th className='table-th'>Estado</th>
                 <th className='table-th'></th>
               </tr>
             </thead>
             <tbody className='divide-y divide-slate-100 bg-white'>
               {items.map(d => (
                 <tr key={d.id}>
                   <td className='table-td font-mono text-xs'>{d.code}</td>
                   <td className='table-td'>{d.name}</td>
                   <td className='table-td'>{d.offices?.name ?? '-'}</td>
                   <td className='table-td'><span className={d.is_active ? 'badge bg-green-100 text-green-700' : 'badge bg-slate-100 text-slate-600'}>{d.is_active ? 'Activo' : 'Inactivo'}</span></td>
                   <td className='table-td'>
                     <div className='flex items-center justify-end gap-1'>
                       <button type='button' onClick={() => toggle(d)} disabled={toggleId === d.id} className={d.is_active ? 'rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600' : 'rounded-lg p-1.5 text-slate-400 hover:bg-green-50 hover:text-green-600'} title={d.is_active ? 'Desactivar' : 'Activar'}>
                         {d.is_active ? <PowerOff className='h-4 w-4'/> : <Power className='h-4 w-4'/>}
                       </button>
                       <button type='button' onClick={() => openEdit(d)} className='rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600' title='Editar'><Pencil className='h-4 w-4'/></button>
                       <button type='button' onClick={() => { setDeleteError(null); setDeleting(d) }} className='rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600' title='Eliminar' aria-label={`Eliminar ${d.name}`}><Trash2 className='h-4 w-4'/></button>
                     </div>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>}
      </div>
      <Modal open={modal} title={editing ? 'Editar departamento' : 'Nuevo departamento'} onClose={() => setModal(false)} footer={<><button className='btn-secondary' onClick={() => setModal(false)} disabled={saving}>Cancelar</button><button form='dep-form' className='btn-primary' disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></>}>
        <form id='dep-form' onSubmit={submit} className='space-y-4'>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            <div>
              <label className='label' htmlFor='dep-code'>Código</label>
              <input
                id='dep-code'
                className='input font-mono'
                placeholder='Se genera automáticamente'
                value={form.code}
                onChange={e => setForm({...form, code: e.target.value.toUpperCase()})}
              />
              <p className='mt-1 text-xs text-slate-400'>Opcional: el sistema asigna el siguiente código (DEP-001, DEP-002, …).</p>
            </div>
            <div><label className='label'>Oficina</label><select className='input' value={form.office_id} onChange={e => setForm({...form, office_id: e.target.value})}><option value=''>Sin asignar</option>{offices.map(o => <option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}</select></div>
          </div>
          <div><label className='label'>Nombre</label><input className='input' required value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></div>
          <label className='flex items-center gap-2 text-sm text-slate-700'><input type='checkbox' checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})}/>Activo</label>
        </form>
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        title='Eliminar departamento'
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
        onClose={() => { setDeleting(null); setDeleteError(null) }}
        message={
          <>
            ¿Eliminar el departamento <strong>{deleting?.name}</strong> ({deleting?.code})?
            Los empleados asignados quedarán sin departamento; esta acción no se puede deshacer.
          </>
        }
      />
    </div>
  )
}
