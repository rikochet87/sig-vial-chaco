'use client'
import { createContext, useContext, ReactNode } from 'react'

export type UserProfile = {
  id:       string
  email:    string
  nombre:   string | null
  rol:      'admin' | 'tecnico' | 'usuario' | 'panel'
  permisos: string[]
}

type UserContextType = {
  profile:     UserProfile
  hasPermiso:  (key: string) => boolean
}

const UserContext = createContext<UserContextType>({
  profile:    { id: '', email: '', nombre: null, rol: 'admin', permisos: [] },
  hasPermiso: () => true,
})

export function UserProvider({
  initialProfile,
  children,
}: {
  initialProfile: UserProfile
  children: ReactNode
}) {
  const hasPermiso = (key: string) => {
    if (initialProfile.rol === 'admin') return true
    return initialProfile.permisos.includes(key)
  }

  return (
    <UserContext.Provider value={{ profile: initialProfile, hasPermiso }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => useContext(UserContext)
