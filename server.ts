import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API endpoints
  app.post("/api/synthesize", async (req, res) => {
    try {
      const { prompt } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set." });
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `You are an AI Synesthesia Engine. The user provides a mood, scene, or feeling.
You must output a JSON object configuring a fluid simulation to reflect this.

The output JSON MUST follow this EXACT format and have these exact keys without any markdown or extra text:
{
  "DENSITY_DISSIPATION": <float between 0.5 to 3.0>,
  "VELOCITY_DISSIPATION": <float between 0.1 to 2.0>,
  "PRESSURE": <float between 0.0 to 1.0>,
  "CURL": <integer between 0 to 50>,
  "SPLAT_RADIUS": <float between 0.01 to 1.0>,
  "COLORFUL": <boolean>,
  "BACK_COLOR": { "r": <0-255>, "g": <0-255>, "b": <0-255> },
  "BLOOM_INTENSITY": <float between 0.1 and 2.5>,
  "SUNRAYS_WEIGHT": <float between 0.3 and 1.5>,
  "CAUSTICS": <boolean>,
  "COLOR_PALETTE": <"Liquid Gold" | "Rose Gold" | "White Gold" | "Cosmic" | "Neon" | "Ocean" | "Volcanic" | "Cyberpunk" | "Rainbow">,
  "UI_THEME": <"dark" | "light" | "neon" | "minimal">
}

Do not add extra keys. Make the fluid parameters match the user's prompt as creatively as possible!
For example:
- "A serene forest pond at dawn": High dissipation (calm), low curl, deep green/blue background.
- "A chaotic raging storm": Low dissipation (lasts long), high curl, fast velocities, dark grey background, high bloom.

Prompt: "${prompt}"`,
        config: {
            temperature: 0.8,
            responseMimeType: "application/json"
        }
      });

      const configText = response.text;
      
      let parsedConfig;
      if (configText) {
          try {
              const cleanedText = configText.replace(/```json/g, '').replace(/```/g, '').trim();
              parsedConfig = JSON.parse(cleanedText);
          } catch (e) {
              parsedConfig = {};
          }
      }
      
      res.json({ success: true, config: parsedConfig });
    } catch (error: any) {
      console.error("Gemini Error:", error);
      res.status(500).json({ error: error.message || "Failed to synthesize." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Support client-side routing
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
