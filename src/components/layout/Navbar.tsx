import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRightLeft,
  Building,
  Building2,
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Network,
  Plane,
  UserCircle,
  Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const navGroups = [
  {
    title: 'Principal',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/asistencia', label: 'Asistencia y reportes', icon: CalendarCheck },
      { to: '/historial', label: 'Historial y revisión', icon: History },
    ],
  },
  {
    title: 'Personal',
    items: [
      { to: '/empleados', label: 'Empleados', icon: Users },
      { to: '/traslados', label: 'Traslados', icon: ArrowRightLeft },
      { to: '/vacaciones', label: 'Vacaciones', icon: Plane },
      { to: '/comisiones', label: 'Comisiones', icon: ClipboardList },
    ],
  },
  {
    title: 'Organización',
    items: [
      { to: '/empresas', label: 'Empresas', icon: Building },
      { to: '/oficinas', label: 'Oficinas', icon: Building2 },
      { to: '/departamentos', label: 'Departamentos', icon: Network },
    ],
  },
]

const allItems = navGroups.flatMap((group) => group.items)
const accountItem = { to: '/perfil', label: 'Mi perfil', icon: UserCircle }

export function Navbar() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const current = allItems.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
  )
  const currentLabel = current?.label ?? 'Menú'

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const handleLogout = async () => {
    setOpen(false)
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            AC
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-slate-900">Asistencia Corp</p>
            <p className="truncate text-xs text-slate-500">{currentLabel}</p>
          </div>
        </div>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition',
              open
                ? 'border-brand-200 bg-brand-50 text-brand-700'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
            )}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span>Menú</span>
            <ChevronDown className={cn('h-4 w-4 transition', open && 'rotate-180')} />
          </button>

          {open && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,680px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            >
              <div className="grid gap-4 p-4 sm:grid-cols-3">
                {navGroups.map((group) => (
                  <div key={group.title}>
                    <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {group.title}
                    </p>
                    <div className="space-y-1">
                      {group.items.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.to === '/'}
                          role="menuitem"
                          onClick={() => setOpen(false)}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition',
                              isActive
                                ? 'bg-brand-50 text-brand-700'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                            )
                          }
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          {item.label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <NavLink
                  to={accountItem.to}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition',
                      isActive
                        ? 'bg-white text-brand-700 shadow-sm'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900',
                    )
                  }
                >
                  <accountItem.icon className="h-4 w-4" />
                  {accountItem.label}
                </NavLink>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-red-600"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
