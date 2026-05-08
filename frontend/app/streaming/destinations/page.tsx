"use client"

import { useState, useCallback, useEffect } from "react"
import { Plus, Eye, EyeOff, Pencil, Trash2, Check, X } from "lucide-react"
import { toast } from "sonner"
import { api, mapDestination, type Destination } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

export default function DestinationsPage() {
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Destination | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newDestination, setNewDestination] = useState<Omit<Destination, "id">>({
    platform: "",
    rtmpUrl: "",
    streamKey: "",
    title: "",
    enabled: false,
  })

  // Fetch destinations on mount
  useEffect(() => {
    const fetchDestinations = async () => {
      try {
        const data = await api.getDestinations()
        setDestinations(data.map(mapDestination))
      } catch (error) {
        console.error("Failed to load destinations", error)
        toast.error("Failed to load destinations. Check your connection.")
        setDestinations([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchDestinations()
  }, [])

  const toggleKeyVisibility = useCallback((id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const toggleEnabled = useCallback(async (id: string) => {
    const destination = destinations.find((d) => d.id === id)
    if (!destination) return

    const newEnabled = !destination.enabled

    try {
      const data = await api.updateDestination(id, { enabled: newEnabled })
      const updatedDestination = mapDestination(data)
      setDestinations((prev) =>
        prev.map((d) => (d.id === id ? updatedDestination : d))
      )
      toast.success("Destination updated")
    } catch (error) {
      console.error("Failed to update destination", error)
      toast.error("Failed to update destination. Check your connection.")
    }
  }, [destinations])

  const startEditing = useCallback((destination: Destination) => {
    setEditingId(destination.id)
    setEditForm({ ...destination })
  }, [])

  const cancelEditing = useCallback(() => {
    setEditingId(null)
    setEditForm(null)
  }, [])

  const saveEditing = useCallback(async () => {
    if (!editForm) return

    try {
      const data = await api.updateDestination(editForm.id, {
        name: editForm.platform,
        rtmp_url: editForm.rtmpUrl,
        stream_key: editForm.streamKey,
        enabled: editForm.enabled,
      })
      const updatedDestination = mapDestination(data)
      setDestinations((prev) =>
        prev.map((d) => (d.id === editForm.id ? updatedDestination : d))
      )
      setEditingId(null)
      setEditForm(null)
      toast.success("Destination updated")
    } catch (error) {
      console.error("Failed to update destination", error)
      toast.error("Failed to update destination. Check your connection.")
    }
  }, [editForm])

  const deleteDestination = useCallback(async (id: string) => {
    try {
      const response = await api.deleteDestination(id)
      if (!response.ok) throw new Error("Failed to delete")
      setDestinations((prev) => prev.filter((d) => d.id !== id))
      toast.success("Destination deleted")
    } catch (error) {
      console.error("Failed to delete destination", error)
      toast.error("Failed to delete destination. Check your connection.")
    }
  }, [])

  const addDestination = useCallback(async () => {
    try {
      const data = await api.createDestination({
        name: newDestination.platform,
        rtmp_url: newDestination.rtmpUrl,
        stream_key: newDestination.streamKey,
        enabled: newDestination.enabled,
        platform_type: newDestination.platform.toLowerCase(),
      })

      setDestinations((prev) => [...prev, mapDestination(data)])
    } catch (error) {
      console.error("Failed to add destination", error)
      toast.error("Failed to add destination. Check your connection.")
      return
    }

    setNewDestination({
      platform: "",
      rtmpUrl: "",
      streamKey: "",
      title: "",
      enabled: false,
    })
    setIsAddDialogOpen(false)
    toast.success("Destination added")
  }, [newDestination])

  const maskKey = () => "••••••••••••••••"

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Destinations</h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage your streaming platforms and RTMP endpoints
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#E8440A] hover:bg-[#E8440A]/90 text-white rounded-[6px] gap-2">
              <Plus className="w-4 h-4" />
              Add Destination
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-surface border-border">
            <DialogHeader>
              <DialogTitle className="text-text-primary">Add New Destination</DialogTitle>
              <DialogDescription className="text-text-secondary">
                Add a new streaming platform to broadcast to
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm text-text-secondary">Platform Name</label>
                <Input
                  value={newDestination.platform}
                  onChange={(e) => setNewDestination({ ...newDestination, platform: e.target.value })}
                  placeholder="e.g., YouTube, Twitch"
                  className="bg-elevated border-border text-text-primary"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-text-secondary">RTMP URL</label>
                <Input
                  value={newDestination.rtmpUrl}
                  onChange={(e) => setNewDestination({ ...newDestination, rtmpUrl: e.target.value })}
                  placeholder="rtmp://..."
                  className="bg-elevated border-border text-text-primary font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-text-secondary">Stream Key</label>
                <Input
                  value={newDestination.streamKey}
                  onChange={(e) => setNewDestination({ ...newDestination, streamKey: e.target.value })}
                  placeholder="Your stream key"
                  type="password"
                  className="bg-elevated border-border text-text-primary font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-text-secondary">Title / Description</label>
                <Input
                  value={newDestination.title}
                  onChange={(e) => setNewDestination({ ...newDestination, title: e.target.value })}
                  placeholder="e.g., Sunday Service"
                  className="bg-elevated border-border text-text-primary"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                className="rounded-[6px] border-border text-text-secondary hover:bg-elevated"
              >
                Cancel
              </Button>
              <Button
                onClick={addDestination}
                disabled={!newDestination.platform || !newDestination.rtmpUrl || !newDestination.streamKey}
                className="bg-[#E8440A] hover:bg-[#E8440A]/90 text-white rounded-[6px]"
              >
                Add Destination
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="rounded-[8px] bg-surface border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-text-secondary font-medium">Platform</TableHead>
              <TableHead className="text-text-secondary font-medium">RTMP URL</TableHead>
              <TableHead className="text-text-secondary font-medium">Stream Key</TableHead>
              <TableHead className="text-text-secondary font-medium">Title</TableHead>
              <TableHead className="text-text-secondary font-medium text-center">Enabled</TableHead>
              <TableHead className="text-text-secondary font-medium text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Skeleton loading state
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell className="text-center"><Skeleton className="h-5 w-9 mx-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : (
              destinations.map((destination) => (
                <TableRow key={destination.id} className="border-border hover:bg-elevated/50">
                  {editingId === destination.id && editForm ? (
                    <>
                      <TableCell>
                        <Input
                          value={editForm.platform}
                          onChange={(e) => setEditForm({ ...editForm, platform: e.target.value })}
                          className="bg-elevated border-border text-text-primary h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={editForm.rtmpUrl}
                          onChange={(e) => setEditForm({ ...editForm, rtmpUrl: e.target.value })}
                          className="bg-elevated border-border text-text-primary font-mono text-xs h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={editForm.streamKey}
                          onChange={(e) => setEditForm({ ...editForm, streamKey: e.target.value })}
                          type="password"
                          className="bg-elevated border-border text-text-primary font-mono text-xs h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={editForm.title}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          className="bg-elevated border-border text-text-primary h-8"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={editForm.enabled}
                          onCheckedChange={(checked) => setEditForm({ ...editForm, enabled: checked })}
                          className="data-[state=checked]:bg-accent data-[state=unchecked]:bg-[#333333]"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={saveEditing}
                            className="h-8 w-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={cancelEditing}
                            className="h-8 w-8 text-text-tertiary hover:text-text-secondary hover:bg-elevated"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-text-primary font-medium">
                        {destination.platform}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-text-secondary max-w-[200px] truncate">
                        {destination.rtmpUrl}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-text-secondary">
                            {visibleKeys.has(destination.id)
                              ? destination.streamKey
                              : maskKey()}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleKeyVisibility(destination.id)}
                            className="h-6 w-6 text-text-tertiary hover:text-text-secondary hover:bg-elevated"
                          >
                            {visibleKeys.has(destination.id) ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-text-secondary">
                        {destination.title}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={destination.enabled}
                          onCheckedChange={() => toggleEnabled(destination.id)}
                          className="data-[state=checked]:bg-accent data-[state=unchecked]:bg-[#333333]"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditing(destination)}
                            className="h-8 w-8 text-text-tertiary hover:text-text-secondary hover:bg-elevated"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteDestination(destination.id)}
                            className="h-8 w-8 text-text-tertiary hover:text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Empty state */}
      {!isLoading && destinations.length === 0 && (
        <div className="rounded-[8px] bg-surface border border-border p-12 text-center">
          <p className="text-text-secondary mb-4">No destinations configured yet</p>
          <Button
            onClick={() => setIsAddDialogOpen(true)}
            className="bg-[#E8440A] hover:bg-[#E8440A]/90 text-white rounded-[6px] gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Your First Destination
          </Button>
        </div>
      )}
    </div>
  )
}
