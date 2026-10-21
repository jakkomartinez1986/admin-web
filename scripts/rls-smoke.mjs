// Pruebas RLS por rol y de la Edge Function admin-create-employee.
// Uso: node scripts/rls-smoke.mjs
// Requiere .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf8')
const env = Object.fromEntries(
  envFile
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const URL = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY

const ADMIN = { email: 'admin@asistencia.corp', password: 'TmpAsis-2026!x7Q' }

let pass = 0
let fail = 0
const results = []

function check(name, condition, detail = '') {
  if (condition) {
    pass++
    results.push(`  PASS  ${name}`)
  } else {
    fail++
    results.push(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`)
  }
}

function client() {
  return createClient(URL, KEY, { auth: { persistSession: false } })
}

// Extrae el mensaje de error devuelto por una Edge Function (400/409 incluidos).
async function invokeErrorText(result) {
  if (result.error) {
    const context = result.error.context
    if (context) {
      try {
        const body = await context.json()
        if (body?.error) return String(body.error)
      } catch {
        // sin cuerpo JSON
      }
    }
    return result.error.message
  }
  return result.data?.error ? String(result.data.error) : ''
}

// Genera una cedula ecuatoriana valida (modulo 10) a partir de una semilla.
// Usa los ultimos 7 digitos de la semilla, de modo que semillas distintas
// (p. ej. `${stamp}1`, `${stamp}2`) produzcan cedulas distintas.
function makeCedula(seed) {
  const base = `17${String(seed).replace(/\D/g, '').slice(-7).padStart(7, '0')}`
  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2]
  let sum = 0
  for (let i = 0; i < 9; i += 1) {
    let product = Number(base[i]) * coefficients[i]
    if (product > 9) product -= 9
    sum += product
  }
  return base + ((10 - (sum % 10)) % 10)
}

async function main() {
  console.log('== RLS / Edge Function smoke tests ==\n')

  const admin = client()
  const adminLogin = await admin.auth.signInWithPassword(ADMIN)
  check('Admin login', !adminLogin.error, adminLogin.error?.message)
  if (adminLogin.error) return finish()

  const { data: offices } = await admin.from('offices').select('id, code').eq('is_active', true).order('code')
  check('Admin ve 8 oficinas', offices?.length === 8, `encontradas=${offices?.length}`)

  // Codigo de departamento autogenerado (DEP-001, DEP-002, ...)
  const stamp = Date.now().toString().slice(-6)
  const deptIns = await admin
    .from('departments')
    .insert({ name: `Depto smoke ${stamp}`, office_id: offices?.[0]?.id ?? null })
    .select('id, code')
    .single()
  check(
    'Departamento sin codigo recibe codigo automatico DEP-NNN',
    !deptIns.error && /^DEP-[0-9]{3,}$/.test(deptIns.data?.code ?? ''),
    deptIns.error?.message ?? `code=${deptIns.data?.code}`,
  )
  const deptId = deptIns.data?.id ?? null
  const deptCode = deptIns.data?.code ?? ''

  // Embed ambiguo empleados/departamentos (regresion) y su forma con hint de FK
  const ambiguous = await admin.from('employees').select('id, departments(name)').limit(1)
  check('Embed sin hint employees->departments falla por ambiguedad', !!ambiguous.error, 'no hubo ambiguedad')
  const hinted = await admin.from('employees').select('id, departments!employees_department_id_fkey(name)').limit(1)
  check(
    'Embed con hint employees_department_id_fkey funciona',
    !hinted.error,
    hinted.error?.message,
  )

  // Crear 2 empleados con la Edge Function (prueba autorizacion + creacion atomica)
  const emp1 = {
    email: `empleado1.${stamp}@asistencia.corp`,
    password: 'TmpEmp-2026!x7Q',
    first_name: 'Empleado',
    last_name: 'Uno',
    employee_code: `EMP-${stamp}-1`,
    national_id: makeCedula(`${stamp}1`),
    role: 'EMPLEADO',
    office_id: offices?.[0]?.id ?? null,
    department_id: deptId,
  }
  const emp2 = {
    email: `empleado2.${stamp}@asistencia.corp`,
    password: 'TmpEmp-2026!x7Q',
    first_name: 'Empleado',
    last_name: 'Dos',
    employee_code: `EMP-${stamp}-2`,
    national_id: makeCedula(`${stamp}2`),
    role: 'EMPLEADO',
    office_id: offices?.[1]?.id ?? null,
  }

  const c1 = await admin.functions.invoke('admin-create-employee', { body: emp1 })
  check('Edge Function crea empleado 1', !c1.error && c1.data?.ok, c1.error?.message ?? JSON.stringify(c1.data))
  const c2 = await admin.functions.invoke('admin-create-employee', { body: emp2 })
  check('Edge Function crea empleado 2', !c2.error && c2.data?.ok, c2.error?.message ?? JSON.stringify(c2.data))

  if (!c1.data?.ok || !c2.data?.ok) return finish()

  const emp1Id = c1.data.employee.id
  const emp2Id = c2.data.employee.id

  // ===== Codigo de empleado opcional (autogenerado) y validaciones de duplicados =====
  const emp3 = {
    email: `empleado3.${stamp}@asistencia.corp`,
    password: 'TmpEmp-2026!x7Q',
    first_name: 'Empleado',
    last_name: 'Tres',
    national_id: makeCedula(`${stamp}3`),
    role: 'EMPLEADO',
  }
  const c3 = await admin.functions.invoke('admin-create-employee', { body: emp3 })
  check('Edge Function crea empleado sin employee_code', !c3.error && c3.data?.ok, c3.error?.message ?? JSON.stringify(c3.data))
  check(
    'El employee_code se autogenera (EMP-NNN) cuando se omite',
    /^EMP-[0-9]+$/.test(c3.data?.employee?.employee_code ?? ''),
    `code=${c3.data?.employee?.employee_code}`,
  )
  const emp3Id = c3.data?.employee?.id

  // Empleado 4: dedicado a las pruebas de comision/revision y a la regla de
  // 1 ENTRADA + 1 SALIDA por dia (emp1 ya uso su ENTRADA con selfEventId).
  const emp4 = {
    email: `empleado4.${stamp}@asistencia.corp`,
    password: 'TmpEmp-2026!x7Q',
    first_name: 'Empleado',
    last_name: 'Cuatro',
    employee_code: `EMP-${stamp}-4`,
    national_id: makeCedula(`${stamp}5`),
    role: 'EMPLEADO',
    office_id: offices?.[0]?.id ?? null,
    department_id: deptId,
  }
  const c4 = await admin.functions.invoke('admin-create-employee', { body: emp4 })
  check('Edge Function crea empleado 4', !c4.error && c4.data?.ok, c4.error?.message ?? JSON.stringify(c4.data))
  const emp4Id = c4.data?.employee?.id

  const dupEmailTarget = `duplicado.${stamp}@asistencia.corp`
  const dupNationalId = await admin.functions.invoke('admin-create-employee', {
    body: { ...emp3, email: dupEmailTarget, employee_code: null },
  })
  const dupNationalIdText = await invokeErrorText(dupNationalId)
  check(
    'Cedula duplicada se rechaza con mensaje claro',
    /c[eé]dula/i.test(dupNationalIdText),
    dupNationalIdText || 'sin error',
  )

  const dupEmail = await admin.functions.invoke('admin-create-employee', {
    body: { ...emp1, national_id: makeCedula(`${stamp}4`), employee_code: null },
  })
  const dupEmailText = await invokeErrorText(dupEmail)
  check(
    'Correo duplicado se rechaza con mensaje claro',
    /correo/i.test(dupEmailText),
    dupEmailText || 'sin error',
  )

  const dupCreated = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .in('email', [dupEmailTarget, emp1.email])
  check(
    'Los intentos duplicados no crean usuarios extra',
    (dupCreated.count ?? 0) === 1,
    `usuarios=${dupCreated.count}`,
  )

  // Clave inicial = cedula + sufijo (definida en admin-create-employee)
  const initialPassword = (employee) => `${employee.national_id}${employee.password}`

  // El empleado aparece vinculado a su departamento (embed con hint de FK)
  const emp1Row = await admin
    .from('employees')
    .select('id, departments!employees_department_id_fkey(name)')
    .eq('id', emp1Id)
    .single()
  check(
    'Empleado 1 vinculado al departamento en el listado',
    !emp1Row.error && emp1Row.data?.departments?.name === `Depto smoke ${stamp}`,
    emp1Row.error?.message ?? JSON.stringify(emp1Row.data),
  )

  // Resolucion del identificador de login (cedula o correo) para el APK
  const anon = client()
  const byCedula = await anon.rpc('resolve_login_email', { p_identifier: emp1.national_id })
  check('resolve_login_email resuelve la cedula al correo', byCedula.data === emp1.email, `data=${byCedula.data}`)
  const byEmail = await anon.rpc('resolve_login_email', { p_identifier: 'Admin@Asistencia.Corp' })
  check('resolve_login_email normaliza el correo', byEmail.data === 'admin@asistencia.corp', `data=${byEmail.data}`)
  const byInvalid = await anon.rpc('resolve_login_email', { p_identifier: '1713175072' })
  check('resolve_login_email rechaza cedula invalida', byInvalid.data === null, `data=${byInvalid.data}`)

  // Login como empleado 1 (clave inicial = cedula + sufijo)
  const u1 = client()
  const u1Login = await u1.auth.signInWithPassword({ email: emp1.email, password: initialPassword(emp1) })
  check('Empleado 1 login', !u1Login.error, u1Login.error?.message)
  const u1OldPassword = await client().auth.signInWithPassword({ email: emp1.email, password: emp1.password })
  check('El sufijo solo NO permite el login', !!u1OldPassword.error, 'el sufijo autentico por si solo')

  // Login como empleado 4 (usado en pruebas de comision y de 1 ENTRADA + 1 SALIDA/dia)
  const u4 = client()
  const u4Login = await u4.auth.signInWithPassword({ email: emp4.email, password: initialPassword(emp4) })
  check('Empleado 4 login', !u4Login.error, u4Login.error?.message)

  const u1Employees = await u1.from('employees').select('id')
  check(
    'Empleado 1 solo ve su propia fila de empleados',
    u1Employees.data?.length === 1 && u1Employees.data[0].id === emp1Id,
    `filas=${u1Employees.data?.length}`,
  )

  const u1Profiles = await u1.from('profiles').select('id, role')
  check(
    'Empleado 1 solo ve su propio perfil',
    u1Profiles.data?.length === 1 && u1Profiles.data[0].role === 'EMPLEADO',
    `filas=${u1Profiles.data?.length}`,
  )

  // ===== Telefono propio y proteccion contra autoascenso =====
  const u1ProfileId = c1.data.employee.profile_id
  const phoneUpdate = await u1
    .from('profiles')
    .update({ phone: '0991234567' })
    .eq('id', u1ProfileId)
    .select('phone')
  check(
    'Empleado actualiza su propio telefono',
    !phoneUpdate.error && phoneUpdate.data?.[0]?.phone === '0991234567',
    phoneUpdate.error?.message ?? JSON.stringify(phoneUpdate.data),
  )

  const roleEscalation = await u1
    .from('profiles')
    .update({ role: 'ADMINISTRADOR' })
    .eq('id', u1ProfileId)
    .select('role')
  check(
    'Empleado NO puede autoascenderse a ADMINISTRADOR',
    !!roleEscalation.error || (roleEscalation.data ?? []).length === 0,
    'se permitio indebidamente',
  )

  const activeEscalation = await u1
    .from('profiles')
    .update({ is_active: false })
    .eq('id', u1ProfileId)
    .select('is_active')
  check(
    'Empleado NO puede desactivarse a si mismo via profiles',
    !!activeEscalation.error || (activeEscalation.data ?? []).length === 0,
    'se permitio indebidamente',
  )

  // Insertar evento de asistencia para si mismo (permitido)
  const opSelf = crypto.randomUUID()
  const insertSelf = await u1
    .from('attendance_events')
    .insert({
      employee_id: emp1Id,
      event_type: 'ENTRADA',
      office_id: emp1.office_id,
      device_time: new Date().toISOString(),
      operation_uuid: opSelf,
      latitude: -0.18,
      longitude: -78.47,
      accuracy_m: 12.5,
    })
    .select('id')
    .single()
  check('Empleado 1 inserta asistencia propia', !insertSelf.error, insertSelf.error?.message)
  const selfEventId = insertSelf.data?.id

  // Insertar evento para otro empleado (debe fallar por RLS)
  const insertOther = await u1.from('attendance_events').insert({
    employee_id: emp2Id,
    event_type: 'ENTRADA',
    office_id: emp2.office_id,
    device_time: new Date().toISOString(),
    operation_uuid: crypto.randomUUID(),
  })
  check('Empleado 1 NO puede insertar asistencia de otro', !!insertOther.error, 'se permitio indebidamente')

  // Empleado 1 no ve eventos de empleado 2
  const u1Events = await u1.from('attendance_events').select('employee_id')
  const onlyOwn = (u1Events.data ?? []).every((e) => e.employee_id === emp1Id)
  check('Empleado 1 solo ve sus propios eventos', onlyOwn, `eventos=${u1Events.data?.length}`)

  // Empleado 1 no puede cambiar su estado de validacion (update solo RRHH)
  const u1Update = await u1
    .from('attendance_events')
    .update({ validation_status: 'CONFIRMADO' })
    .eq('id', selfEventId)
    .select()
  check(
    'Empleado 1 NO puede confirmar su propio evento',
    (u1Update.data ?? []).length === 0,
    'se permitio indebidamente',
  )

  // Empleado 1 no puede crear oficinas
  const u1Office = await u1.from('offices').insert({ name: `Hack ${stamp}`, code: `HACK-${stamp}` })
  check('Empleado 1 NO puede crear oficinas', !!u1Office.error, 'se permitio indebidamente')

  // Oficina temporal: el ADMIN puede crearla y eliminarla (offices_write_admin)
  const offIns = await admin
    .from('offices')
    .insert({ name: `Oficina smoke ${stamp}`, code: `OFC-${stamp}` })
    .select('id')
    .single()
  check('Admin crea oficina temporal', !offIns.error, offIns.error?.message)
  if (offIns.data?.id) {
    const offDel = await admin.from('offices').delete().eq('id', offIns.data.id).select('id')
    check(
      'Admin elimina la oficina temporal',
      !offDel.error && (offDel.data ?? []).length === 1,
      offDel.error?.message ?? `filas=${(offDel.data ?? []).length}`,
    )
  }

  // Un empleado no puede eliminar oficinas ni departamentos
  const u1OfficeDel = await u1.from('offices').delete().eq('id', offices?.[0]?.id).select('id')
  check('Empleado 1 NO puede eliminar oficinas', (u1OfficeDel.data ?? []).length === 0, 'se permitio indebidamente')
  const u1DeptDel = await u1.from('departments').delete().eq('id', deptId).select('id')
  check('Empleado 1 NO puede eliminar departamentos', (u1DeptDel.data ?? []).length === 0, 'se permitio indebidamente')

  // Admin si ve todos los eventos
  const adminEvents = await admin.from('attendance_events').select('id, employee_id')
  check('Admin ve los eventos de todos', (adminEvents.data ?? []).length >= 1, `eventos=${adminEvents.data?.length}`)

  // Admin confirma el evento (RRHH+)
  const adminConfirm = await admin
    .from('attendance_events')
    .update({ validation_status: 'CONFIRMADO' })
    .eq('id', selfEventId)
    .select()
  check('Admin SI puede confirmar eventos', (adminConfirm.data ?? []).length === 1, adminConfirm.error?.message)

  // Un empleado no puede invocar la Edge Function para crear otros usuarios
  const u1Invoke = await u1.functions.invoke('admin-create-employee', {
    body: { ...emp1, email: `hack.${stamp}@asistencia.corp`, employee_code: `HACK-${stamp}` },
  })
  const u1InvokeFailed = !!u1Invoke.error || u1Invoke.data?.error
  check('Empleado 1 NO puede usar admin-create-employee', u1InvokeFailed, 'se permitio indebidamente')

  // Un empleado no puede invocar la Edge Function que elimina empleados
  const u1InvokeDelete = await u1.functions.invoke('admin-delete-employee', { body: { employee_id: emp2Id } })
  const u1InvokeDeleteFailed = !!u1InvokeDelete.error || u1InvokeDelete.data?.error
  check('Empleado 1 NO puede usar admin-delete-employee', u1InvokeDeleteFailed, 'se permitio indebidamente')
  const emp2AfterAttack = await admin.from('employees').select('id').eq('id', emp2Id).maybeSingle()
  check('Empleado 2 sigue existiendo tras el intento', emp2AfterAttack.data?.id === emp2Id, 'se borro indebidamente')

  // ===== Flujo de aprobacion de comisiones + enforcement =====
  // La fecha debe ser la de Ecuador (America/Guayaquil), no la UTC:
  // is_commission_open compara contra (now() at time zone 'America/Guayaquil')::date.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })
  const comIns = await admin
    .from('commissions')
    .insert({ name: `Comision smoke ${stamp}`, detail: 'Prueba automatizada', start_date: today, end_date: today })
    .select('id, status')
    .single()
  check(
    'Admin crea comision en PENDIENTE_APROBACION',
    !comIns.error && comIns.data?.status === 'PENDIENTE_APROBACION',
    comIns.error?.message ?? `status=${comIns.data?.status}`,
  )

  const comId = comIns.data?.id
  if (comId) {
    const openBefore = await admin.rpc('is_commission_open', { p_commission_id: comId })
    check('Comision pendiente NO esta abierta', openBefore.data === false, `data=${openBefore.data}`)

    const noMembers = await admin.rpc('set_commission_status', { p_commission_id: comId, p_new_status: 'APROBADA', p_reason: null })
    check('No se aprueba una comision sin miembros', !!noMembers.error, 'se aprobo indebidamente')

    const mem = await admin
      .from('commission_members')
      .insert({ commission_id: comId, employee_id: emp1Id })
      .select('id')
      .single()
    check('Se asigna un miembro a la comision', !mem.error, mem.error?.message)

    const approve = await admin.rpc('set_commission_status', { p_commission_id: comId, p_new_status: 'APROBADA', p_reason: null })
    check('Admin aprueba la comision', !approve.error, approve.error?.message)

    const openAfter = await admin.rpc('is_commission_open', { p_commission_id: comId })
    check('Comision aprobada y vigente SI esta abierta', openAfter.data === true, `data=${openAfter.data}`)

    const u1Approve = await u1.rpc('set_commission_status', { p_commission_id: comId, p_new_status: 'REVOCADA', p_reason: 'x' })
    check('Empleado NO puede cambiar el estado de la comision', !!u1Approve.error, 'se permitio indebidamente')

    const badTransition = await admin
      .from('commissions')
      .update({ status: 'RECHAZADA', rejection_reason: 'intento directo' })
      .eq('id', comId)
      .select('status')
    check(
      'Transicion directa APROBADA -> RECHAZADA bloqueada',
      !!badTransition.error || (badTransition.data ?? []).length === 0,
      'se permitio indebidamente',
    )

    // emp1 ya registro su ENTRADA del dia (selfEventId); aqui valida su SALIDA
    // con la comision aprobada y vigente (regla de 1 ENTRADA + 1 SALIDA/dia).
    const evOk = await u1.functions.invoke('verify-and-register-attendance', {
      body: {
        record_id: crypto.randomUUID(),
        attendance_type: 'SALIDA',
        device_timestamp: Date.now(),
        latitude: -0.18,
        longitude: -78.47,
        accuracy_meters: 10,
        commission_id: comId,
      },
    })
    check(
      'Edge Function acepta comision valida del miembro',
      !evOk.error && evOk.data?.success === true && evOk.data?.requires_review === false,
      evOk.error?.message ?? JSON.stringify(evOk.data),
    )

    // emp4 es un empleado limpio: su ENTRADA con comision inexistente va a revision.
    const evBad = await u4.functions.invoke('verify-and-register-attendance', {
      body: {
        record_id: crypto.randomUUID(),
        attendance_type: 'ENTRADA',
        device_timestamp: Date.now(),
        commission_id: 'COM-2026-089',
      },
    })
    check(
      'Edge Function marca revision con comision inexistente',
      !evBad.error && evBad.data?.requires_review === true,
      evBad.error?.message ?? JSON.stringify(evBad.data),
    )

    const revoke = await admin.rpc('set_commission_status', {
      p_commission_id: comId,
      p_new_status: 'REVOCADA',
      p_reason: 'Prueba smoke',
    })
    check('Admin revoca la comision', !revoke.error, revoke.error?.message)

    const openRevoked = await admin.rpc('is_commission_open', { p_commission_id: comId })
    check('Comision revocada NO esta abierta', openRevoked.data === false, `data=${openRevoked.data}`)

    // emp4 usa su SALIDA (aun no tiene ninguna) con la comision revocada.
    const evRevoked = await u4.functions.invoke('verify-and-register-attendance', {
      body: {
        record_id: crypto.randomUUID(),
        attendance_type: 'SALIDA',
        device_timestamp: Date.now(),
        commission_id: comId,
      },
    })
    check(
      'Edge Function marca revision con comision revocada',
      !evRevoked.error && evRevoked.data?.requires_review === true,
      evRevoked.error?.message ?? JSON.stringify(evRevoked.data),
    )

    // Limpieza de la comision de prueba.
    // attendance_events no tiene politica DELETE (por diseno) y su FK hacia
    // commissions es ON DELETE RESTRICT, asi que los eventos creados por la Edge
    // Function bloquean el borrado de la comision en la UI.
    const delMembers = await admin.from('commission_members').delete().eq('commission_id', comId)
    check('Se quitan los miembros de la comision', !delMembers.error, delMembers.error?.message)
    const delCommission = await admin.from('commissions').delete().eq('id', comId).select('id')
    const commissionBlocked = !!delCommission.error || (delCommission.data ?? []).length === 0
    check('DELETE de comision con asistencias queda bloqueado (FK RESTRICT)', commissionBlocked, 'se borro indebidamente')
    if (commissionBlocked) {
      console.log(
        `  INFO  Comision de prueba ${comId} pendiente de limpieza con service_role (FK ON DELETE RESTRICT sobre attendance_events).`,
      )
    }
  }

  // ===== Regla: 1 ENTRADA + 1 SALIDA por empleado por dia =====
  // emp4 ya registro 1 ENTRADA (evBad) y 1 SALIDA (evRevoked) hoy; un segundo
  // intento de cada tipo debe ser bloqueado por el trigger.
  const dupEntrada = await u4.from('attendance_events').insert({
    employee_id: emp4Id,
    event_type: 'ENTRADA',
    office_id: emp4.office_id,
    device_time: new Date().toISOString(),
    operation_uuid: crypto.randomUUID(),
  })
  check(
    'Segunda ENTRADA del dia se bloquea (1 por dia)',
    !!dupEntrada.error && /entrada/i.test(dupEntrada.error.message ?? ''),
    dupEntrada.error?.message ?? 'se permitio indebidamente',
  )

  const dupSalida = await u4.from('attendance_events').insert({
    employee_id: emp4Id,
    event_type: 'SALIDA',
    office_id: emp4.office_id,
    device_time: new Date().toISOString(),
    operation_uuid: crypto.randomUUID(),
  })
  check(
    'Segunda SALIDA del dia se bloquea (1 por dia)',
    !!dupSalida.error && /salida/i.test(dupSalida.error.message ?? ''),
    dupSalida.error?.message ?? 'se permitio indebidamente',
  )

  // ===== Reset de clave desde el panel (Edge Function admin-reset-password) =====
  const resetSuffix = 'Rst-2026!'
  const resetRes = await admin.functions.invoke('admin-reset-password', {
    body: { employee_id: emp3Id, password: resetSuffix },
  })
  const resetText = await invokeErrorText(resetRes)
  check('Admin resetea la clave de un empleado', !resetRes.error && resetRes.data?.ok === true, resetText || JSON.stringify(resetRes.data))
  const tempPassword = `${emp3.national_id}${resetSuffix}`
  check(
    'La clave temporal es cedula + sufijo',
    resetRes.data?.temp_password === tempPassword,
    `temp=${resetRes.data?.temp_password}`,
  )

  const emp3Relogin = await client().auth.signInWithPassword({ email: emp3.email, password: tempPassword })
  check('El empleado puede ingresar con la clave temporal', !emp3Relogin.error, emp3Relogin.error?.message)

  const resetAsEmployee = await u1.functions.invoke('admin-reset-password', {
    body: { employee_id: emp3Id, password: resetSuffix },
  })
  check('Empleado NO puede usar admin-reset-password', !!resetAsEmployee.error || resetAsEmployee.data?.error, 'se permitio indebidamente')

  // ===== Eliminacion definitiva de empleados (Edge Function admin-delete-employee) =====
  const delEmp1 = await admin.functions.invoke('admin-delete-employee', { body: { employee_id: emp1Id } })
  const emp1Blocked = !!delEmp1.error || !!delEmp1.data?.error || delEmp1.data?.code === 'HAS_ATTENDANCE'
  check('No se elimina un empleado con asistencias registradas', emp1Blocked, 'se elimino indebidamente')
  const emp1Still = await admin.from('employees').select('id, is_active').eq('id', emp1Id).maybeSingle()
  check('El empleado con asistencias sigue existiendo (para desactivar)', emp1Still.data?.id === emp1Id, 'desaparecio')

  const delEmp2 = await admin.functions.invoke('admin-delete-employee', { body: { employee_id: emp2Id } })
  check(
    'Edge Function elimina un empleado sin asistencias',
    !delEmp2.error && delEmp2.data?.ok === true,
    delEmp2.error?.message ?? JSON.stringify(delEmp2.data),
  )
  if (!delEmp2.error && delEmp2.data?.ok) {
    const emp2Gone = await admin.from('employees').select('id').eq('id', emp2Id).maybeSingle()
    check('La fila de employees desaparece', emp2Gone.data === null, JSON.stringify(emp2Gone.data))
    const emp2ProfileGone = await admin
      .from('profiles')
      .select('id')
      .eq('id', c2.data.employee.profile_id)
      .maybeSingle()
    check('El perfil desaparece', emp2ProfileGone.data === null, JSON.stringify(emp2ProfileGone.data))
    const emp2Login = await client().auth.signInWithPassword({ email: emp2.email, password: initialPassword(emp2) })
    check('Ya no se puede iniciar sesion con el usuario eliminado', !!emp2Login.error, 'el login siguio funcionando')
  }

  const emp1Login = await client().auth.signInWithPassword({ email: emp1.email, password: initialPassword(emp1) })
  check('El empleado 1 (no eliminado) sigue pudiendo ingresar', !emp1Login.error, emp1Login.error?.message)

  if (emp3Id) {
    const delEmp3 = await admin.functions.invoke('admin-delete-employee', { body: { employee_id: emp3Id } })
    check(
      'Se elimina el empleado creado con codigo automatico',
      !delEmp3.error && delEmp3.data?.ok === true,
      delEmp3.error?.message ?? JSON.stringify(delEmp3.data),
    )
  }

  if (deptId) {
    const delDept = await admin.from('departments').delete().eq('id', deptId)
    if (delDept.error) {
      console.log(`  INFO  Departamento de prueba ${deptId} pendiente de limpieza: ${delDept.error.message}`)
    }
  }

  await admin.auth.signOut()
  return finish({ emp1, emp2, emp4, emp1Id, emp2Id, emp4Id, deptId, deptCode })
}

function finish(extra) {
  console.log(results.join('\n'))
  console.log(`\nResultado: ${pass} PASS / ${fail} FAIL`)
  if (extra) {
    console.log('\nDatos de prueba pendientes de limpieza (requieren service_role / MCP):')
    console.log(`  ${extra.emp1.email} / ${extra.emp1.national_id}${extra.emp1.password}  (employee_id=${extra.emp1Id}, no eliminable: tiene asistencias)`)
    console.log(`  ${extra.emp4.email} / ${extra.emp4.national_id}${extra.emp4.password}  (employee_id=${extra.emp4Id}, no eliminable: tiene asistencias)`)
    if (extra.deptId) console.log(`  departamento de prueba: ${extra.deptCode} (id=${extra.deptId})`)
    console.log('  (el empleado 2, su perfil y su usuario de auth se eliminaron con admin-delete-employee)')
  }
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('Error inesperado:', e)
  process.exit(2)
})
