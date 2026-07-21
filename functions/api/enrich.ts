import { GoogleGenAI, Type } from "@google/genai";

interface Env {
  GEMINI_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { request } = context;
    const body = (await request.json()) as { url?: string };
    const { url } = body;

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Retrieve GEMINI_API_KEY from Cloudflare Pages environment variables
    const apiKey = context.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Graceful fallback for Pages deployment when API key is not yet set
      return new Response(
        JSON.stringify({
          success: false,
          metadata: {
            title: url,
            category: "url",
            description: "Resource added. (To enable automated AI metadata extraction, please add the GEMINI_API_KEY variable in your Cloudflare Pages Dashboard settings under Settings > Environment Variables).",
            author: "Unknown",
            language: "English",
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    let pageTitle = "";
    let pageHeaderSnippet = "";

    try {
      // Edge fetch with a 3-second abort timeout
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
        pageHeaderSnippet = html.substring(0, 5000); // Keep size light for edge environment
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
            category: { type: Type.STRING, description: "Must be: 'url', 'pdf', 'image', 'github', 'youtube', 'document'" },
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

    return new Response(
      JSON.stringify({
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
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || String(err),
        metadata: {
          title: "Error fetching metadata",
          category: "url",
          description: "An error occurred during edge metadata extraction fallback.",
          author: "Unknown",
          language: "English",
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
