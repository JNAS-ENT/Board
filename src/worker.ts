import { GoogleGenAI, Type } from "@google/genai";

export interface Env {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  WORKSPACE_KV?: KVNamespace;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  GEMINI_API_KEY?: string;
}

interface BackupEntry {
  id: string;
  dbData: string;
  createdAt: string;
  size: number;
  version: string;
  label?: string;
  checksum: string;
}

// Global in-memory fallback stores for local development or when KV is unbound
const memoryWorkspaces = new Map<string, { recoveryKey: string; dbData: string; updatedAt: string }>();
const memoryBackups = new Map<string, Array<BackupEntry>>();

function jsonResponse(data: any, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...headers,
    },
  });
}

async function computeSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function createBackupHelper(
  env: Env,
  workspaceId: string,
  recoveryKey: string,
  dbData: string,
  label?: string,
  version?: string
): Promise<{ backupId: string; createdAt: string; checksum: string; size: number; version: string; label?: string }> {
  const backupId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const checksum = await computeSha256(dbData);
  const size = new TextEncoder().encode(dbData).byteLength;
  const backupVersion = version || "1.0.0";
  const backupLabel = label || undefined;

  const backupEntry: BackupEntry = {
    id: backupId,
    dbData,
    createdAt,
    size,
    version: backupVersion,
    label: backupLabel,
    checksum,
  };

  if (env.WORKSPACE_KV) {
    const backupKey = `backup:${workspaceId}:${backupId}`;
    await env.WORKSPACE_KV.put(backupKey, JSON.stringify(backupEntry));

    const listKey = `backups_list:${workspaceId}`;
    const listStr = await env.WORKSPACE_KV.get(listKey);
    let list: string[] = listStr ? JSON.parse(listStr) : [];
    list.push(backupId);

    // Keep only the latest 20 backups per workspace (delete older ones)
    if (list.length > 20) {
      const toRemove = list.slice(0, list.length - 20);
      list = list.slice(list.length - 20);
      for (const oldId of toRemove) {
        await env.WORKSPACE_KV.delete(`backup:${workspaceId}:${oldId}`);
      }
    }
    await env.WORKSPACE_KV.put(listKey, JSON.stringify(list));
  } else {
    let workspaceBackups = memoryBackups.get(workspaceId);
    if (!workspaceBackups) {
      workspaceBackups = [];
      memoryBackups.set(workspaceId, workspaceBackups);
    }
    workspaceBackups.push(backupEntry);

    // Keep only the latest 20 backups per workspace (delete older ones)
    if (workspaceBackups.length > 20) {
      workspaceBackups.splice(0, workspaceBackups.length - 20);
    }
  }

  return {
    backupId,
    createdAt,
    checksum,
    size,
    version: backupVersion,
    label: backupLabel,
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight OPTIONS requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // Route API requests
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApiRoutes(url.pathname, request, env);
      } catch (err: any) {
        console.error(`[Worker API Error] ${url.pathname}:`, err);
        return jsonResponse({ error: err?.message || String(err), code: "SERVER_ERROR" }, 500);
      }
    }

    // Serve static frontend assets via ASSETS binding if available
    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      // SPA Fallback for client-side HTML5 routing
      if (response.status === 404 && request.method === "GET" && !url.pathname.includes(".")) {
        const indexRequest = new Request(new URL("/index.html", request.url), request);
        return await env.ASSETS.fetch(indexRequest);
      }
      return response;
    }

    return new Response("Not Found", { status: 404 });
  },
};

