"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { 
  Radio, 
  Settings, 
  BarChart3, 
  Users,
  Tv
} from "lucide-react"
import { useWebSocket } from "./websocket-provider"

const navItems = [
  {
    href: "/streaming",
    label: "Dashboard",
    icon: Tv,
  },
  {
    href: "/streaming/destinations",
    label: "Destinations",
    icon: Radio,
  },
  {
    href: "/streaming/analytics",
    label: "Analytics",
    icon: BarChart3,
  },
  {
    href: "/streaming/team",
    label: "Team",
    icon: Users,
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { isConnected } = useWebSocket()

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-surface border-r border-border flex flex-col">
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 px-6 h-16 border-b border-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-[6px] bg-accent">
          <Radio className="w-4 h-4 text-accent-foreground" />
        </div>
        <span className="font-display text-xl text-text-primary tracking-wide">
          STREAM CTRL
        </span>
        {/* Connection indicator */}
        <div
          className={cn(
            "w-2 h-2 rounded-full ml-auto",
            isConnected ? "bg-emerald-500" : "bg-red-500"
          )}
          title={isConnected ? "Connected" : "Disconnected"}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent-muted text-accent"
                      : "text-text-secondary hover:text-text-primary hover:bg-elevated"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Settings link at bottom */}
      <div className="px-3 py-4 border-t border-border">
        <Link
          href="/streaming/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-elevated transition-colors"
        >
          <Settings className="w-4 h-4" />
          Settings
        </Link>
      </div>
    </aside>
  )
}
