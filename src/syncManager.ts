import { db } from './db';

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
  private lastSyncedAt: string | null = null;
  private lastModifiedAt: string = '';
  private status: 'idle' | 'syncing' | 'error' | 'offline' = 'idle';
  private error: string | null = null;
  private autoSyncTimeout: any = null;
  private listeners: Set<(state: SyncState) => void> = new Set();

  constructor() {
    this.init();
    db.onModified = () => {
      this.markAsModified();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.updateStatus('idle');
        this.triggerAutoSync(true); // Immediate sync on reconnect
      });
      window.addEventListener('offline', () => {
        this.updateStatus('offline');
      });

      // Background automatic synchronization loop (every 12 seconds) to keep multiple devices/browsers in sync
      setInterval(() => {
        if (navigator.onLine && this.status !== 'syncing') {
          this.syncNow().catch(err => console.error('[Periodic Sync] Background sync failed:', err));
        }
      }, 12000);
    }
  }

  private init() {
    if (typeof window === 'undefined') return;

    // Check for workspace deep-linking in URL on startup
    const urlParams = new URLSearchParams(window.location.search);
    const urlWorkspaceId = urlParams.get('workspaceId');
    const urlRecoveryKey = urlParams.get('recoveryKey');

    if (urlWorkspaceId && urlRecoveryKey) {
      console.log('Detected deep-linked workspace in URL. Connecting...');
      // Strip URL parameters immediately for security and to keep address bar clean
      const newUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);

      // Run connection flow asynchronously
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

    if (!storedId || !storedKey) {
      storedId = crypto.randomUUID();
      // Generate a strong, highly secure, easily copyable 16-character alphanumeric recovery key
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Readable chars (no O, 0, I, 1)
      let generatedKey = '';
      for (let i = 0; i < 16; i++) {
        generatedKey += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      storedKey = generatedKey;

      localStorage.setItem('jnas_workspace_id', storedId);
      localStorage.setItem('jnas_recovery_key', storedKey);
      localStorage.setItem('jnas_last_modified_at', new Date().toISOString());
    }

    this.workspaceId = storedId;
    this.recoveryKey = storedKey;
    this.lastSyncedAt = localStorage.getItem('jnas_last_synced_at');
    this.lastModifiedAt = localStorage.getItem('jnas_last_modified_at') || new Date().toISOString();
    this.status = navigator.onLine ? 'idle' : 'offline';

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

  regenerateRecoveryKey(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Readable chars (no O, 0, I, 1)
    let generatedKey = '';
    for (let i = 0; i < 16; i++) {
      generatedKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.recoveryKey = generatedKey;
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

  // Auto sync debounces and executes background synchronizations
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

  // Explicit cloud-to-local and local-to-cloud sync run
  async syncNow(force = false): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!navigator.onLine) {
      this.updateStatus('offline');
      return;
    }

    if (this.status === 'syncing' && !force) return;

    this.updateStatus('syncing');

    try {
      // 1. Fetch remote version
      const res = await fetch(`/api/sync?workspaceId=${this.workspaceId}&recoveryKey=${this.recoveryKey}`);
      
      if (res.status === 404) {
        // Workspace does not exist on server yet, upload local database
        await this.pushLocalToServer();
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${res.status}`);
      }

      const remote = await res.json();
      
      // Determine if remote is newer or has conflict
      const localModifiedTime = new Date(this.lastModifiedAt).getTime();
      const remoteModifiedTime = new Date(remote.updatedAt).getTime();
      const lastSyncedTime = this.lastSyncedAt ? new Date(this.lastSyncedAt).getTime() : 0;

      // Critical Correction: If we have never synced (this.lastSyncedAt is null) but there is remote data on the server,
      // we must pull and merge the remote database to avoid overwriting it with our empty local IndexedDB.
      if (force || remoteModifiedTime > localModifiedTime || !this.lastSyncedAt) {
        console.log('Remote is newer, force requested, or first sync. Pulling and merging...');
        await this.pullAndMergeRemote(remote.dbData, remote.updatedAt);
      } else if (localModifiedTime > remoteModifiedTime) {
        console.log('Local is newer. Pushing to server...');
        await this.pushLocalToServer();
      } else {
        // Everything is perfectly in sync
        console.log('Workspace is fully in sync with server.');
        localStorage.setItem('jnas_needs_sync', 'false'); // Mark sync complete
        this.updateStatus('idle');
      }
    } catch (err: any) {
      console.error('Synchronization failed:', err);
      this.updateStatus('error', err?.message || String(err));
      throw err;
    }
  }

  // Connect to an existing Workspace (on device transition)
  async connectToWorkspace(targetWorkspaceId: string, targetRecoveryKey: string): Promise<boolean> {
    if (!targetWorkspaceId || !targetRecoveryKey) {
      throw new Error('Workspace ID and Recovery Key are required.');
    }

    this.updateStatus('syncing');

    try {
      const res = await fetch(`/api/sync?workspaceId=${targetWorkspaceId}&recoveryKey=${targetRecoveryKey}`);
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to locate workspace. Please verify your keys.');
      }

      const remote = await res.json();
      
      // Make a safety backup of local DB before overwriting
      await this.createAutoBackup('pre-connect-backup');

      // Overwrite local credentials
      this.workspaceId = targetWorkspaceId;
      this.recoveryKey = targetRecoveryKey;
      localStorage.setItem('jnas_workspace_id', targetWorkspaceId);
      localStorage.setItem('jnas_recovery_key', targetRecoveryKey);

      // Restore/import the data
      await db.importDB(remote.dbData);
      
      // Update sync markers
      this.lastSyncedAt = remote.updatedAt;
      this.lastModifiedAt = remote.updatedAt;
      localStorage.setItem('jnas_last_synced_at', remote.updatedAt);
      localStorage.setItem('jnas_last_modified_at', remote.updatedAt);

      this.updateStatus('idle');
      return true;
    } catch (err: any) {
      console.error('Failed to link workspace:', err);
      this.updateStatus('error', err?.message || String(err));
      throw err;
    }
  }

  private async pushLocalToServer(): Promise<void> {
    const dbData = await db.exportDB();
    const now = new Date().toISOString();

    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workspaceId: this.workspaceId,
        recoveryKey: this.recoveryKey,
        dbData,
        updatedAt: now
      })
    });

    if (response.status === 409) {
      // Conflict! Run synchronization check again
      this.updateStatus('idle');
      return this.syncNow();
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Push failed with status ${response.status}`);
    }

    this.lastSyncedAt = now;
    localStorage.setItem('jnas_last_synced_at', now);
    localStorage.setItem('jnas_needs_sync', 'false'); // Mark sync complete
    this.updateStatus('idle');
  }

  private async pullAndMergeRemote(remoteDbDataStr: string, remoteUpdatedAt: string): Promise<void> {
    try {
      const localDbDataStr = await db.exportDB();
      const local = JSON.parse(localDbDataStr);
      const remote = JSON.parse(remoteDbDataStr);

      // Create pre-merge backup
      await this.createAutoBackup('pre-merge-backup');

      // Smart Merger logic: Non-destructive merging of objects by ID
      const merged: any = {};

      const mergeTable = (tableName: string, keyField = 'id', compareField?: string) => {
        const localList = local[tableName] || [];
        const remoteList = remote[tableName] || [];
        const map = new Map<string, any>();

        // First populate map with local rows
        localList.forEach((item: any) => {
          if (item && item[keyField]) {
            map.set(item[keyField], item);
          }
        });

        // Merge with remote rows
        remoteList.forEach((remoteItem: any) => {
          if (!remoteItem || !remoteItem[keyField]) return;
          const localItem = map.get(remoteItem[keyField]);

          if (!localItem) {
            // New remote row, add directly
            map.set(remoteItem[keyField], remoteItem);
          } else if (compareField && remoteItem[compareField] && localItem[compareField]) {
            // Both exist, use timestamp / compare field (e.g. updatedAt)
            const remoteTime = new Date(remoteItem[compareField]).getTime();
            const localTime = new Date(localItem[compareField]).getTime();
            if (remoteTime > localTime) {
              map.set(remoteItem[keyField], remoteItem);
            }
          } else {
            // Default conflict resolution: keep local or merge deep, or remote-wins for synchronization
            map.set(remoteItem[keyField], remoteItem);
          }
        });

        merged[tableName] = Array.from(map.values());
      };

      // Run structured merging across tables
      mergeTable('diary', 'id', 'updatedAt');
      mergeTable('kanban_columns', 'id');
      mergeTable('kanban_cards', 'id');
      mergeTable('whiteboard', 'id');
      mergeTable('resources', 'id', 'createdAt');
      mergeTable('code_snippets', 'id', 'createdAt');
      mergeTable('activities', 'id', 'timestamp');

      // Save merged db to local IndexedDB
      await db.importDB(JSON.stringify(merged));

      // Push back the merged database to server to stabilize both devices
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
      localStorage.setItem('jnas_needs_sync', 'false'); // Mark sync complete
      this.updateStatus('idle');
    } catch (err) {
      console.error('Merge failure:', err);
      // Fall back to importing remote fully to avoid broken state
      await db.importDB(remoteDbDataStr);
      this.lastSyncedAt = remoteUpdatedAt;
      this.lastModifiedAt = remoteUpdatedAt;
      localStorage.setItem('jnas_last_synced_at', remoteUpdatedAt);
      localStorage.setItem('jnas_last_modified_at', remoteUpdatedAt);
      localStorage.setItem('jnas_needs_sync', 'false'); // Mark sync complete
      this.updateStatus('idle');
    }
  }

  // Automatic snapshots saved to localStorage as rolling recovery points
  async createAutoBackup(prefix: string): Promise<void> {
    try {
      const currentDB = await db.exportDB();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      localStorage.setItem(`jnas_backup_${prefix}_${timestamp}`, currentDB);
      
      // Keep only last 3 backups of the same prefix to optimize local storage quota
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

  // Get list of auto-backups
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
}

export const syncManager = new SyncManager();
