/**
 * Gemini 2.5 Flash wrapper.
 * All AI calls funnel through here so fallback logic lives in one place.
 * Server-side only — never import this from client components.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { env, isApiAvailable } from "@/lib/env";

// Singleton model instance (reused across requests in the same process)
let _genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }
  return _genAI;
}

function getModel() {
  return getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });
}

function getFlashLiteModel() {
  return getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
}

/** Generate structured JSON from a text prompt. Throws on API failure. */
export async function generateJSON<T>(prompt: string): Promise<T> {
  const model = getModel();
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  });
  const raw = result.response.text();
  return JSON.parse(raw) as T;
}

/** Analyze a base64 JPEG image and return structured JSON. */
export async function analyzeImageJSON<T>(
  base64Image: string,
  prompt: string
): Promise<T> {
  const model = getModel();
  // Strip data-URI prefix if present
  const data = base64Image.replace(/^data:image\/\w+;base64,/, "");
  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json" },
  });
  return JSON.parse(result.response.text()) as T;
}

/** Generate plain text (no JSON output). */
export async function generateText(prompt: string): Promise<string> {
  const model = getModel();
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return result.response.text().trim();
}

/**
 * Safe JSON generation: returns null if Gemini is unavailable or the call fails.
 * Callers should implement fallback behavior when null is returned.
 */
export async function safeGenerateJSON<T>(prompt: string): Promise<T | null> {
  if (!isApiAvailable.gemini()) {
    console.warn("[Gemini] safeGenerateJSON: API key not configured");
    return null;
  }
  try {
    return await generateJSON<T>(prompt);
  } catch (err) {
    console.error("[Gemini] safeGenerateJSON failed:", err);
    return null;
  }
}

/**
 * Fast JSON generation using gemini-2.0-flash-lite.
 * Use for latency-sensitive calls like character dialogue where speed > capability.
 */
export async function safeGenerateJSONFast<T>(prompt: string): Promise<T | null> {
  if (!isApiAvailable.gemini()) {
    console.warn("[Gemini] safeGenerateJSONFast: API key not configured");
    return null;
  }
  try {
    const model = getFlashLiteModel();
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
    const raw = result.response.text();
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error("[Gemini] safeGenerateJSONFast failed:", err);
    return null;
  }
}

/** Safe image analysis, returns null on any failure. */
export async function safeAnalyzeImageJSON<T>(
  base64Image: string,
  prompt: string
): Promise<T | null> {
  if (!isApiAvailable.gemini()) {
    console.warn("[Gemini] safeAnalyzeImageJSON: API key not configured");
    return null;
  }
  try {
    return await analyzeImageJSON<T>(base64Image, prompt);
  } catch (err) {
    console.error("[Gemini] safeAnalyzeImageJSON failed:", err);
    return null;
  }
}

/** Safe text generation, returns null on any failure. */
export async function safeGenerateText(
  prompt: string
): Promise<string | null> {
  if (!isApiAvailable.gemini()) {
    console.warn("[Gemini] safeGenerateText: API key not configured");
    return null;
  }
  try {
    return await generateText(prompt);
  } catch (err) {
    console.error("[Gemini] safeGenerateText failed:", err);
    return null;
  }
}

// ─── Compatibility shims for pre-existing module contracts ───────────────────

/**
 * Compatibility alias: pre-existing narrator.ts calls generateJson(prompt).
 * Maps (systemPrompt, userPrompt?, schema?) to our generateJSON implementation.
 */
export async function generateJson<T>(
  systemPrompt: string,
  userPrompt?: string,
  _schema?: object
): Promise<T> {
  const fullPrompt = userPrompt
    ? `${systemPrompt}\n\n${userPrompt}`
    : systemPrompt;
  return generateJSON<T>(fullPrompt);
}

/**
 * Pre-existing scan route calls generateJsonFromImage(base64, mimeType, prompt).
 * Wraps analyzeImageJSON with the different argument order.
 */
export async function generateJsonFromImage<T>(
  imageBase64: string,
  _mimeType: string, // kept for API compatibility; currently always image/jpeg
  prompt: string
): Promise<T> {
  return analyzeImageJSON<T>(imageBase64, prompt);
}

/** Check whether Gemini API is configured. */
export const isGeminiAvailable = (): boolean => isApiAvailable.gemini();
