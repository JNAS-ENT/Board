import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API: Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API: Enrich Resource Metadata (Gemini-Powered)
  app.post("/api/enrich", async (req, res) => {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: "URL is required" });
      return;
    }

    let pageTitle = "";
    let pageHeaderSnippet = "";

    try {
      // 1. Try to fetch the head of the page to parse basic HTML meta tags
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const html = await response.text();
        
        // Extract up to first 25,000 characters (HTML head portion usually fits here)
        pageHeaderSnippet = html.substring(0, 25000);

        // Try extracting title as fallback
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          pageTitle = titleMatch[1].trim();
        }
      }
    } catch (err) {
      console.warn(`Could not fetch head of URL: ${url}. Proceeding with AI-only extraction.`, err);
    }

    // 2. Call Gemini to analyze the URL and/or HTML snippet to generate metadata
    try {
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
              videoDuration: { type: Type.STRING, description: "YouTube duration (e.g. '12:45'), or null" }
            },
            required: ["title", "category", "description"]
          }
        }
      });

      const resultText = geminiResponse.text?.trim() || "{}";
      const meta = JSON.parse(resultText);

      // Sanitize category
      const validCategories = ['url', 'pdf', 'image', 'github', 'youtube', 'document'];
      if (!meta.category || !validCategories.includes(meta.category)) {
        if (isYoutube) meta.category = 'youtube';
        else if (isGithub) meta.category = 'github';
        else meta.category = 'url';
      }

      res.json({
        success: true,
        metadata: {
          title: meta.title || pageTitle || url,
          category: meta.category,
          description: meta.description || "No description extracted.",
          author: meta.author || "Unknown",
          language: meta.language || "English",
          stars: meta.stars || undefined,
          videoDuration: meta.videoDuration || undefined
        }
      });
    } catch (aiErr) {
      console.error("Gemini metadata extraction failed:", aiErr);
      
      // Fallback metadata if AI fails
      const guessedCategory = url.includes("youtube.com") || url.includes("youtu.be") 
        ? 'youtube' 
        : url.includes("github.com") 
          ? 'github' 
          : 'url';

      res.json({
        success: false,
        metadata: {
          title: pageTitle || url,
          category: guessedCategory,
          description: "Resource added. Metadata extraction fell back to standard parsing.",
          author: "Unknown",
          language: "English"
        }
      });
    }
  });

  // Vite development middleware vs Static Production file serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
