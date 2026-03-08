"use client";

/**
 * useVoiceAgent — voice interaction layer for character dialogue.
 *
 * STT:  Web Speech API (browser-native, no key needed)
 * TTS:  Gemini Live API — gemini-2.5-flash-native-audio-latest
 *       Audio streams chunk-by-chunk so playback starts in ~1s, not after
 *       the full response has been received.
 *
 * Voice state machine:
 *   idle → listening  (user presses mic)
 *        → processing (transcript received, /api/talk in flight)
 *        → speaking   (Gemini Live audio streaming)
 *        → idle       (audio ends / user cancels)
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoiceState = "idle" | "listening" | "processing" | "speaking";

export interface UseVoiceAgentReturn {
  voiceState: VoiceState;
  lastTranscript: string;
  isEnabled: boolean;
  isSpeechSupported: boolean;
  toggleEnabled: () => void;
  startListening: (onTranscript: (text: string) => void) => void;
  stopListening: () => void;
  speakAsCharacter: (text: string) => Promise<void>;
  cancelSpeaking: () => void;
  setProcessing: () => void;
}

// ─── Voice selection ──────────────────────────────────────────────────────────

/** Maps personality/voiceStyle to a Gemini Live prebuilt voice name. */
function pickVoice(personality: string, voiceStyle: string): string {
  const s = `${personality} ${voiceStyle}`.toLowerCase();
  if (/\b(female|woman|goddess|queen|witch|she|her|lady|mother|sister)\b/.test(s)) return "Aoede";
  if (/\b(deep|gruff|dark|villain|demon|sinister|menacing|raspy|gravel|shadow)\b/.test(s)) return "Charon";
  if (/\b(chaotic|playful|mischiev|trickster|jester|comedian|clown|comedic|chaos)\b/.test(s)) return "Puck";
  if (/\b(stern|warrior|soldier|stoic|strong|heroic|brave|guardian|protector)\b/.test(s)) return "Fenrir";
  return "Kore";
}

// ─── PCM decoder ─────────────────────────────────────────────────────────────

