import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Building2, Crosshair, Download, MapPin, Pencil, Plus, QrCode, RefreshCw, Trash2 } from 'lucide-react'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import { describeDeleteError } from '@/lib/utils'
import { PageHeader } from '@/components/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LocationPicker } from '@/components/ui/LocationPicker'
import type { Office } from '@/types'

interface OfficeForm {
  name: string
  code: string
  address: string
  city: string
  latitude: string
  longitude: string
  geofence_radius_m: string
  is_active: boolean
}

const emptyForm: OfficeForm = {
  name: '',
  code: '',
  address: '',
  city: '',
  latitude: '',
  longitude: '',
  geofence_radius_m: '100',
  is_active: true,
}

function toForm(office: Office): OfficeForm {
  return {
    name: office.name,
    code: office.code,
    address: office.address ?? '',
    city: office.city ?? '',
    latitude: office.latitude != null ? String(office.latitude) : '',
    longitude: office.longitude != null ? String(office.longitude) : '',
    geofence_radius_m: office.geofence_radius_m != null ? String(office.geofence_radius_m) : '100',
    is_active: office.is_active,
  }
}

export default function Offices() {
  const [offices, setOffices] = useState<Office[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Office | null>(null)
  const [form, setForm] = useState<OfficeForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [qrOffice, setQrOffice] = useState<Office | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  const [mapOpen, setMapOpen] = useState(false)
  const [deleting, setDeleting] = useState<Office | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase.from('offices').select('*').order('name', { ascending: true })
    if (loadError) setError(loadError.message)
    else setOffices((data as Office[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!qrOffice) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    setQrError(null)
    setQrDataUrl(null)
    if (!qrOffice.qr_token) {
      setQrError('Esta oficina no tiene un token QR generado.')
      return
    }
    void QRCode.toDataURL(qrOffice.qr_token, { width: 320, margin: 2 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrError('No se pudo generar la imagen del QR.')
      })
    return () => {
      cancelled = true
    }
  }, [qrOffice])

  const openQr = (office: Office) => {
    setQrOffice(office)
  }

  const handleRegenerateQr = async () => {
    if (!qrOffice) return
    setRegenerating(true)
    setQrError(null)
    const newToken = `qr_mvp_${qrOffice.code.toLowerCase()}_${crypto.randomUUID().slice(0, 6)}`
    const { error: updateError } = await supabase
      .from('offices')
      .update({ qr_token: newToken })
      .eq('id', qrOffice.id)

    if (updateError) {
      setQrError(updateError.message)
      setRegenerating(false)
      return
    }

    const updated = { ...qrOffice, qr_token: newToken }
    setQrOffice(updated)
    setOffices((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    setRegenerating(false)
  }

  const downloadQr = () => {
    if (!qrDataUrl || !qrOffice) return
    const link = document.createElement('a')
    link.href = qrDataUrl
    link.download = `qr_${qrOffice.code}.png`
    link.click()
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError(null)
    const { error: deleteErr } = await supabase.from('offices').delete().eq('id', deleting.id)
    setDeleteBusy(false)
    if (deleteErr) {
      setDeleteError(describeDeleteError(deleteErr, 'esta oficina'))
      return
    }
    setDeleting(null)
    await load()
  }

  const openEdit = (office: Office) => {
    setEditing(office)
    setForm(toForm(office))
    setFormError(null)
    setModalOpen(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError(null)

    const hasLat = form.latitude.trim() !== ''
    const hasLng = form.longitude.trim() !== ''
    if (hasLat !== hasLng) {
      setFormError('Latitud y longitud deben proporcionarse juntas o dejarse vacías.')
      setSaving(false)
      return
    }

    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      latitude: hasLat ? Number(form.latitude) : null,
      longitude: hasLng ? Number(form.longitude) : null,
      geofence_radius_m: form.geofence_radius_m.trim() === '' ? null : Number(form.geofence_radius_m),
      is_active: form.is_active,
    }

    const result = editing
      ? await supabase.from('offices').update(payload).eq('id', editing.id)
      : await supabase.from('offices').insert(payload)

    if (result.error) {
      setFormError(result.error.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setModalOpen(false)
    await load()
  }

  return (
    <div>
      <PageHeader
        title="Oficinas"
        description="Configuración de las ocho oficinas"
        action={
          <button type="button" className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nueva oficina
          </button>
        }
      />

      {loading ? (
        <div className="card p-8 text-center text-sm text-slate-500">Cargando…</div>
      ) : error ? (
        <div className="card p-8 text-center text-sm text-red-600" role="alert">
          {error}
        </div>
      ) : offices.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No hay oficinas configuradas.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {offices.map((office) => (
            <div key={office.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{office.name}</p>
                    <p className="font-mono text-xs text-slate-400">{office.code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={office.is_active ? 'badge bg-green-100 text-green-700' : 'badge bg-slate-100 text-slate-600'}>
                    {office.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                  <button
                    type="button"
                    onClick={() => openQr(office)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label={`Ver QR de ${office.name}`}
                    title="Ver / generar QR"
                  >
                    <QrCode className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(office)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label={`Editar ${office.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null)
                      setDeleting(office)
                    }}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Eliminar ${office.name}`}
                    title="Eliminar oficina"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <dl className="mt-3 space-y-1 text-sm text-slate-600">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Ciudad</dt>
                  <dd>{office.city ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Dirección</dt>
                  <dd className="text-right">{office.address ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Radio geocerca</dt>
                  <dd>{office.geofence_radius_m != null ? `${office.geofence_radius_m} m` : '—'}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editing ? `Editar ${editing.name}` : 'Nueva oficina'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" form="office-form" className="btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        <form id="office-form" onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="o-name">Nombre</label>
              <input id="o-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="o-code">Código</label>
              <input
                id="o-code"
                className="input font-mono disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                disabled
                readOnly
                value={editing ? form.code : ''}
                placeholder="Se genera automáticamente"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="o-address">Dirección</label>
            <input id="o-address" className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="o-city">Ciudad</label>
              <input id="o-city" className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="o-radius">Radio geocerca (m)</label>
              <input id="o-radius" type="number" min="1" className="input" value={form.geofence_radius_m} onChange={(e) => setForm({ ...form, geofence_radius_m: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="o-lat">Latitud</label>
              <input id="o-lat" type="number" step="any" className="input" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="o-lng">Longitud</label>
              <input id="o-lng" type="number" step="any" className="input" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary" onClick={() => setMapOpen(true)}>
              <MapPin className="h-4 w-4" />
              Seleccionar en mapa
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (!navigator.geolocation) {
                  setFormError('El navegador no soporta geolocalización.')
                  return
                }
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    setForm((prev) => ({
                      ...prev,
                      latitude: String(pos.coords.latitude),
                      longitude: String(pos.coords.longitude),
                    }))
                  },
                  () => setFormError('No se pudo obtener la ubicación actual de la PC.'),
                  { enableHighAccuracy: true, timeout: 10000 },
                )
              }}
            >
              <Crosshair className="h-4 w-4" />
              Usar ubicación de la PC
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Oficina activa
          </label>
        </form>
      </Modal>

      <Modal
        open={qrOffice !== null}
        title={qrOffice ? `QR de ${qrOffice.name}` : 'QR de oficina'}
        onClose={() => setQrOffice(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={handleRegenerateQr} disabled={regenerating}>
              <RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
              Regenerar
            </button>
            <button type="button" className="btn-primary" onClick={downloadQr} disabled={!qrDataUrl}>
              <Download className="h-4 w-4" />
              Descargar PNG
            </button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-4">
          {qrError ? (
            <div role="alert" className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {qrError}
            </div>
          ) : null}

          <div className="flex h-72 w-72 items-center justify-center rounded-xl border border-slate-200 bg-white p-3">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt={`Código QR de ${qrOffice?.name}`} className="h-full w-full" />
            ) : (
              <span className="text-sm text-slate-400">{qrError ? 'Sin QR' : 'Generando…'}</span>
            )}
          </div>

          <div className="w-full text-center">
            <p className="text-xs uppercase tracking-wide text-slate-400">Token QR</p>
            <p className="break-all font-mono text-sm text-slate-700">{qrOffice?.qr_token ?? '—'}</p>
            <p className="mt-2 text-xs text-slate-400">
              Imprime este código y colócalo en la oficina. El empleado lo escanea en la app para registrar su asistencia.
            </p>
          </div>
        </div>
      </Modal>

      <LocationPicker
        open={mapOpen}
        title={form.name ? `Ubicación de ${form.name}` : 'Ubicación de la oficina'}
        initialLat={form.latitude.trim() !== '' ? Number(form.latitude) : null}
        initialLng={form.longitude.trim() !== '' ? Number(form.longitude) : null}
        onClose={() => setMapOpen(false)}
        onConfirm={(latitude, longitude) => {
          setForm((prev) => ({ ...prev, latitude: String(latitude), longitude: String(longitude) }))
          setMapOpen(false)
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Eliminar oficina"
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
        onClose={() => {
          setDeleting(null)
          setDeleteError(null)
        }}
        message={
          <>
            ¿Eliminar la oficina <strong>{deleting?.name}</strong> ({deleting?.code})? Se perderán su
            ubicación, geocerca y token QR; los empleados y departamentos asignados quedarán sin oficina.
            Esta acción no se puede deshacer.
          </>
        }
      />
    </div>
  )
}
