"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { api } from "@/lib/api"

interface User {
  id: string
  email: string
  name: string
  role: "admin" | "operator" | "viewer"
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

function sessionToUser(session: Session): User {
  const email = session.user.email ?? ""
  return {
    id: session.user.id,
    email,
    name: session.user.user_metadata?.name ?? email.split("@")[0],
    role: (session.user.user_metadata?.role as User["role"]) ?? "viewer",
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        api.setAuthToken(session.access_token)
        setUser(sessionToUser(session))
      }
      setIsLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        api.setAuthToken(session.access_token)
        setUser(sessionToUser(session))
      } else {
        api.setAuthToken(null)
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (isLoading) return
    const isLoginPage = pathname === "/login"
    const isProtectedRoute = pathname.startsWith("/streaming")
    if (!user && isProtectedRoute) {
      router.push("/login")
    } else if (user && isLoginPage) {
      router.push("/streaming")
    }
  }, [user, isLoading, pathname, router])

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setIsLoading(false)
    if (error || !data.session) return false
    api.setAuthToken(data.session.access_token)
    setUser(sessionToUser(data.session))
    return true
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    api.setAuthToken(null)
    setUser(null)
    router.push("/login")
  }, [router])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
