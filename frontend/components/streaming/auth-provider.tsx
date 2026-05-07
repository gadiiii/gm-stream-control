"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  // Check for existing session on mount
  useEffect(() => {
    const storedUser = localStorage.getItem("stream-ctrl-user")
    if (storedUser) {
      setUser(JSON.parse(storedUser))
    }
    setIsLoading(false)
  }, [])

  // Redirect logic
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
    
    // Simulate API call - in production this would call Supabase Auth
    await new Promise((resolve) => setTimeout(resolve, 800))
    
    // Mock validation - accept any non-empty credentials for demo
    if (email && password) {
      const mockUser: User = {
        id: "1",
        email: email,
        name: email.split("@")[0],
        role: "admin",
      }
      setUser(mockUser)
      localStorage.setItem("stream-ctrl-user", JSON.stringify(mockUser))
      setIsLoading(false)
      return true
    }
    
    setIsLoading(false)
    return false
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    localStorage.removeItem("stream-ctrl-user")
    router.push("/login")
  }, [router])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
