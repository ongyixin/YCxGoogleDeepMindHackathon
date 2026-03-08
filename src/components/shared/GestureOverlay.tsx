"use client";

/**
 * GestureOverlay — picture-in-picture panel for front-camera + gesture detection.
 *
 * Shows a small mirrored front-camera feed in the bottom-left corner with:
 *   • Hand landmark skeleton drawn on a canvas overlay
 *   • Detected gesture label in pixel-art style
 *   • "GESTURE VISION" header to fit the retro RPG aesthetic
 *   • Collapse toggle so users can hide the preview
 *
 * Design: pixel-art RPG — sharp corners, `#CC0000` borders, `#FFDE00` accents,
 * scanline texture, monospace labels. Matches ObjectLabel / StoryHUD tone exactly.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { DetectedGesture } from "@/hooks/useGestureDetection";

// ─── Hand landmark connections (MediaPipe hand topology) ─────────────────────

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // index
  [5, 9], [9, 10], [10, 11], [11, 12],  // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20], // pinky + palm
];

// ─── Gesture to display info ──────────────────────────────────────────────────

interface GestureDisplay {
  icon: string;
  label: string;
  color: string;
}

const GESTURE_DISPLAY: Record<string, GestureDisplay> = {
  thumbs_up:   { icon: "👍", label: "THUMBS UP",   color: "#34d399" },
  thumbs_down: { icon: "👎", label: "THUMBS DOWN", color: "#f87171" },
  victory:     { icon: "✌️", label: "VICTORY",     color: "#FFDE00" },
  open_palm:   { icon: "🖐️", label: "OPEN PALM",   color: "#60a5fa" },
  closed_fist: { icon: "✊", label: "FIST",        color: "#f87171" },
  pointing:    { icon: "☝️", label: "POINTING",    color: "#a78bfa" },
  i_love_you:  { icon: "🤟", label: "I LOVE YOU",  color: "#f472b6" },
  none:        { icon: "·",  label: "SCANNING…",   color: "#6b7280" },
};

function getDisplay(label: string | null): GestureDisplay {
  if (!label) return { icon: "·", label: "SCANNING…", color: "#6b7280" };
  return GESTURE_DISPLAY[label] ?? { icon: "❓", label: label.toUpperCase(), color: "#e5e7eb" };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface GestureOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  gesture: DetectedGesture | null;
  isReady: boolean;
  modelError: string | null;
}

// ─── Landmark canvas painter ──────────────────────────────────────────────────

function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number
) {
  if (!landmarks.length) return;

  // Connections
  ctx.strokeStyle = "rgba(255,222,0,0.7)";
  ctx.lineWidth = 1.5;
  for (const [a, b] of HAND_CONNECTIONS) {
    const lA = landmarks[a];
    const lB = landmarks[b];
    if (!lA || !lB) continue;
    ctx.beginPath();
    // Mirror x because the feed is mirrored
    ctx.moveTo((1 - lA.x) * width, lA.y * height);
    ctx.lineTo((1 - lB.x) * width, lB.y * height);
    ctx.stroke();
  }

  // Joints
  for (const lm of landmarks) {
    const x = (1 - lm.x) * width;
    const y = lm.y * height;
    ctx.fillStyle = "rgba(204,0,0,0.9)";
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.fillStyle = "rgba(255,222,0,0.95)";
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GestureOverlay({
  videoRef,
  canvasRef: _canvasRef,
  gesture,
  isReady,
  modelError,
}: GestureOverlayProps) {
  const [collapsed, setCollapsed] = useState(false);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const display = getDisplay(gesture?.label ?? null);

  // Sync the preview video to the same stream as the main video
  useEffect(() => {
    const src = videoRef.current?.srcObject;
    if (videoPreviewRef.current && src) {
      videoPreviewRef.current.srcObject = src as MediaStream;
      videoPreviewRef.current.play().catch(() => {});
    }
  }, [videoRef, isReady]);

  // Paint landmark skeleton onto overlay canvas every animation frame
  useEffect(() => {
    let rafId: number;
    const canvas = overlayCanvasRef.current;
    if (!canvas || !gesture?.landmarks?.length) return;

    function paint() {
      const c = overlayCanvasRef.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      if (gesture?.landmarks?.length) {
        drawLandmarks(ctx, gesture.landmarks, c.width, c.height);
      }
      rafId = requestAnimationFrame(paint);
    }

    rafId = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(rafId);
  }, [gesture]);

  // Clear canvas when gesture disappears
  useEffect(() => {
    if (!gesture && overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext("2d");
      ctx?.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }
  }, [gesture]);

  return (
    <div
      className="absolute bottom-[120px] left-3 z-[25] select-none"
      style={{ fontFamily: "inherit" }}
    >
      {/* Header bar — always visible as a toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-1.5 px-2 py-1 w-full font-pixel"
        style={{
          background: "rgba(6,4,14,0.97)",
          border: "2px solid #CC0000",
          borderBottom: collapsed ? "2px solid #CC0000" : "none",
          boxShadow: "2px 2px 0 rgba(204,0,0,0.45)",
          color: "#FFDE00",
          fontSize: 8,
          letterSpacing: "0.05em",
          cursor: "pointer",
        }}
      >
        {/* Status dot */}
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 0,
            flexShrink: 0,
            background: modelError ? "#f87171" : isReady ? "#34d399" : "#6b7280",
            display: "inline-block",
          }}
        />
        <span style={{ flex: 1, textAlign: "left" }}>GESTURE VISION</span>
        <span style={{ color: "rgba(255,222,0,0.5)", fontSize: 7 }}>
          {collapsed ? "▲" : "▼"}
        </span>
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, scaleY: 0, originY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0, originY: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              style={{
                background: "rgba(6,4,14,0.95)",
                border: "2px solid #CC0000",
                borderTop: "none",
                boxShadow: "2px 2px 0 rgba(204,0,0,0.45)",
                width: 120,
                overflow: "hidden",
              }}
            >
              {/* Camera preview with landmark canvas overlay */}
              <div style={{ position: "relative", width: 120, height: 90 }}>
                <video
                  ref={videoPreviewRef}
                  playsInline
                  muted
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: "scaleX(-1)",
                    display: "block",
                    opacity: isReady ? 0.85 : 0.3,
                  }}
                />
                {/* Landmark overlay canvas */}
                <canvas
                  ref={overlayCanvasRef}
                  width={120}
                  height={90}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                  }}
                />
                {/* Scanline texture */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    backgroundImage:
                      "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 3px)",
                  }}
                />
                {/* Loading / error overlay */}
                {!isReady && !modelError && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(6,4,14,0.7)",
                    }}
                  >
                    <span
                      className="font-pixel animate-pulse"
                      style={{ fontSize: 7, color: "rgba(255,222,0,0.6)", textAlign: "center", padding: "0 6px" }}
                    >
                      LOADING MODEL…
                    </span>
                  </div>
                )}
                {modelError && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(6,4,14,0.75)",
                    }}
                  >
                    <span
                      className="font-pixel"
                      style={{ fontSize: 7, color: "#f87171", textAlign: "center", padding: "0 6px" }}
                    >
                      VISION ERR
                    </span>
                  </div>
                )}
              </div>

              {/* Gesture readout */}
              <div
                style={{
                  borderTop: "1px solid rgba(204,0,0,0.4)",
                  padding: "4px 6px",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>{display.icon}</span>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <span
                    className="font-pixel"
                    style={{
                      fontSize: 7,
                      color: display.color,
                      letterSpacing: "0.04em",
                      display: "block",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {display.label}
                  </span>
                  {gesture && (
                    <span
                      className="font-pixel"
                      style={{ fontSize: 6, color: "rgba(255,240,176,0.45)", letterSpacing: "0.02em" }}
                    >
                      {Math.round(gesture.confidence * 100)}% CONF
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default GestureOverlay;
