import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  Trash2, 
  Cloud, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle,
  FileDown,
  Copy,
  Check,
  Link2,
  Clock,
  RotateCcw,
  PlusCircle,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  QrCode,
  Shield,
  FileKey,
  Camera,
  X,
  History,
  CheckCircle
} from 'lucide-react';
import { db } from '../db';
import { syncManager, SyncState } from '../syncManager';
import {
  hashPassword,
  encryptData,
  decryptData,
  logSecurityEvent,
  getSecurityAuditLogs,
  clearSecurityAuditLogs,
  AuditLogEntry
} from '../cryptoUtils';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

interface StorageSyncProps {
  darkMode: boolean;
  triggerRefresh: () => void;
}

export default function StorageSync({ darkMode, triggerRefresh }: StorageSyncProps) {
  // Stats & States
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

  // Master Password States
  const [isPasswordRegistered, setIsPasswordRegistered] = useState<boolean>(false);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  
  // Registration Form
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  
  // Unlock Form
  const [unlockPassword, setUnlockPassword] = useState('');
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  // Decrypted Credentials (cleared from memory on lock)
  const [unlockedId, setUnlockedId] = useState('');
  const [unlockedKey, setUnlockedKey] = useState('');
  
  // Reveal toggles
  const [showCredentialsRaw, setShowCredentialsRaw] = useState(false);
  
  // Auto-hide countdown
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<any>(null);

  // QR Code States
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);

  // Camera QR Scanning States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const scanAnimationRef = useRef<number | null>(null);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Password Verification for Destructive Tasks
  const [confirmPasswordAction, setConfirmPasswordAction] = useState<(() => void) | null>(null);
  const [destructivePasswordInput, setDestructivePasswordInput] = useState('');
  const [showDestructiveUnlock, setShowDestructiveUnlock] = useState(false);

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

  // Refresh and check password status
  useEffect(() => {
    loadStats();
    setAutoBackups(syncManager.getAutoBackups());
    setAuditLogs(getSecurityAuditLogs());

    const hasPassword = !!localStorage.getItem('jnas_master_password_hash');
    setIsPasswordRegistered(hasPassword);

    // Subscribe to syncManager
    const unsubscribe = syncManager.subscribe((state) => {
      setSyncState(state);
    });

    return () => unsubscribe();
  }, []);

  // Window/Document blur & focus locks (Session Security)
  useEffect(() => {
    const handleLockOnBlur = () => {
      if (isUnlocked) {
        lockCredentials('Auto-Lock: Tab Blurred / Focus Lost');
      }
    };

    const handleLockOnVisibilityChange = () => {
      if (document.hidden && isUnlocked) {
        lockCredentials('Auto-Lock: Screen Minimized / Hidden');
      }
    };

    window.addEventListener('blur', handleLockOnBlur);
    document.addEventListener('visibilitychange', handleLockOnVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleLockOnBlur);
      document.removeEventListener('visibilitychange', handleLockOnVisibilityChange);
    };
  }, [isUnlocked]);

  // Lock and clean memories
  const lockCredentials = (reason = 'Credentials Locked') => {
    setUnlockedId('');
    setUnlockedKey('');
    setIsUnlocked(false);
    setShowCredentialsRaw(false);
    setQrCodeDataUrl('');
    setShowQrModal(false);
    setCountdown(null);
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }
    showSuccess(reason);
    logSecurityEvent(reason);
  };

  // Handle countdown for Auto Hide
  useEffect(() => {
    if (isUnlocked) {
      setCountdown(45); // 45 seconds countdown
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
      countdownTimerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(countdownTimerRef.current);
            lockCredentials('Auto-Lock: Idle Timeout (45s)');
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setCountdown(null);
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    }

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [isUnlocked]);

  const showSuccess = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4500);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 4500);
  };

  const handleCopy = (text: string, type: 'id' | 'key') => {
    if (!isUnlocked) {
      showError('Please unlock with Master Password to copy.');
      return;
    }
    navigator.clipboard.writeText(text);
    if (type === 'id') {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
    showSuccess(`Copied ${type === 'id' ? 'Workspace ID' : 'Recovery Key'} to clipboard!`);
    logSecurityEvent(`Credential Copied: ${type === 'id' ? 'Workspace ID' : 'Recovery Key'}`);
  };

  // Setup Master Password
  const handleRegisterPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword.length < 6) {
      showError('Master Password must be at least 6 characters.');
      return;
    }
    if (regPassword !== regConfirm) {
      showError('Passwords do not match.');
      return;
    }

    try {
      const hashed = await hashPassword(regPassword);
      localStorage.setItem('jnas_master_password_hash', hashed);
      setIsPasswordRegistered(true);
      setRegPassword('');
      setRegConfirm('');
      showSuccess('JNAS Master Password successfully initialized!');
      await logSecurityEvent('Master Password Initialized');
      setAuditLogs(getSecurityAuditLogs());
    } catch (err) {
      showError('Failed to initialize password.');
    }
  };

  // Unlock credentials
  const handleUnlockCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const storedHash = localStorage.getItem('jnas_master_password_hash');
      if (!storedHash) {
        showError('No Master Password configured.');
        return;
      }

      const inputHash = await hashPassword(unlockPassword);
      if (inputHash === storedHash) {
        // Correct Password
        const creds = syncManager.getCredentials();
        setUnlockedId(creds.workspaceId);
        setUnlockedKey(creds.recoveryKey);
        setIsUnlocked(true);
        setUnlockPassword('');
        setShowUnlockModal(false);
        showSuccess('Credentials unlocked successfully. Active for 45s.');
        await logSecurityEvent('Credential Viewed');
        setAuditLogs(getSecurityAuditLogs());
      } else {
        showError('Incorrect Master Password');
        await logSecurityEvent('Failed Unlock Attempt');
        setAuditLogs(getSecurityAuditLogs());
      }
    } catch (err) {
      showError('Verification failed.');
    }
  };

  // Force Master Password verification for high-risk operations
  const triggerPasswordChallenge = (action: () => void) => {
    setConfirmPasswordAction(() => action);
    setDestructivePasswordInput('');
    setShowDestructiveUnlock(true);
  };

  const handleConfirmDestructiveAction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const storedHash = localStorage.getItem('jnas_master_password_hash');
      const inputHash = await hashPassword(destructivePasswordInput);
      
      if (inputHash === storedHash) {
        setShowDestructiveUnlock(false);
        setDestructivePasswordInput('');
        if (confirmPasswordAction) {
          confirmPasswordAction();
        }
      } else {
        showError('Incorrect Master Password. Action aborted.');
        setShowDestructiveUnlock(false);
        setDestructivePasswordInput('');
      }
    } catch (err) {
      showError('Verification failed.');
    }
  };

  // Regenerate Recovery Key
  const handleRegenerateKey = () => {
    triggerPasswordChallenge(async () => {
      try {
        const newKey = syncManager.regenerateRecoveryKey();
        if (isUnlocked) {
          setUnlockedKey(newKey);
        }
        showSuccess('Recovery key regenerated and updated!');
        await logSecurityEvent('Recovery Key Regenerated');
        setAuditLogs(getSecurityAuditLogs());
      } catch (err) {
        showError('Regeneration failed.');
      }
    });
  };

  // Generate connection QR Code (Combined JSON)
  const handleGenerateQrCode = async () => {
    if (!isUnlocked) {
      showError('Please unlock with Master Password to generate QR.');
      return;
    }
    try {
      const data = JSON.stringify({
        workspaceId: unlockedId,
        recoveryKey: unlockedKey
      });
      const dataUrl = await QRCode.toDataURL(data, {
        margin: 1,
        width: 320,
        color: {
          dark: '#0f172a', // Slate 900
          light: '#f8fafc' // Slate 50
        }
      });
      setQrCodeDataUrl(dataUrl);
      setShowQrModal(true);
      logSecurityEvent('QR Code Generated');
      setAuditLogs(getSecurityAuditLogs());
    } catch (err) {
      showError('QR Code generation failed.');
    }
  };

  // Export Encrypted Recovery Package (AES-GCM)
  const handleExportRecoveryPackage = () => {
    if (!isUnlocked) {
      showError('Please unlock credentials to export recovery package.');
      return;
    }

    triggerPasswordChallenge(async () => {
      try {
        // Payload containing sensitive credentials
        const payload = JSON.stringify({
          workspaceId: unlockedId,
          recoveryKey: unlockedKey
        });

        // Use the actual master password entered in the challenge to encrypt the package
        const storedHash = localStorage.getItem('jnas_master_password_hash');
        if (!storedHash) return;

        // Encrypt the credentials payload
        const encryptedCiphertext = await encryptData(payload, destructivePasswordInput);

        const recoveryPackage = {
          databaseVersion: '1.0.0',
          syncMetadata: {
            lastSyncedAt: syncState.lastSyncedAt,
            lastModifiedAt: syncState.lastModifiedAt
          },
          recoveryTimestamp: new Date().toISOString(),
          packageCiphertext: encryptedCiphertext
        };

        const blob = new Blob([JSON.stringify(recoveryPackage, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jnas_secure_recovery_${new Date().toISOString().split('T')[0]}.jnas`;
        a.click();
        URL.revokeObjectURL(url);
        
        showSuccess('Secure Encrypted Recovery Package (.jnas) downloaded successfully!');
        await logSecurityEvent('Recovery Package Exported');
        setAuditLogs(getSecurityAuditLogs());
      } catch (err) {
        showError('Encryption or package export failed.');
      }
    });
  };

  // Import Encrypted Recovery Package (.jnas)
  const [encryptedFileToImport, setEncryptedFileToImport] = useState<any>(null);
  const [importPassword, setImportPassword] = useState('');
  const [showImportPasswordModal, setShowImportPasswordModal] = useState(false);

  const handleImportEncryptedFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawJson = event.target?.result as string;
        const parsed = JSON.parse(rawJson);
        if (!parsed.packageCiphertext) {
          throw new Error('This file is not a valid JNAS encrypted recovery package.');
        }
        setEncryptedFileToImport(parsed);
        setShowImportPasswordModal(true);
      } catch (err: any) {
        showError(err?.message || 'Invalid file structure.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDecryptAndImportPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!encryptedFileToImport || !importPassword) return;

    try {
      // Decrypt packageCiphertext using the specified password
      const decryptedString = await decryptData(encryptedFileToImport.packageCiphertext, importPassword);
      const parsedCreds = JSON.parse(decryptedString);

      if (parsedCreds.workspaceId && parsedCreds.recoveryKey) {
        setLinkWorkspaceId(parsedCreds.workspaceId);
        setLinkRecoveryKey(parsedCreds.recoveryKey);
        setShowImportPasswordModal(false);
        setImportPassword('');
        setEncryptedFileToImport(null);
        showSuccess('Encrypted recovery package successfully decrypted! Credentials loaded into form.');
        await logSecurityEvent('Recovery Package Decrypted & Imported');
        setAuditLogs(getSecurityAuditLogs());
      } else {
        showError('Decrypted data is corrupt or missing credentials.');
      }
    } catch (err) {
      showError('Decryption failed. Incorrect master password.');
    }
  };

  // Upload static QR Image file and decode instantly
  const handleQrCodeImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(image, 0, 0);
          const imageData = ctx.getImageData(0, 0, image.width, image.height);
          const decoded = jsQR(imageData.data, imageData.width, imageData.height);
          if (decoded) {
            try {
              const parsed = JSON.parse(decoded.data);
              if (parsed.workspaceId && parsed.recoveryKey) {
                setLinkWorkspaceId(parsed.workspaceId);
                setLinkRecoveryKey(parsed.recoveryKey);
                showSuccess('Successfully parsed QR Code! Credentials populated.');
                logSecurityEvent('QR Code Image Decoded');
                setAuditLogs(getSecurityAuditLogs());
              } else {
                showError('QR Code is valid but does not contain workspace details.');
              }
            } catch (err) {
              showError('Invalid QR Code format.');
            }
          } else {
            showError('Could not detect any QR Code in that image. Try another.');
          }
        }
      };
      image.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Live Camera Scanner loop
  const startCameraScan = async () => {
    setCameraError('');
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true'); // Required for iOS
        videoRef.current.play();
        scanAnimationRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err) {
      setCameraError('Webcam access was denied or is unavailable.');
      setIsCameraActive(false);
    }
  };

  const stopCameraScan = () => {
    setIsCameraActive(false);
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    }
    if (scanAnimationRef.current) {
      cancelAnimationFrame(scanAnimationRef.current);
      scanAnimationRef.current = null;
    }
  };

  const scanFrame = () => {
    if (!isCameraActive || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = jsQR(imageData.data, imageData.width, imageData.height);

      if (decoded) {
        try {
          const parsed = JSON.parse(decoded.data);
          if (parsed.workspaceId && parsed.recoveryKey) {
            setLinkWorkspaceId(parsed.workspaceId);
            setLinkRecoveryKey(parsed.recoveryKey);
            showSuccess('QR Code successfully scanned via Camera!');
            stopCameraScan();
            logSecurityEvent('Camera QR Scan Successful');
            setAuditLogs(getSecurityAuditLogs());
            return;
          }
        } catch (err) {
          // Keep scanning
        }
      }
    }
    scanAnimationRef.current = requestAnimationFrame(scanFrame);
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

    triggerPasswordChallenge(async () => {
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
        await logSecurityEvent('Device Linked');
        setAuditLogs(getSecurityAuditLogs());
      } catch (err: any) {
        showError(err?.message || 'Failed to connect. Double check your keys.');
      } finally {
        setIsLinking(false);
      }
    });
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
    triggerPasswordChallenge(async () => {
      const confirmRestore = window.confirm(
        "Are you sure you want to restore this snapshot? Your current local state will be overwritten (but synchronized to the cloud if newer)."
      );
      if (!confirmRestore) return;

      try {
        await syncManager.restoreAutoBackup(key);
        showSuccess('Local database successfully rolled back to selected recovery point!');
        loadStats();
        triggerRefresh();
        await logSecurityEvent('Recovery Restored');
        setAuditLogs(getSecurityAuditLogs());
      } catch (err) {
        showError('Failed to restore snapshot.');
      }
    });
  };

  // JSON Database file export
  const handleExportDB = async () => {
    triggerPasswordChallenge(async () => {
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
        await logSecurityEvent('DB Exported');
        setAuditLogs(getSecurityAuditLogs());
      } catch (err) {
        console.error(err);
        showError('Export failed.');
      }
    });
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

        triggerPasswordChallenge(async () => {
          const confirmRestore = window.confirm(
            "WARNING: Overwriting database with imported JSON file. This replaces your current local state. Proceed?"
          );
          if (!confirmRestore) return;

          await db.importDB(jsonStr);
          loadStats();
          triggerRefresh();
          showSuccess('Workspace database successfully restored from imported JSON backup!');
          await logSecurityEvent('DB Imported');
          setAuditLogs(getSecurityAuditLogs());
        });
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
    triggerPasswordChallenge(async () => {
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
        await logSecurityEvent('Factory Reset Executed');
        setAuditLogs(getSecurityAuditLogs());
      } catch (err) {
        console.error(err);
        showError('Factory reset failed.');
      }
    });
  };

  const handleClearAuditLogs = () => {
    triggerPasswordChallenge(() => {
      clearSecurityAuditLogs();
      setAuditLogs([]);
      showSuccess('Security audit logs successfully cleared.');
    });
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

  // If Master Password is not registered, force setup first
  if (!isPasswordRegistered) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-left">
        <div className={`p-8 rounded-3xl border shadow-xl space-y-6 ${
          darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600/10 rounded-2xl text-indigo-500">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Set Up JNAS Master Password</h1>
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Configure local-only cryptographic authorization.
              </p>
            </div>
          </div>

          <div className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-2 ${
            darkMode ? 'bg-slate-950/50 border-slate-850 text-slate-400' : 'bg-slate-50 border-slate-250 text-slate-500'
          }`}>
            <p className="font-semibold text-slate-300">Why do I need a Master Password?</p>
            <p>
              Your Workspace ID and Recovery Key synchronize your encrypted diaries, kanban cards, and code snippets to the secure server.
            </p>
            <p>
              To prevent unauthorized physical access on this machine, sensitive credentials and backups are locked. This password is hashed and checked strictly on your device.
            </p>
          </div>

          <form onSubmit={handleRegisterPassword} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-mono tracking-wider opacity-60">JNAS Master Password</label>
              <input
                type="password"
                placeholder="Minimum 6 characters"
                value={regPassword}
                onChange={e => setRegPassword(e.target.value)}
                autoComplete="new-password"
                className={`w-full px-4 py-3 rounded-2xl text-sm border ${
                  darkMode ? 'bg-slate-950 border-slate-800 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-250 text-slate-800 focus:border-blue-500'
                } outline-none transition`}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-mono tracking-wider opacity-60">Confirm Password</label>
              <input
                type="password"
                placeholder="Re-enter password"
                value={regConfirm}
                onChange={e => setRegConfirm(e.target.value)}
                autoComplete="new-password"
                className={`w-full px-4 py-3 rounded-2xl text-sm border ${
                  darkMode ? 'bg-slate-950 border-slate-800 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-250 text-slate-800 focus:border-blue-500'
                } outline-none transition`}
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-semibold text-sm transition shadow-lg cursor-pointer"
            >
              Initialize Master Password
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-1">
      
      {/* Top Header Card */}
      <div className={`p-6 rounded-2xl border text-left ${
        darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
      }`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-400" />
              <h1 className="text-2xl font-bold tracking-tight">Secure Storage & Sync</h1>
            </div>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Production-grade zero-login synchronization console locked by JNAS Master Password.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-mono font-bold uppercase tracking-wider ${getStatusColor()}`}>
              <span className="w-2 h-2 rounded-full bg-current"></span>
              <span>{syncState.status}</span>
            </div>
            {isUnlocked && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-mono font-bold">
                <Clock className="w-3.5 h-3.5 animate-pulse" />
                <span>UNLOCKED ({countdown}s)</span>
              </div>
            )}
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
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <Cloud className="w-4 h-4 text-blue-500" />
                Active Workspace Cloud Binding
              </h2>
              {!isUnlocked ? (
                <button
                  onClick={() => setShowUnlockModal(true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[11px] font-bold cursor-pointer transition flex items-center gap-1.5 shadow-md"
                >
                  <Lock className="w-3.5 h-3.5" />
                  View Storage Credentials
                </button>
              ) : (
                <button
                  onClick={() => lockCredentials('Credentials Locked Manually')}
                  className="px-3 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-xl text-[11px] font-bold cursor-pointer border border-slate-850 transition flex items-center gap-1.5"
                >
                  <Unlock className="w-3.5 h-3.5 text-amber-500" />
                  Lock Credentials
                </button>
              )}
            </div>
            <p className={`text-xs mb-6 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Your devices sync automatically in the background using these credentials. Keep them private. Unlock to copy, export, or generate connection QR codes.
            </p>

            <div className="space-y-4">
              {/* Workspace ID Block */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono tracking-wider opacity-60">Workspace ID (Private UUID)</label>
                <div className={`flex items-center justify-between p-3 rounded-xl border font-mono text-xs ${
                  darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="truncate pr-4 select-all tracking-wider font-semibold">
                    {isUnlocked ? unlockedId : '------------------------------------'}
                  </span>
                  
                  <div className="flex items-center gap-1 shrink-0">
                    {isUnlocked && (
                      <button 
                        onClick={() => handleCopy(unlockedId, 'id')}
                        className={`p-1.5 rounded-lg hover:bg-slate-800 transition text-slate-400 hover:text-white cursor-pointer`}
                        title="Copy Workspace ID"
                      >
                        {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Recovery Key Block */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono tracking-wider opacity-60">Workspace Recovery Key</label>
                <div className={`flex items-center justify-between p-3 rounded-xl border font-mono text-xs ${
                  darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className={`truncate pr-4 select-all font-semibold ${isUnlocked ? 'text-blue-400' : ''}`}>
                    {isUnlocked 
                      ? (showCredentialsRaw ? unlockedKey : '••••••••••••••••') 
                      : '----------------'}
                  </span>
                  
                  <div className="flex items-center gap-1 shrink-0">
                    {isUnlocked && (
                      <>
                        <button 
                          onClick={() => setShowCredentialsRaw(!showCredentialsRaw)}
                          className="p-1.5 rounded-lg hover:bg-slate-800 transition text-slate-400 hover:text-white cursor-pointer"
                          title={showCredentialsRaw ? "Hide Raw Value" : "Reveal Raw Value"}
                        >
                          {showCredentialsRaw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button 
                          onClick={() => handleCopy(unlockedKey, 'key')}
                          className="p-1.5 rounded-lg hover:bg-slate-800 transition text-slate-400 hover:text-white cursor-pointer"
                          title="Copy Recovery Key"
                        >
                          {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="mt-6 pt-4 border-t border-slate-850 flex flex-wrap gap-2 justify-between items-center">
            <div className="text-[11px] font-mono opacity-50 text-left">
              Last Synced: {syncState.lastSyncedAt ? new Date(syncState.lastSyncedAt).toLocaleString() : 'Never'}
            </div>
            
            <div className="flex flex-wrap gap-2">
              {isUnlocked && (
                <>
                  <button
                    onClick={handleGenerateQrCode}
                    className="px-3 py-2 bg-slate-950 hover:bg-slate-850 text-white rounded-xl text-xs font-semibold cursor-pointer border border-slate-800 hover:border-slate-700 transition flex items-center gap-1.5 shadow-sm"
                  >
                    <QrCode className="w-3.5 h-3.5 text-blue-400" />
                    Generate QR
                  </button>

                  <button
                    onClick={handleRegenerateKey}
                    className="px-3 py-2 bg-slate-950 hover:bg-slate-850 text-white rounded-xl text-xs font-semibold cursor-pointer border border-slate-800 hover:border-slate-700 transition flex items-center gap-1.5 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                    Regenerate Key
                  </button>

                  <button
                    onClick={handleExportRecoveryPackage}
                    className="px-3 py-2 bg-slate-950 hover:bg-slate-850 text-white rounded-xl text-xs font-semibold cursor-pointer border border-slate-800 hover:border-slate-700 transition flex items-center gap-1.5 shadow-sm"
                  >
                    <FileKey className="w-3.5 h-3.5 text-indigo-400" />
                    Export Recovery
                  </button>
                </>
              )}

              <button
                onClick={handleManualSync}
                disabled={syncState.status === 'syncing'}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-xl text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-2 shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncState.status === 'syncing' ? 'animate-spin' : ''}`} />
                Sync Now
              </button>
            </div>
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
              Connect to an existing workspace. Paste keys, scan a QR image, scan via camera, or import a secure recovery file.
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
                type="password"
                placeholder="Paste Target Recovery Key"
                value={linkRecoveryKey}
                onChange={(e) => setLinkRecoveryKey(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border font-mono ${
                  darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-600 focus:border-blue-500' : 'bg-slate-50 border-slate-200 placeholder-slate-400 focus:border-blue-500'
                } outline-none transition`}
              />

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isLinking}
                  className="flex-1 py-2 bg-slate-950 hover:bg-slate-850 text-white rounded-xl border border-slate-800 hover:border-slate-700 text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-2 shadow-sm"
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
              </div>
            </form>

            <div className="mt-4 pt-3 border-t border-slate-850 space-y-2">
              <label className="text-[9px] uppercase font-mono tracking-wider opacity-60 block">Advanced Imports</label>
              
              <div className="grid grid-cols-2 gap-2">
                {/* QR Code camera scan / image file scan */}
                <div className="relative">
                  <input
                    type="file"
                    id="link-qr-upload"
                    accept="image/*"
                    onChange={handleQrCodeImageUpload}
                    className="hidden"
                  />
                  <label
                    htmlFor="link-qr-upload"
                    className="w-full py-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 text-slate-300 hover:text-white rounded-xl text-center font-semibold cursor-pointer transition flex justify-center items-center gap-1.5 text-[10px]"
                  >
                    <QrCode className="w-3 h-3 text-blue-400" />
                    QR Image
                  </label>
                </div>

                <button
                  onClick={isCameraActive ? stopCameraScan : startCameraScan}
                  className="py-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 text-slate-300 hover:text-white rounded-xl text-center font-semibold cursor-pointer transition flex justify-center items-center gap-1.5 text-[10px]"
                >
                  <Camera className="w-3 h-3 text-purple-400" />
                  {isCameraActive ? 'Stop Cam' : 'Webcam Scan'}
                </button>
              </div>

              {/* Secure encrypted package import */}
              <div className="relative">
                <input
                  type="file"
                  id="link-jnas-import"
                  accept=".jnas,.json"
                  onChange={handleImportEncryptedFileSelect}
                  className="hidden"
                />
                <label
                  htmlFor="link-jnas-import"
                  className="w-full py-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 text-slate-300 hover:text-white rounded-xl text-center font-semibold cursor-pointer transition flex justify-center items-center gap-1.5 text-[11px]"
                >
                  <FileKey className="w-3.5 h-3.5 text-indigo-400" />
                  Import Encrypted Recovery (.jnas)
                </label>
              </div>
            </div>

            {/* Webcam Live Stream container */}
            {isCameraActive && (
              <div className="mt-4 p-3 rounded-2xl border border-indigo-500/25 bg-indigo-950/20 text-center space-y-3 relative overflow-hidden">
                <button 
                  onClick={stopCameraScan}
                  className="absolute top-2 right-2 p-1 bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-full transition cursor-pointer z-10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] uppercase font-mono tracking-wider text-indigo-400 block font-semibold animate-pulse">Scanning with live camera...</span>
                <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-850 bg-slate-950">
                  <video ref={videoRef} className="w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                  {/* Visual scanning line */}
                  <div className="absolute left-0 right-0 h-0.5 bg-indigo-500/80 animate-bounce top-1/2"></div>
                </div>
              </div>
            )}
            {cameraError && (
              <p className="text-rose-400 text-[10px] mt-1.5 text-left">{cameraError}</p>
            )}
          </div>

          <div className="mt-4 text-[10px] leading-relaxed text-slate-500 italic text-left">
            * Linking overwrites local browser state. Always secure a backup.
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

        {/* Diagnostics & Offline Toolkit */}
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
              <div className="flex justify-between items-center py-1.5 border-b border-dashed border-slate-850">
                <span className="opacity-60">tbl_diary</span>
                <span className="font-bold">{stats.diary} rows</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-dashed border-slate-850">
                <span className="opacity-60">tbl_kanban_cards</span>
                <span className="font-bold">{stats.kanban_cards} rows</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-dashed border-slate-850">
                <span className="opacity-60">tbl_whiteboard</span>
                <span className="font-bold">{stats.whiteboard} rows</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-dashed border-slate-850">
                <span className="opacity-60">tbl_resources</span>
                <span className="font-bold">{stats.resources} rows</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-dashed border-slate-850">
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
                Offline backups, Markdown compilers, and factory resets.
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

      {/* Security Audit Trail Component */}
      <div className={`p-6 rounded-2xl border text-left ${
        darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
      }`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-400" />
              Security Audit Trail Logs
            </h2>
            <p className={`text-[11px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Decentralized offline security events monitored on this machine.
            </p>
          </div>
          <button
            onClick={handleClearAuditLogs}
            className="text-xs border border-rose-500/10 bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer"
          >
            Clear Audit Trail
          </button>
        </div>

        {auditLogs.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-slate-850 text-center text-xs text-slate-500">
            No security logging trail found yet. Credentials actions are fully audited.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-850">
            <table className="w-full text-left border-collapse text-[11px] font-mono">
              <thead>
                <tr className={`${darkMode ? 'bg-slate-950/80' : 'bg-slate-50'} border-b border-slate-850 text-slate-400 uppercase font-bold tracking-wider`}>
                  <th className="p-3">Action</th>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Device</th>
                  <th className="p-3">Browser</th>
                  <th className="p-3">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {auditLogs.map((log) => (
                  <tr key={log.id} className={darkMode ? 'hover:bg-slate-950/30' : 'hover:bg-slate-50'}>
                    <td className="p-3 font-semibold text-slate-300 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                      {log.action}
                    </td>
                    <td className="p-3 text-slate-400">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="p-3 text-slate-450">{log.device}</td>
                    <td className="p-3 text-slate-450">{log.browser}</td>
                    <td className="p-3 text-slate-400">{log.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 1. Modal: Enter Master Password to Unlock Credentials */}
      {showUnlockModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-4 text-left ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold">Authenticate with JNAS</h3>
              </div>
              <button 
                onClick={() => setShowUnlockModal(false)}
                className="p-1 hover:bg-slate-800/20 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <p className="text-xs text-slate-400 leading-relaxed">
              Verify your local JNAS Master Password to reveal workspace keys and enable copy/export actions.
            </p>

            <form onSubmit={handleUnlockCredentials} className="space-y-4">
              <input
                type="password"
                placeholder="Enter Master Password"
                value={unlockPassword}
                onChange={e => setUnlockPassword(e.target.value)}
                autoFocus
                className={`w-full px-3 py-2.5 rounded-xl text-xs border ${
                  darkMode ? 'bg-slate-950 border-slate-800 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-blue-500'
                } outline-none transition`}
                required
              />

              <div className="flex justify-end gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setShowUnlockModal(false)}
                  className="px-4 py-2 bg-slate-850 hover:bg-slate-800 rounded-xl transition text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition shadow-md cursor-pointer"
                >
                  Verify & Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal: Destructive Action Password Challenge */}
      {showDestructiveUnlock && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className={`w-full max-w-md p-6 rounded-3xl border border-rose-500/30 shadow-2xl space-y-4 text-left ${
            darkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'
          }`}>
            <div className="flex items-center gap-2 text-rose-500">
              <Lock className="w-5 h-5 shrink-0 animate-pulse" />
              <h3 className="text-sm font-bold uppercase tracking-wider font-mono">Security Challenge Required</h3>
            </div>
            
            <p className="text-xs text-slate-400 leading-relaxed">
              You are executing a high-risk operation. Enter your JNAS Master Password to authorize.
            </p>

            <form onSubmit={handleConfirmDestructiveAction} className="space-y-4">
              <input
                type="password"
                placeholder="Enter JNAS Master Password"
                value={destructivePasswordInput}
                onChange={e => setDestructivePasswordInput(e.target.value)}
                autoFocus
                className="w-full px-3 py-2.5 rounded-xl text-xs border bg-slate-950 border-rose-500/20 text-white focus:border-rose-500 outline-none transition font-mono"
                required
              />

              <div className="flex justify-end gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setShowDestructiveUnlock(false);
                    setDestructivePasswordInput('');
                    setConfirmPasswordAction(null);
                  }}
                  className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-xl cursor-pointer"
                >
                  Abort Action
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-md cursor-pointer"
                >
                  Authorize Action
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal: QR Code Display */}
      {showQrModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-sm p-6 rounded-3xl border shadow-2xl text-center space-y-4 ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="flex justify-between items-center text-left">
              <h3 className="text-sm font-bold flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-blue-500" />
                Connection QR Code
              </h3>
              <button 
                onClick={() => setShowQrModal(false)}
                className="p-1 hover:bg-slate-800/20 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 text-left leading-relaxed">
              Scan this QR code from another device to automatically link workspaces without typing keys. Keep this QR code strictly private.
            </p>

            <div className={`p-4 rounded-2xl inline-block border ${darkMode ? 'bg-slate-950 border-slate-850' : 'bg-slate-50'}`}>
              {qrCodeDataUrl ? (
                <img src={qrCodeDataUrl} alt="Workspace Credentials QR" className="w-56 h-56 mx-auto rounded-lg select-none" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-slate-500" />
                </div>
              )}
            </div>

            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-white rounded-xl text-xs font-semibold cursor-pointer transition shadow-sm"
            >
              Close QR Code
            </button>
          </div>
        </div>
      )}

      {/* 4. Modal: Decrypt Imported Recovery Package Password Prompt */}
      {showImportPasswordModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-4 text-left ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center gap-2 text-indigo-400">
              <FileKey className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold">Decrypt Secure Recovery Package</h3>
            </div>
            
            <p className="text-xs text-slate-400 leading-relaxed">
              Enter the JNAS Master Password that was used to encrypt this backup package in order to restore credentials.
            </p>

            <form onSubmit={handleDecryptAndImportPackage} className="space-y-4">
              <input
                type="password"
                placeholder="Enter Decryption Password"
                value={importPassword}
                onChange={e => setImportPassword(e.target.value)}
                autoFocus
                className={`w-full px-3 py-2.5 rounded-xl text-xs border ${
                  darkMode ? 'bg-slate-950 border-slate-800 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-blue-500'
                } outline-none transition`}
                required
              />

              <div className="flex justify-end gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportPasswordModal(false);
                    setImportPassword('');
                    setEncryptedFileToImport(null);
                  }}
                  className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md cursor-pointer"
                >
                  Decrypt & Load
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
