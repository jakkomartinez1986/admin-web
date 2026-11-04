import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, RefreshCw, Search, ShieldOff, Smartphone, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { formatDateTime } from '@/lib/utils'
import type { Role, ValidationStatus } from '@/types'

type SharedDevicePolicy = 'PERMITIR' | 'REVISAR' | 'BLOQUEAR'

interface DeviceEventRow {
  id: string
  employee_id: string
  device_id: string | null
  device_name: string | null
  device_shared: boolean | null
  device_accounts_count: number | null
  device_review_reason: string | null
  validation_status: ValidationStatus
  device_time: string
  server_time_received: string
  company_id: string | null
  employees?: {
    employee_code: string
    profiles?: { first_name: string; last_name: string } | null
  } | null
  companies?: { name: string } | null
}

interface CompanyRow {
  id: string
  name: string
  shared_device_policy: SharedDevicePolicy
}

interface AuthorizedDeviceRow {
  id: string
  company_id: string
  device_id: string
  device_name: string | null
  reason: string | null
  created_at: string
}

interface DeviceSummary {
  deviceId: string
  deviceName: string | null
  companyId: string | null
  companyName: string | null
  employees: Map<string, string>
  eventCount: number
  reviewCount: number
  shared: boolean
  accountsCount: number
  reason: string | null
  lastSeen: string
}

function employeeLabel(row: DeviceEventRow) {
  const profile = row.employees?.profiles
  const name = profile ? `${profile.first_name} ${profile.last_name}`.trim() : ''
  return name || row.employees?.employee_code || 'Empleado sin nombre'
}

function summarize(events: DeviceEventRow[]): DeviceSummary[] {
  const grouped = new Map<string, DeviceSummary>()

  for (const event of events) {
    if (!event.device_id) continue

    const current = grouped.get(event.device_id) ?? {
      deviceId: event.device_id,
      deviceName: event.device_name,
      companyId: event.company_id,
      companyName: event.companies?.name ?? null,
      employees: new Map<string, string>(),
      eventCount: 0,
      reviewCount: 0,
      shared: false,
      accountsCount: 0,
      reason: null,
      lastSeen: event.server_time_received,
    }

    current.employees.set(event.employee_id, employeeLabel(event))
    current.eventCount += 1
    if (event.validation_status === 'REQUIERE_REVISION') current.reviewCount += 1
    current.shared = current.shared || event.device_shared === true
    current.accountsCount = Math.max(
      current.accountsCount,
      event.device_accounts_count ?? 0,
      current.employees.size,
    )
    current.reason = current.reason ?? event.device_review_reason
    current.deviceName = current.deviceName ?? event.device_name
    current.companyId = current.companyId ?? event.company_id
    current.companyName = current.companyName ?? event.companies?.name ?? null
    if (new Date(event.server_time_received) > new Date(current.lastSeen)) {
      current.lastSeen = event.server_time_received
    }

    grouped.set(event.device_id, current)
  }

  return Array.from(grouped.values())
    .map((device) => ({
      ...device,
      shared: device.shared || device.employees.size > 1,
      accountsCount: Math.max(device.accountsCount, device.employees.size),
    }))
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
}

