// JNAS Security Cryptography and Audit Utility Module

// SHA-256 password hashing for secure local verification
export async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate key using PBKDF2
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// AES-GCM Encrypt Data using Master Password
export async function encryptData(data: string, password: string): Promise<string> {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    
    const enc = new TextEncoder();
    const encryptedContent = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      enc.encode(data)
    );

    const encryptedUint8 = new Uint8Array(encryptedContent);
    
    // Structure: salt (16 bytes) | iv (12 bytes) | ciphertext (remaining)
    const combined = new Uint8Array(salt.length + iv.length + encryptedUint8.length);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(encryptedUint8, salt.length + iv.length);

    // Convert to Base64
    return btoa(String.fromCharCode(...Array.from(combined)));
  } catch (err) {
    console.error('Encryption failed:', err);
    throw new Error('Encryption failed. Please check password and system capabilities.');
  }
}

// AES-GCM Decrypt Data using Master Password
export async function decryptData(encryptedBase64: string, password: string): Promise<string> {
  try {
    const binaryString = atob(encryptedBase64);
    const combined = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      combined[i] = binaryString.charCodeAt(i);
    }

    if (combined.length < 28) {
      throw new Error('Malformed encrypted package.');
    }

    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);

    const key = await deriveKey(password, salt);
    const decryptedContent = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decryptedContent);
  } catch (err) {
    console.error('Decryption failed:', err);
    throw new Error('Decryption failed. Incorrect master password or corrupted recovery file.');
  }
}

// Interfaces for Audit Logs
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  device: string;
  browser: string;
  ip: string;
}

// Get basic device heuristics (mobile, tablet, desktop)
export function getDeviceInfo(): string {
  const width = window.innerWidth;
  const userAgent = navigator.userAgent;
  let deviceType = 'Desktop';
  if (/Mobi|Android|iPhone/i.test(userAgent)) {
    deviceType = 'Mobile';
  } else if (/Tablet|iPad/i.test(userAgent)) {
    deviceType = 'Tablet';
  } else if (width < 768) {
    deviceType = 'Mobile';
  } else if (width < 1024) {
    deviceType = 'Tablet';
  }
  return deviceType;
}

// Extract human-readable browser details from user agent
export function getBrowserInfo(): string {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Firefox')) {
    return 'Firefox';
  } else if (userAgent.includes('Chrome') && !userAgent.includes('Chromium')) {
    return 'Chrome';
  } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    return 'Safari';
  } else if (userAgent.includes('Edge')) {
    return 'Edge';
  } else if (userAgent.includes('Trident')) {
    return 'Internet Explorer';
  }
  return 'Modern Browser';
}

// IP Fetching utility (using non-blocking async fetching)
let cachedIp: string = '';
export async function getIpAddress(): Promise<string> {
  if (cachedIp) return cachedIp;
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      cachedIp = data.ip || 'Local Network';
      return cachedIp;
    }
  } catch (e) {
    // Fail silently, return offline/local address
  }
  return 'Local/Offline';
}

// Write a new entry to the security audit logs in localStorage
export async function logSecurityEvent(action: string): Promise<void> {
  try {
    const ip = await getIpAddress();
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      device: getDeviceInfo(),
      browser: getBrowserInfo(),
      ip
    };

    const existingLogsStr = localStorage.getItem('jnas_security_audit_logs');
    const logs: AuditLogEntry[] = existingLogsStr ? JSON.parse(existingLogsStr) : [];
    
    // Add to top of array
    logs.unshift(entry);

    // Maintain up to 100 log entries to avoid filling storage
    if (logs.length > 100) {
      logs.splice(100);
    }

    localStorage.setItem('jnas_security_audit_logs', JSON.stringify(logs));
  } catch (err) {
    console.error('Failed to write security audit log:', err);
  }
}

// Retrieve audit logs
export function getSecurityAuditLogs(): AuditLogEntry[] {
  try {
    const existingLogsStr = localStorage.getItem('jnas_security_audit_logs');
    return existingLogsStr ? JSON.parse(existingLogsStr) : [];
  } catch (err) {
    return [];
  }
}

// Clear audit logs
export function clearSecurityAuditLogs(): void {
  localStorage.removeItem('jnas_security_audit_logs');
}
