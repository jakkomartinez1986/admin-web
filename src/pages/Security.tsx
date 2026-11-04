import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import { formatDateTime } from '@/lib/utils'
import type { Role } from '@/types'

type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL'
type AlertStatusFilter = 'open' | 'resolved' | 'all'

interface SecurityAlertRow {
  id: string
  alert_type: string
  severity: AlertSeverity
  title: string
  details: Record<string, unknown> | null
  resolved: boolean
  resolved_at: string | null
  created_at: string
  device_id: string | null
  device_name: string | null
  event_id: string | null
  request_id: string | null
  profiles?: {
    first_name: string
    last_name: string
    email: string
  } | null
  employees?: { employee_code: string } | null
}

const alertTypeLabels: Record<string, string> = {
  DEVICE_SWITCH: 'Cambio de equipo',
  CLOCK_SKEW: 'Hora del dispositivo',
  LOCATION_MISMATCH: 'Ubicación fuera de geocerca',
  RATE_LIMIT: 'Límite de frecuencia',
  REPLAY_NONCE: 'Nonce reutilizado',
  INVALID_SIGNATURE: 'Firma inválida',
  UNSIGNED_REQUEST: 'Solicitud sin firma',
  SHARED_DEVICE: 'Equipo compartido',
  DEVICE_POLICY_BLOCK: 'Bloqueo por política',
}

const severityLabels: Record<AlertSeverity, string> = {
  INFO: 'Informativa',
  WARNING: 'Advertencia',
  CRITICAL: 'Crítica',
}

const severityClasses: Record<AlertSeverity, string> = {
  INFO: 'bg-sky-100 text-sky-700',
  WARNING: 'bg-amber-100 text-amber-700',
  CRITICAL: 'bg-red-100 text-red-700',
}

function employeeLabel(alert: SecurityAlertRow) {
  const profile = alert.profiles
  const name = profile ? `${profile.first_name} ${profile.last_name}`.trim() : ''
  return name || alert.employees?.employee_code || '—'
}

function detailValue(details: Record<string, unknown> | null, key: string) {
  const value = details?.[key]
  if (value == null || value === '') return '—'
  return String(value)
}

function summarizeDetails(alert: SecurityAlertRow) {
  const details = alert.details
  switch (alert.alert_type) {
    case 'DEVICE_SWITCH':
      return `Anterior: ${detailValue(details, 'previous_device_name')} (${detailValue(details, 'previous_device_id')})`
    case 'LOCATION_MISMATCH':
      return `Distancia: ${detailValue(details, 'distance_m')} m · Límite: ${detailValue(details, 'radius_m')} m`
    case 'CLOCK_SKEW':
      return `Desfase: ${detailValue(details, 'skew_seconds')} s`
    case 'RATE_LIMIT':
      return `Cuenta: ${detailValue(details, 'profile_count_10m')} · Equipo: ${detailValue(details, 'device_count_10m')}`
    case 'DEVICE_POLICY_BLOCK':
      return `Empleados en el equipo: ${detailValue(details, 'device_accounts_count')}`
    case 'REPLAY_NONCE':
    case 'INVALID_SIGNATURE':
    case 'UNSIGNED_REQUEST':
      return `Operación: ${detailValue(details, 'operation_uuid')}`
    default:
      return details ? JSON.stringify(details) : '—'
  }
}

