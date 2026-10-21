import { useEffect, useState } from 'react'
import { Users, Building2, LogIn, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'

interface Stats {
  employees: number
  offices: number
  entries: number
  exits: number
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number | null; icon: typeof Users }) {
  return (
    <div className="card flex items-center gap-4">
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-semibold text-slate-900">{value ?? '—'}</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const [employees, offices, entries, exits] = await Promise.all([
        supabase.from('employees').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('offices').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase
          .from('attendance_events')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'ENTRADA')
          .gte('device_time', today.toISOString()),
        supabase
          .from('attendance_events')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'SALIDA')
          .gte('device_time', today.toISOString()),
      ])

      const firstError = employees.error || offices.error || entries.error || exits.error
      if (firstError) {
        setError(firstError.message)
        setStats({ employees: 0, offices: 0, entries: 0, exits: 0 })
        return
      }

      setStats({
        employees: employees.count ?? 0,
        offices: offices.count ?? 0,
        entries: entries.count ?? 0,
        exits: exits.count ?? 0,
      })
    }

    void load()
  }, [])

  return (
    <div>
      <PageHeader title="Dashboard" description="Resumen de asistencia del día" />

      {error && (
        <div role="alert" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No se pudieron cargar algunos indicadores: {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Empleados activos" value={stats?.employees ?? null} icon={Users} />
        <StatCard label="Oficinas activas" value={stats?.offices ?? null} icon={Building2} />
        <StatCard label="Entradas hoy" value={stats?.entries ?? null} icon={LogIn} />
        <StatCard label="Salidas hoy" value={stats?.exits ?? null} icon={LogOut} />
      </div>
    </div>
  )
}