async function handleApiRoutes(pathname: string, request: Request, env: Env): Promise<Response> {
  // 1. GET /api/health
  if (pathname === "/api/health") {
    return jsonResponse({ status: "ok" });
  }

  // 2. GET /api/config
  if (pathname === "/api/config") {
    const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").trim();
    const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "").trim();
    return jsonResponse({
      supabaseUrl,
      supabaseAnonKey,
      isConfigured: Boolean(supabaseUrl && supabaseAnonKey),
    });
  }

  // 3. /api/sync
  if (pathname === "/api/sync") {
    const url = new URL(request.url);

    // GET /api/sync
    if (request.method === "GET") {
      const workspaceId = url.searchParams.get("workspaceId");
      const recoveryKey = url.searchParams.get("recoveryKey");

      if (!workspaceId || !recoveryKey) {
        return jsonResponse(
          { error: "Missing workspaceId or recoveryKey parameters.", code: "INVALID_REQUEST" },
          400
        );
      }

      let workspaceDataStr: string | null = null;
      if (env.WORKSPACE_KV) {
        workspaceDataStr = await env.WORKSPACE_KV.get(workspaceId);
      } else {
        const cached = memoryWorkspaces.get(workspaceId);
        if (cached) workspaceDataStr = JSON.stringify(cached);
      }

      if (!workspaceDataStr) {
        return jsonResponse({ error: "Workspace not found.", code: "NOT_FOUND" }, 404);
      }

      const payload = JSON.parse(workspaceDataStr) as {
        recoveryKey: string;
        dbData: string;
        updatedAt: string;
      };

      if (payload.recoveryKey !== recoveryKey) {
        return jsonResponse({ error: "Invalid recovery key. Access denied.", code: "UNAUTHORIZED" }, 403);
      }

      return jsonResponse({
        success: true,
        workspaceId,
        dbData: payload.dbData,
        updatedAt: payload.updatedAt,
      });
    }

    // POST /api/sync
    if (request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body.", code: "INVALID_JSON" }, 400);
      }

      const { workspaceId, recoveryKey, dbData, updatedAt } = body || {};
      if (!workspaceId || !recoveryKey || !dbData || !updatedAt) {
        return jsonResponse(
          { error: "Missing required sync fields: workspaceId, recoveryKey, dbData, updatedAt.", code: "INVALID_REQUEST" },
          400
        );
      }

      let existingStr: string | null = null;
      if (env.WORKSPACE_KV) {
        existingStr = await env.WORKSPACE_KV.get(workspaceId);
      } else {
        const cached = memoryWorkspaces.get(workspaceId);
        if (cached) existingStr = JSON.stringify(cached);
      }

      if (existingStr) {
        const existing = JSON.parse(existingStr) as { recoveryKey: string; updatedAt: string };
        if (existing.recoveryKey !== recoveryKey) {
          return jsonResponse(
            { error: "Invalid recovery key. Cannot overwrite workspace.", code: "UNAUTHORIZED" },
            403
          );
        }

        const existingTime = new Date(existing.updatedAt).getTime();
        const incomingTime = new Date(updatedAt).getTime();
        if (incomingTime < existingTime) {
          return jsonResponse(
            {
              error: "Conflict detected. Server has a newer version.",
              code: "CONFLICT",
              serverUpdatedAt: existing.updatedAt,
            },
            409
          );
        }
      }

      const recordToStore = { recoveryKey, dbData, updatedAt };
      if (env.WORKSPACE_KV) {
        await env.WORKSPACE_KV.put(workspaceId, JSON.stringify(recordToStore));
      } else {
        memoryWorkspaces.set(workspaceId, recordToStore);
      }

      return jsonResponse({ success: true, workspaceId, updatedAt });
    }
  }

  // 4. GET /api/backups (List backups for a workspace)
  if (pathname === "/api/backups" && request.method === "GET") {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    const recoveryKey = url.searchParams.get("recoveryKey");

    if (!workspaceId || !recoveryKey) {
      return jsonResponse(
        { error: "Missing required query parameters: workspaceId, recoveryKey.", code: "INVALID_REQUEST" },
        400
      );
    }

    let existingWorkspaceStr: string | null = null;
    if (env.WORKSPACE_KV) {
      existingWorkspaceStr = await env.WORKSPACE_KV.get(workspaceId);
    } else {
      const cached = memoryWorkspaces.get(workspaceId);
      if (cached) existingWorkspaceStr = JSON.stringify(cached);
    }

    if (!existingWorkspaceStr) {
      return jsonResponse({ error: "Workspace not found.", code: "NOT_FOUND" }, 404);
    }

    const existingWorkspace = JSON.parse(existingWorkspaceStr) as { recoveryKey: string };
    if (existingWorkspace.recoveryKey !== recoveryKey) {
      return jsonResponse({ error: "Invalid recovery key. Access denied.", code: "UNAUTHORIZED" }, 403);
    }

    const backupsList: Array<{
      id: string;
      createdAt: string;
      size: number;
      version: string;
      label?: string;
      checksum: string;
    }> = [];

    if (env.WORKSPACE_KV) {
      const listKey = `backups_list:${workspaceId}`;
      const listStr = await env.WORKSPACE_KV.get(listKey);
      const list: string[] = listStr ? JSON.parse(listStr) : [];

      for (const backupId of list) {
        const backupKey = `backup:${workspaceId}:${backupId}`;
        const backupStr = await env.WORKSPACE_KV.get(backupKey);
        if (backupStr) {
          const parsed = JSON.parse(backupStr) as BackupEntry;
          backupsList.push({
            id: parsed.id,
            createdAt: parsed.createdAt,
            size: parsed.size || (parsed.dbData ? new TextEncoder().encode(parsed.dbData).byteLength : 0),
            version: parsed.version || "1.0.0",
            label: parsed.label,
            checksum: parsed.checksum || "",
          });
        }
      }
    } else {
      const workspaceBackups = memoryBackups.get(workspaceId) || [];
      for (const parsed of workspaceBackups) {
        backupsList.push({
          id: parsed.id,
          createdAt: parsed.createdAt,
          size: parsed.size || (parsed.dbData ? new TextEncoder().encode(parsed.dbData).byteLength : 0),
          version: parsed.version || "1.0.0",
          label: parsed.label,
          checksum: parsed.checksum || "",
        });
      }
    }

    return jsonResponse({
      success: true,
      workspaceId,
      backups: backupsList,
    });
  }

  // 5. POST /api/backup (Create a new backup)
  if (pathname === "/api/backup" && request.method === "POST") {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body.", code: "INVALID_JSON" }, 400);
    }

    const { workspaceId, recoveryKey, dbData, label, version } = body || {};
    if (!workspaceId || !recoveryKey || !dbData) {
      return jsonResponse(
        { error: "Missing required fields: workspaceId, recoveryKey, dbData.", code: "INVALID_REQUEST" },
        400
      );
    }

    let existingWorkspaceStr: string | null = null;
    if (env.WORKSPACE_KV) {
      existingWorkspaceStr = await env.WORKSPACE_KV.get(workspaceId);
    } else {
      const cached = memoryWorkspaces.get(workspaceId);
      if (cached) existingWorkspaceStr = JSON.stringify(cached);
    }

    if (existingWorkspaceStr) {
      const existing = JSON.parse(existingWorkspaceStr) as { recoveryKey: string };
      if (existing.recoveryKey !== recoveryKey) {
        return jsonResponse({ error: "Invalid recovery key. Access denied.", code: "UNAUTHORIZED" }, 403);
      }
    }

    const result = await createBackupHelper(env, workspaceId, recoveryKey, dbData, label, version);

    return jsonResponse({
      success: true,
      workspaceId,
      backupId: result.backupId,
      createdAt: result.createdAt,
      checksum: result.checksum,
      size: result.size,
      version: result.version,
      label: result.label,
    });
  }

  // 6. POST /api/restore (Restore workspace from backup with safety check & checksum validation)
  if (pathname === "/api/restore" && request.method === "POST") {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body.", code: "INVALID_JSON" }, 400);
    }

    const { workspaceId, recoveryKey, backupId } = body || {};
    if (!workspaceId || !recoveryKey) {
      return jsonResponse(
        { error: "Missing required fields: workspaceId, recoveryKey.", code: "INVALID_REQUEST" },
        400
      );
    }

    let existingWorkspaceStr: string | null = null;
    if (env.WORKSPACE_KV) {
      existingWorkspaceStr = await env.WORKSPACE_KV.get(workspaceId);
    } else {
      const cached = memoryWorkspaces.get(workspaceId);
      if (cached) existingWorkspaceStr = JSON.stringify(cached);
    }

    if (!existingWorkspaceStr) {
      return jsonResponse({ error: "Workspace not found.", code: "NOT_FOUND" }, 404);
    }

    const existingWorkspace = JSON.parse(existingWorkspaceStr) as {
      recoveryKey: string;
      dbData: string;
      updatedAt: string;
    };
    if (existingWorkspace.recoveryKey !== recoveryKey) {
      return jsonResponse({ error: "Invalid recovery key. Access denied.", code: "UNAUTHORIZED" }, 403);
    }

    let targetBackupEntry: BackupEntry | null = null;

    if (env.WORKSPACE_KV) {
      let targetBackupId = backupId;
      if (!targetBackupId) {
        const listKey = `backups_list:${workspaceId}`;
        const listStr = await env.WORKSPACE_KV.get(listKey);
        const list: string[] = listStr ? JSON.parse(listStr) : [];
        if (list.length === 0) {
          return jsonResponse({ error: "No backups found for this workspace.", code: "NO_BACKUPS" }, 404);
        }
        targetBackupId = list[list.length - 1];
      }

      const backupKey = `backup:${workspaceId}:${targetBackupId}`;
      const backupStr = await env.WORKSPACE_KV.get(backupKey);
      if (backupStr) {
        targetBackupEntry = JSON.parse(backupStr) as BackupEntry;
      }
    } else {
      const workspaceBackups = memoryBackups.get(workspaceId) || [];
      if (workspaceBackups.length === 0) {
        return jsonResponse({ error: "No backups found for this workspace.", code: "NO_BACKUPS" }, 404);
      }

      if (backupId) {
        targetBackupEntry = workspaceBackups.find((b) => b.id === backupId) || null;
      } else {
        targetBackupEntry = workspaceBackups[workspaceBackups.length - 1] || null;
      }
    }

    if (!targetBackupEntry || !targetBackupEntry.dbData) {
      return jsonResponse({ error: "Backup snapshot not found.", code: "NOT_FOUND" }, 404);
    }

    // Generate and verify SHA-256 checksum before restoring
    const computedChecksum = await computeSha256(targetBackupEntry.dbData);
    if (targetBackupEntry.checksum && targetBackupEntry.checksum !== computedChecksum) {
      return jsonResponse(
        {
          error: "Checksum verification failed. Backup data is corrupted or tampered.",
          code: "CORRUPTED_BACKUP",
          expectedChecksum: targetBackupEntry.checksum,
          computedChecksum,
        },
        422
      );
    }

    // Automatically create a safety backup before every restore
    let safetyBackupResult: { backupId: string } | null = null;
    if (existingWorkspace.dbData && existingWorkspace.dbData.trim().length > 0) {
      try {
        safetyBackupResult = await createBackupHelper(
          env,
          workspaceId,
          recoveryKey,
          existingWorkspace.dbData,
          "Pre-restore safety backup",
          "auto"
        );
      } catch (err) {
        console.warn("Failed to create pre-restore safety backup:", err);
      }
    }

    const restoredDbData = targetBackupEntry.dbData;
    const restoredUpdatedAt = targetBackupEntry.createdAt || new Date().toISOString();

    const updatedWorkspaceValue = {
      recoveryKey,
      dbData: restoredDbData,
      updatedAt: restoredUpdatedAt,
    };

    if (env.WORKSPACE_KV) {
      await env.WORKSPACE_KV.put(workspaceId, JSON.stringify(updatedWorkspaceValue));
    } else {
      memoryWorkspaces.set(workspaceId, updatedWorkspaceValue);
    }

    return jsonResponse({
      success: true,
      workspaceId,
      dbData: restoredDbData,
      updatedAt: restoredUpdatedAt,
      safetyBackupId: safetyBackupResult?.backupId || undefined,
    });
  }

  // 7. POST /api/enrich
  if (pathname === "/api/enrich" && request.method === "POST") {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body.", code: "INVALID_JSON" }, 400);
    }

    const { url } = body || {};
    if (!url || typeof url !== "string") {
      return jsonResponse({ error: "URL is required", code: "INVALID_REQUEST" }, 400);
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonResponse({
        success: false,
        metadata: {
          title: url,
          category: "url",
          description: "Resource added. (To enable automated AI metadata extraction, please add GEMINI_API_KEY environment variable).",
          author: "Unknown",
          language: "English",
        },
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    let pageTitle = "";
    let pageHeaderSnippet = "";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const html = await response.text();
        pageHeaderSnippet = html.substring(0, 5000);
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          pageTitle = titleMatch[1].trim();
        }
      }
    } catch (err) {
      console.warn("Could not fetch page header snippet", err);
    }

    const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");
    const isGithub = url.includes("github.com");

    const systemInstruction = `You are an expert web scraping and metadata extraction model. 
Analyze the URL: "${url}" and any provided HTML snippet:
"${pageHeaderSnippet.substring(0, 1500)}"

Return a clean, structured JSON metadata response with details about this page.
Guidelines:
- Title: Extract or generate a clean human-friendly title.
- Category: Categorize into one of these: 'url', 'pdf', 'image', 'github', 'youtube', 'document'.
- Description: Write a high-quality concise summary (1-2 sentences) of what this website/resource is about.
- Author: Extract or deduce the author/publisher.
- Language: Determine the page language.
- Stars/Views (For GitHub/YouTube): If it is GitHub, estimate or guess the number of stars (as an integer). If it is YouTube, estimate video duration.`;

    const geminiResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: "Analyze this resource and return structured metadata.",
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            category: {
              type: Type.STRING,
              description: "Must be: 'url', 'pdf', 'image', 'github', 'youtube', 'document'",
            },
            description: { type: Type.STRING },
            author: { type: Type.STRING },
            language: { type: Type.STRING },
            stars: { type: Type.INTEGER, description: "GitHub stars count, or null" },
            videoDuration: { type: Type.STRING, description: "YouTube duration (e.g. '12:45'), or null" },
          },
          required: ["title", "category", "description"],
        },
      },
    });

    const resultText = geminiResponse.text?.trim() || "{}";
    const meta = JSON.parse(resultText);

    const validCategories = ["url", "pdf", "image", "github", "youtube", "document"];
    if (!meta.category || !validCategories.includes(meta.category)) {
      if (isYoutube) meta.category = "youtube";
      else if (isGithub) meta.category = "github";
      else meta.category = "url";
    }

    return jsonResponse({
      success: true,
      metadata: {
        title: meta.title || pageTitle || url,
        category: meta.category,
        description: meta.description || "No description extracted.",
        author: meta.author || "Unknown",
        language: meta.language || "English",
        stars: meta.stars || undefined,
        videoDuration: meta.videoDuration || undefined,
      },
    });
  }

  // 8. /api/workspace & /api/workspace/link
  if (pathname === "/api/workspace" || pathname === "/api/workspace/link") {
    const url = new URL(request.url);

    if (request.method === "GET") {
      const workspaceId = url.searchParams.get("workspaceId");
      const recoveryKey = url.searchParams.get("recoveryKey");

      if (!workspaceId || !recoveryKey) {
        return jsonResponse(
          { error: "Missing workspaceId or recoveryKey parameter.", code: "INVALID_REQUEST" },
          400
        );
      }

      let existingStr: string | null = null;
      if (env.WORKSPACE_KV) {
        existingStr = await env.WORKSPACE_KV.get(workspaceId);
      } else {
        const cached = memoryWorkspaces.get(workspaceId);
        if (cached) existingStr = JSON.stringify(cached);
      }

      if (!existingStr) {
        return jsonResponse({ exists: false, error: "Workspace does not exist.", code: "NOT_FOUND" }, 404);
      }

      const payload = JSON.parse(existingStr) as { recoveryKey: string; updatedAt: string };
      if (payload.recoveryKey !== recoveryKey) {
        return jsonResponse({ exists: true, authenticated: false, error: "Invalid recovery key.", code: "UNAUTHORIZED" }, 403);
      }

      return jsonResponse({
        success: true,
        exists: true,
        authenticated: true,
        workspaceId,
        updatedAt: payload.updatedAt,
      });
    }

    if (request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body.", code: "INVALID_JSON" }, 400);
      }

      const { workspaceId, recoveryKey } = body || {};
      if (!workspaceId || !recoveryKey) {
        return jsonResponse(
          { error: "Missing required fields: workspaceId, recoveryKey.", code: "INVALID_REQUEST" },
          400
        );
      }

      let existingStr: string | null = null;
      if (env.WORKSPACE_KV) {
        existingStr = await env.WORKSPACE_KV.get(workspaceId);
      } else {
        const cached = memoryWorkspaces.get(workspaceId);
        if (cached) existingStr = JSON.stringify(cached);
      }

      if (!existingStr) {
        return jsonResponse({ error: "Workspace not found.", code: "NOT_FOUND" }, 404);
      }

      const payload = JSON.parse(existingStr) as { recoveryKey: string; updatedAt: string };
      if (payload.recoveryKey !== recoveryKey) {
        return jsonResponse({ error: "Invalid recovery key. Connection rejected.", code: "UNAUTHORIZED" }, 403);
      }

      return jsonResponse({
        success: true,
        workspaceId,
        updatedAt: payload.updatedAt,
        message: "Workspace authenticated and linked successfully.",
      });
    }
  }

  return jsonResponse({ error: `API Endpoint not found: ${pathname}`, code: "NOT_FOUND" }, 404);
}

