import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { describeDeleteError } from '@/lib/utils'
import { isValidEcuadorianRuc } from '@/lib/ruc'
import { PageHeader } from '@/components/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { Company } from '@/types'

interface Form {
  name: string
  commercial_name: string
  tax_id: string
  address: string
  phone: string
  email: string
  is_active: boolean
}

const empty: Form = { name: '', commercial_name: '', tax_id: '', address: '', phone: '', email: '', is_active: true }

export default function Companies() {
  const [items, setItems] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)
  const [form, setForm] = useState<Form>(empty)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toggleId, setToggleId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Company | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: e } = await supabase.from('companies').select('*').order('name')
    if (e) setError(e.message)
    else setItems((data as Company[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const openCreate = () => {
    setEditing(null); setForm(empty); setFormError(null); setModal(true)
  }

  const openEdit = (c: Company) => {
    setEditing(c)
    setForm({
      name: c.name,
      commercial_name: c.commercial_name ?? '',
      tax_id: c.tax_id,
      address: c.address ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      is_active: c.is_active,
    })
    setFormError(null)
    setModal(true)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const taxId = form.tax_id.trim()
    if (!isValidEcuadorianRuc(taxId)) {
      setFormError('El RUC debe tener 13 dígitos y una provincia válida (01–24, 06 o 09).')
      return
    }
    setSaving(true)
    setFormError(null)
    const payload = {
      name: form.name.trim(),
      commercial_name: form.commercial_name.trim() || null,
      tax_id: taxId,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      is_active: form.is_active,
    }
    const res = editing
      ? await supabase.from('companies').update(payload).eq('id', editing.id)
      : await supabase.from('companies').insert(payload)
    if (res.error) { setFormError(res.error.message); setSaving(false); return }
    setSaving(false); setModal(false); await load()
  }

  const toggle = async (c: Company) => {
    setToggleId(c.id)
    const { error: e } = await supabase.from('companies').update({ is_active: !c.is_active }).eq('id', c.id)
    if (e) setError(e.message)
    setToggleId(null); await load()
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true); setDeleteError(null)
    const { error: e } = await supabase.from('companies').delete().eq('id', deleting.id)
    setDeleteBusy(false)
    if (e) { setDeleteError(describeDeleteError(e, 'esta empresa')); return }
    setDeleting(null); await load()
  }

  return (
    <div>
      <PageHeader title='Empresas' description='Empresas del holding (acceso del administrador general)' action={
        <button className='btn-primary' onClick={openCreate}><Plus className='h-4 w-4'/>Nueva empresa</button>
      } />
      <div className='card overflow-hidden p-0'>
        {loading ? <div className='p-8 text-center text-sm text-slate-500'>Cargando…</div> :
         error ? <div className='p-8 text-center text-sm text-red-600' role='alert'>{error}</div> :
         items.length === 0 ? <div className='p-8 text-center text-sm text-slate-500'>Sin empresas</div> :
         <div className='overflow-x-auto'>
           <table className='min-w-full divide-y divide-slate-200'>
             <thead className='bg-slate-50'>
               <tr>
                 <th className='table-th'>RUC</th>
                 <th className='table-th'>Razón social</th>
                 <th className='table-th'>Nombre comercial</th>
                 <th className='table-th'>Correo</th>
                 <th className='table-th'>Estado</th>
                 <th className='table-th'></th>
               </tr>
             </thead>
             <tbody className='divide-y divide-slate-100 bg-white'>
               {items.map(c => (
                 <tr key={c.id}>
                   <td className='table-td font-mono text-xs'>{c.tax_id}</td>
                   <td className='table-td'>{c.name}</td>
                   <td className='table-td'>{c.commercial_name ?? '-'}</td>
                   <td className='table-td'>{c.email ?? '-'}</td>
                   <td className='table-td'><span className={c.is_active ? 'badge bg-green-100 text-green-700' : 'badge bg-slate-100 text-slate-600'}>{c.is_active ? 'Activa' : 'Inactiva'}</span></td>
                   <td className='table-td'>
                     <div className='flex items-center justify-end gap-1'>
                       <button type='button' onClick={() => toggle(c)} disabled={toggleId === c.id} className={c.is_active ? 'rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600' : 'rounded-lg p-1.5 text-slate-400 hover:bg-green-50 hover:text-green-600'} title={c.is_active ? 'Desactivar' : 'Activar'}>
                         {c.is_active ? <PowerOff className='h-4 w-4'/> : <Power className='h-4 w-4'/>}
                       </button>
                       <button type='button' onClick={() => openEdit(c)} className='rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600' title='Editar'><Pencil className='h-4 w-4'/></button>
                       <button type='button' onClick={() => { setDeleteError(null); setDeleting(c) }} className='rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600' title='Eliminar' aria-label={`Eliminar ${c.name}`}><Trash2 className='h-4 w-4'/></button>
                     </div>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>}
      </div>
      <Modal open={modal} title={editing ? 'Editar empresa' : 'Nueva empresa'} onClose={() => setModal(false)} footer={<><button className='btn-secondary' onClick={() => setModal(false)} disabled={saving}>Cancelar</button><button form='company-form' className='btn-primary' disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></>}>
        <form id='company-form' onSubmit={submit} className='space-y-4'>
          {formError && <div className='rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700' role='alert'>{formError}</div>}
          <div><label className='label'>Razón social *</label><input className='input' required value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></div>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            <div>
              <label className='label'>RUC *</label>
              <input className='input font-mono' required maxLength={13} value={form.tax_id} onChange={e => setForm({...form, tax_id: e.target.value.replace(/[^0-9]/g, '')})}/>
              <p className='mt-1 text-xs text-slate-400'>13 dígitos; provincia válida (01–24, 06 o 09).</p>
            </div>
            <div><label className='label'>Nombre comercial</label><input className='input' value={form.commercial_name} onChange={e => setForm({...form, commercial_name: e.target.value})}/></div>
          </div>
          <div><label className='label'>Dirección</label><input className='input' value={form.address} onChange={e => setForm({...form, address: e.target.value})}/></div>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            <div><label className='label'>Teléfono</label><input className='input' value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}/></div>
            <div><label className='label'>Correo</label><input type='email' className='input' value={form.email} onChange={e => setForm({...form, email: e.target.value})}/></div>
          </div>
          <label className='flex items-center gap-2 text-sm text-slate-700'><input type='checkbox' checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})}/>Activa</label>
        </form>
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        title='Eliminar empresa'
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
        onClose={() => { setDeleting(null); setDeleteError(null) }}
        message={
          <>
            ¿Eliminar la empresa <strong>{deleting?.name}</strong> (RUC {deleting?.tax_id})?
            Si tiene asignaciones de empleados el sistema lo rechazará; esta acción no se puede deshacer.
          </>
        }
      />
    </div>
  )
}
