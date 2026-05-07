"use client"

import { useState } from "react"
import { useAuth } from "@/components/streaming/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Radio, Loader2 } from "lucide-react"

export default function LoginPage() {
  const { login, isLoading } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!email || !password) {
      setError("Please enter both email and password")
      return
    }

    const success = await login(email, password)
    if (!success) {
      setError("Invalid credentials")
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-[8px] bg-accent">
            <Radio className="w-6 h-6 text-accent-foreground" />
          </div>
          <h1 className="font-display text-3xl text-text-primary tracking-wide">
            STREAM CTRL
          </h1>
          <p className="text-text-secondary text-sm">
            Sign in to access the control panel
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-[8px] bg-surface border border-border p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-text-secondary">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@church.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-elevated border-border text-text-primary placeholder:text-text-tertiary rounded-[6px]"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-text-secondary">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-elevated border-border text-text-primary placeholder:text-text-tertiary rounded-[6px]"
                disabled={isLoading}
              />
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#E8440A] hover:bg-[#E8440A]/90 text-white rounded-[6px] gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </div>

          <p className="text-center text-xs text-text-tertiary">
            Contact your administrator if you need access
          </p>
        </form>
      </div>
    </div>
  )
}
