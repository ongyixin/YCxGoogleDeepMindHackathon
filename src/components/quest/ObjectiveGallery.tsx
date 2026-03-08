"use client";

import { useEffect } from "react";
import type { ObjectiveSnapshot } from "@/types";

interface ObjectiveGalleryProps {
  snapshots: ObjectiveSnapshot[];
  missionCodename: string;
  onClose: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function ObjectiveGallery({
  snapshots,
  missionCodename,
  onClose,
}: ObjectiveGalleryProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ background: "rgba(4,6,22,0.97)" }}
    >
      {/* Scanlines overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 4px)",
        }}
      />

      {/* Header */}
      <div
        className="relative z-10 flex items-center justify-between px-4 py-3 shrink-0"
        style={{
          background: "rgba(6,8,30,0.98)",
          borderBottom: "2px solid #3B4CCA",
          boxShadow: "0 2px 0 rgba(59,76,202,0.3)",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 bg-[#FFDE00] animate-pulse2" />
            <div className="w-1.5 h-1.5 bg-[#FFDE00] animate-pulse2" style={{ animationDelay: "0.2s" }} />
            <div className="w-1.5 h-1.5 bg-[#FFDE00] animate-pulse2" style={{ animationDelay: "0.4s" }} />
          </div>
          <div>
            <p className="font-pixel text-base tracking-widest" style={{ color: "#FFDE00" }}>
              MISSION LOG
            </p>
            <p className="font-vt text-xl" style={{ color: "rgba(176,196,255,0.5)" }}>
              {missionCodename} — {snapshots.length} checkpoint{snapshots.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="font-pixel text-base touch-target px-3 py-1.5 active:translate-x-[1px] active:translate-y-[1px]"
          style={{
            border: "2px solid rgba(59,76,202,0.6)",
            background: "rgba(6,8,30,0.8)",
            color: "rgba(255,222,0,0.7)",
            boxShadow: "2px 2px 0 rgba(59,76,202,0.3)",
          }}
        >
          ✕ CLOSE
        </button>
      </div>

      {/* Gallery body */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4">
        {snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <span className="font-pixel text-3xl" style={{ color: "rgba(59,76,202,0.4)" }}>□</span>
            <p className="font-pixel text-base tracking-wider" style={{ color: "rgba(255,255,255,0.2)" }}>
              NO CHECKPOINTS YET
            </p>
            <p className="font-vt text-xl" style={{ color: "rgba(176,196,255,0.3)" }}>
              Complete objectives to capture intel
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Timeline spine */}
            <div className="relative">
              {snapshots.map((snap, idx) => (
                <div key={snap.objectiveId} className="relative flex gap-3 mb-4 last:mb-0">
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
                      {/* Film grain overlay */}
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
                      {/* Completed checkmark badge */}
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

              {/* "MISSION IN PROGRESS" tail indicator when not all objectives done */}
              <div className="flex items-center gap-3 mt-2 ml-9">
                <div
                  className="font-pixel text-base animate-pulse2"
                  style={{ color: "rgba(59,76,202,0.5)", fontSize: "11px", letterSpacing: "0.1em" }}
                >
                  ▶ MISSION IN PROGRESS
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="relative z-10 shrink-0 px-4 py-3 flex items-center justify-between"
        style={{
          borderTop: "2px solid rgba(59,76,202,0.4)",
          background: "rgba(6,8,30,0.98)",
        }}
      >
        <span className="font-pixel text-base" style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px", letterSpacing: "0.1em" }}>
          INTEL ARCHIVE // {snapshots.length} FRAME{snapshots.length !== 1 ? "S" : ""} CAPTURED
        </span>
        <button
          onClick={onClose}
          className="font-pixel touch-target px-5 py-2.5 active:translate-x-[2px] active:translate-y-[2px]"
          style={{
            background: "#FFDE00",
            border: "2px solid #1a2880",
            boxShadow: "3px 3px 0 rgba(26,40,128,0.6)",
            color: "#0a0e30",
            fontSize: "11px",
            letterSpacing: "0.08em",
          }}
        >
          ◀ BACK TO MISSION
        </button>
      </div>
    </div>
  );
}

export default ObjectiveGallery;
