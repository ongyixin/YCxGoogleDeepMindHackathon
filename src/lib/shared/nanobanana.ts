// NanoBanana visual asset generator wrapper.
// Powered by Imagen 3 via Google AI API, with Gemini Flash image generation as fallback.
// Falls back to emoji placeholders when all generation paths are unavailable.

import { Jimp } from "jimp";
import type {
  NanoBananaRequest,
  NanoBananaResponse,
  NanoBananaAssetType,
  IVisualGenerator,
  CharacterExpression,
} from "@/types";
import { env } from "@/lib/env";

const IMAGEN_MODEL = "imagen-3.0-generate-001";
const IMAGEN_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:generateImages`;

const GEMINI_FLASH_IMAGE_MODEL = "gemini-3.1-flash-image-preview";
const GEMINI_FLASH_IMAGE_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH_IMAGE_MODEL}:generateContent`;

// Fallback emojis per asset type — shown in UI when all generation fails
const FALLBACK_EMOJIS: Record<NanoBananaAssetType, string> = {
  character_portrait: "🎭",
  mission_card: "📋",
  recap_poster: "🎬",
  quest_item_icon: "⚔️",
};

/** Prefer the dedicated NanoBanana key; fall back to the Gemini key which is confirmed working. */
function getBestApiKey(): string {
  return env.NANOBANANA_API_KEY || env.GEMINI_API_KEY;
}

/**
 * Try Imagen 3 via generativelanguage.googleapis.com.
 * Requests PNG output (supports alpha) and explicitly prompts for a transparent background.
 */
