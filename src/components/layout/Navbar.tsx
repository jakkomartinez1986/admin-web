import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { ArrowRightLeft, Building, Building2, CalendarCheck, ClipboardList, History, LayoutDashboard, LogOut, Menu, UserCircle, Users, X, Network, Plane } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/asistencia', label: 'Asistencia', icon: CalendarCheck },
  { to: '/empleados', label: 'Empleados', icon: Users },
  { to: '/empresas', label: 'Empresas', icon: Building },
  { to: '/traslados', label: 'Traslados', icon: ArrowRightLeft },
  { to: '/oficinas', label: 'Oficinas', icon: Building2 },
  { to: '/departamentos', label: 'Departamentos', icon: Network },
  { to: '/comisiones', label: 'Comisiones', icon: ClipboardList },
  { to: '/vacaciones', label: 'Vacaciones', icon: Plane },
  { to: '/historial', label: 'Historial', icon: History },
  { to: '/perfil', label: 'Perfil', icon: UserCircle },
]

export function Navbar() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            AC
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">Asistencia Corp</p>
            <p className="hidden text-xs text-slate-500 sm:block">Panel de administración</p>
          </div>
        </div>

        <nav className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button type="button" onClick={handleLogout} className="btn-secondary hidden sm:inline-flex">
            <LogOut className="h-4 w-4" />
            Salir
          </button>
          <button
            type="button"
            className="btn-secondary lg:hidden"
            aria-label="Abrir menú"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-slate-200 bg-white px-4 py-3 lg:hidden">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100',
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
            <button type="button" onClick={handleLogout} className="btn-secondary mt-2 w-full justify-start">
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </nav>
      )}
    </header>
  )
}
