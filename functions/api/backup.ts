interface Env {
  WORKSPACE_KV?: KVNamespace;
  DB?: D1Database;
}

// Global in-memory backup store for local fallback/development
const memoryBackups = new Map<string, Array<{ id: string; dbData: string; createdAt: string }>>();

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as {
      workspaceId: string;
      recoveryKey: string;
      dbData: string;
    };

    const { workspaceId, recoveryKey, dbData } = body;

    if (!workspaceId || !recoveryKey || !dbData) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: workspaceId, recoveryKey, dbData." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify workspace exists and recovery key matches
    let existingWorkspaceStr: string | null = null;
    if (context.env.WORKSPACE_KV) {
      existingWorkspaceStr = await context.env.WORKSPACE_KV.get(workspaceId);
    } else {
      // In local/fallback memory map
      const globalStore = (global as any).__localSyncStore || new Map();
      const cached = globalStore.get(workspaceId);
      if (cached) {
        existingWorkspaceStr = JSON.stringify(cached);
      }
    }

    if (existingWorkspaceStr) {
      const existing = JSON.parse(existingWorkspaceStr) as { recoveryKey: string };
      if (existing.recoveryKey !== recoveryKey) {
        return new Response(
          JSON.stringify({ error: "Invalid recovery key. Access denied.", code: "UNAUTHORIZED" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const backupId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const backupEntry = { id: backupId, dbData, createdAt };

    if (context.env.WORKSPACE_KV) {
      // Save backup in KV using workspaceId + backup prefix
      const backupKey = `backup:${workspaceId}:${backupId}`;
      await context.env.WORKSPACE_KV.put(backupKey, JSON.stringify(backupEntry));

      // Update backup list for this workspace
      const listKey = `backups_list:${workspaceId}`;
      const existingListStr = await context.env.WORKSPACE_KV.get(listKey);
      const list = existingListStr ? JSON.parse(existingListStr) as string[] : [];
      list.push(backupId);
      await context.env.WORKSPACE_KV.put(listKey, JSON.stringify(list));
    } else {
      // Memory Store backup
      let workspaceBackups = memoryBackups.get(workspaceId);
      if (!workspaceBackups) {
        workspaceBackups = [];
        memoryBackups.set(workspaceId, workspaceBackups);
      }
      workspaceBackups.push(backupEntry);
      
      // Also write to global dev backup store if inside Node environment
      const globalBackups = (global as any).__localBackupStore || new Map();
      let devBackups = globalBackups.get(workspaceId) || [];
      devBackups.push(backupEntry);
      globalBackups.set(workspaceId, devBackups);
      (global as any).__localBackupStore = globalBackups;
    }

    return new Response(
      JSON.stringify({
        success: true,
        workspaceId,
        backupId,
        createdAt,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
