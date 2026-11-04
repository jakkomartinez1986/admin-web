
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
  Settings2,
  ShieldAlert,
  Smartphone,
  UserCircle,
  UserCog,
  Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const navGroups = [
  {
    title: 'Organización',
    icon: Building2,
    items: [
      { to: '/empresas', label: 'Empresas', icon: Building },
      { to: '/oficinas', label: 'Oficinas', icon: Building2 },
      { to: '/departamentos', label: 'Departamentos', icon: Network },
    ],
  },
  {
    title: 'Personal',
    icon: Users,
    items: [
      { to: '/empleados', label: 'Empleados', icon: Users },
      { to: '/usuarios', label: 'Usuarios y roles', icon: UserCog },
      { to: '/traslados', label: 'Traslados', icon: ArrowRightLeft },
      { to: '/vacaciones', label: 'Vacaciones', icon: Plane },
      { to: '/comisiones', label: 'Comisiones', icon: ClipboardList },
    ],
  },
  {
    title: 'Sistema',
    icon: Settings2,
    items: [
      { to: '/asistencia', label: 'Asistencia y reportes', icon: CalendarCheck },
      { to: '/historial', label: 'Historial y revisión', icon: History },
      { to: '/dispositivos', label: 'Equipos y dispositivos', icon: Smartphone },
      { to: '/seguridad', label: 'Seguridad de asistencia', icon: ShieldAlert },
    ],
  },
]

const directItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/perfil', label: 'Mi perfil', icon: UserCircle },
]

export function Navbar() {
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const currentItem = [
    ...directItems,
    ...navGroups.flatMap((group) => group.items),
  ].find((item) =>
    item.to === '/'
      ? location.pathname === '/'
      : location.pathname === item.to ||
        location.pathname.startsWith(`${item.to}/`),
  )

  const currentLabel = currentItem?.label ?? 'Menú'

  useEffect(() => {
    setOpenGroup(null)
  }, [location.pathname])

  useEffect(() => {
    if (!openGroup) return

    const handleClick = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setOpenGroup(null)
      }
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenGroup(null)
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)

    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [openGroup])

  const handleLogout = async () => {
    setOpenGroup(null)

    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Error al cerrar sesión:', error.message)
      return
    }

    navigate('/login', { replace: true })
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
      isActive
        ? 'bg-brand-50 text-brand-700'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    )

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
        {/* Marca y página actual */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            AC
          </span>

          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-slate-900">
              Asistencia Corp
            </p>
            <p className="truncate text-xs text-slate-500">
              {currentLabel}
            </p>
          </div>
        </div>

        {/* Navegación */}
        <nav
          ref={menuRef}
          aria-label="Navegación principal"
          className="flex items-center gap-1"
        >
          {/* Dashboard directo */}
          <NavLink
            to="/"
            end
            className={linkClass}
            aria-label="Dashboard"
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Dashboard</span>
          </NavLink>

          {/* Dropdowns por categoría */}
          {navGroups.map((group) => {
            const GroupIcon = group.icon
            const isOpen = openGroup === group.title

            const isGroupActive = group.items.some(
              (item) =>
                location.pathname === item.to ||
                location.pathname.startsWith(`${item.to}/`),
            )

            return (
              <div key={group.title} className="relative">
                <button
                  type="button"
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                    isOpen || isGroupActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )}
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpenGroup(isOpen ? null : group.title)
                  }
                >
                  <GroupIcon className="h-4 w-4 shrink-0" />
                  <span>{group.title}</span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                </button>

                {isOpen && (
                  <div
                    role="menu"
                    aria-label={group.title}
                    className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
                  >
                    <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {group.title}
                    </p>

                    <div className="space-y-1">
                      {group.items.map((item) => {
                        const ItemIcon = item.icon

                        return (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            role="menuitem"
                            className={linkClass}
                            onClick={() => setOpenGroup(null)}
                          >
                            <ItemIcon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                          </NavLink>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Perfil */}
          <NavLink
            to="/perfil"
            className={linkClass}
            aria-label="Mi perfil"
          >
            <UserCircle className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Mi perfil</span>
          </NavLink>

          {/* Cerrar sesión */}
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="hidden xl:inline">Salir</span>
          </button>
        </nav>
      </div>
    </header>
  )
}
