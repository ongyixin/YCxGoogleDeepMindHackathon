"use client";

export const dynamic = "force-dynamic";

import { Suspense, useRef, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { RecapPoster } from "@/components/shared/RecapPoster";
import { MOCK_STORY_SESSION, MOCK_QUEST_SESSION, MOCK_CAMPAIGN_RECAP } from "@/lib/mock-data";
import type { ActiveMode, ObjectiveSnapshot } from "@/types";

const DEBRIEF_SNAPSHOTS_KEY = "mcm_debrief_snapshots";

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// ─── Share Modal ──────────────────────────────────────────────────────────────

function ShareModal({ isStory, onClose }: { isStory: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const accentColor = "#FFDE00";
  const innerBorder = isStory ? "#CC0000" : "#3B4CCA";
  const shadowColor = isStory ? "rgba(204,0,0,0.6)" : "rgba(59,76,202,0.6)";
  const bgColor = isStory ? "rgba(30,6,6,0.99)" : "rgba(6,8,30,0.99)";
  const textColor = isStory ? "#FFF0B0" : "#B0C4FF";

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  }

  function handleNativeShare() {
    if (navigator.share) {
      navigator.share({
        title: "Main Character Mode",
        text: isStory
          ? "I was the main character in my own story! 🎭"
          : "Mission complete. Campaign debrief unlocked. ⚡",
        url: window.location.href,
      });
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center px-4 pb-6"
      style={{ background: "rgba(4,6,22,0.88)" }}
      onClick={onClose}
    >
      {/* Scanlines on backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.1) 3px, rgba(0,0,0,0.1) 4px)",
        }}
      />

      <div
        className="relative w-full max-w-sm"
        style={{
          border: `3px solid ${accentColor}`,
          background: bgColor,
          boxShadow: `6px 6px 0 ${shadowColor}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Inner border */}
        <div className="absolute inset-[4px] pointer-events-none" style={{ border: `1px solid ${innerBorder}` }} />

        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${innerBorder}` }}
        >
          <div className="flex items-center gap-2">
            <span className="font-pixel text-base animate-blink" style={{ color: accentColor }}>▶</span>
            <span className="font-pixel text-base tracking-widest" style={{ color: accentColor }}>
              {isStory ? "SHARE EPISODE" : "SHARE DEBRIEF"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="font-pixel text-base touch-target px-3 py-1 active:translate-x-[1px] active:translate-y-[1px]"
            style={{
              border: `1px solid ${innerBorder}`,
              background: `${innerBorder}30`,
              color: `${accentColor}80`,
              fontSize: "11px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-2 px-4 py-4">
          <p className="font-vt text-xl mb-2" style={{ color: `${textColor}80` }}>
            {isStory ? "Share your episode with the world." : "Broadcast your mission results."}
          </p>

          {/* Copy link */}
          <button
            className="w-full touch-target font-pixel active:translate-x-[2px] active:translate-y-[2px]"
            style={{
              background: copied ? innerBorder : "transparent",
              border: `2px solid ${innerBorder}`,
              boxShadow: `3px 3px 0 ${shadowColor}`,
              color: copied ? accentColor : accentColor,
              fontSize: "12px",
              letterSpacing: "0.1em",
              padding: "14px 16px",
              transition: "background 0.15s",
            }}
            onClick={handleCopy}
          >
            {copied ? "✓ LINK COPIED" : "⎘ COPY LINK"}
          </button>

          {/* Native share (only on supported devices) */}
          {typeof navigator !== "undefined" && !!navigator.share && (
            <button
              className="w-full touch-target font-pixel active:translate-x-[2px] active:translate-y-[2px]"
              style={{
                background: accentColor,
                border: `2px solid ${innerBorder}`,
                boxShadow: `3px 3px 0 ${shadowColor}`,
                color: isStory ? "#1a0800" : "#0a0e30",
                fontSize: "12px",
                letterSpacing: "0.1em",
                padding: "14px 16px",
              }}
              onClick={handleNativeShare}
            >
              ↗ SHARE VIA...
            </button>
          )}

          {/* Dismiss */}
          <button
            className="w-full touch-target font-pixel active:translate-x-[1px] active:translate-y-[1px]"
            style={{
              background: "transparent",
              border: `2px solid rgba(255,255,255,0.15)`,
              color: "rgba(255,255,255,0.35)",
              fontSize: "12px",
              letterSpacing: "0.1em",
              padding: "12px 16px",
            }}
            onClick={onClose}
          >
            ← DISMISS
          </button>
        </div>

        {/* Corner brackets */}
        {[
          "top-0 left-0",
          "top-0 right-0",
          "bottom-0 left-0",
          "bottom-0 right-0",
        ].map((pos, i) => (
          <div
            key={i}
            className={`absolute w-2.5 h-2.5 pointer-events-none ${pos}`}
            style={{
              borderTop: i < 2 ? `2px solid ${accentColor}` : undefined,
              borderBottom: i >= 2 ? `2px solid ${accentColor}` : undefined,
              borderLeft: i % 2 === 0 ? `2px solid ${accentColor}` : undefined,
              borderRight: i % 2 === 1 ? `2px solid ${accentColor}` : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Debrief Log (inline, for PDF export) ────────────────────────────────────

function DebriefLog({
  snapshots,
  logRef,
}: {
  snapshots: ObjectiveSnapshot[];
  logRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (snapshots.length === 0) return null;

  return (
    <div
      ref={logRef}
      style={{ background: "rgba(6,8,30,0.99)" }}
    >
      {/* Section header */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{
          borderTop: "2px solid #3B4CCA",
          borderBottom: "1px solid rgba(59,76,202,0.4)",
          background: "rgba(6,8,30,0.98)",
        }}
      >
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 bg-[#FFDE00]"
              style={{ opacity: 0.7 + i * 0.1 }}
            />
          ))}
        </div>
        <div>
          <p className="font-pixel text-base tracking-widest" style={{ color: "#FFDE00" }}>
            MISSION LOG
          </p>
          <p className="font-vt text-xl" style={{ color: "rgba(176,196,255,0.5)" }}>
            {snapshots.length} checkpoint{snapshots.length !== 1 ? "s" : ""} captured
          </p>
        </div>
        <div className="ml-auto">
          <span
            className="font-pixel text-base"
            style={{ color: "rgba(255,222,0,0.3)", fontSize: "10px", letterSpacing: "0.1em" }}
          >
            INTEL ARCHIVE
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="px-4 py-4 flex flex-col gap-4">
        {snapshots.map((snap, idx) => (
          <div key={snap.objectiveId} className="flex gap-3">
            {/* Timeline indicator */}
            <div className="flex flex-col items-center shrink-0 pt-1" style={{ width: "28px" }}>
              <div
                className="font-pixel text-base w-6 h-6 flex items-center justify-center shrink-0"
                style={{
                  background: "#FFDE00",
                  color: "#0a0e30",
                  fontSize: "10px",
                }}
              >
                {String(idx + 1).padStart(2, "0")}
              </div>
              {idx < snapshots.length - 1 && (
                <div
                  className="flex-1 w-px mt-1"
                  style={{ background: "rgba(59,76,202,0.4)", minHeight: "16px" }}
                />
              )}
            </div>

            {/* Card */}
            <div
              className="flex-1 overflow-hidden"
              style={{
                border: "2px solid rgba(59,76,202,0.5)",
                background: "rgba(6,8,30,0.85)",
                boxShadow: "3px 3px 0 rgba(59,76,202,0.2)",
              }}
            >
              {/* Photo */}
              <div className="relative" style={{ aspectRatio: "16/9" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={snap.dataUrl}
                  alt={snap.objectiveDescription}
                  className="w-full h-full object-cover"
                  style={{ display: "block" }}
                />
                {/* Film grain */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 3px)",
                    mixBlendMode: "multiply",
                  }}
                />
                {/* Timestamp badge */}
                <div
                  className="absolute bottom-0 right-0 px-2 py-0.5"
                  style={{
                    background: "rgba(4,6,22,0.85)",
                    borderTop: "1px solid rgba(59,76,202,0.4)",
                    borderLeft: "1px solid rgba(59,76,202,0.4)",
                  }}
                >
                  <span
                    className="font-mono-dm tabular-nums"
                    style={{ color: "rgba(255,222,0,0.5)", fontSize: "10px" }}
                  >
                    {formatTime(snap.capturedAt)}
                  </span>
                </div>
                {/* LOGGED badge */}
                <div
                  className="absolute top-0 left-0 px-2 py-0.5"
                  style={{
                    background: "rgba(4,6,22,0.85)",
                    borderBottom: "1px solid rgba(255,222,0,0.3)",
                    borderRight: "1px solid rgba(255,222,0,0.3)",
                  }}
                >
                  <span className="font-pixel text-base" style={{ color: "#FFDE00" }}>
                    ■ LOGGED
                  </span>
                </div>
              </div>

              {/* Caption */}
              <div
                className="px-3 py-2"
                style={{ borderTop: "1px solid rgba(59,76,202,0.35)" }}
              >
                <p
                  className="font-vt text-xl leading-snug"
                  style={{ color: "rgba(176,196,255,0.85)" }}
                >
                  {snap.objectiveDescription}
                </p>
              </div>
            </div>
          </div>
        ))}

        {/* Footer watermark */}
        <p
          className="text-center font-pixel mt-2"
          style={{ color: "rgba(255,222,0,0.15)", fontSize: "9px", letterSpacing: "0.15em" }}
        >
          [ MAIN CHARACTER MODE — MISSION LOG ]
        </p>
      </div>
    </div>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function RecapContent() {
  const searchParams = useSearchParams();
  const mode = (searchParams.get("mode") ?? "story") as ActiveMode;
  const isStory = mode === "story";
  const posterRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [snapshots, setSnapshots] = useState<ObjectiveSnapshot[]>([]);

  const session = (isStory ? MOCK_STORY_SESSION : MOCK_QUEST_SESSION) as import("@/types").SessionState;
  const durationMinutes = Math.round((Date.now() - session.startedAt) / 1000 / 60);
  const highlights = isStory
    ? [
        "Lumina formed an unexpected alliance",
        "The Stolen Light quest completed",
        `+${session.progression.xp} XP earned`,
      ]
    : [
        MOCK_CAMPAIGN_RECAP.highlightMission,
        `${MOCK_CAMPAIGN_RECAP.missionsCompleted} missions completed`,
        `Longest combo: ×${MOCK_CAMPAIGN_RECAP.longestCombo}`,
      ];

  // Load snapshots from sessionStorage (populated by quest page when mission completes)
  useEffect(() => {
    if (isStory) return;
    try {
      const raw = sessionStorage.getItem(DEBRIEF_SNAPSHOTS_KEY);
      if (raw) setSnapshots(JSON.parse(raw));
    } catch { /* silent */ }
  }, [isStory]);

  const exportToPDF = useCallback(async () => {
    if (!posterRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const { jsPDF } = await import("jspdf");

      // Page 1 — poster
      const posterDataUrl = await toPng(posterRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#06040e",
      });

      const posterImg = new Image();
      posterImg.src = posterDataUrl;
      await new Promise<void>((res) => { posterImg.onload = () => res(); });

      const pW = posterImg.naturalWidth;
      const pH = posterImg.naturalHeight;
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [pW, pH] });
      pdf.addImage(posterDataUrl, "PNG", 0, 0, pW, pH);

      // Page 2 — mission log (quest mode only, if snapshots exist)
      if (!isStory && logRef.current && snapshots.length > 0) {
        const logDataUrl = await toPng(logRef.current, {
          cacheBust: true,
          pixelRatio: 2,
          backgroundColor: "#06040e",
        });

        const logImg = new Image();
        logImg.src = logDataUrl;
        await new Promise<void>((res) => { logImg.onload = () => res(); });

        const lW = logImg.naturalWidth;
        const lH = logImg.naturalHeight;
        pdf.addPage([lW, lH]);
        pdf.addImage(logDataUrl, "PNG", 0, 0, lW, lH);
      }

      pdf.save("campaign-debrief.pdf");
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, isStory, snapshots.length]);

  const borderColor = "#FFDE00";
  const innerBorder = isStory ? "#CC0000" : "#3B4CCA";
  const bg = "#06040e";
  const accentColor = "#FFDE00";
  const shadowColor = isStory ? "rgba(204,0,0,0.5)" : "rgba(59,76,202,0.5)";
  const textColor = isStory ? "#FFF0B0" : "#B0C4FF";

  void borderColor;
  void textColor;

  return (
    <div
      className="relative h-full w-full overflow-hidden flex flex-col pixel-grid"
      style={{ background: bg }}
    >
      {/* Background atmosphere */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isStory
            ? "radial-gradient(ellipse at 30% 20%, rgba(204,0,0,0.3) 0%, transparent 55%), radial-gradient(ellipse at 70% 80%, rgba(255,222,0,0.1) 0%, transparent 55%)"
            : "radial-gradient(ellipse at 20% 80%, rgba(59,76,202,0.3) 0%, transparent 55%), radial-gradient(ellipse at 80% 20%, rgba(59,76,202,0.06) 0%, transparent 55%)",
        }}
      />
      {/* Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)",
        }}
      />

      <div className="relative z-10 flex flex-col flex-1 overflow-y-auto safe-top safe-bottom px-4 py-5 gap-4">
        {/* Header chrome */}
        <div
          className="flex items-center justify-between"
          style={{
            border: `2px solid ${innerBorder}`,
            background: isStory ? "rgba(30,6,6,0.95)" : "rgba(6,8,30,0.95)",
            boxShadow: `2px 2px 0 ${shadowColor}`,
            padding: "8px 12px",
          }}
        >
          <a
            href={`/${mode}`}
            className="font-pixel text-base touch-target"
            style={{ color: `${accentColor}80` }}
          >
            ← BACK
          </a>
          <span className="font-pixel text-base tracking-wider" style={{ color: `${accentColor}50` }}>
            {isStory ? "★ EPISODE COMPLETE ★" : "[ CAMPAIGN DEBRIEF ]"}
          </span>
        </div>

        {/* Poster */}
        <RecapPoster
          ref={posterRef}
          mode={mode}
          genre={(session as import("@/types").SessionState).storyState?.genre}
          durationMinutes={durationMinutes}
          totalXP={session.progression.xp}
          highlights={highlights}
        />

        {/* Mission Log — quest mode with captured snapshots */}
        {!isStory && snapshots.length > 0 && (
          <div
            style={{
              border: `2px solid #3B4CCA`,
              boxShadow: `3px 3px 0 rgba(59,76,202,0.3)`,
            }}
          >
            <DebriefLog snapshots={snapshots} logRef={logRef} />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <button
            className="w-full touch-target font-pixel active:translate-x-[2px] active:translate-y-[2px]"
            style={{
              background: accentColor,
              border: `2px solid ${innerBorder}`,
              boxShadow: `3px 3px 0 ${shadowColor}`,
              color: isStory ? "#1a0800" : "#0a0e30",
              fontSize: "12px",
              letterSpacing: "0.1em",
              padding: "16px 16px",
              transition: "box-shadow 0.05s, transform 0.05s",
            }}
            onClick={() => setShowShareModal(true)}
          >
            {isStory ? "▶ SHARE EPISODE" : "▶ SHARE DEBRIEF"}
          </button>

          {!isStory && (
            <button
              className="w-full touch-target font-pixel active:translate-x-[1px] active:translate-y-[1px]"
              disabled={isExporting}
              style={{
                background: isExporting ? "rgba(59,76,202,0.18)" : "transparent",
                border: `2px solid ${innerBorder}`,
                boxShadow: `2px 2px 0 ${shadowColor}`,
                color: isExporting ? `${accentColor}50` : accentColor,
                fontSize: "12px",
                letterSpacing: "0.1em",
                padding: "14px 16px",
                transition: "box-shadow 0.05s, transform 0.05s, opacity 0.15s",
                cursor: isExporting ? "not-allowed" : "pointer",
              }}
              onClick={exportToPDF}
            >
              {isExporting ? "⏳ EXPORTING..." : "⬇ EXPORT PDF"}
            </button>
          )}

          <a
            href="/"
            className="w-full touch-target font-pixel text-center flex items-center justify-center active:translate-x-[1px] active:translate-y-[1px]"
            style={{
              background: "transparent",
              border: `2px solid rgba(255,255,255,0.18)`,
              boxShadow: "2px 2px 0 rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.4)",
              fontSize: "12px",
              letterSpacing: "0.1em",
              padding: "14px 16px",
              transition: "box-shadow 0.05s, transform 0.05s",
            }}
          >
            ↩ PLAY AGAIN
          </a>
        </div>

        {/* Footer */}
        <p className="text-center font-pixel" style={{ color: `${accentColor}15`, fontSize: "9px", letterSpacing: "0.15em" }}>
          MAIN CHARACTER MODE — YC × GOOGLE DEEPMIND
        </p>
      </div>

      {/* Share modal */}
      {showShareModal && (
        <ShareModal isStory={isStory} onClose={() => setShowShareModal(false)} />
      )}
    </div>
  );
}

export default function RecapPage() {
  return (
    <Suspense fallback={<div className="h-full w-full" style={{ background: "#06040e" }} />}>
      <RecapContent />
    </Suspense>
  );
}
