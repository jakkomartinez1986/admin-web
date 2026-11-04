import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, ShieldCheck, UserCog } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { usePagination } from '@/hooks/usePagination'
import { useSort } from '@/hooks/useSort'
import { SortableHeader } from '@/components/ui/SortableHeader'
import type { Role } from '@/types'

const roles: Role[] = ['ADMINISTRADOR', 'RECURSOS_HUMANOS', 'SUPERVISOR', 'EMPLEADO']

const roleDescription: Record<Role, string> = {
  ADMINISTRADOR: 'Acceso total, incluida la gestión de empresas y políticas de equipos.',
  RECURSOS_HUMANOS: 'Gestión de personal, asistencias, vacaciones y comisiones.',
  SUPERVISOR: 'Consulta de su equipo y registros autorizados.',
  EMPLEADO: 'Acceso al APK para registrar asistencia y consultar su información.',
}

interface UserProfileRow {
  id: string
  first_name: string
  last_name: string
  email: string
  national_id: string | null
  phone: string | null
  role: Role
  is_active: boolean
  created_at: string
  employees?: {
    employee_code: string
    is_active: boolean
    job_title: string | null
    offices?: { name: string; code: string } | null
    company_employee_assignments?: {
      company_id: string
      status: string
      companies?: { name: string } | null
    }[] | null
  } | null
}

const sortAccessors = {
  name: (user: UserProfileRow) => `${user.last_name} ${user.first_name}`,
  code: (user: UserProfileRow) => user.employees?.employee_code ?? '',
}

function currentCompany(user: UserProfileRow) {
  const assignments = user.employees?.company_employee_assignments ?? []
  return (
    assignments.find((assignment) => assignment.status === 'ACTIVA') ??
    assignments.find((assignment) => assignment.status === 'FUTURA') ??
    null
  )
}

