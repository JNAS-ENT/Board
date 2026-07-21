import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'api-dev-server',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith('/api/health')) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ status: 'ok' }));
              return;
            }
            if (req.url?.startsWith('/api/enrich') && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', async () => {
                try {
                  const parsed = JSON.parse(body);
                  const { url } = parsed;
                  if (!url) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'URL is required' }));
                    return;
                  }
                  
                  const apiKey = process.env.GEMINI_API_KEY || '';
                  if (!apiKey) {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({
                      success: false,
                      metadata: {
                        title: url,
                        category: "url",
                        description: "Resource added. (To enable automated AI metadata extraction, please configure GEMINI_API_KEY).",
                        author: "Unknown",
                        language: "English"
                      }
                    }));
                    return;
                  }

                  const { GoogleGenAI, Type } = await import('@google/genai');
                  const ai = new GoogleGenAI({ apiKey });

                  let pageTitle = '';
                  let pageHeaderSnippet = '';

                  try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 4000);
                    const fetchResponse = await fetch(url, {
                      headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html'
                      },
                      signal: controller.signal
                    });
                    clearTimeout(timeoutId);

                    if (fetchResponse.ok) {
                      const html = await fetchResponse.text();
                      pageHeaderSnippet = html.substring(0, 25000);
                      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
                      if (titleMatch && titleMatch[1]) {
                        pageTitle = titleMatch[1].trim();
                      }
                    }
                  } catch (err) {
                    console.warn('Could not fetch head of URL in dev mode:', err);
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
                          videoDuration: { type: Type.STRING, description: "YouTube duration (e.g. '12:45'), or null" }
                        },
                        required: ["title", "category", "description"]
                      }
                    }
                  });

                  const resultText = geminiResponse.text?.trim() || "{}";
                  const meta = JSON.parse(resultText);

                  const validCategories = ['url', 'pdf', 'image', 'github', 'youtube', 'document'];
                  if (!meta.category || !validCategories.includes(meta.category)) {
                    if (isYoutube) meta.category = 'youtube';
                    else if (isGithub) meta.category = 'github';
                    else meta.category = 'url';
                  }

                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
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
                  }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err?.message || String(err) }));
                }
              });
              return;
            }
            next();
          });
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
