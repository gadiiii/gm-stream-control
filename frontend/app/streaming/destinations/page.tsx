"use client"

import { useState, useCallback, useEffect } from "react"
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  PlugZap,
  Loader2,
  CircleCheck,
  CircleAlert,
} from "lucide-react"
import { toast } from "sonner"
import {
  api,
  mapDestination,
  type Destination,
  type DestinationTestResult,
  type NginxResult,
} from "@/lib/api"
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Destination | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, DestinationTestResult>>({})
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set())
  const [newDestination, setNewDestination] = useState<Omit<Destination, "id">>({
    platform: "",
    rtmpUrl: "",
    streamKey: "",
    hasStreamKey: false,
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
        toast.error(`Failed to load destinations: ${error instanceof Error ? error.message : "Check your connection."}`)
        setDestinations([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchDestinations()
  }, [])

  /** The backend regenerates nginx.conf after every change, but holds the
   * reload while a stream is publishing — reloading would drop it. Say so,
   * otherwise the change looks applied when it is only queued. */
  const reportNginxOutcome = useCallback((result: NginxResult | undefined) => {
    if (!result) return
    if (result.deferred) {
      toast.info("Saved. This takes effect when the current stream ends — reloading now would drop it.")
      return
    }
    if (result.skipped_destinations?.length) {
      toast.warning(
        `Not streaming to ${result.skipped_destinations.join(", ")} — stream key could not be read. Re-enter it.`
      )
      return
    }
    if (result.ok === false && result.error) {
      toast.warning(`Saved, but nginx did not reload: ${result.error}`)
    }
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
      reportNginxOutcome(data.nginx)
    } catch (error) {
      console.error("Failed to update destination", error)
      toast.error(`Failed to update destination: ${error instanceof Error ? error.message : "Check your connection."}`)
    }
  }, [destinations, reportNginxOutcome])

  const startEditing = useCallback((destination: Destination) => {
    setEditingId(destination.id)
    // streamKey from the API is ciphertext, never the plaintext key. Start blank
    // rather than round-tripping it — saving it back would double-encrypt it.
    setEditForm({ ...destination, streamKey: "" })
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
        // Omit when blank so the backend leaves the stored key untouched —
        // the field starts empty on every edit since it never holds the
        // real plaintext key (see startEditing).
        ...(editForm.streamKey ? { stream_key: editForm.streamKey } : {}),
        enabled: editForm.enabled,
      })
      const updatedDestination = mapDestination(data)
      setDestinations((prev) =>
        prev.map((d) => (d.id === editForm.id ? updatedDestination : d))
      )
      setEditingId(null)
      setEditForm(null)
      toast.success("Destination updated")
      reportNginxOutcome(data.nginx)
    } catch (error) {
      console.error("Failed to update destination", error)
      toast.error(`Failed to update destination: ${error instanceof Error ? error.message : "Check your connection."}`)
    }
  }, [editForm, reportNginxOutcome])

  const deleteDestination = useCallback(async (id: string) => {
    try {
      const response = await api.deleteDestination(id)
      if (!response.ok) throw new Error("Failed to delete")
      setDestinations((prev) => prev.filter((d) => d.id !== id))
      toast.success("Destination deleted")
    } catch (error) {
      console.error("Failed to delete destination", error)
      toast.error(`Failed to delete destination: ${error instanceof Error ? error.message : "Check your connection."}`)
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
      toast.error(`Failed to add destination: ${error instanceof Error ? error.message : "Check your connection."}`)
      return
    }

    setNewDestination({
      platform: "",
      rtmpUrl: "",
      streamKey: "",
      hasStreamKey: false,
      enabled: false,
    })
    setIsAddDialogOpen(false)
    toast.success("Destination added")
  }, [newDestination])

  const testDestination = useCallback(async (id: string) => {
    setTestingIds((prev) => new Set(prev).add(id))
    try {
      const result = await api.testDestination(id)
      setTestResults((prev) => ({ ...prev, [id]: result }))
      if (result.ok && result.key_status === "ok") {
        toast.success(`${result.name}: the platform accepted this stream key`)
      } else if (result.ok) {
        toast.warning(
          `${result.name} is reachable, but the key could not be confirmed. ${result.warning ?? ""}`.trim()
        )
      } else {
        toast.error(result.key_detail ?? result.error ?? "Destination unreachable")
      }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : "Check your connection."
      setTestResults((prev) => ({ ...prev, [id]: { ok: false, error: message } }))
      toast.error(`Test failed: ${message}`)
      return null
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [])

  const testAll = useCallback(async () => {
    if (destinations.length === 0) return
    const results = await Promise.all(destinations.map((d) => testDestination(d.id)))
    const failed = results.filter((r) => r && !r.ok)

    if (failed.length === 0) {
      const confirmed = results.filter((r) => r?.key_status === "ok").length
      toast.success(
        confirmed === destinations.length
          ? `All ${destinations.length} destinations accepted their stream key`
          : `All ${destinations.length} destinations reachable (${confirmed} key(s) confirmed)`
      )
      return
    }

    // Say which failure it is. "Unreachable" for a rejected key sends you
    // hunting the network when the problem is the key or the URL.
    const rejected = failed.filter((r) => r?.key_status === "rejected").length
    const unreadable = failed.filter((r) => r?.key_status === "unreadable").length
    const unreachable = failed.length - rejected - unreadable
    const parts = [
      rejected && `${rejected} rejected the stream key`,
      unreadable && `${unreadable} has an unreadable stored key`,
      unreachable && `${unreachable} unreachable`,
    ].filter(Boolean)

    toast.error(`${failed.length} of ${destinations.length} failed — ${parts.join(", ")}`)
  }, [destinations, testDestination])

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
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={testAll}
            disabled={destinations.length === 0 || testingIds.size > 0}
            className="rounded-[6px] border-border text-text-secondary hover:bg-elevated gap-2"
          >
            {testingIds.size > 0 ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PlugZap className="w-4 h-4" />
            )}
            Test All
          </Button>
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
      </div>

      {/* Table */}
      <div className="rounded-[8px] bg-surface border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-text-secondary font-medium">Platform</TableHead>
              <TableHead className="text-text-secondary font-medium">RTMP URL</TableHead>
              <TableHead className="text-text-secondary font-medium">Stream Key</TableHead>
              <TableHead className="text-text-secondary font-medium">Pre-flight</TableHead>
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
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
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
                          placeholder="Leave blank to keep current key"
                          className="bg-elevated border-border text-text-primary font-mono text-xs h-8"
                        />
                      </TableCell>
                      <TableCell className="text-text-tertiary text-xs">—</TableCell>
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
                        <span className="font-mono text-xs text-text-secondary">
                          {destination.hasStreamKey ? maskKey() : "not set"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {testingIds.has(destination.id) ? (
                          <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Testing…
                          </span>
                        ) : testResults[destination.id] ? (
                          testResults[destination.id].ok ? (
                            <span
                              title={testResults[destination.id].key_detail}
                              className="flex items-center gap-1.5 text-xs text-emerald-400"
                            >
                              <CircleCheck className="w-3.5 h-3.5 shrink-0" />
                              {testResults[destination.id].key_status === "ok"
                                ? `Key accepted · ${testResults[destination.id].latency_ms}ms`
                                : `Reachable · ${testResults[destination.id].latency_ms}ms`}
                            </span>
                          ) : (
                            <span
                              title={
                                testResults[destination.id].key_detail ||
                                testResults[destination.id].error
                              }
                              className="flex items-center gap-1.5 text-xs text-red-400"
                            >
                              <CircleAlert className="w-3.5 h-3.5 shrink-0" />
                              {testResults[destination.id].key_status === "rejected"
                                ? "Key rejected"
                                : testResults[destination.id].key_status === "unreadable"
                                  ? "Key unreadable"
                                  : "Unreachable"}
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-text-tertiary">Not tested</span>
                        )}
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
                            onClick={() => testDestination(destination.id)}
                            disabled={testingIds.has(destination.id)}
                            title="Pre-flight check — confirms the platform accepts this stream key"
                            className="h-8 w-8 text-text-tertiary hover:text-text-secondary hover:bg-elevated"
                          >
                            <PlugZap className="w-4 h-4" />
                          </Button>
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
