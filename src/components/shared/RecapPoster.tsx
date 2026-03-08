"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import type { ActiveMode, StoryGenre } from "@/types";

interface RecapPosterProps {
  mode: ActiveMode;
  genre?: StoryGenre;
  durationMinutes: number;
  totalXP: number;
  highlights: string[];
  posterUrl?: string;
  className?: string;
}

export const RecapPoster = forwardRef<HTMLDivElement, RecapPosterProps>(function RecapPoster({
  mode,
  genre,
  durationMinutes,
  totalXP,
  highlights,
  posterUrl,
  className,
}: RecapPosterProps, ref: React.Ref<HTMLDivElement>) {
  const isStory = mode === "story";
  const borderColor = isStory ? "#FFDE00" : "#FFDE00";
  const innerBorderColor = isStory ? "#CC0000" : "#3B4CCA";
  const accentColor = isStory ? "#FFDE00" : "#FFDE00";
  const bgColor = isStory ? "rgba(30,6,6,0.99)" : "rgba(6,8,30,0.99)";
  const shadowColor = isStory ? "rgba(204,0,0,0.6)" : "rgba(59,76,202,0.6)";
  const textColor = isStory ? "#FFF0B0" : "#B0C4FF";
  const titleText = isStory ? `THE ${formatGenre(genre ?? "mystery").toUpperCase()} SESSION` : "MISSION COMPLETE";
  const subtitle = isStory ? "EPISODE COMPLETE" : "CAMPAIGN DEBRIEF";

  return (
    <div
      ref={ref}
      className={cn("relative w-full", className)}
      style={{ aspectRatio: "9/16", maxHeight: "70vh" }}
    >
      {/* Outer gold border */}
      <div
        className="absolute inset-0"
        style={{
          border: `3px solid ${borderColor}`,
          boxShadow: `6px 6px 0 ${shadowColor}`,
        }}
      />
      {/* Inner purple/green border */}
      <div
        className="absolute inset-[6px]"
        style={{ border: `1px solid ${innerBorderColor}` }}
      />

      {/* Background */}
      <div className="absolute inset-0" style={{ background: bgColor }} />

      {/* Poster image (if available) */}
      {posterUrl && (
        <img
          src={posterUrl}
          alt="Episode poster"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: 0.3 }}
        />
      )}

      {/* Pixel grid overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col px-6 py-8 gap-4">
        {/* Top area */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          {/* Mode icon */}
          <div className="text-5xl">{isStory ? "🎭" : "⚡"}</div>

          {/* Stars */}
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="font-pixel text-base" style={{ color: accentColor }}>
                ★
              </span>
            ))}
          </div>

          {/* Subtitle */}
          <p className="font-pixel text-base tracking-wider" style={{ color: `${accentColor}80` }}>
            {subtitle}
          </p>

          {/* Main title */}
          <div
            className="w-full py-3 px-4"
            style={{ border: `2px solid ${borderColor}`, background: `${innerBorderColor}40` }}
          >
            <h2
              className="font-pixel leading-loose text-center"
              style={{ color: accentColor, fontSize: "16px", letterSpacing: "0.06em" }}
            >
              {titleText}
            </h2>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2">
          <StatBlock label={isStory ? "XP EARNED" : "TOTAL XP"} value={`+${totalXP}`} color={accentColor} borderColor={innerBorderColor} />
          <StatBlock label="DURATION" value={`${durationMinutes}M`} color={accentColor} borderColor={innerBorderColor} />
          <StatBlock label={isStory ? "GENRE" : "MODE"} value={isStory ? formatGenre(genre ?? "mystery").slice(0, 6).toUpperCase() : "QUEST"} color={accentColor} borderColor={innerBorderColor} />
        </div>

        {/* Highlights */}
        <div className="flex flex-col gap-1.5">
          <p className="font-pixel text-base tracking-wider mb-1" style={{ color: `${accentColor}60` }}>
            ▸ HIGHLIGHTS
          </p>
          {highlights.slice(0, 3).map((h, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-2"
              style={{
                border: `1px solid ${innerBorderColor}`,
                background: `${innerBorderColor}30`,
              }}
            >
              <span className="font-pixel text-base" style={{ color: accentColor }}>■</span>
              <p className="font-vt text-xl flex-1 truncate" style={{ color: textColor }}>
                {h}
              </p>
            </div>
          ))}
        </div>

        {/* Watermark */}
        <div className="text-center">
          <p className="font-pixel text-[9px] tracking-wider" style={{ color: `${accentColor}25` }}>
            {isStory ? "◆ MAIN CHARACTER MODE ◆" : "[ MAIN CHARACTER MODE ]"}
          </p>
        </div>
      </div>
    </div>
  );
});

function StatBlock({
  label,
  value,
  color,
  borderColor,
}: {
  label: string;
  value: string;
  color: string;
  borderColor: string;
}) {
  return (
    <div
      className="flex flex-col items-center py-2 px-1"
      style={{ border: `2px solid ${borderColor}`, background: `${borderColor}30` }}
    >
      <span className="font-pixel text-base tabular-nums" style={{ color }}>
        {value}
      </span>
      <span className="font-pixel text-center mt-1" style={{ color: `${color}50`, fontSize: "9px", letterSpacing: "0.04em" }}>
        {label}
      </span>
    </div>
  );
}

function formatGenre(genre: StoryGenre): string {
  return genre.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