/** Convert base64-encoded 16-bit LE PCM → Float32 samples (for AudioContext). */
function base64PcmToFloat32(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const i16 = new Int16Array(bytes.buffer);
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768.0;
  return f32;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceAgent({
  characterName,
  personality,
  voiceStyle,
  defaultEnabled = false,
}: {
  characterName: string;
  personality: string;
  voiceStyle: string;
  /** When true, voice mode starts enabled (e.g. demo mode). */
  defaultEnabled?: boolean;
}): UseVoiceAgentReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [lastTranscript, setLastTranscript] = useState("");
  const [isEnabled, setIsEnabled] = useState(defaultEnabled);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scheduledEndTimeRef = useRef<number>(0);
  const lastSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const voiceStateRef = useRef<VoiceState>("idle");
  voiceStateRef.current = voiceState;

  // Track whether speaking has been cancelled mid-stream
  const cancelledRef = useRef(false);
  const liveSessionRef = useRef<{ close: () => void } | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "";
  const voice = pickVoice(personality, voiceStyle);

  useEffect(() => {
    return () => {
      try { recognitionRef.current?.abort(); } catch {}
      try { liveSessionRef.current?.close(); } catch {}
      audioCtxRef.current?.close();
    };
  }, []);

  const isSpeechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // ── STT ──────────────────────────────────────────────────────────────────

  const startListening = useCallback(
    (onTranscript: (text: string) => void) => {
      if (!isSpeechSupported) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rec: any = new SR();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      recognitionRef.current = rec;

      rec.onstart = () => setVoiceState("listening");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (e: any) => {
        const text: string = e.results[0]?.[0]?.transcript?.trim() ?? "";
        if (text) {
          setLastTranscript(text);
          setVoiceState("processing");
          onTranscript(text);
        }
      };

      rec.onerror = () => {
        if (voiceStateRef.current === "listening") setVoiceState("idle");
      };
      rec.onend = () => {
        if (voiceStateRef.current === "listening") setVoiceState("idle");
      };

      rec.start();
    },
    [isSpeechSupported],
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const setProcessing = useCallback(() => setVoiceState("processing"), []);

  // ── Cancel speaking ───────────────────────────────────────────────────────

  const cancelSpeaking = useCallback(() => {
    cancelledRef.current = true;
    try { liveSessionRef.current?.close(); } catch {}
    liveSessionRef.current = null;
    try { lastSourceRef.current?.stop(); } catch {}
    lastSourceRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setVoiceState("idle");
  }, []);

  const toggleEnabled = useCallback(() => {
    setIsEnabled((v) => {
      if (v) {
        try { recognitionRef.current?.abort(); } catch {}
        cancelledRef.current = true;
        try { liveSessionRef.current?.close(); } catch {}
        liveSessionRef.current = null;
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
        setVoiceState("idle");
      }
      return !v;
    });
  }, []);

  // ── TTS via browser SpeechSynthesis (offline fallback) ──────────────────

  const speakWithBrowserTTS = useCallback(
    (text: string): Promise<void> => {
      return new Promise((resolve) => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) {
          setVoiceState("idle");
          resolve();
          return;
        }
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.rate = 1.05;
        utt.pitch = 1.1;
        // Pick a female-sounding voice if available
        const voices = window.speechSynthesis.getVoices();
        const femaleVoice =
          voices.find((v) => /female|woman|girl/i.test(v.name)) ??
          voices.find((v) => /samantha|victoria|karen|moira|tessa|fiona|veena/i.test(v.name)) ??
          voices.find((v) => v.lang.startsWith("en")) ??
          null;
        if (femaleVoice) utt.voice = femaleVoice;
        setVoiceState("speaking");
        cancelledRef.current = false;
        utt.onend = () => {
          if (!cancelledRef.current) setVoiceState("idle");
          resolve();
        };
        utt.onerror = () => {
          if (!cancelledRef.current) setVoiceState("idle");
          resolve();
        };
        window.speechSynthesis.speak(utt);
      });
    },
    []
  );

  // ── TTS via Gemini Live (streaming playback) ──────────────────────────────

  const speakAsCharacter = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim()) {
        setVoiceState("idle");
        return;
      }

      // Fall back to browser TTS when no Gemini API key is available
      if (!apiKey) {
        await speakWithBrowserTTS(text);
        return;
      }

      setVoiceState("speaking");
      cancelledRef.current = false;

      try {
        // Use the /web sub-path to guarantee the browser build (BrowserWebSocket)
        const { GoogleGenAI } = await import("@google/genai/web");
        const ai = new GoogleGenAI({ apiKey });

        // Reuse / recreate AudioContext at 24 kHz to match Gemini PCM output
        if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
          audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") await ctx.resume();

        // Reset streaming schedule
        scheduledEndTimeRef.current = ctx.currentTime;
        lastSourceRef.current = null;

        /**
         * Queue one decoded PCM chunk as a scheduled AudioBufferSource.
         * Returns the source node so we can mark the last one for onended.
         */
        function scheduleChunk(samples: Float32Array): AudioBufferSourceNode {
          const buf = ctx.createBuffer(1, samples.length, 24000);
          buf.getChannelData(0).set(samples);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          const startAt = Math.max(ctx.currentTime, scheduledEndTimeRef.current);
          src.start(startAt);
          scheduledEndTimeRef.current = startAt + buf.duration;
          return src;
        }

        const systemPrompt =
          `You are a professional voice actor performing the role of ${characterName}. ` +
          `Character personality: ${personality}. Voice style: ${voiceStyle}. ` +
          `When the user sends text inside quotation marks, speak it verbatim with full ` +
          `emotional expression fitting the character. Do not add any extra words, ` +
          `commentary, or additional lines — only voice the quoted text.`;

        await new Promise<void>((resolve, reject) => {
          let resolved = false;

          const finish = (err?: unknown) => {
            if (resolved) return;
            resolved = true;
            liveSessionRef.current = null;
            if (!cancelledRef.current) setVoiceState("idle");
            if (err) reject(err); else resolve();
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (ai.live as any)
            .connect({
              model: "gemini-2.5-flash-native-audio-latest",
              config: {
                responseModalities: ["AUDIO"],
                systemInstruction: systemPrompt,
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voice },
                  },
                },
              },
              callbacks: {
                onopen() {},
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onmessage(msg: any) {
                  if (cancelledRef.current) { finish(); return; }

                  const parts = msg?.serverContent?.modelTurn?.parts ?? [];
                  for (const part of parts) {
                    if (part?.inlineData?.mimeType?.includes("audio") && part.inlineData.data) {
                      const samples = base64PcmToFloat32(part.inlineData.data);
                      const src = scheduleChunk(samples);
                      lastSourceRef.current = src;
                    }
                  }

                  // Turn complete — attach onended to the last scheduled source
                  if (msg?.serverContent?.turnComplete) {
                    if (lastSourceRef.current) {
                      lastSourceRef.current.onended = () => finish();
                    } else {
                      // No audio was produced
                      finish();
                    }
                    // Close the session — we don't need more data
                    try { liveSessionRef.current?.close(); } catch {}
                  }
                },
                onclose() { finish(); },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onerror(e: any) {
                  console.error("[VoiceAgent] Gemini Live error:", e);
                  finish(e);
                },
              },
            })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then((session: any) => {
              if (cancelledRef.current) { session.close(); finish(); return; }
              liveSessionRef.current = session;
              // Send the character's dialogue in quotes so the model reads it verbatim
              session.sendClientContent({
                turns: [
                  {
                    role: "user",
                    parts: [{ text: `"${text}"` }],
                  },
                ],
                turnComplete: true,
              });
            })
            .catch((err: unknown) => finish(err));
        });
      } catch (err) {
        console.error("[VoiceAgent] speakAsCharacter error:", err);
        if (!cancelledRef.current) setVoiceState("idle");
      }
    },
    [apiKey, characterName, personality, voiceStyle, voice, speakWithBrowserTTS],
  );

  return {
    voiceState,
    lastTranscript,
    isEnabled,
    isSpeechSupported,
    toggleEnabled,
    startListening,
    stopListening,
    speakAsCharacter,
    cancelSpeaking,
    setProcessing,
  };
}
