-- ===========================================================================
-- JNAS ARCHITECT WORKSPACE — SUPABASE POSTGRESQL SCHEMA
-- PRODUCTION READY, ZERO-LOGIN OFFLINE-FIRST SECURE REPLICATION
-- ===========================================================================

-- Enable extension for UUID generation if not already active
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- TRIGGER FUNCTION FOR UPDATING TIMESTAMPS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 1. WORKSPACES TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    recovery_key_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspaces_updated_at ON workspaces(updated_at);

CREATE TRIGGER trigger_update_workspaces_updated_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. USER PREFERENCES TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'light' NOT NULL,
    sidebar_state TEXT DEFAULT 'expanded' NOT NULL,
    custom_settings JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_workspace_preferences UNIQUE (workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_workspace ON user_preferences(workspace_id);

CREATE TRIGGER trigger_update_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. SETTINGS TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_workspace_setting_key UNIQUE (workspace_id, key)
);

CREATE INDEX IF NOT EXISTS idx_settings_workspace_key ON settings(workspace_id, key);

CREATE TRIGGER trigger_update_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. JOURNAL TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS journal (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1 NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_journal_workspace ON journal(workspace_id);
CREATE INDEX IF NOT EXISTS idx_journal_updated_at ON journal(updated_at);

CREATE TRIGGER trigger_update_journal_updated_at
    BEFORE UPDATE ON journal
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. WHITEBOARD TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whiteboard (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_whiteboard_workspace ON whiteboard(workspace_id);
CREATE INDEX IF NOT EXISTS idx_whiteboard_updated_at ON whiteboard(updated_at);

CREATE TRIGGER trigger_update_whiteboard_updated_at
    BEFORE UPDATE ON whiteboard
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 6. KANBAN BOARDS TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kanban_boards (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    version INTEGER DEFAULT 1 NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kanban_boards_workspace ON kanban_boards(workspace_id);

CREATE TRIGGER trigger_update_kanban_boards_updated_at
    BEFORE UPDATE ON kanban_boards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 7. KANBAN COLUMNS TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kanban_columns (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    board_id TEXT REFERENCES kanban_boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    order_num INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    version INTEGER DEFAULT 1 NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kanban_columns_workspace ON kanban_columns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_kanban_columns_board ON kanban_columns(board_id);

CREATE TRIGGER trigger_update_kanban_columns_updated_at
    BEFORE UPDATE ON kanban_columns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 8. KANBAN CARDS TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kanban_cards (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    column_id TEXT NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_kanban_cards_workspace ON kanban_cards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_column ON kanban_cards(column_id);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_updated_at ON kanban_cards(updated_at);

CREATE TRIGGER trigger_update_kanban_cards_updated_at
    BEFORE UPDATE ON kanban_cards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 9. RESOURCE LIBRARY TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT NOT NULL,
    notes TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    version INTEGER DEFAULT 1 NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resources_workspace ON resources(workspace_id);
CREATE INDEX IF NOT EXISTS idx_resources_updated_at ON resources(updated_at);

CREATE TRIGGER trigger_update_resources_updated_at
    BEFORE UPDATE ON resources
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 10. CODE SNIPPETS TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS snippets (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    code TEXT NOT NULL,
    language TEXT NOT NULL,
    notes TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    version INTEGER DEFAULT 1 NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snippets_workspace ON snippets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_snippets_updated_at ON snippets(updated_at);

CREATE TRIGGER trigger_update_snippets_updated_at
    BEFORE UPDATE ON snippets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 11. RECENT ACTIVITIES TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    action TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_workspace ON activities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp DESC);

-- ---------------------------------------------------------------------------
-- 12. SYNC QUEUE (OFFLINE FAILURES QUEUE)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    store_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_workspace ON sync_queue(workspace_id);

-- ---------------------------------------------------------------------------
-- 13. BACKUPS TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    db_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backups_workspace ON backups(workspace_id);

-- ---------------------------------------------------------------------------
-- 14. AUDIT LOGS TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON audit_logs(workspace_id);


-- ===========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- USING DYNAMIC HTTP HEADERS 'x-workspace-id' AND 'x-recovery-key'
-- ===========================================================================

-- 1. Enable Row Level Security on all tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE whiteboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. Create Helper Functions for parsing custom header credentials
-- These extract x-workspace-id and x-recovery-key headers sent with the queries.
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
    SELECT 1 FROM workspaces
    WHERE id = w_id
      AND recovery_key_hash = current_recovery_key_hash()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- 4. Define policies for workspaces
-- Anyone is allowed to INSERT a brand-new workspace to enable initial provisioning.
CREATE POLICY "Allow workspace insertion" ON workspaces
    FOR INSERT TO anon
    WITH CHECK (true);

-- Workspaces can only be viewed or modified if they are authorized
CREATE POLICY "Allow workspace access if authorized" ON workspaces
    FOR ALL TO anon
    USING (id = current_workspace_id() AND recovery_key_hash = current_recovery_key_hash());


-- 5. Define policies for all secondary tables
-- Standard Rule: Operational rows can be accessed/mutated only if they belong to the authorized workspace
CREATE POLICY "user_preferences_authorized_access" ON user_preferences
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "settings_authorized_access" ON settings
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "journal_authorized_access" ON journal
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "whiteboard_authorized_access" ON whiteboard
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "kanban_boards_authorized_access" ON kanban_boards
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "kanban_columns_authorized_access" ON kanban_columns
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "kanban_cards_authorized_access" ON kanban_cards
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "resources_authorized_access" ON resources
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "snippets_authorized_access" ON snippets
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "activities_authorized_access" ON activities
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "sync_queue_authorized_access" ON sync_queue
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "backups_authorized_access" ON backups
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));

CREATE POLICY "audit_logs_authorized_access" ON audit_logs
    FOR ALL TO anon
    USING (workspace_id = current_workspace_id() AND is_workspace_authorized(workspace_id));


-- ===========================================================================
-- REALTIME REPLICATION ENABLEMENT
-- Enlists tables into the 'supabase_realtime' publication for push-notifications
-- ===========================================================================
BEGIN;
  -- Remove existing publications if any to avoid collision
  DROP PUBLICATION IF EXISTS jnas_realtime_pub;
  
  -- Create publication for our synchronized tables
  CREATE PUBLICATION jnas_realtime_pub FOR TABLE 
    workspaces,
    user_preferences,
    settings,
    journal,
    whiteboard,
    kanban_boards,
    kanban_columns,
    kanban_cards,
    resources,
    snippets,
    activities;
COMMIT;
