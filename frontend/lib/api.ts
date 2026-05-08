const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

let _authToken: string | null = null

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    ...(extra ?? {}),
    ...(_authToken ? { Authorization: `Bearer ${_authToken}` } : {}),
  }
}

const jsonHeaders = () => authHeaders({ "Content-Type": "application/json" })

export interface ApiDestination {
  id: string
  name: string
  rtmp_url: string
  stream_key: string
  enabled: boolean
  platform_type?: string
  created_at?: string
  updated_at?: string
}

export interface DestinationPayload {
  name?: string
  rtmp_url?: string
  stream_key?: string
  enabled?: boolean
  platform_type?: string
}

export interface Destination {
  id: string
  platform: string
  rtmpUrl: string
  streamKey: string
  title: string
  enabled: boolean
  platformType?: string
}

export interface ApiStreamHistory {
  id: string
  started_at?: string | null
  duration_secs?: number | string | null
  status?: string | null
  peak_viewers?: number | null
  total_viewers?: number | null
}

export interface TeamInvitePayload {
  email: string
  role: string
}

export interface ApiTeamMember {
  id?: string
  email?: string | null
  user_id?: string | null
  role?: string | null
  created_at?: string | null
}

const parseJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  return response.json()
}

export const mapDestination = (d: ApiDestination): Destination => ({
  id: d.id,
  platform: d.name,
  rtmpUrl: d.rtmp_url,
  streamKey: d.stream_key,
  title: d.name,
  enabled: d.enabled,
  platformType: d.platform_type,
})

export const api = {
  setAuthToken(token: string | null) {
    _authToken = token
  },

  // Destinations
  getDestinations: () =>
    fetch(`${API_URL}/api/destinations`, { headers: authHeaders() }).then((response) =>
      parseJson<ApiDestination[]>(response)
    ),
  createDestination: (data: DestinationPayload) =>
    fetch(`${API_URL}/api/destinations`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then((response) => parseJson<ApiDestination>(response)),
  updateDestination: (id: string, data: DestinationPayload) =>
    fetch(`${API_URL}/api/destinations/${id}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then((response) => parseJson<ApiDestination>(response)),
  deleteDestination: (id: string) =>
    fetch(`${API_URL}/api/destinations/${id}`, { method: "DELETE", headers: authHeaders() }),

  // Stream control
  getStreamStatus: () =>
    fetch(`${API_URL}/api/stream/status`, { headers: authHeaders() }).then((response) =>
      parseJson<unknown>(response)
    ),
  startStream: () =>
    fetch(`${API_URL}/api/stream/start`, { method: "POST", headers: authHeaders() }).then((response) =>
      parseJson<unknown>(response)
    ),
  stopStream: () =>
    fetch(`${API_URL}/api/stream/stop`, { method: "POST", headers: authHeaders() }).then((response) =>
      parseJson<unknown>(response)
    ),

  // Analytics
  getAnalyticsLive: () =>
    fetch(`${API_URL}/api/analytics/live`, { headers: authHeaders() }).then((response) =>
      parseJson<unknown>(response)
    ),
  getAnalyticsHistory: () =>
    fetch(`${API_URL}/api/analytics/history`, { headers: authHeaders() }).then((response) =>
      parseJson<ApiStreamHistory[]>(response)
    ),

  // Team
  getTeam: () =>
    fetch(`${API_URL}/api/team`, { headers: authHeaders() }).then((response) =>
      parseJson<ApiTeamMember[]>(response)
    ),
  inviteTeamMember: (data: TeamInvitePayload) =>
    fetch(`${API_URL}/api/team/invite`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then((response) => parseJson<ApiTeamMember>(response)),
  updateTeamMemberRole: (id: string, role: string) =>
    fetch(`${API_URL}/api/team/${id}/role`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ role }),
    }).then((response) => parseJson<ApiTeamMember>(response)),
  deleteTeamMember: (id: string) =>
    fetch(`${API_URL}/api/team/${id}`, { method: "DELETE", headers: authHeaders() }),
}
