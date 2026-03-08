"use client";

import { motion } from "framer-motion";

import type { ObjectCharacter } from "@/types";
import type { VoiceState } from "@/hooks/useVoiceAgent";
import { AnimatedCharacterSprite } from "./AnimatedCharacterSprite";

interface ObjectLabelProps {
  character: ObjectCharacter;
  position?: "left" | "center" | "right" | "background";
  onClick?: () => void;
  isSelected?: boolean;
  index?: number;
  x?: number;
  y?: number;
  onTap?: (character: ObjectCharacter) => void;
  isActive?: boolean;
  delay?: number;
  voiceState?: VoiceState;
}

function positionToCSS(
  position: "left" | "center" | "right" | "background",
  index: number
): { left?: string; right?: string; top?: string; transform?: string } {
  const topVariants = ["38%", "45%", "32%", "52%", "28%"];
  const top = topVariants[index % topVariants.length];

  switch (position) {
    case "left":
      return { left: "6%", top };
    case "center":
      return { left: "50%", top, transform: "translateX(-50%)" };
    case "right":
      return { right: "6%", top };
    case "background":
      return { left: `${30 + (index * 17) % 40}%`, top: "18%" };
    default:
      return { left: "50%", top, transform: "translateX(-50%)" };
  }
}


export function ObjectLabel({
  character,
  position,
  onClick,
  isSelected = false,
  index = 0,
  x,
  y,
  onTap,
  isActive,
  delay,
  voiceState,
}: ObjectLabelProps) {
  const posStyle: React.CSSProperties =
    x !== undefined && y !== undefined
      ? { position: "absolute", left: `${x * 100}%`, top: `${y * 100}%`, transform: "translate(-50%, -50%)" }
      : positionToCSS(position ?? "center", index);
  const handleClick = onTap ? () => onTap(character) : onClick ?? (() => {});
  const effectiveSelected = isActive ?? isSelected;
  const effectiveDelay = delay ?? index * 0.12;

  // Only animate voice for the selected character
  const activeVoiceState = effectiveSelected ? voiceState : undefined;

  return (
    <motion.button
      className="absolute z-[10] touch-target cursor-pointer flex flex-col items-center gap-1"
      style={posStyle}
      onClick={handleClick}
      initial={{ opacity: 0, scale: 0.5, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.4, y: -8 }}
      transition={{ duration: 0.4, delay: effectiveDelay, type: "spring", stiffness: 220 }}
      whileTap={{ scale: 0.90 }}
      aria-label={`Talk to ${character.name}`}
    >
      {/* Avatar */}
      <div
        style={{
          width: 72,
          height: 72,
          border: `2px solid ${effectiveSelected ? "#FFDE00" : "#CC0000"}`,
          boxShadow: effectiveSelected
            ? "0 0 0 2px rgba(255,222,0,0.35), 0 0 18px rgba(255,222,0,0.25)"
            : "0 0 0 1px rgba(204,0,0,0.4), 2px 2px 0 rgba(204,0,0,0.5)",
          overflow: "hidden",
          flexShrink: 0,
          background: "rgba(6,4,14,0.75)",
        }}
      >
        <AnimatedCharacterSprite
          character={character}
          voiceState={activeVoiceState}
          size="full"
          rounded={false}
          pixelated
        />
      </div>

      {/* Name label */}
      <span
        className="font-pixel whitespace-nowrap"
        style={{
          fontSize: 9,
          letterSpacing: "0.04em",
          color: effectiveSelected ? "#FFDE00" : "#FFF0B0",
          textShadow: "0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.8)",
          maxWidth: 90,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "block",
          textAlign: "center",
        }}
      >
        {character.name}
      </span>

      {/* Selection indicator */}
      {effectiveSelected && (
        <motion.div
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-0"
        >
          <span
            className="font-pixel animate-blink"
            style={{ fontSize: 9, color: "#FFDE00" }}
          >
            ▼ TALKING
          </span>
        </motion.div>
      )}
    </motion.button>
  );
}

export default ObjectLabel;