export default function Devices() {
  const [events, setEvents] = useState<DeviceEventRow[]>([])
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [authorizedDevices, setAuthorizedDevices] = useState<AuthorizedDeviceRow[]>([])
  const [role, setRole] = useState<Role | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [onlyShared, setOnlyShared] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [reevaluating, setReevaluating] = useState<string | null>(null)
  const [authorizing, setAuthorizing] = useState<string | null>(null)
  const [managingCompany, setManagingCompany] = useState<CompanyRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [eventsResult, userResult, companiesResult, authorizedResult] = await Promise.all([
      supabase
        .from('attendance_events')
        .select(
          'id, employee_id, device_id, device_name, device_shared, device_accounts_count, device_review_reason, validation_status, device_time, server_time_received, company_id, employees(employee_code, profiles(first_name, last_name)), companies(name)',
        )
        .not('device_id', 'is', null)
        .order('server_time_received', { ascending: false })
        .limit(1000),
      supabase.auth.getUser(),
      supabase
        .from('companies')
        .select('id, name, shared_device_policy')
        .order('name', { ascending: true }),
      supabase
        .from('company_authorized_devices')
        .select('id, company_id, device_id, device_name, reason, created_at')
        .order('created_at', { ascending: false }),
    ])

    if (eventsResult.error) {
      setError(eventsResult.error.message)
    } else {
      setEvents((eventsResult.data as unknown as DeviceEventRow[]) ?? [])
    }

    if (!companiesResult.error) {
      setCompanies((companiesResult.data as unknown as CompanyRow[]) ?? [])
    }

    if (!authorizedResult.error) {
      setAuthorizedDevices((authorizedResult.data as unknown as AuthorizedDeviceRow[]) ?? [])
    }

    const user = userResult.data.user
    if (user) {
      setUserId(user.id)
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      setRole((profile?.role as Role | undefined) ?? null)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const devices = useMemo(() => summarize(events), [events])
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return devices.filter((device) => {
      if (onlyShared && !device.shared) return false
      if (!term) return true
      return [
        device.deviceId,
        device.deviceName ?? '',
        device.companyName ?? '',
        ...device.employees.values(),
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [devices, onlyShared, search])

  const sharedCount = devices.filter((device) => device.shared).length
  const canManage = role === 'ADMINISTRADOR'

  const companyById = useMemo(
    () => new Map(companies.map((company) => [company.id, company])),
    [companies],
  )
  const authorizedByKey = useMemo(
    () =>
      new Map(
        authorizedDevices.map((device) => [`${device.company_id}:${device.device_id}`, device]),
      ),
    [authorizedDevices],
  )

  const updatePolicy = async (company: CompanyRow, policy: SharedDevicePolicy) => {
    setError(null)
    setMessage(null)

    const { error: updateError } = await supabase
      .from('companies')
      .update({ shared_device_policy: policy })
      .eq('id', company.id)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setCompanies((current) =>
      current.map((item) =>
        item.id === company.id ? { ...item, shared_device_policy: policy } : item,
      ),
    )
    setMessage(
      `Política de ${company.name} actualizada a ${policy}. Se aplica a los próximos registros.`,
    )
  }

  const authorizeDevice = async (device: DeviceSummary) => {
    if (!device.companyId || !userId) return
    setAuthorizing(device.deviceId)
    setError(null)
    setMessage(null)

    const { error: insertError } = await supabase.from('company_authorized_devices').insert({
      company_id: device.companyId,
      device_id: device.deviceId,
      device_name: device.deviceName,
      reason: 'Autorizado desde el panel de equipos',
      authorized_by: userId,
    })

    if (insertError) {
      setError(insertError.message)
    } else {
      await supabase.rpc('mark_shared_device_events', { p_device_id: device.deviceId })
      setMessage(`Equipo ${device.deviceId} autorizado para ${device.companyName ?? 'la empresa'}.`)
      await load()
    }

    setAuthorizing(null)
  }

  const revokeDevice = async (authorized: AuthorizedDeviceRow) => {
    setError(null)
    setMessage(null)

    const { error: deleteError } = await supabase
      .from('company_authorized_devices')
      .delete()
      .eq('id', authorized.id)

    if (deleteError) {
      setError(deleteError.message)
    } else {
      setMessage(`Autorización retirada al equipo ${authorized.device_id}.`)
      await load()
    }
  }

  const reevaluate = async (device: DeviceSummary) => {
    setReevaluating(device.deviceId)
    setError(null)
    setMessage(null)

    const { data, error: rpcError } = await supabase.rpc('mark_shared_device_events', {
      p_device_id: device.deviceId,
    })

    if (rpcError) {
      setError(rpcError.message)
    } else {
      setMessage(
        `Equipo ${device.deviceId} reevaluado: ${data ?? 0} empleado(s) distinto(s) detectado(s).`,
      )
      await load()
    }

    setReevaluating(null)
  }

  return (
    <div>
      <PageHeader
        title="Equipos y dispositivos"
        description="Detección de equipos usados por varios empleados (posible uso compartido de credenciales)"
        action={
          <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Actualizar
          </button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Equipos detectados</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{devices.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Equipos compartidos</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">{sharedCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Eventos evaluados</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{events.length}</p>
        </div>
      </div>

      <div className="card mb-4 p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Política de equipos compartidos</h2>
          <p className="text-xs text-slate-500">
            Define qué hacer cuando un mismo equipo registra asistencia de varios empleados.
            Un equipo autorizado siempre se permite.
          </p>
        </div>

        {companies.length === 0 ? (
          <p className="text-sm text-slate-500">No hay empresas configuradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="table-th">Empresa</th>
                  <th className="table-th">Política</th>
                  <th className="table-th">Equipos autorizados</th>
                  <th className="table-th">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {companies.map((company) => {
                  const authorized = authorizedDevices.filter(
                    (device) => device.company_id === company.id,
                  )
                  return (
                    <tr key={company.id}>
                      <td className="table-td font-medium text-slate-900">{company.name}</td>
                      <td className="table-td">
                        <select
                          className="input max-w-[180px]"
                          value={company.shared_device_policy}
                          disabled={!canManage}
                          onChange={(event) =>
                            void updatePolicy(
                              company,
                              event.target.value as SharedDevicePolicy,
                            )
                          }
                        >
                          <option value="PERMITIR">Permitir</option>
                          <option value="REVISAR">Revisar</option>
                          <option value="BLOQUEAR">Bloquear</option>
                        </select>
                      </td>
                      <td className="table-td">{authorized.length}</td>
                      <td className="table-td">
                        <button
                          type="button"
                          className="btn-secondary whitespace-nowrap text-xs"
                          onClick={() => setManagingCompany(company)}
                        >
                          Gestionar equipos
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-md">
          <label htmlFor="device-search" className="label">
            Buscar equipo o empleado
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="device-search"
              className="input pl-9"
              placeholder="ID de equipo, modelo o empleado"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={onlyShared}
            onChange={(event) => setOnlyShared(event.target.checked)}
          />
          Solo equipos compartidos
        </label>
      </div>

      {message && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {!canManage && (
        <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Solo un administrador puede cambiar políticas, autorizar equipos o reevaluar equipos compartidos.
        </div>
      )}

      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500">
            <Smartphone className="h-8 w-8 text-slate-300" />
            {onlyShared
              ? 'No hay equipos compartidos con los filtros aplicados.'
              : 'No hay equipos registrados con los filtros aplicados.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="table-th">Equipo</th>
                  <th className="table-th">Empresa</th>
                  <th className="table-th">Empleados</th>
                  <th className="table-th">Eventos</th>
                  <th className="table-th">Última actividad</th>
                  <th className="table-th">Estado</th>
                  <th className="table-th">Motivo</th>
                  <th className="table-th">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map((device) => {
                  const company = device.companyId ? companyById.get(device.companyId) : null
                  const authorized = device.companyId
                    ? authorizedByKey.get(`${device.companyId}:${device.deviceId}`)
                    : undefined
                  return (
                  <tr key={device.deviceId} className={device.shared ? 'bg-amber-50/40' : undefined}>
                    <td className="table-td">
                      <div className="font-medium text-slate-900">{device.deviceName ?? 'Equipo sin nombre'}</div>
                      <div className="font-mono text-xs text-slate-400">{device.deviceId}</div>
                    </td>
                    <td className="table-td">
                      {device.companyName ?? '—'}
                      {company && (
                        <div className="text-xs text-slate-400">Política: {company.shared_device_policy}</div>
                      )}
                    </td>
                    <td className="table-td">
                      <div className="font-semibold text-slate-900">{device.employees.size}</div>
                      <div className="max-w-[220px] truncate text-xs text-slate-500" title={Array.from(device.employees.values()).join(', ')}>
                        {Array.from(device.employees.values()).join(', ') || '—'}
                      </div>
                    </td>
                    <td className="table-td">
                      {device.eventCount}
                      {device.reviewCount > 0 && (
                        <span className="ml-2 text-xs text-amber-700">{device.reviewCount} en revisión</span>
                      )}
                    </td>
                    <td className="table-td whitespace-nowrap">{formatDateTime(device.lastSeen)}</td>
                    <td className="table-td">
                      {authorized ? (
                        <span className="badge bg-emerald-100 text-emerald-700">
                          Autorizado · {device.accountsCount}
                        </span>
                      ) : device.shared ? (
                        <span className="badge bg-amber-100 text-amber-700">
                          Compartido · {device.accountsCount}
                        </span>
                      ) : (
                        <span className="badge bg-emerald-100 text-emerald-700">Individual</span>
                      )}
                    </td>
                    <td className="table-td max-w-[280px] text-xs text-slate-500">
                      {device.reason ?? (device.shared ? 'Equipo utilizado por varios empleados.' : '—')}
                    </td>
                    <td className="table-td">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-secondary whitespace-nowrap text-xs"
                          disabled={!canManage || reevaluating === device.deviceId}
                          onClick={() => void reevaluate(device)}
                          title={canManage ? 'Reejecutar la evaluación de uso compartido' : 'Requiere rol ADMINISTRADOR'}
                        >
                          <RefreshCw
                            className={
                              reevaluating === device.deviceId
                                ? 'h-3.5 w-3.5 animate-spin'
                                : 'h-3.5 w-3.5'
                            }
                          />
                          Reevaluar
                        </button>
                        {authorized ? (
                          <button
                            type="button"
                            className="btn-secondary whitespace-nowrap text-xs text-red-600"
                            disabled={!canManage}
                            onClick={() => void revokeDevice(authorized)}
                          >
                            <ShieldOff className="h-3.5 w-3.5" />
                            Revocar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-secondary whitespace-nowrap text-xs"
                            disabled={
                              !canManage ||
                              !device.companyId ||
                              authorizing === device.deviceId
                            }
                            onClick={() => void authorizeDevice(device)}
                            title={
                              !device.companyId
                                ? 'El equipo no tiene empresa asociada'
                                : 'Autorizar este equipo para la empresa'
                            }
                          >
                            <CheckCircle2
                              className={
                                authorizing === device.deviceId
                                  ? 'h-3.5 w-3.5 animate-spin'
                                  : 'h-3.5 w-3.5'
                              }
                            />
                            Autorizar
                          </button>
                        )}
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
        open={managingCompany !== null}
        title={managingCompany ? `Equipos autorizados · ${managingCompany.name}` : 'Equipos autorizados'}
        onClose={() => setManagingCompany(null)}
        footer={
          <button type="button" className="btn-secondary" onClick={() => setManagingCompany(null)}>
            Cerrar
          </button>
        }
      >
        {managingCompany && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Los equipos de esta lista pueden ser usados por varios empleados sin quedar en
              revisión, incluso si la política de la empresa es BLOQUEAR.
            </p>

            {authorizedDevices.filter((device) => device.company_id === managingCompany.id).length === 0 ? (
              <div className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                Todavía no hay equipos autorizados. Usa el botón Autorizar en la tabla de equipos.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {authorizedDevices
                  .filter((device) => device.company_id === managingCompany.id)
                  .map((device) => (
                    <div key={device.id} className="flex items-start justify-between gap-3 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {device.device_name ?? 'Equipo sin nombre'}
                        </p>
                        <p className="font-mono text-xs text-slate-400">{device.device_id}</p>
                        <p className="text-xs text-slate-500">
                          {device.reason ?? 'Sin motivo registrado'} · {formatDateTime(device.created_at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary whitespace-nowrap text-xs text-red-600"
                        disabled={!canManage}
                        onClick={() => void revokeDevice(device)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Quitar
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
