import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { CalendarDays, KeyRound, Pencil, Plus, Power, PowerOff, Trash2, Upload, Download } from 'lucide-react'
import type ExcelJS from 'exceljs'
import { supabase } from '@/lib/supabase'
import { isValidEcuadorianId } from '@/lib/cedula'
import { describeDeleteError } from '@/lib/utils'
import { PageHeader } from '@/components/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { Company, Department, Employee, EmployeeVacation, Office, Role } from '@/types'

const roles: Role[] = ['ADMINISTRADOR', 'RECURSOS_HUMANOS', 'SUPERVISOR', 'EMPLEADO']

interface CreateForm {
  email: string
  password: string
  first_name: string
  last_name: string
  national_id: string
  employee_code: string
  phone: string
  role: Role
  job_title: string
  department_id: string
  office_id: string
  company_id: string
  effective_date: string
}

const emptyCreate: CreateForm = {
  email: '',
  password: '',
  first_name: '',
  last_name: '',
  national_id: '',
  employee_code: '',
  phone: '',
  role: 'EMPLEADO',
  job_title: '',
  department_id: '',
  office_id: '',
  company_id: '',
  effective_date: new Date().toISOString().slice(0, 10),
}

// Traduce errores de autenticacion de la Edge Function a un mensaje claro para el admin.
// Cuando la sesion del navegador expira, la EF devuelve 401 con { error: 'Invalid token' }.
function translateAuthError(message: string, status?: number): string {
  if (status === 401 || /^invalid token$/i.test(message.trim())) {
    return 'Tu sesión expiró. Cierra sesión y vuelve a ingresar para continuar.'
  }
  return message
}

