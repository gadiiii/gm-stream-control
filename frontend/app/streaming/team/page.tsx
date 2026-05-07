"use client"

import { useState, useCallback, useEffect } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { UserPlus, MoreHorizontal, Trash2, Shield, Eye, Settings } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Role = "admin" | "operator" | "viewer"

interface TeamMember {
  id: string
  email: string
  name: string
  role: Role
  joinedAt: string
  lastActive: string
}

const toRole = (role: string): Role => {
  if (role === "admin" || role === "operator" || role === "viewer") {
    return role
  }

  return "viewer"
}

const mapTeamMember = (member: any): TeamMember => ({
  id: member.id,
  email: member.email ?? member.user_id ?? "",
  name: member.email?.split("@")[0] ?? member.user_id ?? "Team member",
  role: toRole(member.role),
  joinedAt: member.created_at ? member.created_at.split("T")[0] : "",
  lastActive: member.created_at ?? new Date().toISOString(),
})

const roleConfig: Record<Role, { label: string; color: string; icon: React.ElementType }> = {
  admin: {
    label: "Admin",
    color: "bg-[#E8440A]/20 text-[#E8440A] border-[#E8440A]/30",
    icon: Shield,
  },
  operator: {
    label: "Operator",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: Settings,
  },
  viewer: {
    label: "Viewer",
    color: "bg-[#2A2A2A] text-[#888888] border-transparent",
    icon: Eye,
  },
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([])

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<Role>("viewer")
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isInviting, setIsInviting] = useState(false)

  useEffect(() => {
    const loadTeam = async () => {
      try {
        const data = await api.getTeam()
        setMembers(data.map(mapTeamMember))
      } catch (error) {
        console.error("Failed to load team", error)
        toast.error("Failed to load team. Check your connection.")
        setMembers([])
      } finally {
        setIsLoading(false)
      }
    }

    loadTeam()
  }, [])

  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim()) return

    setIsInviting(true)
    try {
      const data = await api.inviteTeamMember({ email: inviteEmail, role: inviteRole })
      setMembers((prev) => [...prev, mapTeamMember(data)])
      setInviteEmail("")
      setInviteRole("viewer")
      setIsInviteDialogOpen(false)
      toast.success("Team member invited")
    } catch (error) {
      console.error("Failed to invite team member", error)
      toast.error("Failed to invite team member. Check your connection.")
    } finally {
      setIsInviting(false)
    }
  }, [inviteEmail, inviteRole])

  const handleRoleChange = useCallback(async (memberId: string, newRole: Role) => {
    try {
      const data = await api.updateTeamMemberRole(memberId, newRole)
      const updatedMember = mapTeamMember(data)
      setMembers((prev) =>
        prev.map((member) =>
          member.id === memberId ? updatedMember : member
        )
      )
      toast.success("Team member updated")
    } catch (error) {
      console.error("Failed to update team member", error)
      toast.error("Failed to update team member. Check your connection.")
    }
  }, [])

  const handleRemoveMember = useCallback(async (memberId: string) => {
    try {
      const response = await api.deleteTeamMember(memberId)
      if (!response.ok) throw new Error("Failed to remove member")
      setMembers((prev) => prev.filter((member) => member.id !== memberId))
      toast.success("Team member removed")
    } catch (error) {
      console.error("Failed to remove team member", error)
      toast.error("Failed to remove team member. Check your connection.")
    }
  }, [])

  const formatLastActive = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffHours < 1) return "Just now"
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Team</h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage team members and permissions
          </p>
        </div>

        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#E8440A] hover:bg-[#E8440A]/90 text-white rounded-[6px] gap-2">
              <UserPlus className="w-4 h-4" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-elevated border-border">
            <DialogHeader>
              <DialogTitle className="text-text-primary">
                Invite Team Member
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm text-text-secondary">
                  Email Address
                </label>
                <Input
                  type="email"
                  placeholder="member@church.org"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="bg-surface border-border text-text-primary placeholder:text-text-tertiary rounded-[6px]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-text-secondary">Role</label>
                <Select
                  value={inviteRole}
                  onValueChange={(value: Role) => setInviteRole(value)}
                >
                  <SelectTrigger className="bg-surface border-border text-text-primary rounded-[6px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-elevated border-border">
                    <SelectItem value="admin" className="text-text-primary">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-[#E8440A]" />
                        Admin — Full access
                      </div>
                    </SelectItem>
                    <SelectItem value="operator" className="text-text-primary">
                      <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-blue-400" />
                        Operator — Start/stop streams
                      </div>
                    </SelectItem>
                    <SelectItem value="viewer" className="text-text-primary">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-[#888888]" />
                        Viewer — View only
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setIsInviteDialogOpen(false)}
                  className="flex-1 border-border text-text-secondary hover:text-text-primary hover:bg-surface rounded-[6px]"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleInvite}
                  disabled={!inviteEmail.trim() || isInviting}
                  className="flex-1 bg-[#E8440A] hover:bg-[#E8440A]/90 text-white rounded-[6px]"
                >
                  {isInviting ? "Sending..." : "Send Invite"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Role Legend */}
      <div className="flex items-center gap-4">
        {Object.entries(roleConfig).map(([role, config]) => {
          const Icon = config.icon
          return (
            <div key={role} className="flex items-center gap-2 text-sm text-text-secondary">
              <Icon className="w-4 h-4" />
              <span>{config.label}</span>
            </div>
          )
        })}
      </div>

      {/* Team Members Table */}
      <div className="rounded-[8px] bg-surface border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-text-secondary font-medium">
                Member
              </TableHead>
              <TableHead className="text-text-secondary font-medium">
                Role
              </TableHead>
              <TableHead className="text-text-secondary font-medium">
                Joined
              </TableHead>
              <TableHead className="text-text-secondary font-medium">
                Last Active
              </TableHead>
              <TableHead className="text-text-secondary font-medium w-[50px]">
                
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={index} className="border-border">
                  <TableCell>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-44" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-8 w-[130px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : members.map((member) => {
              const config = roleConfig[member.role]
              return (
                <TableRow
                  key={member.id}
                  className="border-border hover:bg-elevated/50"
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-text-primary font-medium">
                        {member.name}
                      </span>
                      <span className="text-sm font-mono text-text-tertiary">
                        {member.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={member.role}
                      onValueChange={(value: Role) =>
                        handleRoleChange(member.id, value)
                      }
                    >
                      <SelectTrigger
                        className={`w-[130px] border rounded-[6px] ${config.color}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-elevated border-border">
                        <SelectItem value="admin" className="text-text-primary">
                          Admin
                        </SelectItem>
                        <SelectItem value="operator" className="text-text-primary">
                          Operator
                        </SelectItem>
                        <SelectItem value="viewer" className="text-text-primary">
                          Viewer
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm text-text-secondary">
                      {member.joinedAt}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-text-secondary">
                      {formatLastActive(member.lastActive)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-text-tertiary hover:text-text-primary hover:bg-elevated"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-elevated border-border"
                      >
                        <DropdownMenuItem
                          onClick={() => handleRemoveMember(member.id)}
                          className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove Member
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Empty State */}
      {!isLoading && members.length === 0 && (
        <div className="text-center py-12">
          <p className="text-text-secondary">No team members yet</p>
          <p className="text-sm text-text-tertiary mt-1">
            Invite your first team member to get started
          </p>
        </div>
      )}
    </div>
  )
}
