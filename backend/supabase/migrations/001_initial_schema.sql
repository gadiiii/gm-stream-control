-- GM Stream Control Panel — Initial Schema
-- Apply via: supabase db push  OR  paste into Supabase Studio SQL editor

-- ─── streams ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS streams (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at      timestamptz NOT NULL,
    ended_at        timestamptz,
    duration_secs   integer,
    status          text CHECK (status IN ('live', 'ended', 'error')),
    title           text,
    peak_viewers    integer DEFAULT 0,
    total_viewers   integer DEFAULT 0,
    created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      timestamptz DEFAULT now()
);

-- ─── destinations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS destinations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    rtmp_url        text NOT NULL,
    stream_key      text NOT NULL,
    enabled         boolean DEFAULT true,
    platform_type   text CHECK (platform_type IN ('youtube', 'facebook', 'instagram', 'owncast', 'custom')),
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

-- Auto-update updated_at on destinations
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER destinations_updated_at
    BEFORE UPDATE ON destinations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── stream_destinations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stream_destinations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id       uuid REFERENCES streams(id) ON DELETE CASCADE,
    destination_id  uuid REFERENCES destinations(id) ON DELETE SET NULL,
    status          text CHECK (status IN ('connected', 'error', 'disabled', 'stopped')),
    peak_viewers    integer DEFAULT 0,
    error_message   text
);

-- ─── stream_analytics ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stream_analytics (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id       uuid REFERENCES streams(id) ON DELETE CASCADE,
    destination_id  uuid REFERENCES destinations(id) ON DELETE SET NULL,
    recorded_at     timestamptz DEFAULT now(),
    viewer_count    integer DEFAULT 0,
    bitrate_kbps    integer
);

-- ─── team_members ──────────────────────────────────────────────────────────
-- user_id is text (not uuid FK) to support both UUID auth users and email-only invites
CREATE TABLE IF NOT EXISTS team_members (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         text NOT NULL,
    role            text CHECK (role IN ('admin', 'operator', 'viewer')) DEFAULT 'viewer',
    invited_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      timestamptz DEFAULT now()
);

-- ─── RLS (Row Level Security) ───────────────────────────────────────────────
-- Enable RLS on all tables — backend uses service key so it bypasses RLS.
-- These policies protect direct client access if you ever enable it.
ALTER TABLE streams           ENABLE ROW LEVEL SECURITY;
ALTER TABLE destinations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_analytics  ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members      ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically (used by FastAPI backend).
-- Add user-facing policies here if you enable direct Supabase client access from frontend.
