"use client"

import { useState } from "react"
import { Play, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const CHECKLIST = [
  "Audio levels checked and peaking correctly",
  "Cameras framed and in focus",
  "OBS scene collection loaded",
  "Lower thirds and graphics ready",
]

interface GoLiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (title: string) => void
  enabledDestinations: string[]
  isLoading?: boolean
}

export function GoLiveDialog({
  open,
  onOpenChange,
  onConfirm,
  enabledDestinations,
  isLoading,
}: GoLiveDialogProps) {
  const [title, setTitle] = useState("")
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const toggle = (index: number) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const allChecked = checked.size === CHECKLIST.length
  const hasDestinations = enabledDestinations.length > 0

  const handleConfirm = () => {
    onConfirm(title.trim())
    setTitle("")
    setChecked(new Set())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Go live</DialogTitle>
          <DialogDescription className="text-text-secondary">
            Confirm your setup before starting the broadcast.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <label className="text-sm text-text-secondary">Stream title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Sunday Morning Service"
              className="bg-elevated border-border text-text-primary"
            />
          </div>

          <div className="space-y-2">
            <span className="text-sm text-text-secondary">Broadcasting to</span>
            {hasDestinations ? (
              <div className="flex flex-wrap gap-2">
                {enabledDestinations.map((name) => (
                  <span
                    key={name}
                    className="px-2.5 py-1 rounded-full text-xs font-medium bg-elevated border border-border text-text-primary capitalize"
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-[6px] border border-amber-500/30 bg-amber-500/10 p-3">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200">
                  No destinations are enabled. The stream will run but won&apos;t reach any platform.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <span className="text-sm text-text-secondary">Pre-stream checklist</span>
            <div className="space-y-2.5">
              {CHECKLIST.map((item, index) => (
                <label
                  key={item}
                  className="flex items-start gap-3 cursor-pointer group"
                >
                  <Checkbox
                    checked={checked.has(index)}
                    onCheckedChange={() => toggle(index)}
                    className="mt-0.5 border-border data-[state=checked]:bg-[#E8440A] data-[state=checked]:border-[#E8440A]"
                  />
                  <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
                    {item}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-[6px] border-border text-text-secondary hover:bg-elevated"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!allChecked || isLoading}
            className="bg-[#E8440A] hover:bg-[#E8440A]/90 text-white rounded-[6px] gap-2"
          >
            <Play className="w-4 h-4" />
            {allChecked ? "Start Stream" : `Check all ${CHECKLIST.length} items`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
