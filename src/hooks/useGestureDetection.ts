"use client";

/**
 * useGestureDetection — real-time hand gesture recognition via MediaPipe.
 *
 * Loads the GestureRecognizer model once, then processes the front-camera
 * video stream at a capped rate (~10 fps) using requestAnimationFrame.
 *
 * Recognized gestures (MediaPipe labels):
 *   None, Closed_Fist, Open_Palm, Pointing_Up, Thumb_Down,
 *   Thumb_Up, Victory, ILoveYou
 *
 * Normalised public labels used by the rest of the app:
 *   "thumbs_up"  "thumbs_down"  "victory"  "open_palm"
 *   "closed_fist"  "pointing"  "i_love_you"  "none"
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { GestureRecognizer, NormalizedLandmark } from "@mediapipe/tasks-vision";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DetectedGesture {
  /** Normalised gesture label (e.g. "thumbs_up") */
  label: string;
  /** Raw MediaPipe category name */
  raw: string;
  /** Detection confidence 0–1 */
  confidence: number;
  /** 21 hand landmarks (x, y normalised to video dims) for the first hand */
  landmarks: NormalizedLandmark[];
  /** Unix timestamp of this detection */
  timestamp: number;
}

export interface UseGestureDetectionReturn {
  /** Most recently stable gesture (debounced) */
  gesture: DetectedGesture | null;
  /** True once the model is loaded and processing */
  isReady: boolean;
  /** Non-null when model loading fails */
  modelError: string | null;
}

// ─── Label normalisation ──────────────────────────────────────────────────────

const RAW_TO_LABEL: Record<string, string> = {
  Thumb_Up:     "thumbs_up",
  Thumb_Down:   "thumbs_down",
  Victory:      "victory",
  Open_Palm:    "open_palm",
  Closed_Fist:  "closed_fist",
  Pointing_Up:  "pointing",
  ILoveYou:     "i_love_you",
  None:         "none",
};

function normaliseLabel(raw: string): string {
  return RAW_TO_LABEL[raw] ?? raw.toLowerCase().replace(/\s+/g, "_");
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum confidence to report a gesture (avoids jitter on low-confidence frames) */
const MIN_CONFIDENCE = 0.72;

/** How long (ms) a gesture must be held before it is surfaced */
const DEBOUNCE_MS = 300;

/** Frame processing interval cap — ~10 fps to stay lightweight */
const FRAME_INTERVAL_MS = 100;

// CDN path for the WASM runtime bundled by @mediapipe/tasks-vision
const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGestureDetection(
  videoRef: React.RefObject<HTMLVideoElement>,
  enabled: boolean = true
): UseGestureDetectionReturn {
  const [gesture, setGesture] = useState<DetectedGesture | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  // Debounce state: track how long current candidate gesture has been held
  const candidateRef = useRef<{ raw: string; since: number } | null>(null);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const recognizer = recognizerRef.current;
    if (!video || !recognizer || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const now = performance.now();
    if (now - lastFrameTimeRef.current < FRAME_INTERVAL_MS) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }
    lastFrameTimeRef.current = now;

    try {
      const results = recognizer.recognizeForVideo(video, now);
      const topGesture = results.gestures?.[0]?.[0];
      const landmarks = results.landmarks?.[0] ?? [];

      if (
        topGesture &&
        topGesture.categoryName !== "None" &&
        topGesture.score >= MIN_CONFIDENCE
      ) {
        const rawName = topGesture.categoryName;

        // Debounce: same gesture must be held for DEBOUNCE_MS
        if (candidateRef.current?.raw !== rawName) {
          candidateRef.current = { raw: rawName, since: now };
        } else if (now - candidateRef.current.since >= DEBOUNCE_MS) {
          setGesture({
            label: normaliseLabel(rawName),
            raw: rawName,
            confidence: topGesture.score,
            landmarks,
            timestamp: Date.now(),
          });
        }
      } else {
        // No gesture held — clear candidate and reset to null after debounce
        if (candidateRef.current !== null) {
          if (candidateRef.current.raw !== "none") {
            candidateRef.current = { raw: "none", since: now };
          } else if (now - candidateRef.current.since >= DEBOUNCE_MS) {
            candidateRef.current = null;
            setGesture(null);
          }
        }
      }
    } catch {
      // Silently ignore per-frame errors (video may not yet be ready)
    }

    rafRef.current = requestAnimationFrame(processFrame);
  }, [videoRef]);

  // Load model and start processing loop
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function loadModel() {
      try {
        const { GestureRecognizer, FilesetResolver } = await import(
          "@mediapipe/tasks-vision"
        );

        const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

        const recognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (cancelled) {
          recognizer.close();
          return;
        }

        recognizerRef.current = recognizer;
        setIsReady(true);

        rafRef.current = requestAnimationFrame(processFrame);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Model load failed";
        console.error("[useGestureDetection] Model load error:", err);
        setModelError(msg);
      }
    }

    loadModel();

    return () => {
      cancelled = true;
      stopLoop();
      recognizerRef.current?.close();
      recognizerRef.current = null;
      setIsReady(false);
    };
  }, [enabled, processFrame, stopLoop]);

  return { gesture, isReady, modelError };
}
