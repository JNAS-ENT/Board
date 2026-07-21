interface Env {
  WORKSPACE_KV?: KVNamespace;
  DB?: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as {
      workspaceId: string;
      recoveryKey: string;
    };

    const { workspaceId, recoveryKey } = body;

    if (!workspaceId || !recoveryKey) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: workspaceId, recoveryKey." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let existingStr: string | null = null;
    if (context.env.WORKSPACE_KV) {
      existingStr = await context.env.WORKSPACE_KV.get(workspaceId);
    } else {
      const globalStore = (global as any).__localSyncStore || new Map();
      const cached = globalStore.get(workspaceId);
      if (cached) {
        existingStr = JSON.stringify(cached);
      }
    }

    if (!existingStr) {
      return new Response(
        JSON.stringify({ error: "Workspace not found.", code: "NOT_FOUND" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const payload = JSON.parse(existingStr) as { recoveryKey: string; dbData: string; updatedAt: string };
    if (payload.recoveryKey !== recoveryKey) {
      return new Response(
        JSON.stringify({ error: "Invalid recovery key. Connection rejected.", code: "UNAUTHORIZED" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        workspaceId,
        updatedAt: payload.updatedAt,
        message: "Workspace linked successfully.",
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
