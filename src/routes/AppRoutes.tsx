import { Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { Layout } from '@/components/layout/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Employees from '@/pages/Employees'
import Offices from '@/pages/Offices'
import Departments from '@/pages/Departments'
import Commissions from '@/pages/Commissions'
import Companies from '@/pages/Companies'
import Transfers from '@/pages/Transfers'
import Vacations from '@/pages/Vacations'
import Attendance from '@/pages/Attendance'
import History from '@/pages/History'
import Profile from '@/pages/Profile'
import NotFound from '@/pages/NotFound'

export function AppRoutes({ session }: { session: Session | null }) {
  return (
    <Routes>
      <Route path="/login" element={<Login session={session} />} />
      <Route
        element={
          <ProtectedRoute session={session}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/asistencia" element={<Attendance />} />
        <Route path="/empleados" element={<Employees />} />
        <Route path="/oficinas" element={<Offices />} />
        <Route path="/departamentos" element={<Departments />} />
        <Route path="/comisiones" element={<Commissions />} />
        <Route path="/empresas" element={<Companies />} />
        <Route path="/traslados" element={<Transfers />} />
        <Route path="/vacaciones" element={<Vacations />} />
        <Route path="/historial" element={<History />} />
        <Route path="/perfil" element={<Profile />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