async function generateWithImagen(prompt: string): Promise<string | null> {
  const apiKey = getBestApiKey();
  if (!apiKey) return null;

  const response = await fetch(`${IMAGEN_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/png",
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Imagen API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const b64 = data?.generatedImages?.[0]?.image?.imageBytes as string | undefined;
  if (!b64) return null;
  return `data:image/png;base64,${b64}`;
}

/**
 * Try Gemini 2.0 Flash image generation.
 * When referenceImage (raw base64 JPEG) is provided it is included as an inlineData
 * part so Gemini can use the camera snapshot as a visual reference.
 */
async function generateWithGeminiFlash(
  prompt: string,
  referenceImage?: string
): Promise<string | null> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const parts: Array<Record<string, unknown>> = [];
  if (referenceImage) {
    const data = referenceImage.replace(/^data:image\/\w+;base64,/, "");
    parts.push({ inlineData: { mimeType: "image/jpeg", data } });
  }
  parts.push({ text: prompt });

  const response = await fetch(`${GEMINI_FLASH_IMAGE_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini Flash image API ${response.status}: ${errText}`);
  }

  const responseData = await response.json();
  const responseParts: Array<{ inlineData?: { mimeType?: string; data?: string } }> =
    responseData?.candidates?.[0]?.content?.parts ?? [];

  for (const part of responseParts) {
    if (part?.inlineData?.data) {
      const mimeType = part.inlineData.mimeType ?? "image/png";
      return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }
  return null;
}

/**
 * Removes the white background from a PNG data URL using a flood-fill (magic wand)
 * approach seeded from the four corners, then feathers the resulting alpha mask.
 * Returns a new PNG data URL with a transparent background, or the original on error.
 */
async function removeBackgroundMagicWand(
  dataUrl: string,
  featherRadius = 3,
  tolerance = 40
): Promise<string> {
  try {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const inputBuffer = Buffer.from(base64, "base64");
    const image = await Jimp.read(inputBuffer);
    const { width, height } = image.bitmap;

    const isNearWhite = (idx: number) => {
      const r = image.bitmap.data[idx];
      const g = image.bitmap.data[idx + 1];
      const b = image.bitmap.data[idx + 2];
      return (255 - r) < tolerance && (255 - g) < tolerance && (255 - b) < tolerance;
    };

    // BFS flood-fill from corners to identify connected white background pixels
    const mask = new Uint8Array(width * height); // 0 = foreground, 255 = background
    const visited = new Uint8Array(width * height);
    const queue: [number, number][] = [];

    const corners: [number, number][] = [
      [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
    ];
    for (const [cx, cy] of corners) {
      const idx = (cy * width + cx) * 4;
      if (!visited[cy * width + cx] && isNearWhite(idx)) {
        visited[cy * width + cx] = 1;
        queue.push([cx, cy]);
      }
    }

    while (queue.length > 0) {
      const [x, y] = queue.shift()!;
      mask[y * width + x] = 255;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited[ny * width + nx]) {
          const nIdx = (ny * width + nx) * 4;
          if (isNearWhite(nIdx)) {
            visited[ny * width + nx] = 1;
            queue.push([nx, ny]);
          }
        }
      }
    }

    // Apply mask + optional feathering via a blurred alpha channel
    if (featherRadius > 0) {
      const alphaBuffer = Buffer.alloc(width * height * 4);
      for (let i = 0; i < width * height; i++) {
        const val = mask[i] === 255 ? 0 : 255;
        alphaBuffer[i * 4] = val;
        alphaBuffer[i * 4 + 1] = val;
        alphaBuffer[i * 4 + 2] = val;
        alphaBuffer[i * 4 + 3] = 255;
      }
      const alphaImg = new Jimp({ data: alphaBuffer, width, height });
      alphaImg.blur(featherRadius);

      for (let i = 0; i < width * height; i++) {
        image.bitmap.data[i * 4 + 3] = alphaImg.bitmap.data[i * 4]; // r-channel of blurred mask
      }
    } else {
      for (let i = 0; i < width * height; i++) {
        if (mask[i] === 255) image.bitmap.data[i * 4 + 3] = 0;
      }
    }

    const outputBuffer = await image.getBuffer("image/png");
    return `data:image/png;base64,${outputBuffer.toString("base64")}`;
  } catch (err) {
    console.error("[nanobanana] Background removal failed:", err);
    return dataUrl; // Return original on failure
  }
}

/** Prompt modifiers that describe how each expression differs from the neutral pose. */
const EXPRESSION_MODIFIERS: Record<CharacterExpression, string> = {
  neutral: "neutral calm expression, default standing pose",
  talking: "mouth wide open as if mid-sentence, animated speech expression, otherwise identical pose and design",
  happy: "beaming smile, eyes sparkling with joy, upbeat energetic pose, otherwise identical design",
  angry: "furrowed brows, gritted teeth or tight frown, tense body posture, otherwise identical design",
  sad: "downcast drooping eyes, slight frown, slightly slumped dejected posture, otherwise identical design",
  surprised: "wide open eyes, open O-shaped mouth, raised eyebrows, slightly recoiled posture, otherwise identical design",
};

/**
 * Generate an expression variant of an existing character sprite.
 * Uses the neutral sprite as a visual reference so Gemini Flash can preserve
 * the character's design and only alter the facial expression / posture.
 *
 * Returns a PNG data URL, or null if generation fails.
 */
export async function generateExpressionVariant(
  expression: CharacterExpression,
  neutralSpriteUrl: string,
  characterIdentityPrompt: string
): Promise<string | null> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey || !neutralSpriteUrl) return null;

  const modifier = EXPRESSION_MODIFIERS[expression];

  const prompt = [
    `Redraw this exact pixel art character sprite with ONE change: ${modifier}.`,
    `Keep everything else identical: same character design, same pixel art style, same body proportions, same outfit, same color palette, same full-body standing pose, same white background.`,
    `Character identity: ${characterIdentityPrompt}`,
    `Output: full body pixel art sprite, SOLID PURE WHITE BACKGROUND (#ffffff), no text, no watermark, no speech bubbles.`,
  ].join(" ");

  try {
    const result = await generateWithGeminiFlash(prompt, neutralSpriteUrl);
    if (result) {
      return await removeBackgroundMagicWand(result);
    }
  } catch (err) {
    console.error(`[nanobanana] Expression variant '${expression}' generation failed:`, err);
  }
  return null;
}

export const visualGenerator: IVisualGenerator = {
  async generate(req: NanoBananaRequest): Promise<NanoBananaResponse> {
    const hasAnyKey = !!(env.NANOBANANA_API_KEY || env.GEMINI_API_KEY);

    if (hasAnyKey) {
      // When a reference image is provided, skip Imagen 3 (text-only) and go
      // straight to Gemini Flash which supports multimodal input.
      if (req.referenceImage) {
        try {
          const imageUrl = await generateWithGeminiFlash(req.prompt, req.referenceImage);
          if (imageUrl) {
            const processed = await removeBackgroundMagicWand(imageUrl);
            return { imageUrl: processed, isFallback: false };
          }
        } catch (err) {
          console.error("[nanobanana] Gemini Flash image gen (with reference) failed:", err);
        }
      } else {
        // Primary: Imagen 3
        try {
          const imageUrl = await generateWithImagen(req.prompt);
          if (imageUrl) {
            const processed = await removeBackgroundMagicWand(imageUrl);
            return { imageUrl: processed, isFallback: false };
          }
        } catch (err) {
          console.error("[nanobanana] Imagen 3 failed:", err);
        }

        // Secondary: Gemini 2.0 Flash image generation
        try {
          const imageUrl = await generateWithGeminiFlash(req.prompt);
          if (imageUrl) {
            const processed = await removeBackgroundMagicWand(imageUrl);
            return { imageUrl: processed, isFallback: false };
          }
        } catch (err) {
          console.error("[nanobanana] Gemini Flash image gen failed:", err);
        }
      }
    }

    return {
      imageUrl: "",
      isFallback: true,
      fallbackEmoji: FALLBACK_EMOJIS[req.type],
    };
  },
};