export default function Users() {
  const [users, setUsers] = useState<UserProfileRow[]>([])
  const [currentRole, setCurrentRole] = useState<Role | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [editing, setEditing] = useState<UserProfileRow | null>(null)
  const [newRole, setNewRole] = useState<Role>('EMPLEADO')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [usersResult, userResult] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'id, first_name, last_name, email, national_id, phone, role, is_active, created_at, employees(employee_code, is_active, job_title, offices(name, code), company_employee_assignments(company_id, status, companies(name)))',
        )
        .order('last_name', { ascending: true }),
      supabase.auth.getUser(),
    ])

    if (usersResult.error) {
      setError(usersResult.error.message)
    } else {
      setUsers((usersResult.data as unknown as UserProfileRow[]) ?? [])
    }

    const user = userResult.data.user
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      setCurrentRole((profile?.role as Role | undefined) ?? null)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const canManageRoles = currentRole === 'ADMINISTRADOR' || currentRole === 'RECURSOS_HUMANOS'

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return users.filter((user) => {
      if (roleFilter && user.role !== roleFilter) return false
      if (!term) return true
      const company = currentCompany(user)?.companies?.name ?? ''
      return [
        user.first_name,
        user.last_name,
        user.email,
        user.national_id ?? '',
        user.employees?.employee_code ?? '',
        company,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [search, roleFilter, users])

  const { sorted, sortKey, sortDirection, toggleSort } = useSort(filtered, sortAccessors, 'name')
  const pagination = usePagination(sorted, 25, `${search}|${roleFilter}|${sortKey}|${sortDirection}`)

  const openRoleModal = (user: UserProfileRow) => {
    setEditing(user)
    setNewRole(user.role)
    setFormError(null)
    setMessage(null)
  }

  const saveRole = async () => {
    if (!editing) return
    if (!canManageRoles) {
      setFormError('Solo ADMINISTRADOR o RECURSOS_HUMANOS pueden cambiar roles.')
      return
    }

    setSaving(true)
    setFormError(null)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', editing.id)

    if (updateError) {
      setFormError(updateError.message)
      setSaving(false)
      return
    }

    setMessage(
      `${editing.first_name} ${editing.last_name} ahora tiene el rol ${newRole}.`,
    )
    setEditing(null)
    setSaving(false)
    await load()
  }

  const roleCounts = roles.reduce<Record<Role, number>>(
    (acc, role) => ({ ...acc, [role]: users.filter((user) => user.role === role).length }),
    { ADMINISTRADOR: 0, RECURSOS_HUMANOS: 0, SUPERVISOR: 0, EMPLEADO: 0 },
  )

  return (
    <div>
      <PageHeader
        title="Usuarios y roles"
        description="Cuentas vinculadas a empleados y asignación de roles de acceso"
        action={
          <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Actualizar
          </button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {roles.map((role) => (
          <button
            key={role}
            type="button"
            className={`card p-4 text-left transition hover:border-brand-300 ${
              roleFilter === role ? 'border-brand-400 bg-brand-50/40' : ''
            }`}
            onClick={() => setRoleFilter(roleFilter === role ? '' : role)}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {role.replace('_', ' ')}
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{roleCounts[role]}</p>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-md">
          <label htmlFor="user-search" className="label">
            Buscar usuario
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="user-search"
              className="input pl-9"
              placeholder="Nombre, correo, cédula, código o empresa"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <div className="w-full sm:max-w-xs">
          <label htmlFor="user-role" className="label">
            Rol
          </label>
          <select
            id="user-role"
            className="input"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="">Todos los roles</option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
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
      {!canManageRoles && (
        <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Puedes consultar los usuarios, pero solo ADMINISTRADOR o RECURSOS_HUMANOS pueden cambiar roles.
        </div>
      )}

      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No hay usuarios con los filtros aplicados.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <SortableHeader label="Usuario" column="name" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                    <th className="table-th">Cédula</th>
                    <SortableHeader label="Código" column="code" sortKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                    <th className="table-th">Empresa / Oficina</th>
                    <th className="table-th">Rol</th>
                    <th className="table-th">Estado</th>
                    <th className="table-th">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {pagination.pageItems.map((user) => {
                    const company = currentCompany(user)
                    return (
                      <tr key={user.id}>
                        <td className="table-td">
                          <div className="font-medium text-slate-900">
                            {user.first_name} {user.last_name}
                          </div>
                          <div className="text-xs text-slate-500">{user.email}</div>
                        </td>
                        <td className="table-td font-mono text-xs">{user.national_id ?? '—'}</td>
                        <td className="table-td">
                          <span className="font-mono text-xs">{user.employees?.employee_code ?? '—'}</span>
                          {user.employees?.job_title && (
                            <div className="text-xs text-slate-400">{user.employees.job_title}</div>
                          )}
                        </td>
                        <td className="table-td">
                          <div>{company?.companies?.name ?? '—'}</div>
                          <div className="text-xs text-slate-400">
                            {user.employees?.offices
                              ? `${user.employees.offices.name} (${user.employees.offices.code})`
                              : '—'}
                          </div>
                        </td>
                        <td className="table-td">
                          <span className="badge bg-slate-100 text-slate-700">{user.role}</span>
                        </td>
                        <td className="table-td">
                          {user.is_active ? (
                            <span className="badge bg-emerald-100 text-emerald-700">Activo</span>
                          ) : (
                            <span className="badge bg-red-100 text-red-700">Inactivo</span>
                          )}
                        </td>
                        <td className="table-td">
                          <button
                            type="button"
                            className="btn-secondary whitespace-nowrap text-xs"
                            onClick={() => openRoleModal(user)}
                            disabled={!canManageRoles}
                            title={canManageRoles ? 'Cambiar rol del usuario' : 'Requiere rol RRHH o ADMINISTRADOR'}
                          >
                            <UserCog className="h-3.5 w-3.5" />
                            Cambiar rol
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={pagination.page}
              pageSize={pagination.pageSize}
              total={pagination.total}
              totalPages={pagination.totalPages}
              start={pagination.start}
              end={pagination.end}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              noun="usuarios"
            />
          </>
        )}
      </div>

      <Modal
        open={editing !== null}
        title="Asignar rol de usuario"
        onClose={() => setEditing(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={() => void saveRole()} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar rol'}
            </button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-sm font-semibold text-slate-900">
                {editing.first_name} {editing.last_name}
              </p>
              <p className="text-xs text-slate-500">
                {editing.email}
                {editing.employees?.employee_code ? ` · ${editing.employees.employee_code}` : ''}
              </p>
            </div>

            <div>
              <label htmlFor="role-select" className="label">
                Rol
              </label>
              <select
                id="role-select"
                className="input"
                value={newRole}
                onChange={(event) => setNewRole(event.target.value as Role)}
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500">{roleDescription[newRole]}</p>
            </div>

            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              El rol se aplica a la cuenta y a lo que puede hacer en el panel y en el APK.
              Para el personal operativo usa EMPLEADO; SUPERVISOR solo para jefaturas.
            </div>

            {formError && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {formError}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