export default function Security() {
  const [alerts, setAlerts] = useState<SecurityAlertRow[]>([])
  const [role, setRole] = useState<Role | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<AlertStatusFilter>('open')
  const [severityFilter, setSeverityFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [alertsResult, userResult] = await Promise.all([
      supabase
        .from('attendance_security_alerts')
        .select(
          'id, alert_type, severity, title, details, resolved, resolved_at, created_at, device_id, device_name, event_id, request_id, profiles!attendance_security_alerts_profile_id_fkey(first_name, last_name, email), employees!attendance_security_alerts_employee_id_fkey(employee_code)',
        )
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.auth.getUser(),
    ])

    if (alertsResult.error) {
      setError(alertsResult.error.message)
    } else {
      setAlerts((alertsResult.data as unknown as SecurityAlertRow[]) ?? [])
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

  const canManage = role === 'ADMINISTRADOR'

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return alerts.filter((alert) => {
      if (statusFilter === 'open' && alert.resolved) return false
      if (statusFilter === 'resolved' && !alert.resolved) return false
      if (severityFilter && alert.severity !== severityFilter) return false
      if (typeFilter && alert.alert_type !== typeFilter) return false
      if (!term) return true
      return [
        employeeLabel(alert),
        alert.title,
        alert.device_name ?? '',
        alert.device_id ?? '',
        alert.alert_type,
        alertTypeLabels[alert.alert_type] ?? '',
        summarizeDetails(alert),
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [alerts, search, severityFilter, statusFilter, typeFilter])

  const unresolvedCount = alerts.filter((alert) => !alert.resolved).length
  const criticalCount = alerts.filter(
    (alert) => !alert.resolved && alert.severity === 'CRITICAL',
  ).length
  const last24Hours = alerts.filter(
    (alert) => Date.now() - new Date(alert.created_at).getTime() <= 24 * 60 * 60 * 1000,
  ).length

  const updateResolved = async (alert: SecurityAlertRow, resolved: boolean) => {
    if (!canManage || !userId) return
    setSavingId(alert.id)
    setError(null)
    setMessage(null)

    const { error: updateError } = await supabase
      .from('attendance_security_alerts')
      .update({
        resolved,
        resolved_by: resolved ? userId : null,
        resolved_at: resolved ? new Date().toISOString() : null,
      })
      .eq('id', alert.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setAlerts((current) =>
        current.map((item) =>
          item.id === alert.id
            ? {
                ...item,
                resolved,
                resolved_at: resolved ? new Date().toISOString() : null,
              }
            : item,
        ),
      )
      setMessage(
        resolved
          ? 'Alerta marcada como revisada.'
          : 'Alerta reabierta para revisión.',
      )
    }

    setSavingId(null)
  }

  return (
    <div>
      <PageHeader
        title="Seguridad de asistencia"
        description="Alertas de firma, nonce, ubicación, hora, frecuencia y cambios de equipo"
        action={
          <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Actualizar
          </button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Alertas abiertas</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">{unresolvedCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Críticas abiertas</p>
          <p className="mt-1 text-2xl font-semibold text-red-700">{criticalCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Últimas 24 horas</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{last24Hours}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="security-search" className="label">Buscar</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="security-search"
              className="input pl-9"
              placeholder="Empleado, equipo o motivo"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <div>
          <label htmlFor="security-status" className="label">Estado</label>
          <select
            id="security-status"
            className="input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as AlertStatusFilter)}
          >
            <option value="open">Abiertas</option>
            <option value="resolved">Revisadas</option>
            <option value="all">Todas</option>
          </select>
        </div>
        <div>
          <label htmlFor="security-severity" className="label">Severidad</label>
          <select
            id="security-severity"
            className="input"
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value)}
          >
            <option value="">Todas</option>
            <option value="CRITICAL">Crítica</option>
            <option value="WARNING">Advertencia</option>
            <option value="INFO">Informativa</option>
          </select>
        </div>
        <div>
          <label htmlFor="security-type" className="label">Tipo</label>
          <select
            id="security-type"
            className="input"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="">Todos</option>
            {Object.entries(alertTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {message && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
          <ShieldCheck className="h-4 w-4" />
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {role && !canManage && (
        <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Puedes consultar las alertas, pero solo un ADMINISTRADOR puede marcarlas como revisadas.
        </div>
      )}

      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500">
            <ShieldAlert className="h-8 w-8 text-slate-300" />
            No hay alertas con los filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="table-th">Fecha</th>
                  <th className="table-th">Empleado</th>
                  <th className="table-th">Equipo</th>
                  <th className="table-th">Tipo</th>
                  <th className="table-th">Severidad</th>
                  <th className="table-th">Detalle</th>
                  <th className="table-th">Estado</th>
                  <th className="table-th">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map((alert) => (
                  <tr key={alert.id} className={alert.resolved ? 'opacity-60' : undefined}>
                    <td className="table-td whitespace-nowrap">{formatDateTime(alert.created_at)}</td>
                    <td className="table-td">
                      <div className="font-medium text-slate-900">{employeeLabel(alert)}</div>
                      <div className="text-xs text-slate-400">
                        {alert.profiles?.email ?? alert.employees?.employee_code ?? '—'}
                      </div>
                    </td>
                    <td className="table-td">
                      <div>{alert.device_name ?? 'Equipo sin nombre'}</div>
                      <div className="font-mono text-xs text-slate-400">{alert.device_id ?? '—'}</div>
                    </td>
                    <td className="table-td">
                      <div className="font-medium text-slate-900">
                        {alertTypeLabels[alert.alert_type] ?? alert.alert_type}
                      </div>
                      <div className="text-xs text-slate-500">{alert.title}</div>
                    </td>
                    <td className="table-td">
                      <span className={`badge ${severityClasses[alert.severity]}`}>
                        {alert.severity === 'CRITICAL' && <AlertTriangle className="mr-1 h-3 w-3" />}
                        {severityLabels[alert.severity]}
                      </span>
                    </td>
                    <td className="table-td max-w-[300px] text-xs text-slate-600">
                      {summarizeDetails(alert)}
                    </td>
                    <td className="table-td">
                      {alert.resolved ? (
                        <span className="badge bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Revisada
                        </span>
                      ) : (
                        <span className="badge bg-amber-100 text-amber-700">Abierta</span>
                      )}
                      {alert.resolved_at && (
                        <div className="mt-1 text-xs text-slate-400">{formatDateTime(alert.resolved_at)}</div>
                      )}
                    </td>
                    <td className="table-td">
                      <button
                        type="button"
                        className="btn-secondary whitespace-nowrap text-xs"
                        disabled={!canManage || savingId === alert.id}
                        onClick={() => void updateResolved(alert, !alert.resolved)}
                        title={canManage ? 'Cambiar estado de la alerta' : 'Requiere rol ADMINISTRADOR'}
                      >
                        {alert.resolved ? (
                          <RotateCcw className="h-3.5 w-3.5" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        {alert.resolved ? 'Reabrir' : 'Marcar revisada'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
