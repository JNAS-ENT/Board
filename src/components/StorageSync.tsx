import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  Trash2, 
  Cloud, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle,
  FileText,
  FileDown,
  Copy,
  Check,
  Link2,
  ShieldAlert,
  Clock,
  RotateCcw,
  PlusCircle,
  HelpCircle
} from 'lucide-react';
import { db } from '../db';
import { syncManager, SyncState } from '../syncManager';

interface StorageSyncProps {
  darkMode: boolean;
  triggerRefresh: () => void;
}

export default function StorageSync({ darkMode, triggerRefresh }: StorageSyncProps) {
  const [stats, setStats] = useState({
    diary: 0,
    kanban_cards: 0,
    whiteboard: 0,
    resources: 0,
    code_snippets: 0,
    activities: 0
  });

  const [syncState, setSyncState] = useState<SyncState>(syncManager.getState());
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  // Link credentials form
  const [linkWorkspaceId, setLinkWorkspaceId] = useState('');
  const [linkRecoveryKey, setLinkRecoveryKey] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  // Auto-backup states
  const [autoBackups, setAutoBackups] = useState<Array<{ key: string; timestamp: string; label: string }>>([]);

  // Copy-to-clipboard state helpers
  const [copiedId, setCopiedId] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const loadStats = async () => {
    try {
      const d = await db.getDiaryEntries();
      const k = await db.getKanbanCards();
      const w = await db.getWhiteboardElements();
      const r = await db.getResources();
      const c = await db.getCodeSnippets();
      const a = await db.getRecentActivities();

      setStats({
        diary: d.length,
        kanban_cards: k.length,
        whiteboard: w.length,
        resources: r.length,
        code_snippets: c.length,
        activities: a.length
      });
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadStats();
    setAutoBackups(syncManager.getAutoBackups());

    // Subscribe to syncManager states
    const unsubscribe = syncManager.subscribe((state) => {
      setSyncState(state);
    });

    return () => unsubscribe();
  }, []);

  const showSuccess = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4500);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 4500);
  };

  const handleCopy = (text: string, type: 'id' | 'key') => {
    navigator.clipboard.writeText(text);
    if (type === 'id') {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
    showSuccess('Copied to clipboard!');
  };

  // Manual cloud synchronization
  const handleManualSync = async () => {
    try {
      await syncManager.syncNow();
      showSuccess('Cloud synchronization completed successfully!');
      loadStats();
      triggerRefresh();
    } catch (err: any) {
      showError(err?.message || 'Sync failed. Working in local offline mode.');
    }
  };

  // Connection to existing workspace
  const handleLinkWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkWorkspaceId.trim() || !linkRecoveryKey.trim()) {
      showError('Please supply both the Workspace ID and the Recovery Key.');
      return;
    }

    const confirmLink = window.confirm(
      "WARNING: Connecting to this workspace will replace all your current local browser data with the cloud data from that workspace. Proceed?"
    );
    if (!confirmLink) return;

    setIsLinking(true);
    try {
      await syncManager.connectToWorkspace(linkWorkspaceId.trim(), linkRecoveryKey.trim());
      showSuccess('Successfully linked workspace! All data downloaded from cloud.');
      setLinkWorkspaceId('');
      setLinkRecoveryKey('');
      loadStats();
      triggerRefresh();
    } catch (err: any) {
      showError(err?.message || 'Failed to connect. Double check your keys.');
    } finally {
      setIsLinking(false);
    }
  };

  // Manual Recovery Snapshot creation
  const handleCreateManualBackup = async () => {
    try {
      await syncManager.createAutoBackup('manual');
      setAutoBackups(syncManager.getAutoBackups());
      showSuccess('Self-healing recovery point snapshot recorded in browser local storage!');
    } catch (err) {
      showError('Failed to capture backup snapshot.');
    }
  };

  // Restore rolling backup
  const handleRestoreBackup = async (key: string) => {
    const confirmRestore = window.confirm(
      "Are you sure you want to restore this snapshot? Your current local state will be overwritten (but synchronized to the cloud if newer)."
    );
    if (!confirmRestore) return;

    try {
      await syncManager.restoreAutoBackup(key);
      showSuccess('Local database successfully rolled back to selected recovery point!');
      loadStats();
      triggerRefresh();
    } catch (err) {
      showError('Failed to restore snapshot.');
    }
  };

  // JSON Database file export
  const handleExportDB = async () => {
    try {
      const jsonStr = await db.exportDB();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jnas_workspace_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showSuccess('Database snapshot exported and downloaded as JSON.');
    } catch (err) {
      console.error(err);
      showError('Export failed.');
    }
  };

  // JSON Database file restore
  const handleImportDB = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonStr = event.target?.result as string;
        const parsed = JSON.parse(jsonStr);
        if (!parsed.diary && !parsed.kanban_cards && !parsed.whiteboard) {
          throw new Error('Invalid file format.');
        }

        const confirmRestore = window.confirm(
          "WARNING: Overwriting database with imported JSON file. This replaces your current local state. Proceed?"
        );
        if (!confirmRestore) return;

        await db.importDB(jsonStr);
        loadStats();
        triggerRefresh();
        showSuccess('Workspace database successfully restored from imported JSON backup!');
      } catch (err) {
        console.error(err);
        showError('Invalid JSON file. Please ensure it is a valid JNAS Workspace backup.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
  };

  // Diary Markdown compiled export
  const handleExportMarkdown = async () => {
    try {
      const diaries = await db.getDiaryEntries();
      if (diaries.length === 0) {
        showError('No diaries found to export.');
        return;
      }

      let markdownCompiled = `# JNAS ARCHITECT WORKSPACE — DIARY LOG EXPORT\nGenerated: ${new Date().toLocaleString()}\n\n`;

      diaries.forEach(entry => {
        markdownCompiled += `=========================================\n`;
        markdownCompiled += `## ${entry.title || 'Untitled log'}\n`;
        markdownCompiled += `Created: ${new Date(entry.createdAt).toLocaleString()} | Modified: ${new Date(entry.updatedAt).toLocaleString()}\n\n`;
        markdownCompiled += `${entry.content}\n\n`;
      });

      const blob = new Blob([markdownCompiled], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jnas_diary_compilation_${new Date().toISOString().split('T')[0]}.md`;
      a.click();
      URL.revokeObjectURL(url);
      showSuccess('Diary stream successfully compiled and downloaded as Markdown!');
    } catch (err) {
      console.error(err);
      showError('Failed to compile Markdown logs.');
    }
  };

  // Local state wipe
  const handleClearDB = async () => {
    const doubleConfirm = window.confirm(
      "DANGER: Wiping all local data is permanent. You will lose your diaries, boards, whiteboard drawings, code snippets, and resources. Proceed?"
    );
    if (!doubleConfirm) return;

    try {
      const overwriteStore = async (storeName: string) => {
        return new Promise<void>((resolve, reject) => {
          if (!db['db']) return reject(new Error('DB not loaded'));
          const transaction = db['db'].transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          const request = store.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      };

      await overwriteStore('diary');
      await overwriteStore('kanban_cards');
      await overwriteStore('whiteboard');
      await overwriteStore('resources');
      await overwriteStore('code_snippets');
      await overwriteStore('activities');

      loadStats();
      triggerRefresh();
      showSuccess('All database stores successfully cleared.');
    } catch (err) {
      console.error(err);
      showError('Factory reset failed.');
    }
  };

  // Color matching status indicators
  const getStatusColor = () => {
    switch (syncState.status) {
      case 'idle': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'syncing': return 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse';
      case 'offline': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'error': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-1">
      
      {/* Top Header Card */}
      <div className={`p-6 rounded-2xl border text-left ${
        darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
      }`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Zero-Login Storage & Sync</h1>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Production-ready distributed synchronization system and local-first self-healing database.
            </p>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-mono font-bold uppercase tracking-wider ${getStatusColor()}`}>
            <span className="w-2 h-2 rounded-full bg-current"></span>
            <span>{syncState.status}</span>
          </div>
        </div>
      </div>

      {message && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 rounded-xl text-xs flex items-center gap-2 font-sans animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-xl text-xs flex items-center gap-2 font-sans animate-fade-in">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Grid: Workspace Sync Credentials & Link Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Workspace Credentials Info */}
        <div className={`lg:col-span-2 p-6 rounded-2xl border text-left flex flex-col justify-between ${
          darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2 mb-2">
              <Cloud className="w-4 h-4 text-blue-500" />
              Active Workspace Cloud Binding
            </h2>
            <p className={`text-xs mb-6 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Your devices sync automatically in the background using these unique credentials. Keep them private. No login or registration required.
            </p>

            <div className="space-y-4">
              {/* Workspace ID Block */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono tracking-wider opacity-60">Workspace ID (Private UUID)</label>
                <div className={`flex items-center justify-between p-3 rounded-xl border font-mono text-xs ${
                  darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="truncate pr-4 select-all">{syncState.workspaceId}</span>
                  <button 
                    onClick={() => handleCopy(syncState.workspaceId, 'id')}
                    className={`p-1.5 rounded-lg hover:bg-slate-800 transition text-slate-400 hover:text-white cursor-pointer`}
                    title="Copy Workspace ID"
                  >
                    {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Recovery Key Block */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono tracking-wider opacity-60">Workspace Recovery Key / Passphrase</label>
                <div className={`flex items-center justify-between p-3 rounded-xl border font-mono text-xs ${
                  darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="truncate pr-4 select-all text-blue-400 font-semibold">{syncState.recoveryKey}</span>
                  <button 
                    onClick={() => handleCopy(syncState.recoveryKey, 'key')}
                    className={`p-1.5 rounded-lg hover:bg-slate-800 transition text-slate-400 hover:text-white cursor-pointer`}
                    title="Copy Recovery Key"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="text-[11px] font-mono opacity-50 text-left">
              Last Synced: {syncState.lastSyncedAt ? new Date(syncState.lastSyncedAt).toLocaleString() : 'Never'}
            </div>
            
            <button
              onClick={handleManualSync}
              disabled={syncState.status === 'syncing'}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-xl text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-2 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncState.status === 'syncing' ? 'animate-spin' : ''}`} />
              Sync Now
            </button>
          </div>
        </div>

        {/* Link Another Device Form */}
        <div className={`p-6 rounded-2xl border text-left flex flex-col justify-between ${
          darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2 mb-2">
              <Link2 className="w-4 h-4 text-purple-400" />
              Link Device / Pull Cloud Data
            </h2>
            <p className={`text-xs mb-4 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Connect to an existing workspace on this browser. Input the target Workspace ID and Recovery Key to merge.
            </p>

            <form onSubmit={handleLinkWorkspace} className="space-y-3">
              <input
                type="text"
                placeholder="Paste Target Workspace ID"
                value={linkWorkspaceId}
                onChange={(e) => setLinkWorkspaceId(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                  darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-600 focus:border-blue-500' : 'bg-slate-50 border-slate-200 placeholder-slate-400 focus:border-blue-500'
                } outline-none transition`}
              />

              <input
                type="text"
                placeholder="Paste Target Recovery Key"
                value={linkRecoveryKey}
                onChange={(e) => setLinkRecoveryKey(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                  darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-600 focus:border-blue-500' : 'bg-slate-50 border-slate-200 placeholder-slate-400 focus:border-blue-500'
                } outline-none transition`}
              />

              <button
                type="submit"
                disabled={isLinking}
                className="w-full py-2 bg-slate-950 hover:bg-slate-850 text-white rounded-xl border border-slate-800 hover:border-slate-700 text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-2 shadow-sm"
              >
                {isLinking ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Linking...
                  </>
                ) : (
                  <>
                    <Link2 className="w-3.5 h-3.5" />
                    Connect & Fetch
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="mt-4 text-[10px] leading-relaxed text-slate-500 italic text-left">
            * Warning: Overwrites the local browser state.
          </div>
        </div>

      </div>

      {/* Grid: Self-Healing Backups & Database Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Self-Healing Local Recovery Point Snapshots */}
        <div className={`p-6 rounded-2xl border text-left ${
          darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          <div className="flex justify-between items-center mb-4">
            <div className="space-y-0.5">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-500" />
                Self-Healing Recovery Point Snapshots
              </h2>
              <p className={`text-[11px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Rolling point-in-time recovery saves stored in browser localStorage.
              </p>
            </div>
            <button
              onClick={handleCreateManualBackup}
              className="text-xs bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 px-2.5 py-1.5 rounded-xl text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer transition flex items-center gap-1"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Save Snapshot
            </button>
          </div>

          {autoBackups.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-slate-850 text-center text-xs text-slate-500">
              No local backup snapshots currently stored. Snapshots save automatically before major mergers or linking operations.
            </div>
          ) : (
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {autoBackups.map((backup) => (
                <div key={backup.key} className={`p-3 rounded-xl border flex justify-between items-center gap-4 text-xs font-mono ${
                  darkMode ? 'bg-slate-950/50 border-slate-850 hover:bg-slate-950' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                }`}>
                  <div className="flex items-center gap-2 truncate">
                    <Database className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="font-semibold text-slate-300 truncate text-[11px]">{backup.label}</span>
                  </div>
                  <button
                    onClick={() => handleRestoreBackup(backup.key)}
                    className="px-2.5 py-1 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white rounded-lg text-[10px] font-semibold transition cursor-pointer flex items-center gap-1 font-sans shrink-0 border border-blue-500/15"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Diagnostic Metrics & Manual Operations */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Diagnostic Metrics Card */}
          <div className={`p-6 rounded-2xl border text-left ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <h2 className="text-sm font-bold flex items-center gap-2 mb-1">
              <Database className="w-4 h-4 text-indigo-500" />
              Local IndexedDB Cache
            </h2>
            <p className={`text-[11px] mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Audit diagnostic statistics.
            </p>

            <div className="space-y-2 text-[10px] font-mono">
              <div className="flex justify-between items-center py-1.5 border-b border-dashed border-slate-800">
                <span className="opacity-60">tbl_diary</span>
                <span className="font-bold">{stats.diary} rows</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-dashed border-slate-800">
                <span className="opacity-60">tbl_kanban_cards</span>
                <span className="font-bold">{stats.kanban_cards} rows</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-dashed border-slate-800">
                <span className="opacity-60">tbl_whiteboard</span>
                <span className="font-bold">{stats.whiteboard} rows</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-dashed border-slate-800">
                <span className="opacity-60">tbl_resources</span>
                <span className="font-bold">{stats.resources} rows</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-dashed border-slate-800">
                <span className="opacity-60">tbl_snippets</span>
                <span className="font-bold">{stats.code_snippets} rows</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="opacity-60">tbl_activities</span>
                <span className="font-bold">{stats.activities} rows</span>
              </div>
            </div>
          </div>

          {/* Export / Destructive Card */}
          <div className={`p-6 rounded-2xl border text-left flex flex-col justify-between ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="space-y-1">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <Download className="w-4 h-4 text-indigo-500" />
                Diagnostics Toolkit
              </h2>
              <p className={`text-[11px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Offline file imports, Markdown exports, and factory resets.
              </p>
            </div>

            <div className="space-y-2 text-xs pt-4">
              <button
                onClick={handleExportDB}
                className="w-full py-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white rounded-xl text-center font-semibold cursor-pointer transition flex justify-center items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Backup JSON
              </button>

              <button
                onClick={handleExportMarkdown}
                className="w-full py-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white rounded-xl text-center font-semibold cursor-pointer transition flex justify-center items-center gap-1.5"
              >
                <FileDown className="w-3.5 h-3.5 text-emerald-500" />
                Compile Diary MD
              </button>

              <div className="relative">
                <input
                  type="file"
                  id="diagnostics-restore"
                  accept=".json"
                  onChange={handleImportDB}
                  className="hidden"
                />
                <label
                  htmlFor="diagnostics-restore"
                  className="w-full py-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 text-slate-300 hover:text-white rounded-xl font-semibold cursor-pointer transition flex justify-center items-center gap-1.5 text-center text-xs"
                >
                  <Upload className="w-3.5 h-3.5 text-purple-400" />
                  Restore JSON
                </label>
              </div>

              <button
                onClick={handleClearDB}
                className="w-full py-2 bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/10 rounded-xl text-center font-semibold cursor-pointer transition flex justify-center items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Factory Reset
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
