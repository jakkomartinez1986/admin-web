export type Role = 'ADMINISTRADOR' | 'RECURSOS_HUMANOS' | 'SUPERVISOR' | 'EMPLEADO'

export type EventType = 'ENTRADA' | 'SALIDA'

export type ValidationStatus =
  | 'PENDIENTE'
  | 'SINCRONIZANDO'
  | 'CONFIRMADO'
  | 'RECHAZADO'
  | 'REQUIERE_REVISION'

export type CommissionStatus = 'BORRADOR' | 'PENDIENTE_APROBACION' | 'APROBADA' | 'RECHAZADA' | 'REVOCADA' | 'FINALIZADA'

export interface Office {
  id: string
  name: string
  code: string
  address: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  geofence_radius_m: number | null
  qr_token: string | null
  is_active: boolean
  created_at: string
}

export interface Department {
  id: string
  name: string
  code: string
  office_id: string | null
  manager_employee_id: string | null
  is_active: boolean
  offices?: Office | null
}

export interface ProfileEmbed {
  first_name: string
  last_name: string
  email?: string
  national_id?: string | null
  phone?: string | null
  role?: Role
}

export interface Employee {
  id: string
  profile_id: string
  employee_code: string
  department_id: string | null
  office_id: string | null
  work_schedule_id: string | null
  supervisor_id: string | null
  job_title: string | null
  is_active: boolean
  created_at: string
  profiles?: ProfileEmbed | null
  departments?: Department | null
  offices?: Office | null
}

export type VacationStatus = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'

export interface EmployeeVacation {
  id: string
  employee_id: string
  start_date: string
  end_date: string
  reason: string | null
  status: VacationStatus
  created_by: string | null
  created_at: string
}

export interface WorkSchedule {
  id: string
  name: string
  start_time: string
  end_time: string
  grace_minutes: number
  work_days: number[]
  is_active: boolean
}

export interface AttendanceEvent {
  id: string
  employee_id: string
  event_type: EventType
  office_id: string | null
  service_commission_id: string | null
  device_time: string
  server_time_received: string
  latitude: number | null
  longitude: number | null
  accuracy_m: number | null
  operation_uuid: string
  device_id: string | null
  validation_status: ValidationStatus
  rejection_reason: string | null
  created_at: string
  company_id: string | null
  assignment_id: string | null
  employees?: { employee_code: string; profiles?: ProfileEmbed | null } | null
  offices?: Pick<Office, 'name' | 'code'> | null
  companies?: Pick<Company, 'id' | 'name' | 'commercial_name' | 'tax_id'> | null
}

export interface ServiceCommission {
  id: string
  employee_id: string
  start_at: string
  end_at: string
  destination: string
  authorized_area: string | null
  reason: string
  status: CommissionStatus
  authorized_by: string | null
  approved_at: string | null
  notes: string | null
  created_at: string
  employees?: { employee_code: string; profiles?: ProfileEmbed | null } | null
}

export type CommissionApprovalStatus =
  | 'PENDIENTE_APROBACION'
  | 'APROBADA'
  | 'RECHAZADA'
  | 'REVOCADA'
  | 'FINALIZADA'

export interface Commission {
  id: string
  name: string
  detail: string | null
  start_date: string
  end_date: string
  status: CommissionApprovalStatus
  is_active: boolean
  closed_at: string | null
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  commission_members?: CommissionMember[] | null
}

export interface CommissionMember {
  id: string
  commission_id: string
  employee_id: string
  assigned_at: string
}

export interface Company {
  id: string
  name: string
  commercial_name: string | null
  tax_id: string
  address: string | null
  phone: string | null
  email: string | null
  logo_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CompanyAssignmentStatus = 'ACTIVA' | 'FINALIZADA' | 'FUTURA'

export interface CompanyAssignment {
  id: string
  employee_id: string
  company_id: string
  start_date: string
  end_date: string | null
  status: CompanyAssignmentStatus
  position: string | null
  department_id: string | null
  office_id: string | null
  created_at: string
  created_by: string | null
  companies?: Pick<Company, 'id' | 'name' | 'commercial_name' | 'tax_id'> | null
  employees?: {
    employee_code: string
    profiles?: Pick<ProfileEmbed, 'first_name' | 'last_name' | 'national_id' | 'email'> | null
  } | null
}
