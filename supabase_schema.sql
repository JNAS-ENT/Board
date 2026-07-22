-- ===========================================================================
-- JNAS ARCHITECT WORKSPACE — SUPABASE POSTGRESQL SCHEMA
-- PRODUCTION READY, ZERO-LOGIN OFFLINE-FIRST SECURE REPLICATION
-- ===========================================================================

-- Enable extension for UUID generation if not already active
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1. WORKSPACES TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jnas_workspaces (
    id TEXT PRIMARY KEY,
    recovery_key_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jnas_workspaces_updated_at ON jnas_workspaces(updated_at);

-- ---------------------------------------------------------------------------
-- 2. DIARY / JOURNAL TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jnas_diary (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES jnas_workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1 NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jnas_diary_workspace ON jnas_diary(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jnas_diary_updated_at ON jnas_diary(updated_at);

-- ---------------------------------------------------------------------------
-- 3. WHITEBOARD TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jnas_whiteboard (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES jnas_workspaces(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL,
    width DOUBLE PRECISION,
    height DOUBLE PRECISION,
    text TEXT NOT NULL,
    color TEXT,
    shape TEXT,
    from_id TEXT,
    to_id TEXT,
    group_id TEXT,
    rotation DOUBLE PRECISION DEFAULT 0,
    locked BOOLEAN DEFAULT false NOT NULL,
    border_width DOUBLE PRECISION,
    border_style TEXT,
    fill_color TEXT,
    gradient BOOLEAN DEFAULT false NOT NULL,
    gradient_color TEXT,
    shadow BOOLEAN DEFAULT false NOT NULL,
    opacity DOUBLE PRECISION,
    rounded_corners BOOLEAN DEFAULT false NOT NULL,
    image_url TEXT,
    icon_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    version INTEGER DEFAULT 1 NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jnas_whiteboard_workspace ON jnas_whiteboard(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jnas_whiteboard_updated_at ON jnas_whiteboard(updated_at);

-- ---------------------------------------------------------------------------
-- 4. KANBAN COLUMNS TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jnas_kanban_columns (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES jnas_workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    order_num INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    version INTEGER DEFAULT 1 NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jnas_kanban_columns_workspace ON jnas_kanban_columns(workspace_id);

-- ---------------------------------------------------------------------------
-- 5. KANBAN CARDS TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jnas_kanban_cards (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES jnas_workspaces(id) ON DELETE CASCADE,
    column_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    progress INTEGER DEFAULT 0 NOT NULL,
    deadline TEXT,
    labels JSONB DEFAULT '[]'::jsonb NOT NULL,
    attachments JSONB DEFAULT '[]'::jsonb NOT NULL,
    order_num INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    version INTEGER DEFAULT 1 NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jnas_kanban_cards_workspace ON jnas_kanban_cards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jnas_kanban_cards_column ON jnas_kanban_cards(column_id);
CREATE INDEX IF NOT EXISTS idx_jnas_kanban_cards_updated_at ON jnas_kanban_cards(updated_at);

-- ---------------------------------------------------------------------------
-- 6. RESOURCE LIBRARY TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jnas_resources (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES jnas_workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT NOT NULL,
    notes TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    version INTEGER DEFAULT 1 NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jnas_resources_workspace ON jnas_resources(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jnas_resources_updated_at ON jnas_resources(updated_at);

-- ---------------------------------------------------------------------------
-- 7. CODE SNIPPETS TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jnas_code_snippets (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES jnas_workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    code TEXT NOT NULL,
    language TEXT NOT NULL,
    notes TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    version INTEGER DEFAULT 1 NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jnas_code_snippets_workspace ON jnas_code_snippets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jnas_code_snippets_updated_at ON jnas_code_snippets(updated_at);

-- ---------------------------------------------------------------------------
-- 8. RECENT ACTIVITIES TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jnas_activities (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES jnas_workspaces(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    action TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jnas_activities_workspace ON jnas_activities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jnas_activities_timestamp ON jnas_activities(timestamp DESC);

-- ---------------------------------------------------------------------------
-- 9. SYNC QUEUE (OFFLINE FAILURES QUEUE)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jnas_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL,
    store_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jnas_sync_queue_workspace ON jnas_sync_queue(workspace_id);

-- ---------------------------------------------------------------------------
-- 10. BACKUPS TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jnas_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES jnas_workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    db_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jnas_backups_workspace ON jnas_backups(workspace_id);

-- ---------------------------------------------------------------------------
-- 11. AUDIT LOGS TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jnas_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES jnas_workspaces(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jnas_audit_log_workspace ON jnas_audit_log(workspace_id);


-- ===========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- USING DYNAMIC HTTP HEADERS 'x-workspace-id' AND 'x-recovery-key'
-- ===========================================================================

-- 1. Enable Row Level Security on all operational tables
ALTER TABLE jnas_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE jnas_diary ENABLE ROW LEVEL SECURITY;
ALTER TABLE jnas_whiteboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE jnas_kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE jnas_kanban_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE jnas_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE jnas_code_snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE jnas_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE jnas_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE jnas_audit_log ENABLE ROW LEVEL SECURITY;

-- 2. Create Helper Functions for parsing custom header credentials
-- These extract x-workspace-id and x-recovery-key headers sent with the query.
CREATE OR REPLACE FUNCTION current_workspace_id() 
RETURNS TEXT AS $$
BEGIN
  RETURN NULLIF(current_setting('request.headers', true)::json->>'x-workspace-id', '');
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_recovery_key_hash() 
RETURNS TEXT AS $$
BEGIN
  RETURN NULLIF(current_setting('request.headers', true)::json->>'x-recovery-key', '');
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- 3. Workspace authorization helper function
-- Validates if the request contains valid workspace ID and recovery key hash matches
CREATE OR REPLACE FUNCTION is_workspace_authorized(w_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM jnas_workspaces
    WHERE id = w_id
      AND recovery_key_hash = current_recovery_key_hash()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- 4. Define policies for jnas_workspaces
-- Anyone is allowed to INSERT a brand-new workspace to enable initial provisioning.
CREATE POLICY "Allow workspace insertion" ON jnas_workspaces
    FOR INSERT TO anon
    WITH CHECK (true);

-- Workspaces can only be viewed or modified if they are authorized
CREATE POLICY "Allow workspace access if authorized" ON jnas_workspaces
    FOR ALL TO anon
    USING (id = current_workspace_id() AND recovery_key_hash = current_recovery_key_hash());


-- 5. Define policies for all secondary tables
-- Standard Rule: Operational rows can be accessed/mutated only if they belong to the authorized workspace
CREATE POLICY "jnas_diary_authorized_access" ON jnas_diary
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "jnas_whiteboard_authorized_access" ON jnas_whiteboard
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "jnas_kanban_columns_authorized_access" ON jnas_kanban_columns
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "jnas_kanban_cards_authorized_access" ON jnas_kanban_cards
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "jnas_resources_authorized_access" ON jnas_resources
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "jnas_code_snippets_authorized_access" ON jnas_code_snippets
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "jnas_activities_authorized_access" ON jnas_activities
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "jnas_backups_authorized_access" ON jnas_backups
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "jnas_audit_log_authorized_access" ON jnas_audit_log
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));


-- ===========================================================================
-- REALTIME REPLICATION ENABLEMENT
-- Enlists tables into the 'supabase_realtime' publication for push-notifications
-- ===========================================================================
begin;
  -- Remove existing publications if any to avoid collision
  drop publication if exists jnas_realtime_pub;
  
  -- Create publication for our synchronized tables
  create publication jnas_realtime_pub for table 
    jnas_workspaces,
    jnas_diary,
    jnas_whiteboard,
    jnas_kanban_columns,
    jnas_kanban_cards,
    jnas_resources,
    jnas_code_snippets,
    jnas_activities;
commit;
