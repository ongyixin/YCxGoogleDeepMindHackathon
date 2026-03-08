"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { relationshipLabel } from "@/lib/story/relationships";

interface RelationshipBarProps {
  score: number;        // -100 to 100
  delta?: number;
  characterName?: string;
  className?: string;
  compact?: boolean;
}

function scoreToSegments(score: number, total: number): number {
  // Map -100..100 to 0..total segments
  return Math.round(((score + 100) / 200) * total);
}

function scoreToColor(score: number): string {
  if (score >= 70) return "#FFDE00";           // devoted
  if (score >= 40) return "#FFDE00";           // friendly
  if (score >= 10) return "rgba(255,255,255,0.7)"; // warming up
  if (score >= -10) return "rgba(255,255,255,0.5)"; // neutral
  if (score >= -40) return "#FF9900";          // suspicious
  if (score >= -70) return "#CC0000";          // hostile
  return "#FF0000";                            // nemesis
}

function deltaLabel(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

export function RelationshipBar({
  score,
  delta,
  characterName,
  className,
  compact = false,
}: RelationshipBarProps) {
  const TOTAL_SEGMENTS = compact ? 12 : 16;
  const filledSegs = scoreToSegments(score, TOTAL_SEGMENTS);
  const color = scoreToColor(score);
  const label = relationshipLabel(score).toUpperCase();

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {!compact && (
        <div className="flex items-center justify-between">
          <span className="font-pixel text-base tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
            {characterName ? `${characterName.toUpperCase()} AFFECTION` : "RELATIONSHIP"}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-pixel text-base" style={{ color }}>
              {label}
            </span>
            {delta !== undefined && delta !== 0 && (
              <motion.span
                key={delta}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="font-pixel text-base font-bold"
                style={{ color: delta > 0 ? "#FFDE00" : "#FF0000" }}
              >
                {deltaLabel(delta)}
              </motion.span>
            )}
          </div>
        </div>
      )}

      {/* Segmented bar */}
      <div className="flex gap-[2px] items-center">
        {Array.from({ length: TOTAL_SEGMENTS }).map((_, i) => {
          const filled = i < filledSegs;
          const isMidpoint = i === Math.floor(TOTAL_SEGMENTS / 2) - 1;
          return (
            <div
              key={i}
              className={cn("transition-all duration-300", compact ? "h-2" : "h-3")}
              style={{
                width: compact ? 8 : 10,
                border: `1px solid ${filled ? color : "rgba(255,255,255,0.15)"}`,
                background: filled ? color : "transparent",
                boxShadow: filled && i === filledSegs - 1 ? `0 0 4px ${color}` : "none",
                marginRight: isMidpoint ? 3 : 0,
              }}
            />
          );
        })}
      </div>

      {compact && (
        <div className="flex items-center justify-between">
          <span className="font-pixel text-base" style={{ color }}>
            {label}
          </span>
          {delta !== undefined && delta !== 0 && (
            <span
              className="font-pixel text-base font-bold"
              style={{ color: delta > 0 ? "#FFDE00" : "#FF0000" }}
            >
              {deltaLabel(delta)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default RelationshipBar;
