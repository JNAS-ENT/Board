interface Env {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const supabaseUrl = context.env.VITE_SUPABASE_URL || "";
    const supabaseAnonKey = context.env.VITE_SUPABASE_ANON_KEY || "";

    return new Response(
      JSON.stringify({
        supabaseUrl: supabaseUrl.trim(),
        supabaseAnonKey: supabaseAnonKey.trim(),
        isConfigured: Boolean(supabaseUrl.trim() && supabaseAnonKey.trim())
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
