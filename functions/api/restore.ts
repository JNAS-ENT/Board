interface Env {
  WORKSPACE_KV?: KVNamespace;
  DB?: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as {
      workspaceId: string;
      recoveryKey: string;
      backupId?: string; // Optional: if omitted, restores the latest backup
    };

    const { workspaceId, recoveryKey, backupId } = body;

    if (!workspaceId || !recoveryKey) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: workspaceId, recoveryKey." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Verify workspace exists and recovery key matches
    let existingWorkspaceStr: string | null = null;
    if (context.env.WORKSPACE_KV) {
      existingWorkspaceStr = await context.env.WORKSPACE_KV.get(workspaceId);
    } else {
      const globalStore = (global as any).__localSyncStore || new Map();
      const cached = globalStore.get(workspaceId);
      if (cached) {
        existingWorkspaceStr = JSON.stringify(cached);
      }
    }

    if (!existingWorkspaceStr) {
      return new Response(
        JSON.stringify({ error: "Workspace not found.", code: "NOT_FOUND" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const existing = JSON.parse(existingWorkspaceStr) as { recoveryKey: string; dbData: string; updatedAt: string };
    if (existing.recoveryKey !== recoveryKey) {
      return new Response(
        JSON.stringify({ error: "Invalid recovery key. Access denied.", code: "UNAUTHORIZED" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    let restoredDbData: string | null = null;
    let restoredUpdatedAt: string | null = null;

    if (context.env.WORKSPACE_KV) {
      let targetBackupId = backupId;
      
      if (!targetBackupId) {
        const listKey = `backups_list:${workspaceId}`;
        const listStr = await context.env.WORKSPACE_KV.get(listKey);
        const list = listStr ? JSON.parse(listStr) as string[] : [];
        if (list.length === 0) {
          return new Response(
            JSON.stringify({ error: "No backups found for this workspace.", code: "NO_BACKUPS" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
        targetBackupId = list[list.length - 1]; // Latest backup
      }

      const backupKey = `backup:${workspaceId}:${targetBackupId}`;
      const backupStr = await context.env.WORKSPACE_KV.get(backupKey);
      if (backupStr) {
        const parsedBackup = JSON.parse(backupStr) as { dbData: string; createdAt: string };
        restoredDbData = parsedBackup.dbData;
        restoredUpdatedAt = parsedBackup.createdAt;
      }
    } else {
      // Local Node global fallback store
      const globalBackups = (global as any).__localBackupStore || new Map();
      const devBackups = globalBackups.get(workspaceId) || [];
      
      if (devBackups.length === 0) {
        return new Response(
          JSON.stringify({ error: "No backups found for this workspace.", code: "NO_BACKUPS" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      let backupEntry;
      if (backupId) {
        backupEntry = devBackups.find((b: any) => b.id === backupId);
      } else {
        backupEntry = devBackups[devBackups.length - 1]; // Latest
      }

      if (backupEntry) {
        restoredDbData = backupEntry.dbData;
        restoredUpdatedAt = backupEntry.createdAt;
      }
    }

    if (!restoredDbData) {
      return new Response(
        JSON.stringify({ error: "Backup snapshot not found.", code: "NOT_FOUND" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Overwrite the current active database with the restored database backup
    const updatedWorkspaceValue = {
      recoveryKey,
      dbData: restoredDbData,
      updatedAt: restoredUpdatedAt || new Date().toISOString(),
    };

    if (context.env.WORKSPACE_KV) {
      await context.env.WORKSPACE_KV.put(workspaceId, JSON.stringify(updatedWorkspaceValue));
    } else {
      const globalStore = (global as any).__localSyncStore || new Map();
      globalStore.set(workspaceId, updatedWorkspaceValue);
    }

    return new Response(
      JSON.stringify({
        success: true,
        workspaceId,
        dbData: restoredDbData,
        updatedAt: restoredUpdatedAt,
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