interface EditForm {
  role: Role
  phone: string
  job_title: string
  department_id: string
  office_id: string
  is_active: boolean
  company_id: string
  effective_date: string
}

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [offices, setOffices] = useState<Office[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate)
  const [createError, setCreateError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [editing, setEditing] = useState<Employee | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{
    created: number
    failed: { row: number; email: string; error: string }[]
  } | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [deleting, setDeleting] = useState<Employee | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [resetting, setResetting] = useState<Employee | null>(null)
  const [resetSuffix, setResetSuffix] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetResult, setResetResult] = useState<{ email: string; temp_password: string } | null>(null)

  const [vacationEmployee, setVacationEmployee] = useState<Employee | null>(null)
  const [vacations, setVacations] = useState<EmployeeVacation[]>([])
  const [vacationLoading, setVacationLoading] = useState(false)
  const [vacationForm, setVacationForm] = useState({ start_date: '', end_date: '', reason: '' })
  const [vacationSaving, setVacationSaving] = useState(false)
  const [vacationError, setVacationError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('employees')
      .select(
        '*, profiles(first_name, last_name, email, national_id, phone, role), departments!employees_department_id_fkey(name), offices(name, code)',
      )
      .order('last_name', { referencedTable: 'profiles', ascending: true })

    if (loadError) {
      setError(loadError.message)
    } else {
      setEmployees((data as Employee[]) ?? [])
    }

    const [officesRes, departmentsRes, companiesRes] = await Promise.all([
      supabase.from('offices').select('*').order('name'),
      supabase.from('departments').select('*').order('name'),
      supabase.from('companies').select('*').order('name'),
    ])
    setOffices((officesRes.data as Office[]) ?? [])
    setDepartments((departmentsRes.data as Department[]) ?? [])
    setCompanies((companiesRes.data as Company[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setCreateError(null)

    if (!isValidEcuadorianId(createForm.national_id)) {
      setCreateError('Ingresa una cédula ecuatoriana válida (10 dígitos).')
      setSaving(false)
      return
    }

    const { data, error: invokeError } = await supabase.functions.invoke('admin-create-employee', {
      body: {
        email: createForm.email.trim(),
        password: createForm.password,
        first_name: createForm.first_name.trim(),
        last_name: createForm.last_name.trim(),
        national_id: createForm.national_id.trim(),
        employee_code: createForm.employee_code.trim() || null,
        phone: createForm.phone.trim() || null,
        role: createForm.role,
        job_title: createForm.job_title.trim() || null,
        department_id: createForm.department_id || null,
        office_id: createForm.office_id || null,
      },
    })

    if (invokeError) {
      let message = invokeError.message
      const context = (invokeError as { context?: Response }).context
      if (context) {
        try {
          const body = await context.json()
          if (body?.error) message = body.error
        } catch {
          // ignore
        }
      }
      setCreateError(translateAuthError(message, context?.status))
      setSaving(false)
      return
    }
    if (data && data.error) {
      setCreateError(data.error)
      setSaving(false)
      return
    }

    if (createForm.company_id && data?.ok && data?.employee?.id) {
      const { error: transferErr } = await supabase.rpc('transfer_employee', {
        p_employee_id: data.employee.id,
        p_target_company_id: createForm.company_id,
        p_effective_date: createForm.effective_date || new Date().toISOString().slice(0, 10),
        p_reason: 'Asignación inicial desde alta de empleado',
        p_position: createForm.job_title.trim() || null,
      })
      if (transferErr) {
        setCreateError(`Empleado creado, pero no se pudo asignar a la empresa: ${transferErr.message}`)
        setSaving(false)
        await load()
        return
      }
    }

    setSaving(false)
    setCreateOpen(false)
    setCreateForm(emptyCreate)
    await load()
  }

  const openEdit = (emp: Employee) => {
    setEditing(emp)
    setEditForm({
      role: emp.profiles?.role ?? 'EMPLEADO',
      phone: emp.profiles?.phone ?? '',
      job_title: emp.job_title ?? '',
      department_id: emp.department_id ?? '',
      office_id: emp.office_id ?? '',
      is_active: emp.is_active,
      company_id: '',
      effective_date: new Date().toISOString().slice(0, 10),
    })
    setEditError(null)
  }

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing || !editForm) return
    setSaving(true)
    setEditError(null)

    const employeeUpdate = await supabase
      .from('employees')
      .update({
        job_title: editForm.job_title.trim() || null,
        department_id: editForm.department_id || null,
        office_id: editForm.office_id || null,
        is_active: editForm.is_active,
      })
      .eq('id', editing.id)

    if (employeeUpdate.error) {
      setEditError(employeeUpdate.error.message)
      setSaving(false)
      return
    }

    const profileUpdate = await supabase
      .from('profiles')
      .update({ role: editForm.role, phone: editForm.phone.trim() || null })
      .eq('id', editing.profile_id)
    if (profileUpdate.error) {
      setEditError(`Empleado actualizado, pero el perfil falló: ${profileUpdate.error.message}`)
      setSaving(false)
      return
    }

    if (editForm.company_id) {
      const { error: transferErr } = await supabase.rpc('transfer_employee', {
        p_employee_id: editing.id,
        p_target_company_id: editForm.company_id,
        p_effective_date: editForm.effective_date,
        p_reason: 'Asignación/traslado desde panel de empleados',
        p_position: editForm.job_title.trim() || null,
      })
      if (transferErr) {
        setEditError(Empleado actualizado, pero no se pudo asignar a la empresa: )
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setEditing(null)
    setEditForm(null)
    await load()
  }

  const toggleActive = async (emp: Employee) => {
    const next = !emp.is_active
    setTogglingId(emp.id)
    const employeeUpdate = await supabase.from('employees').update({ is_active: next }).eq('id', emp.id)
    if (employeeUpdate.error) {
      setError(employeeUpdate.error.message)
      setTogglingId(null)
      return
    }
    const profileUpdate = await supabase.from('profiles').update({ is_active: next }).eq('id', emp.profile_id)
    if (profileUpdate.error) {
      setError(`Empleado actualizado, pero el perfil falló: ${profileUpdate.error.message}`)
      setTogglingId(null)
      return
    }
    setEmployees((prev) => prev.map((e) => (e.id === emp.id ? { ...e, is_active: next } : e)))
    setTogglingId(null)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError(null)

    const { data, error: invokeError } = await supabase.functions.invoke('admin-delete-employee', {
      body: { employee_id: deleting.id },
    })

    if (invokeError) {
      let message = invokeError.message
      const context = (invokeError as { context?: Response }).context
      if (context) {
        try {
          const body = await context.json()
          if (body?.error) message = body.error
        } catch {
          // ignore
        }
      }
      setDeleteError(describeDeleteError({ message }, 'este empleado'))
      setDeleteBusy(false)
      return
    }
    if (data && data.error) {
      setDeleteError(String(data.error))
      setDeleteBusy(false)
      return
    }

    setDeleteBusy(false)
    setDeleting(null)
    await load()
  }

  const openReset = (emp: Employee) => {
    setResetting(emp)
    setResetSuffix('')
    setResetError(null)
    setResetResult(null)
  }

  const closeReset = () => {
    setResetting(null)
    setResetSuffix('')
    setResetError(null)
    setResetResult(null)
  }

  const handleReset = async (e: FormEvent) => {
    e.preventDefault()
    if (!resetting) return
    const suffix = resetSuffix.trim()
    if (suffix.length < 6) {
      setResetError('El sufijo de la clave temporal debe tener al menos 6 caracteres.')
      return
    }
    setResetBusy(true)
    setResetError(null)

    const { data, error: invokeError } = await supabase.functions.invoke('admin-reset-password', {
      body: { employee_id: resetting.id, password: suffix },
    })

    if (invokeError) {
      let message = invokeError.message
      const context = (invokeError as { context?: Response }).context
      if (context) {
        try {
          const body = await context.json()
          if (body?.error) message = body.error
        } catch {
          // ignore
        }
      }
      setResetError(message)
      setResetBusy(false)
      return
    }
    if (data && data.error) {
      setResetError(String(data.error))
      setResetBusy(false)
      return
    }

    setResetResult({
      email: String(data?.email ?? resetting.profiles?.email ?? ''),
      temp_password: String(data?.temp_password ?? `${resetting.profiles?.national_id ?? ''}${suffix}`),
    })
    setResetBusy(false)
  }

  const openVacations = async (emp: Employee) => {
    setVacationEmployee(emp)
    setVacationForm({ start_date: '', end_date: '', reason: '' })
    setVacationError(null)
    setVacations([])
    setVacationLoading(true)
    const { data, error: loadError } = await supabase
      .from('employee_vacations')
      .select('*')
      .eq('employee_id', emp.id)
      .order('start_date', { ascending: false })
    if (loadError) setVacationError(loadError.message)
    else setVacations((data as EmployeeVacation[]) ?? [])
    setVacationLoading(false)
  }

  const handleAddVacation = async (e: FormEvent) => {
    e.preventDefault()
    if (!vacationEmployee) return
    if (!vacationForm.start_date || !vacationForm.end_date) {
      setVacationError('Indica fecha de inicio y fin.')
      return
    }
    if (vacationForm.end_date < vacationForm.start_date) {
      setVacationError('La fecha de fin debe ser igual o posterior a la de inicio.')
      return
    }
    setVacationSaving(true)
    setVacationError(null)
    const { error: insertError } = await supabase.from('employee_vacations').insert({
      employee_id: vacationEmployee.id,
      start_date: vacationForm.start_date,
      end_date: vacationForm.end_date,
      reason: vacationForm.reason.trim() || null,
      status: 'APROBADA',
    })
    if (insertError) {
      setVacationError(insertError.message)
      setVacationSaving(false)
      return
    }
    setVacationForm({ start_date: '', end_date: '', reason: '' })
    setVacationSaving(false)
    await openVacations(vacationEmployee)
  }

  const handleDeleteVacation = async (id: string) => {
    if (!vacationEmployee) return
    const { error: deleteError } = await supabase.from('employee_vacations').delete().eq('id', id)
    if (deleteError) {
      setVacationError(deleteError.message)
      return
    }
    setVacations((prev) => prev.filter((v) => v.id !== id))
  }

  const downloadTemplate = async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Sistema de Asistencia'
    const ws = wb.addWorksheet('Empleados')
    ws.columns = [
      { header: 'email', key: 'email', width: 30 },
      { header: 'password (sufijo de la clave)', key: 'password', width: 28 },
      { header: 'first_name', key: 'first_name', width: 18 },
      { header: 'last_name', key: 'last_name', width: 18 },
      { header: 'national_id', key: 'national_id', width: 16 },
      { header: 'employee_code (opcional)', key: 'employee_code', width: 22 },
      { header: 'role', key: 'role', width: 20 },
      { header: 'job_title', key: 'job_title', width: 22 },
      { header: 'office_code', key: 'office_code', width: 14 },
      { header: 'department_code', key: 'department_code', width: 16 },
      { header: 'phone (opcional)', key: 'phone', width: 16 },
    ]
    ws.getRow(1).font = { bold: true }
    ws.getCell('B1').note =
      'Sufijo de la clave inicial (mínimo 6 caracteres). La clave real del empleado es su cédula + este sufijo; el empleado la cambia al primer ingreso en la app.'
    ws.getCell('K1').note =
      'Teléfono de contacto del empleado (opcional). Se guarda en profiles.phone.'
    ws.addRow({
      email: 'ana.ejemplo@asistencia.corp',
      password: 'ClaveSegura1',
      first_name: 'Ana',
      last_name: 'Pérez',
      national_id: '1713175071',
      employee_code: '',
      role: 'EMPLEADO',
      job_title: 'Analista',
      office_code: '',
      department_code: '',
      phone: '',
    })

    const info = wb.addWorksheet('Instrucciones')
    info.getColumn(1).width = 100
    const lines = [
      'Instrucciones para la importación de empleados',
      '',
      `- Roles permitidos: ${roles.join(', ')}.`,
      '- email, password, first_name, last_name y national_id son obligatorios.',
      '- La columna "password" es el SUFIJO de la clave inicial (mínimo 6 caracteres), no la clave completa.',
      '  Ejemplo: cédula 1713175071 + sufijo ClaveSegura1 → clave inicial 1713175071ClaveSegura1.',
      '- national_id es la cédula ecuatoriana (10 dígitos); se valida el dígito verificador y no puede repetirse.',
      '- employee_code es OPCIONAL: si se deja vacío el sistema asigna el siguiente código (EMP-001, EMP-002, …).',
      '- La clave inicial de cada empleado es su cédula + el sufijo indicado; debe cambiarla al primer ingreso desde la app móvil.',
      '- office_code y department_code son opcionales; si se indican deben coincidir con un código existente.',
      '- Si solo indicas department_code, la oficina se tomará del departamento.',
      '- phone es OPCIONAL: teléfono de contacto del empleado (6-20 dígitos; se aceptan +, - y espacios).',
      '- Elimina la fila de ejemplo antes de cargar tus datos reales.',
      '- No incluyas datos personales reales en entornos de prueba.',
    ]
    lines.forEach((line) => info.addRow([line]))

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'plantilla_empleados.xlsx'
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleImportFile = async (file: File) => {
    setImporting(true)
    setImportError(null)
    setImportResult(null)

    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.worksheets[0]
      if (!ws) {
        setImportError('El archivo no contiene hojas de cálculo.')
        setImporting(false)
        return
      }

      const headerMap: Record<string, number> = {}
      const headerAliases: Record<string, string> = {
        cedula: 'national_id',
        'cédula': 'national_id',
        clave: 'password',
        'clave inicial': 'password',
        telefono: 'phone',
        'teléfono': 'phone',
        phone: 'phone',
      }
      ws.getRow(1).eachCell((cell, col) => {
        const key = String(cell.value ?? '').trim().toLowerCase()
        if (!key) return
        // Acepta encabezados descriptivos como "password (sufijo de la clave)".
        const base = key.replace(/\s*\(.*\)\s*$/, '').trim()
        headerMap[headerAliases[base] ?? base] = col
      })

      const requiredHeaders = ['email', 'password', 'first_name', 'last_name', 'national_id']
      const missing = requiredHeaders.filter((h) => !(h in headerMap))
      if (missing.length > 0) {
        setImportError(`Faltan columnas obligatorias: ${missing.join(', ')}.`)
        setImporting(false)
        return
      }

      const cellString = (row: ExcelJS.Row, key: string): string => {
        const col = headerMap[key]
        if (!col) return ''
        const value = row.getCell(col).value
        if (value == null) return ''
        if (typeof value === 'object') {
          if ('text' in value && typeof value.text === 'string') return value.text.trim()
          if ('result' in value && value.result != null) return String(value.result).trim()
          if ('richText' in value && Array.isArray(value.richText)) {
            return value.richText.map((t) => t.text).join('').trim()
          }
          return ''
        }
        return String(value).trim()
      }

      const officeByCode = new Map(offices.map((o) => [o.code.toLowerCase(), o.id]))
      const departmentByCode = new Map(departments.map((d) => [d.code.toLowerCase(), d.id]))
      const usedNationalIds = new Set(
        employees.map((e) => e.profiles?.national_id).filter((id): id is string => !!id),
      )
      const usedEmails = new Set(employees.map((e) => e.profiles?.email?.toLowerCase()).filter((v): v is string => !!v))

      let created = 0
      const failed: { row: number; email: string; error: string }[] = []

      for (let i = 2; i <= ws.rowCount; i++) {
        const row = ws.getRow(i)
        const email = cellString(row, 'email')
        const firstName = cellString(row, 'first_name')
        const lastName = cellString(row, 'last_name')
        const employeeCode = cellString(row, 'employee_code')
        const nationalId = cellString(row, 'national_id')

        if (!email && !firstName && !lastName && !employeeCode && !nationalId) continue

        const rowError = (message: string) => failed.push({ row: i, email: email || `fila ${i}`, error: message })

        if (!email || !firstName || !lastName || !nationalId) {
          rowError('Faltan campos obligatorios (email, first_name, last_name, national_id).')
          continue
        }
        if (!isValidEcuadorianId(nationalId)) {
          rowError('Cédula ecuatoriana inválida (debe ser de 10 dígitos y con dígito verificador correcto).')
          continue
        }
        if (usedNationalIds.has(nationalId)) {
          rowError(`La cédula ${nationalId} ya está registrada (o se repite en el archivo).`)
          continue
        }
        const usedEmailKey = email.toLowerCase()
        if (usedEmails.has(usedEmailKey)) {
          rowError(`El correo ${email} ya está registrado (o se repite en el archivo).`)
          continue
        }
        const password = cellString(row, 'password')
        if (password.length < 6) {
          rowError('El sufijo de la clave inicial debe tener al menos 6 caracteres.')
          continue
        }
        const roleValue = cellString(row, 'role').toUpperCase()
        const role: Role = (roles as string[]).includes(roleValue) ? (roleValue as Role) : 'EMPLEADO'
        const officeCode = cellString(row, 'office_code').trim()
        const departmentCode = cellString(row, 'department_code').trim()

        let officeId: string | null = null
        if (officeCode) {
          const found = officeByCode.get(officeCode.toLowerCase())
          if (!found) {
            rowError(`Oficina inexistente: "${officeCode}". Usa un código de oficina válido (ej. OF-001).`)
            continue
          }
          officeId = found
        }

        let departmentId: string | null = null
        if (departmentCode) {
          const found = departmentByCode.get(departmentCode.toLowerCase())
          if (!found) {
            rowError(`Departamento inexistente: "${departmentCode}".`)
            continue
          }
          departmentId = found
          if (!officeId) {
            const dept = departments.find((d) => d.id === departmentId)
            officeId = dept?.office_id ?? null
          }
        }

        const { data, error: invokeError } = await supabase.functions.invoke('admin-create-employee', {
          body: {
            email,
            password,
            first_name: firstName,
            last_name: lastName,
            national_id: nationalId,
            // Opcional: si viene vacio la Edge Function asigna el siguiente codigo (EMP-NNN).
            employee_code: employeeCode || null,
            role,
            job_title: cellString(row, 'job_title') || null,
            office_id: officeId,
            department_id: departmentId,
            phone: cellString(row, 'phone') || null,
          },
        })

        let message = invokeError?.message ?? ''
        let invokeStatus: number | undefined
        const context = (invokeError as { context?: Response } | undefined)?.context
        if (context) {
          invokeStatus = context.status
          try {
            const body = await context.json()
            if (body?.error) message = body.error
          } catch {
            // ignore
          }
        }
        if (!invokeError && data?.error) message = data.error

        if (message) {
          rowError(translateAuthError(message, invokeStatus))
        } else {
          created++
          usedNationalIds.add(nationalId)
          usedEmails.add(usedEmailKey)
        }
      }

      setImportResult({ created, failed })
      await load()
    } catch {
      setImportError('No se pudo leer el archivo. Verifica que sea un .xlsx válido.')
    }
    setImporting(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div>
      <PageHeader
        title="Empleados"
        description="Gestión de personal y asignaciones"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleImportFile(file)
              }}
            />
            <button type="button" className="btn-secondary" onClick={downloadTemplate}>
              <Download className="h-4 w-4" />
              Plantilla
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              <Upload className="h-4 w-4" />
              {importing ? 'Importando…' : 'Importar XLSX'}
            </button>
            <button type="button" className="btn-primary" onClick={() => { setCreateForm(emptyCreate); setCreateError(null); setCreateOpen(true) }}>
              <Plus className="h-4 w-4" />
              Nuevo empleado
            </button>
          </div>
        }
      />

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-600" role="alert">
            {error}
          </div>
        ) : employees.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No hay empleados registrados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="table-th">Código</th>
                  <th className="table-th">Nombre</th>
                  <th className="table-th">Cédula</th>
                  <th className="table-th">Correo</th>
                  <th className="table-th">Teléfono</th>
                  <th className="table-th">Oficina</th>
                  <th className="table-th">Departamento</th>
                  <th className="table-th">Rol</th>
                  <th className="table-th">Estado</th>
                  <th className="table-th sticky right-0 bg-slate-50" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {employees.map((emp) => (
                  <tr key={emp.id}>
                    <td className="table-td font-mono text-xs">{emp.employee_code}</td>
                    <td className="table-td">
                      {emp.profiles?.first_name} {emp.profiles?.last_name}
                    </td>
                    <td className="table-td font-mono text-xs">{emp.profiles?.national_id ?? '—'}</td>
                    <td className="table-td">{emp.profiles?.email}</td>
                    <td className="table-td">
                      {emp.profiles?.phone ? (
                        <a href={`tel:${emp.profiles.phone}`} className="text-blue-600 hover:underline">
                          {emp.profiles.phone}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="table-td">{emp.offices?.name ?? '—'}</td>
                    <td className="table-td">{emp.departments?.name ?? '—'}</td>
                    <td className="table-td">{emp.profiles?.role}</td>
                    <td className="table-td">
                      <span className={emp.is_active ? 'badge bg-green-100 text-green-700' : 'badge bg-slate-100 text-slate-600'}>
                        {emp.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="table-td sticky right-0 bg-white">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => toggleActive(emp)}
                          disabled={togglingId === emp.id}
                          className={
                            emp.is_active
                              ? 'rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50'
                              : 'rounded-lg p-1.5 text-slate-400 hover:bg-green-50 hover:text-green-600 disabled:opacity-50'
                          }
                          title={emp.is_active ? 'Desactivar empleado' : 'Activar empleado'}
                          aria-label={emp.is_active ? 'Desactivar empleado' : 'Activar empleado'}
                        >
                          {emp.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => openReset(emp)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                          title="Restablecer clave"
                          aria-label={`Restablecer clave de ${emp.profiles?.first_name} ${emp.profiles?.last_name}`}
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openVacations(emp)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                          title="Vacaciones"
                          aria-label={`Vacaciones de ${emp.profiles?.first_name} ${emp.profiles?.last_name}`}
                        >
                          <CalendarDays className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(emp)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          aria-label={`Editar ${emp.profiles?.first_name} ${emp.profiles?.last_name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null)
                            setDeleting(emp)
                          }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Eliminar empleado"
                          aria-label={`Eliminar ${emp.profiles?.first_name} ${emp.profiles?.last_name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        title="Nuevo empleado"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" form="employee-create-form" className="btn-primary" disabled={saving}>
              {saving ? 'Creando…' : 'Crear empleado'}
            </button>
          </>
        }
      >
        <form id="employee-create-form" onSubmit={handleCreate} className="space-y-4">
          {createError && (
            <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {createError}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="e-first">Nombres</label>
              <input id="e-first" className="input" required value={createForm.first_name} onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="e-last">Apellidos</label>
              <input id="e-last" className="input" required value={createForm.last_name} onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="e-cedula">Cédula (10 dígitos)</label>
            <input
              id="e-cedula"
              className="input font-mono"
              required
              maxLength={10}
              inputMode="numeric"
              value={createForm.national_id}
              onChange={(e) => setCreateForm({ ...createForm, national_id: e.target.value.replace(/\D/g, '') })}
            />
            <p className="mt-1 text-xs text-slate-400">Cédula ecuatoriana; se valida el dígito verificador.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="e-code">Código de empleado</label>
              <input
                id="e-code"
                className="input font-mono"
                placeholder="Se genera automáticamente"
                value={createForm.employee_code}
                onChange={(e) => setCreateForm({ ...createForm, employee_code: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-400">Opcional: el sistema asigna el siguiente código (EMP-001, EMP-002, …).</p>
            </div>
            <div>
              <label className="label" htmlFor="e-role">Rol</label>
              <select id="e-role" className="input" value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as Role })}>
                {roles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="e-email">Correo electrónico</label>
              <input id="e-email" type="email" className="input" required value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="e-phone">Teléfono</label>
              <input
                id="e-phone"
                type="tel"
                className="input"
                placeholder="Ej. 0991234567"
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-400">Se usa para contactar al empleado ante una inasistencia.</p>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="e-pass">Sufijo de la clave inicial (mín. 6)</label>
            <input id="e-pass" type="text" className="input" required minLength={6} value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
            <p className="mt-1 text-xs text-slate-400">
              Clave inicial = cédula + sufijo:{' '}
              <span className="font-mono text-slate-600">
                {(createForm.national_id || 'cédula') + (createForm.password || 'sufijo')}
              </span>
              . El empleado debe cambiarla en su primer ingreso desde la app móvil.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="e-office">Oficina</label>
              <select id="e-office" className="input" value={createForm.office_id} onChange={(e) => setCreateForm({ ...createForm, office_id: e.target.value })}>
                <option value="">Sin asignar</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="e-dept">Departamento</label>
              <select id="e-dept" className="input" value={createForm.department_id} onChange={(e) => setCreateForm({ ...createForm, department_id: e.target.value })}>
                <option value="">Sin asignar</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="e-job">Cargo</label>
            <input id="e-job" className="input" value={createForm.job_title} onChange={(e) => setCreateForm({ ...createForm, job_title: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="e-company">Empresa</label>
              <select id="e-company" className="input" value={createForm.company_id} onChange={(e) => setCreateForm({ ...createForm, company_id: e.target.value })}>
                <option value="">Sin asignar</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="e-effective">Fecha efectiva</label>
              <input id="e-effective" type="date" className="input" value={createForm.effective_date} onChange={(e) => setCreateForm({ ...createForm, effective_date: e.target.value })} />
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={editing !== null && editForm !== null}
        title={editing ? `Editar ${editing.profiles?.first_name} ${editing.profiles?.last_name}` : ''}
        onClose={() => { setEditing(null); setEditForm(null) }}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => { setEditing(null); setEditForm(null) }} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" form="employee-edit-form" className="btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        {editForm && (
          <form id="employee-edit-form" onSubmit={handleEdit} className="space-y-4">
            {editError && (
              <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {editError}
              </div>
            )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ed-role">Rol</label>
              <select id="ed-role" className="input" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}>
                {roles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ed-phone">Teléfono</label>
              <input
                id="ed-phone"
                type="tel"
                className="input"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
          </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="ed-office">Oficina</label>
                <select id="ed-office" className="input" value={editForm.office_id} onChange={(e) => setEditForm({ ...editForm, office_id: e.target.value })}>
                  <option value="">Sin asignar</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="ed-dept">Departamento</label>
                <select id="ed-dept" className="input" value={editForm.department_id} onChange={(e) => setEditForm({ ...editForm, department_id: e.target.value })}>
                  <option value="">Sin asignar</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="ed-job">Cargo</label>
              <input id="ed-job" className="input" value={editForm.job_title} onChange={(e) => setEditForm({ ...editForm, job_title: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="ed-company">Empresa (asignar/trasladar)</label>
                <select id="ed-company" className="input" value={editForm.company_id} onChange={(e) => setEditForm({ ...editForm, company_id: e.target.value })}>
                  <option value="">Sin cambios</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-400">Usa Traslados para mover entre empresas con control completo.</p>
              </div>
              <div>
                <label className="label" htmlFor="ed-effective">Fecha efectiva</label>
                <input id="ed-effective" type="date" className="input" value={editForm.effective_date} onChange={(e) => setEditForm({ ...editForm, effective_date: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={editForm.is_active} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })} />
              Empleado activo
            </label>
          </form>
        )}
      </Modal>

      <Modal
        open={importError !== null || importResult !== null}
        title="Resultado de importación"
        onClose={() => { setImportError(null); setImportResult(null) }}
        footer={
          <button
            type="button"
            className="btn-primary"
            onClick={() => { setImportError(null); setImportResult(null) }}
          >
            Cerrar
          </button>
        }
      >
        {importError ? (
          <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {importError}
          </div>
        ) : importResult ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              <span className="font-semibold text-green-700">{importResult.created}</span> empleado(s) creado(s) correctamente.
              {importResult.failed.length > 0 && (
                <>
                  {' '}
                  <span className="font-semibold text-red-700">{importResult.failed.length}</span> con error.
                </>
              )}
            </p>
            {importResult.failed.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="table-th">Fila</th>
                      <th className="table-th">Correo</th>
                      <th className="table-th">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {importResult.failed.map((f, idx) => (
                      <tr key={idx}>
                        <td className="table-td">{f.row}</td>
                        <td className="table-td">{f.email}</td>
                        <td className="table-td text-red-600">{f.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={vacationEmployee !== null}
        title={
          vacationEmployee
            ? `Vacaciones de ${vacationEmployee.profiles?.first_name ?? ''} ${vacationEmployee.profiles?.last_name ?? ''}`.trim()
            : 'Vacaciones'
        }
        onClose={() => setVacationEmployee(null)}
        footer={
          <button type="button" className="btn-secondary" onClick={() => setVacationEmployee(null)}>
            Cerrar
          </button>
        }
      >
        <div className="space-y-4">
          {vacationError && (
            <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {vacationError}
            </div>
          )}

          <form onSubmit={handleAddVacation} className="space-y-3 rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-700">Añadir período de vacaciones</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="v-start">Desde</label>
                <input
                  id="v-start"
                  type="date"
                  className="input"
                  value={vacationForm.start_date}
                  onChange={(e) => setVacationForm({ ...vacationForm, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="v-end">Hasta</label>
                <input
                  id="v-end"
                  type="date"
                  className="input"
                  value={vacationForm.end_date}
                  onChange={(e) => setVacationForm({ ...vacationForm, end_date: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="v-reason">Motivo (opcional)</label>
              <input
                id="v-reason"
                className="input"
                value={vacationForm.reason}
                onChange={(e) => setVacationForm({ ...vacationForm, reason: e.target.value })}
              />
            </div>
            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={vacationSaving}>
                {vacationSaving ? 'Guardando…' : 'Añadir'}
              </button>
            </div>
          </form>

          {vacationLoading ? (
            <p className="py-4 text-center text-sm text-slate-500">Cargando…</p>
          ) : vacations.length === 0 ? (
            <p className="py-2 text-center text-sm text-slate-500">Sin períodos registrados.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {vacations.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <p className="text-sm text-slate-700">
                      {v.start_date} → {v.end_date}
                    </p>
                    {v.reason && <p className="text-xs text-slate-400">{v.reason}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteVacation(v.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Eliminar período"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Eliminar empleado"
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
        onClose={() => {
          setDeleting(null)
          setDeleteError(null)
        }}
        message={
          <>
            ¿Eliminar definitivamente a{' '}
            <strong>
              {deleting?.profiles?.first_name} {deleting?.profiles?.last_name}
            </strong>{' '}
            ({deleting?.employee_code})? Se borrarán su usuario, su perfil y sus datos de vacaciones.
            Si ya tiene asistencias registradas el sistema no permitirá eliminarlo: desactívalo en su lugar.
          </>
        }
      />

      <Modal
        open={resetting !== null}
        title={resetting ? `Restablecer clave de ${resetting.profiles?.first_name} ${resetting.profiles?.last_name}`.trim() : 'Restablecer clave'}
        onClose={closeReset}
        footer={
          resetResult ? (
            <button type="button" className="btn-primary" onClick={closeReset}>
              Cerrar
            </button>
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={closeReset} disabled={resetBusy}>
                Cancelar
              </button>
              <button type="submit" form="reset-form" className="btn-primary" disabled={resetBusy}>
                {resetBusy ? 'Restableciendo…' : 'Restablecer clave'}
              </button>
            </>
          )
        }
      >
        {resetResult ? (
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              Clave temporal generada para <strong>{resetResult.email}</strong>.
            </p>
            <p>
              La contraseña inicial será:{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                {resetResult.temp_password}
              </code>
            </p>
            <p className="text-xs text-slate-500">
              Al iniciar sesión desde la app móvil, el usuario deberá cambiar esta clave. No la comparta fuera del canal autorizado.
            </p>
          </div>
        ) : (
          <form id="reset-form" onSubmit={handleReset} className="space-y-4">
            {resetError && (
              <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {resetError}
              </div>
            )}
            <div>
              <label className="label" htmlFor="reset-suffix">Sufijo de la clave temporal (mín. 6)</label>
              <input
                id="reset-suffix"
                type="text"
                className="input"
                required
                minLength={6}
                value={resetSuffix}
                onChange={(e) => setResetSuffix(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">
                Clave temporal = cédula del empleado + sufijo. El empleado deberá cambiarla al primer inicio de sesión en la app móvil.
              </p>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

