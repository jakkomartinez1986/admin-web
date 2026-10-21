import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'

interface ProfileRow {
  first_name: string | null
  last_name: string | null
  role: string | null
}

export default function Profile() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      const currentUser = data.user
      setUser(currentUser)

      if (currentUser) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name, role')
          .eq('id', currentUser.id)
          .maybeSingle()
        setProfile(profileData as ProfileRow | null)
      }
    })
  }, [])

  return (
    <div>
      <PageHeader title="Mi perfil" description="Datos de la cuenta actual" />

      <div className="card max-w-lg space-y-4">
        <div>
          <p className="label">Correo electrónico</p>
          <p className="text-sm text-slate-700">{user?.email ?? '—'}</p>
        </div>
        <div>
          <p className="label">Nombre</p>
          <p className="text-sm text-slate-700">
            {profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || '—' : '—'}
          </p>
        </div>
        <div>
          <p className="label">Rol</p>
          <p className="text-sm text-slate-700">{profile?.role ?? '—'}</p>
        </div>
        <div>
          <p className="label">Último inicio de sesión</p>
          <p className="text-sm text-slate-700">{user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('es-EC') : '—'}</p>
        </div>
      </div>
    </div>
  )
}
