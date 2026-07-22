import { db } from './db';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { hashPassword } from './cryptoUtils';

export interface SyncState {
  workspaceId: string;
  recoveryKey: string;
  lastSyncedAt: string | null;
  lastModifiedAt: string;
  status: 'idle' | 'syncing' | 'error' | 'offline';
  error: string | null;
}

class SyncManager {
  private workspaceId: string = '';
  private recoveryKey: string = '';
  private recoveryKeyHash: string = '';
  private lastSyncedAt: string | null = null;
  private lastModifiedAt: string = '';
  private status: 'idle' | 'syncing' | 'error' | 'offline' = 'idle';
  private error: string | null = null;
  private autoSyncTimeout: any = null;
  private listeners: Set<(state: SyncState) => void> = new Set();
  
  // Realtime subscription handles
  private realtimeChannel: any = null;
  private subscribedWorkspaceId: string | null = null;

  constructor() {
    this.init();
    db.onModified = () => {
      this.markAsModified();
    };
    db.onSyncItem = (storeName, item, action) => {
      this.syncItem(storeName, item, action).catch(err => {
        console.error(`[onSyncItem] Failed to sync ${storeName}:`, err);
      });
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.updateStatus('idle');
        this.triggerAutoSync(true); // Immediate sync on reconnect
      });
      window.addEventListener('offline', () => {
        this.updateStatus('offline');
      });

