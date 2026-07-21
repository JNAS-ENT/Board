interface Env {
  WORKSPACE_KV?: KVNamespace;
}

// In-memory fallback cache for local emulation or when KV is not bound
const memoryStore = new Map<string, { recoveryKey: string; dbData: string; updatedAt: string }>();

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { searchParams } = new URL(context.request.url);
    const workspaceId = searchParams.get("workspaceId");
    const recoveryKey = searchParams.get("recoveryKey");

    if (!workspaceId || !recoveryKey) {
      return new Response(
        JSON.stringify({ error: "Missing workspaceId or recoveryKey parameters." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let workspaceDataStr: string | null = null;
    if (context.env.WORKSPACE_KV) {
      workspaceDataStr = await context.env.WORKSPACE_KV.get(workspaceId);
    } else {
      const globalStore = (global as any).__localSyncStore || memoryStore;
      const cached = globalStore.get ? globalStore.get(workspaceId) : globalStore[workspaceId];
      if (cached) {
        workspaceDataStr = JSON.stringify(cached);
      }
    }

    if (!workspaceDataStr) {
      return new Response(
        JSON.stringify({ error: "Workspace not found.", code: "NOT_FOUND" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const payload = JSON.parse(workspaceDataStr) as {
      recoveryKey: string;
      dbData: string;
      updatedAt: string;
    };

    if (payload.recoveryKey !== recoveryKey) {
      return new Response(
        JSON.stringify({ error: "Invalid recovery key. Access denied.", code: "UNAUTHORIZED" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        workspaceId,
        dbData: payload.dbData,
        updatedAt: payload.updatedAt,
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as {
      workspaceId: string;
      recoveryKey: string;
      dbData: string;
      updatedAt: string;
    };

    const { workspaceId, recoveryKey, dbData, updatedAt } = body;

    if (!workspaceId || !recoveryKey || !dbData || !updatedAt) {
      return new Response(
        JSON.stringify({ error: "Missing required sync fields: workspaceId, recoveryKey, dbData, updatedAt." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if workspace already exists to prevent hijacking
    let existingStr: string | null = null;
    if (context.env.WORKSPACE_KV) {
      existingStr = await context.env.WORKSPACE_KV.get(workspaceId);
    } else {
      const globalStore = (global as any).__localSyncStore || memoryStore;
      const cached = globalStore.get ? globalStore.get(workspaceId) : globalStore[workspaceId];
      if (cached) {
        existingStr = JSON.stringify(cached);
      }
    }

    if (existingStr) {
      const existing = JSON.parse(existingStr) as {
        recoveryKey: string;
        updatedAt: string;
      };

      if (existing.recoveryKey !== recoveryKey) {
        return new Response(
          JSON.stringify({ error: "Invalid recovery key. Cannot overwrite workspace.", code: "UNAUTHORIZED" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }

      // Check for modification conflict if needed, but last-writer-wins with higher updatedAt is general.
      const existingDate = new Date(existing.updatedAt).getTime();
      const incomingDate = new Date(updatedAt).getTime();
      if (incomingDate < existingDate) {
        return new Response(
          JSON.stringify({
            error: "Conflict detected. The server has a newer version of this workspace.",
            code: "CONFLICT",
            serverUpdatedAt: existing.updatedAt,
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const valueToStore = {
      recoveryKey,
      dbData,
      updatedAt,
    };

    if (context.env.WORKSPACE_KV) {
      // Store indefinitely or with a generous TTL (e.g., 6 months of inactivity)
      await context.env.WORKSPACE_KV.put(workspaceId, JSON.stringify(valueToStore));
    } else {
      const globalStore = (global as any).__localSyncStore || memoryStore;
      if (globalStore.set) {
        globalStore.set(workspaceId, valueToStore);
      } else {
        globalStore[workspaceId] = valueToStore;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        workspaceId,
        updatedAt,
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
