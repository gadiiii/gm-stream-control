import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface StatCardProps {
  label: string
  value: string
  icon: LucideIcon
  className?: string
}

export function StatCard({ label, value, icon: Icon, className }: StatCardProps) {
  return (
    <div className={cn(
      "flex flex-col gap-2 p-4 rounded-[8px] bg-surface border border-border",
      className
    )}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">{label}</span>
        <Icon className="w-4 h-4 text-text-tertiary" />
      </div>
      <span className="font-display text-4xl text-text-primary tracking-wider">
        {value}
      </span>
    </div>
  )
}