      // Background automatic synchronization loop (every 5 seconds)
      setInterval(() => {
        if (navigator.onLine && this.status !== 'syncing') {
          this.syncNow().catch(err => console.error('[Periodic Sync] Background sync failed:', err));
        }
      }, 5000);
    }
  }

  private async init() {
    if (typeof window === 'undefined') return;

    // Check for workspace deep-linking in URL on startup
    const urlParams = new URLSearchParams(window.location.search);
    const urlWorkspaceId = urlParams.get('workspaceId');
    const urlRecoveryKey = urlParams.get('recoveryKey');

    if (urlWorkspaceId && urlRecoveryKey) {
      console.log('Detected deep-linked workspace in URL. Connecting...');
      const newUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);

      setTimeout(() => {
        this.connectToWorkspace(urlWorkspaceId, urlRecoveryKey)
          .then((success) => {
            if (success) {
              console.log('Successfully connected to deep-linked workspace! Reloading components...');
              window.location.reload();
            }
          })
          .catch(err => {
            console.error('Failed to auto-connect to deep-linked workspace:', err);
          });
      }, 500);
      return;
    }

    // Load or generate Workspace Credentials
    let storedId = localStorage.getItem('jnas_workspace_id');
    let storedKey = localStorage.getItem('jnas_recovery_key');

    // Migration: If the user has a legacy random UUID workspace, migrate them to the shared workspace
    if (storedId && storedId.length === 36 && storedId.includes('-')) {
      console.log('Migrating legacy isolated UUID workspace to shared production workspace...');
      storedId = 'jnas-shared-production-workspace';
      storedKey = 'JNASWORKSPACEKEY';
      localStorage.setItem('jnas_workspace_id', storedId);
      localStorage.setItem('jnas_recovery_key', storedKey);
      localStorage.removeItem('jnas_last_synced_at'); // Reset to force merge
    }

    if (!storedId || !storedKey) {
      storedId = 'jnas-shared-production-workspace';
      storedKey = 'JNASWORKSPACEKEY';

      localStorage.setItem('jnas_workspace_id', storedId);
      localStorage.setItem('jnas_recovery_key', storedKey);
      localStorage.setItem('jnas_last_modified_at', new Date().toISOString());
    }

    this.workspaceId = storedId;
    this.recoveryKey = storedKey;
    this.recoveryKeyHash = await hashPassword(storedKey);
    this.lastSyncedAt = localStorage.getItem('jnas_last_synced_at');
    this.lastModifiedAt = localStorage.getItem('jnas_last_modified_at') || new Date().toISOString();
    this.status = navigator.onLine ? 'idle' : 'offline';

    // Start real-time subscriptions if configured
    this.setupRealtimeSubscription();

    // Trigger initial check/sync
    setTimeout(() => {
      this.syncNow().catch(err => console.error('Initial sync error:', err));
    }, 1000);
  }

  getCredentials(): { workspaceId: string; recoveryKey: string } {
    return {
      workspaceId: this.workspaceId,
      recoveryKey: this.recoveryKey
    };
  }

  async regenerateRecoveryKey(): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Readable chars (no O, 0, I, 1)
    let generatedKey = '';
    for (let i = 0; i < 16; i++) {
      generatedKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.recoveryKey = generatedKey;
    this.recoveryKeyHash = await hashPassword(generatedKey);
    localStorage.setItem('jnas_recovery_key', generatedKey);
    this.markAsModified();
    this.notify();
    return generatedKey;
  }

  getState(): SyncState {
    return {
      workspaceId: this.workspaceId,
      recoveryKey: this.recoveryKey,
      lastSyncedAt: this.lastSyncedAt,
      lastModifiedAt: this.lastModifiedAt,
      status: this.status,
      error: this.error
    };
  }

  subscribe(listener: (state: SyncState) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach(listener => listener(state));
  }

  private updateStatus(status: 'idle' | 'syncing' | 'error' | 'offline', error: string | null = null) {
    this.status = status;
    this.error = error;
    this.notify();
  }

  markAsModified() {
    this.lastModifiedAt = new Date().toISOString();
    localStorage.setItem('jnas_last_modified_at', this.lastModifiedAt);
    localStorage.setItem('jnas_needs_sync', 'true'); // Queue this change for uploading
    this.notify();
    this.triggerAutoSync();
  }

  triggerAutoSync(immediate = false) {
    if (this.status === 'offline' || !navigator.onLine) {
      return;
    }

    if (this.autoSyncTimeout) {
      clearTimeout(this.autoSyncTimeout);
    }

    const delay = immediate ? 0 : 3000; // 3 seconds debounce for rapid auto-saving
    this.autoSyncTimeout = setTimeout(() => {
      this.syncNow().catch(err => console.error('Background auto-sync failed:', err));
    }, delay);
  }

  /**
   * Performs an explicit, comprehensive local-to-cloud sync run.
   */
  async syncNow(force = false): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!navigator.onLine) {
      this.updateStatus('offline');
      return;
    }

    if (this.status === 'syncing' && !force) return;
    this.updateStatus('syncing');

    try {
      if (!isSupabaseConfigured) {
        // --- FALLBACK MODE: REST API KV Synchronizer ---
        await this.syncNowFallback(force);
        return;
      }

      // --- PRODUCTION SUPABASE REAL-TIME INCREMENTAL SYNC ENGINE ---
      const supabase = getSupabaseClient(this.workspaceId, this.recoveryKeyHash);
      if (!supabase) {
        throw new Error('Supabase client failed to initialize.');
      }

      // 1. Ensure the workspace exists on Supabase
      const { data: wsRow, error: wsError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', this.workspaceId)
        .maybeSingle();

      if (wsError) {
        throw new Error(`Failed to query remote workspace: ${wsError.message}`);
      }

      if (!wsRow) {
        // Register brand new workspace
        const { error: insertError } = await supabase
          .from('workspaces')
          .insert({
            id: this.workspaceId,
            recovery_key_hash: this.recoveryKeyHash
          });
        if (insertError) {
          throw new Error(`Failed to register workspace: ${insertError.message}`);
        }
        console.log(`[Supabase Sync] Registered workspace: ${this.workspaceId}`);
      } else if (wsRow.recovery_key_hash !== this.recoveryKeyHash) {
        throw new Error('Unauthorized workspace credentials. Recovery Key mismatch!');
      }

      // Establish Postgres Realtime Subscription
      this.setupRealtimeSubscription();

      // 2. Clear out any pending deletions recorded while offline
      await this.flushPendingDeletions(supabase);

      // 3. Two-way Incremental Sync for each IndexedDB collection
      await this.syncStoreIncremental(supabase, 'diary', 'journal', 'updatedAt', 'updated_at');
      await this.syncStoreIncremental(supabase, 'kanban_columns', 'kanban_columns', 'updatedAt', 'updated_at');
      await this.syncStoreIncremental(supabase, 'kanban_cards', 'kanban_cards', 'updatedAt', 'updated_at');
      await this.syncStoreIncremental(supabase, 'whiteboard', 'whiteboard', 'updatedAt', 'updated_at');
      await this.syncStoreIncremental(supabase, 'resources', 'resources', 'updatedAt', 'updated_at');
      await this.syncStoreIncremental(supabase, 'code_snippets', 'snippets', 'updatedAt', 'updated_at');
      await this.syncStoreIncremental(supabase, 'activities', 'activities', 'timestamp', 'timestamp');

      this.lastSyncedAt = new Date().toISOString();
      localStorage.setItem('jnas_last_synced_at', this.lastSyncedAt);
      localStorage.setItem('jnas_needs_sync', 'false');
      this.updateStatus('idle');

      console.log(`[Supabase Sync] Workspace ${this.workspaceId} synced incrementally with success.`);
    } catch (err: any) {
      console.error('Supabase Sync execution error:', err);
      this.updateStatus('error', err?.message || String(err));
      throw err;
    }
  }

  /**
   * Connect to an existing Workspace on device transition or manual credential input.
   */
  async connectToWorkspace(targetWorkspaceId: string, targetRecoveryKey: string): Promise<boolean> {
    if (!targetWorkspaceId || !targetRecoveryKey) {
      throw new Error('Workspace ID and Recovery Key are required.');
    }

    this.updateStatus('syncing');

    try {
      const hashedKey = await hashPassword(targetRecoveryKey);

      if (isSupabaseConfigured) {
        // --- SUPABASE CONNECT FLOW ---
        const supabase = getSupabaseClient(targetWorkspaceId, hashedKey);
        if (!supabase) throw new Error('Supabase Client initialization error.');

        const { data: wsRow, error: wsError } = await supabase
          .from('workspaces')
          .select('*')
          .eq('id', targetWorkspaceId)
          .maybeSingle();

        if (wsError) {
          throw new Error(`Authentication server error: ${wsError.message}`);
        }

        if (!wsRow) {
          throw new Error('Workspace not found on Supabase. Verify ID and Recovery Key.');
        }

        if (wsRow.recovery_key_hash !== hashedKey) {
          throw new Error('Invalid Recovery Key. Access Denied.');
        }

        // Safety backup of existing data
        await this.createAutoBackup('pre-connect-backup');

        // Overwrite credentials locally
        this.workspaceId = targetWorkspaceId;
        this.recoveryKey = targetRecoveryKey;
        this.recoveryKeyHash = hashedKey;
        localStorage.setItem('jnas_workspace_id', targetWorkspaceId);
        localStorage.setItem('jnas_recovery_key', targetRecoveryKey);

        // Fetch all remote data table-by-table and populate IndexedDB
        const getRemoteItems = async (tableName: string) => {
          const { data, error } = await supabase.from(tableName).select('*').eq('workspace_id', targetWorkspaceId);
          if (error) throw error;
          return data || [];
        };

        const diaryRows = await getRemoteItems('journal');
        const columnRows = await getRemoteItems('kanban_columns');
        const cardRows = await getRemoteItems('kanban_cards');
        const whiteboardRows = await getRemoteItems('whiteboard');
        const resourceRows = await getRemoteItems('resources');
        const snippetRows = await getRemoteItems('snippets');
        const activityRows = await getRemoteItems('activities');

        // Clear local and restore
        const mergedData = {
          diary: diaryRows.map(r => this.mapRowToLocal('diary', r)),
          kanban_columns: columnRows.map(r => this.mapRowToLocal('kanban_columns', r)),
          kanban_cards: cardRows.map(r => this.mapRowToLocal('kanban_cards', r)),
          whiteboard: whiteboardRows.map(r => this.mapRowToLocal('whiteboard', r)),
          resources: resourceRows.map(r => this.mapRowToLocal('resources', r)),
          code_snippets: snippetRows.map(r => this.mapRowToLocal('code_snippets', r)),
          activities: activityRows.map(r => this.mapRowToLocal('activities', r))
        };

        await db.importDB(JSON.stringify(mergedData));

        const nowStr = new Date().toISOString();
        this.lastSyncedAt = nowStr;
        this.lastModifiedAt = nowStr;
        localStorage.setItem('jnas_last_synced_at', nowStr);
        localStorage.setItem('jnas_last_modified_at', nowStr);

        this.setupRealtimeSubscription();
        this.updateStatus('idle');
        return true;
      } else {
        // --- REST API FALLBACK CONNECT FLOW ---
        const res = await fetch(`/api/sync?workspaceId=${targetWorkspaceId}&recoveryKey=${targetRecoveryKey}`);
        
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to locate workspace. Please verify your keys.');
        }

        const remote = await res.json();
        
        await this.createAutoBackup('pre-connect-backup');

        this.workspaceId = targetWorkspaceId;
        this.recoveryKey = targetRecoveryKey;
        this.recoveryKeyHash = hashedKey;
        localStorage.setItem('jnas_workspace_id', targetWorkspaceId);
        localStorage.setItem('jnas_recovery_key', targetRecoveryKey);

        await db.importDB(remote.dbData);
        
        this.lastSyncedAt = remote.updatedAt;
        this.lastModifiedAt = remote.updatedAt;
        localStorage.setItem('jnas_last_synced_at', remote.updatedAt);
        localStorage.setItem('jnas_last_modified_at', remote.updatedAt);

        this.updateStatus('idle');
        return true;
      }
    } catch (err: any) {
      console.error('Failed to connect to workspace:', err);
      this.updateStatus('error', err?.message || String(err));
      throw err;
    }
  }

  /**
   * Subscribes to Supabase Postgres replication channels for absolute real-time updates.
   */
  private setupRealtimeSubscription() {
    if (!isSupabaseConfigured) return;
    if (this.subscribedWorkspaceId === this.workspaceId && this.realtimeChannel) {
      return; // Already subscribed to this workspace
    }

    // Teardown legacy channel if any
    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe();
      this.realtimeChannel = null;
    }

    const supabase = getSupabaseClient(this.workspaceId, this.recoveryKeyHash);
    if (!supabase) return;

    console.log(`[Realtime Sync] Enrolling into Realtime Publication for Workspace: ${this.workspaceId}`);

    const handlePayload = (storeName: string, payload: any) => {
      this.handleRealtimeEvent(storeName, payload).catch(err => {
        console.error(`[Realtime Sync] Payload handling exception:`, err);
      });
    };

    this.realtimeChannel = supabase.channel(`jnas_rt_pub_${this.workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal', filter: `workspace_id=eq.${this.workspaceId}` }, (p) => handlePayload('diary', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whiteboard', filter: `workspace_id=eq.${this.workspaceId}` }, (p) => handlePayload('whiteboard', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_columns', filter: `workspace_id=eq.${this.workspaceId}` }, (p) => handlePayload('kanban_columns', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_cards', filter: `workspace_id=eq.${this.workspaceId}` }, (p) => handlePayload('kanban_cards', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resources', filter: `workspace_id=eq.${this.workspaceId}` }, (p) => handlePayload('resources', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'snippets', filter: `workspace_id=eq.${this.workspaceId}` }, (p) => handlePayload('code_snippets', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: `workspace_id=eq.${this.workspaceId}` }, (p) => handlePayload('activities', p))
      .subscribe((status) => {
        console.log(`[Realtime Sync] Subscription status updated: ${status}`);
      });

    this.subscribedWorkspaceId = this.workspaceId;
  }

  private async handleRealtimeEvent(storeName: string, payload: any) {
    try {
      const type = payload.eventType;
      console.log(`[Realtime Event] Received ${type} for ${storeName}:`, payload);

      if (type === 'INSERT' || type === 'UPDATE') {
        const item = this.mapRowToLocal(storeName, payload.new);
        await db.putItemDirect(storeName, item);
      } else if (type === 'DELETE') {
        const id = payload.old.id;
        if (id) {
          await db.deleteItemDirect(storeName, id);
        }
      }

      // Notify React components across the active app instance
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('jnas_db_updated'));
      }
      this.notify();
    } catch (err) {
      console.error('[Realtime Sync] Failed to handle incoming server update:', err);
    }
  }

  /**
   * Incremental Two-Way Sync Core Algorithm
   */
  private async syncStoreIncremental(
    supabase: any,
    storeName: string,
    tableName: string,
    localCompareField: string,
    remoteCompareField: string
  ): Promise<void> {
    // 1. Read remote records from Supabase
    const { data: remoteRows, error: remoteError } = await supabase
      .from(tableName)
      .select('*')
      .eq('workspace_id', this.workspaceId);

    if (remoteError) {
      throw new Error(`Failed to download rows for ${tableName}: ${remoteError.message}`);
    }

    // 2. Read local records from IndexedDB
    const localItems = await db.getStoreItems<any>(storeName);

    const localMap = new Map<string, any>();
    localItems.forEach(item => {
      if (item && item.id) localMap.set(item.id, item);
    });

    const remoteMap = new Map<string, any>();
    (remoteRows || []).forEach(row => {
      if (row && row.id) remoteMap.set(row.id, row);
    });

    // 3. Process local items -> push or update to Supabase
    for (const [id, localItem] of localMap.entries()) {
      const remoteRow = remoteMap.get(id);

      if (!remoteRow) {
        // Record is new on client. Upload to Supabase
        const insertPayload = this.mapLocalToRow(storeName, localItem);
        const { error: insertError } = await supabase.from(tableName).insert(insertPayload);
        if (insertError) {
          console.error(`[Incremental PUSH] Insert failed for ${storeName}/${id}:`, insertError);
        }
      } else {
        // Both exist. Compare timestamps to resolve conflicts
        const localTimeStr = localItem[localCompareField] || localItem.createdAt || localItem.timestamp;
        const remoteTimeStr = remoteRow[remoteCompareField];

        if (localTimeStr && remoteTimeStr) {
          const localTime = new Date(localTimeStr).getTime();
          const remoteTime = new Date(remoteTimeStr).getTime();

          if (localTime > remoteTime + 10) { // Keep safety margin of 10ms
            const updatePayload = this.mapLocalToRow(storeName, localItem);
            const { error: updateError } = await supabase.from(tableName).update(updatePayload).eq('id', id);
            if (updateError) {
              console.error(`[Incremental UPDATE] Upload failed for ${storeName}/${id}:`, updateError);
            }
          }
        }
      }
    }

    // 4. Process remote items -> download or overwrite to IndexedDB
    for (const [id, remoteRow] of remoteMap.entries()) {
      const localItem = localMap.get(id);

      if (!localItem) {
        // Record is missing on client. Download it
        const localRepresentation = this.mapRowToLocal(storeName, remoteRow);
        await db.putItemDirect(storeName, localRepresentation);
      } else {
        const localTimeStr = localItem[localCompareField] || localItem.createdAt || localItem.timestamp;
        const remoteTimeStr = remoteRow[remoteCompareField];

        if (localTimeStr && remoteTimeStr) {
          const localTime = new Date(localTimeStr).getTime();
          const remoteTime = new Date(remoteTimeStr).getTime();

          if (remoteTime > localTime + 10) {
            const localRepresentation = this.mapRowToLocal(storeName, remoteRow);
            await db.putItemDirect(storeName, localRepresentation);
          }
        }
      }
    }
  }

  /**
   * Replays deletions performed offline to secure consistent state on server.
   */
  private async flushPendingDeletions(supabase: any): Promise<void> {
    try {
      const pendingStr = localStorage.getItem('jnas_pending_deletes') || '[]';
      const pendingDeletes = JSON.parse(pendingStr);

      if (pendingDeletes.length === 0) return;

      console.log(`[Offline Replication] Found ${pendingDeletes.length} pending deletes to flush.`);

      const remainingDeletes: any[] = [];

      for (const del of pendingDeletes) {
        const tableName = this.getTableNameFromStore(del.storeName);
        if (!tableName) continue;

        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq('id', del.id)
          .eq('workspace_id', this.workspaceId);

        if (error) {
          console.error(`[Offline Deletes] Failed to delete ${tableName}/${del.id}:`, error);
          remainingDeletes.push(del); // Retry during next sync
        }
      }

      localStorage.setItem('jnas_pending_deletes', JSON.stringify(remainingDeletes));
    } catch (err) {
      console.error('[Offline Deletion Sync] Replay execution crashed:', err);
    }
  }

  private getTableNameFromStore(storeName: string): string | null {
    switch (storeName) {
      case 'diary': return 'journal';
      case 'whiteboard': return 'whiteboard';
      case 'kanban_columns': return 'kanban_columns';
      case 'kanban_cards': return 'kanban_cards';
      case 'resources': return 'resources';
      case 'code_snippets': return 'snippets';
      case 'activities': return 'activities';
      default: return null;
    }
  }

  /**
   * Legacy fallbacks for cloud-synchronization when Supabase is not configured yet.
   */
  private async syncNowFallback(force = false): Promise<void> {
    try {
      const res = await fetch(`/api/sync?workspaceId=${this.workspaceId}&recoveryKey=${this.recoveryKey}`);
      
      if (res.status === 404) {
        await this.pushLocalToServerFallback();
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${res.status}`);
      }

      const remote = await res.json();
      
      const localModifiedTime = new Date(this.lastModifiedAt).getTime();
      const remoteModifiedTime = new Date(remote.updatedAt).getTime();

      if (force || remoteModifiedTime > localModifiedTime || !this.lastSyncedAt) {
        await this.pullAndMergeRemoteFallback(remote.dbData, remote.updatedAt);
      } else if (localModifiedTime > remoteModifiedTime) {
        await this.pushLocalToServerFallback();
      } else {
        localStorage.setItem('jnas_needs_sync', 'false');
        this.updateStatus('idle');
      }
    } catch (err: any) {
      console.error('REST API Sync Fallback failed:', err);
      this.updateStatus('error', err?.message || String(err));
      throw err;
    }
  }

  private async pushLocalToServerFallback(): Promise<void> {
    const dbData = await db.exportDB();
    const now = new Date().toISOString();

    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: this.workspaceId,
        recoveryKey: this.recoveryKey,
        dbData,
        updatedAt: now
      })
    });

    if (response.status === 409) {
      this.updateStatus('idle');
      return this.syncNow();
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Push fallback failed with status ${response.status}`);
    }

    this.lastSyncedAt = now;
    localStorage.setItem('jnas_last_synced_at', now);
    localStorage.setItem('jnas_needs_sync', 'false');
    this.updateStatus('idle');
  }

  private async pullAndMergeRemoteFallback(remoteDbDataStr: string, remoteUpdatedAt: string): Promise<void> {
    try {
      const localDbDataStr = await db.exportDB();
      const local = JSON.parse(localDbDataStr);
      const remote = JSON.parse(remoteDbDataStr);

      await this.createAutoBackup('pre-merge-backup');

      const merged: any = {};

      const mergeTable = (tableName: string, keyField = 'id', compareField?: string) => {
        const localList = local[tableName] || [];
        const remoteList = remote[tableName] || [];
        const map = new Map<string, any>();

        localList.forEach((item: any) => {
          if (item && item[keyField]) {
            map.set(item[keyField], item);
          }
        });

        remoteList.forEach((remoteItem: any) => {
          if (!remoteItem || !remoteItem[keyField]) return;
          const localItem = map.get(remoteItem[keyField]);

          if (!localItem) {
            map.set(remoteItem[keyField], remoteItem);
          } else if (compareField && remoteItem[compareField] && localItem[compareField]) {
            const remoteTime = new Date(remoteItem[compareField]).getTime();
            const localTime = new Date(localItem[compareField]).getTime();
            if (remoteTime > localTime) {
              map.set(remoteItem[keyField], remoteItem);
            }
          } else {
            map.set(remoteItem[keyField], remoteItem);
          }
        });

        merged[tableName] = Array.from(map.values());
      };

      mergeTable('diary', 'id', 'updatedAt');
      mergeTable('kanban_columns', 'id');
      mergeTable('kanban_cards', 'id');
      mergeTable('whiteboard', 'id');
      mergeTable('resources', 'id', 'createdAt');
      mergeTable('code_snippets', 'id', 'createdAt');
      mergeTable('activities', 'id', 'timestamp');

      await db.importDB(JSON.stringify(merged));

      const mergedDbStr = JSON.stringify(merged);
      const now = new Date().toISOString();

      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: this.workspaceId,
          recoveryKey: this.recoveryKey,
          dbData: mergedDbStr,
          updatedAt: now
        })
      });

      this.lastSyncedAt = now;
      this.lastModifiedAt = now;
      localStorage.setItem('jnas_last_synced_at', now);
      localStorage.setItem('jnas_last_modified_at', now);
      localStorage.setItem('jnas_needs_sync', 'false');
      this.updateStatus('idle');
    } catch (err) {
      console.error('Merge fallback failure:', err);
      await db.importDB(remoteDbDataStr);
      this.lastSyncedAt = remoteUpdatedAt;
      this.lastModifiedAt = remoteUpdatedAt;
      localStorage.setItem('jnas_last_synced_at', remoteUpdatedAt);
      localStorage.setItem('jnas_last_modified_at', remoteUpdatedAt);
      localStorage.setItem('jnas_needs_sync', 'false');
      this.updateStatus('idle');
    }
  }

  async createAutoBackup(prefix: string): Promise<void> {
    try {
      const currentDB = await db.exportDB();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      localStorage.setItem(`jnas_backup_${prefix}_${timestamp}`, currentDB);
      
      const keys = Object.keys(localStorage)
        .filter(k => k.startsWith(`jnas_backup_${prefix}_`))
        .sort();

      while (keys.length > 3) {
        const oldest = keys.shift();
        if (oldest) localStorage.removeItem(oldest);
      }
    } catch (err) {
      console.warn('LocalStorage backup storage quota warning:', err);
    }
  }

  getAutoBackups(): Array<{ key: string; timestamp: string; label: string }> {
    const list: Array<{ key: string; timestamp: string; label: string }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('jnas_backup_')) {
        const parts = key.split('_');
        const prefix = parts[2] || 'backup';
        const rawTime = parts[3] || '';
        const formattedTime = rawTime.replace(/-/g, ':').replace(/T/, ' ').substring(0, 16);
        list.push({
          key,
          timestamp: rawTime,
          label: `${prefix.toUpperCase()} — ${formattedTime}`
        });
      }
    }
    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async restoreAutoBackup(key: string): Promise<void> {
    const data = localStorage.getItem(key);
    if (!data) throw new Error('Backup not found');
    await db.importDB(data);
    this.markAsModified();
  }

  private mapRowToLocal(storeName: string, row: any): any {
    switch (storeName) {
      case 'diary':
        return {
          id: row.id,
          title: row.title,
          content: row.content,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      case 'whiteboard':
        return {
          id: row.id,
          type: row.type,
          x: row.x,
          y: row.y,
          width: row.width !== null ? row.width : undefined,
          height: row.height !== null ? row.height : undefined,
          text: row.text,
          color: row.color !== null ? row.color : undefined,
          shape: row.shape !== null ? row.shape : undefined,
          fromId: row.from_id !== null ? row.from_id : undefined,
          toId: row.to_id !== null ? row.to_id : undefined,
          groupId: row.group_id !== null ? row.group_id : undefined,
          rotation: row.rotation !== null ? row.rotation : undefined,
          locked: row.locked,
          borderWidth: row.border_width !== null ? row.border_width : undefined,
          borderStyle: row.border_style !== null ? row.border_style : undefined,
          fillColor: row.fill_color !== null ? row.fill_color : undefined,
          gradient: row.gradient,
          gradientColor: row.gradient_color !== null ? row.gradient_color : undefined,
          shadow: row.shadow,
          opacity: row.opacity !== null ? row.opacity : undefined,
          roundedCorners: row.rounded_corners,
          imageUrl: row.image_url !== null ? row.image_url : undefined,
          iconName: row.icon_name !== null ? row.icon_name : undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      case 'kanban_columns':
        return {
          id: row.id,
          title: row.title,
          order: row.order_num,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      case 'kanban_cards':
        return {
          id: row.id,
          columnId: row.column_id,
          title: row.title,
          description: row.description,
          progress: row.progress,
          deadline: row.deadline !== null ? row.deadline : undefined,
          labels: Array.isArray(row.labels) ? row.labels : [],
          attachments: Array.isArray(row.attachments) ? row.attachments : [],
          order: row.order_num,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      case 'resources':
        return {
          id: row.id,
          title: row.title,
          url: row.url,
          category: row.category,
          notes: row.notes,
          metadata: row.metadata !== null ? row.metadata : undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      case 'code_snippets':
        return {
          id: row.id,
          title: row.title,
          code: row.code,
          language: row.language,
          notes: row.notes,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      case 'activities':
        return {
          id: row.id,
          type: row.type,
          action: row.action,
          title: row.title,
          details: row.details,
          timestamp: row.timestamp
        };
      default:
        return row;
    }
  }

  private mapLocalToRow(storeName: string, item: any): any {
    switch (storeName) {
      case 'diary':
        return {
          id: item.id,
          workspace_id: this.workspaceId,
          title: item.title || 'Untitled Entry',
          content: item.content || '',
          created_at: item.createdAt,
          updated_at: item.updatedAt || item.createdAt,
          deleted_at: null,
          version: 1
        };
      case 'whiteboard':
        return {
          id: item.id,
          workspace_id: this.workspaceId,
          type: item.type,
          x: item.x || 0,
          y: item.y || 0,
          width: item.width !== undefined ? item.width : null,
          height: item.height !== undefined ? item.height : null,
          text: item.text || '',
          color: item.color !== undefined ? item.color : null,
          shape: item.shape !== undefined ? item.shape : null,
          from_id: item.fromId !== undefined ? item.fromId : null,
          to_id: item.toId !== undefined ? item.toId : null,
          group_id: item.groupId !== undefined ? item.groupId : null,
          rotation: item.rotation !== undefined ? item.rotation : 0,
          locked: item.locked || false,
          border_width: item.borderWidth !== undefined ? item.borderWidth : null,
          border_style: item.borderStyle !== undefined ? item.borderStyle : null,
          fill_color: item.fillColor !== undefined ? item.fillColor : null,
          gradient: item.gradient || false,
          gradient_color: item.gradientColor !== undefined ? item.gradientColor : null,
          shadow: item.shadow || false,
          opacity: item.opacity !== undefined ? item.opacity : null,
          rounded_corners: item.roundedCorners || false,
          image_url: item.imageUrl !== undefined ? item.imageUrl : null,
          icon_name: item.iconName !== undefined ? item.iconName : null,
          created_at: item.createdAt || new Date().toISOString(),
          updated_at: item.updatedAt || new Date().toISOString(),
          version: 1
        };
      case 'kanban_columns':
        return {
          id: item.id,
          workspace_id: this.workspaceId,
          title: item.title,
          order_num: item.order,
          created_at: item.createdAt || new Date().toISOString(),
          updated_at: item.updatedAt || new Date().toISOString(),
          version: 1
        };
      case 'kanban_cards':
        return {
          id: item.id,
          workspace_id: this.workspaceId,
          column_id: item.columnId,
          title: item.title,
          description: item.description || '',
          progress: item.progress || 0,
          deadline: item.deadline !== undefined ? item.deadline : null,
          labels: item.labels || [],
          attachments: item.attachments || [],
          order_num: item.order,
          created_at: item.createdAt || new Date().toISOString(),
          updated_at: item.updatedAt || new Date().toISOString(),
          version: 1
        };
      case 'resources':
        return {
          id: item.id,
          workspace_id: this.workspaceId,
          title: item.title,
          url: item.url,
          category: item.category,
          notes: item.notes || '',
          metadata: item.metadata || {},
          created_at: item.createdAt || new Date().toISOString(),
          updated_at: item.updatedAt || new Date().toISOString(),
          version: 1
        };
      case 'code_snippets':
        return {
          id: item.id,
          workspace_id: this.workspaceId,
          title: item.title,
          code: item.code || '',
          language: item.language || 'typescript',
          notes: item.notes || '',
          created_at: item.createdAt || new Date().toISOString(),
          updated_at: item.updatedAt || new Date().toISOString(),
          version: 1
        };
      case 'activities':
        return {
          id: item.id,
          workspace_id: this.workspaceId,
          type: item.type,
          action: item.action,
          title: item.title,
          details: item.details || '',
          timestamp: item.timestamp,
          created_at: item.timestamp
        };
      default:
        return item;
    }
  }

  /**
   * Directly write or delete a single item to Supabase for immediate, zero-latency sync.
   */
  async syncItem(storeName: string, item: any, action: 'put' | 'delete'): Promise<void> {
    if (!isSupabaseConfigured) return;

    const supabase = getSupabaseClient(this.workspaceId, this.recoveryKeyHash);
    if (!supabase) return;

    const tableName = this.getTableNameFromStore(storeName);
    if (!tableName) return;

    try {
      if (action === 'put') {
        const payload = this.mapLocalToRow(storeName, item);
        const { error } = await supabase.from(tableName).upsert(payload);
        if (error) {
          console.error(`[Immediate Sync] Failed to upsert to ${tableName}:`, error.message);
          throw error;
        }
      } else if (action === 'delete') {
        const id = typeof item === 'object' ? item.id : item;
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq('id', id)
          .eq('workspace_id', this.workspaceId);
        if (error) {
          console.error(`[Immediate Sync] Failed to delete from ${tableName}:`, error.message);
          throw error;
        }
      }
    } catch (err) {
      console.warn(`[Immediate Sync] Failed for ${storeName}, scheduling background sync fallback:`, err);
      this.markAsModified();
    }
  }
}

export const syncManager = new SyncManager();
