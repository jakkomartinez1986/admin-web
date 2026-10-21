import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

interface Props {
  session: Session | null
  children: ReactNode
}

export function ProtectedRoute({ session, children }: Props) {
  const location = useLocation()

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <>{children}</>
}
