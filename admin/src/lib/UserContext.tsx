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

/**
 * El valor por defecto es el de **un usuario sin permisos**.
 *
 * Sólo se usa si alguien llama a `useUser()` fuera del `UserProvider`, que es un
 * error de programación. Antes ese default era `rol: 'admin'` con
 * `hasPermiso: () => true`: un componente mal ubicado mostraba todo en vez de no
 * mostrar nada, que es exactamente al revés de lo que conviene.
 */
const UserContext = createContext<UserContextType>({
  profile:    { id: '', email: '', nombre: null, rol: 'usuario', permisos: [] },
  hasPermiso: () => false,
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
