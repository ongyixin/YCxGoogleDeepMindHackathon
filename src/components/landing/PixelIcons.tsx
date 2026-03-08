/**
 * Pixel art SVG icons for the TabBar.
 * Each icon is drawn on a small integer grid with shapeRendering="crispEdges"
 * so they stay razor-sharp at any display size.
 */

interface IconProps {
  size?: number;
  color?: string;
}

/** Right-pointing triangle — PLAY tab */
export function PlayIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 5 9"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Each column narrows as it goes right, forming a pixel triangle */}
      <rect x="0" y="0" width="1" height="9" />
      <rect x="1" y="1" width="1" height="7" />
      <rect x="2" y="2" width="1" height="5" />
      <rect x="3" y="3" width="1" height="3" />
      <rect x="4" y="4" width="1" height="1" />
    </svg>
  );
}

/** Pixel question mark — GUIDE / HOW TO PLAY tab */
export function QuestionIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 6 9"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Top arch */}
      <rect x="1" y="0" width="4" height="1" />
      <rect x="0" y="1" width="1" height="1" />
      <rect x="5" y="1" width="1" height="2" />
      {/* Rightward hook curling down-left */}
      <rect x="4" y="3" width="1" height="1" />
      <rect x="3" y="4" width="1" height="1" />
      {/* Stem */}
      <rect x="2" y="5" width="1" height="2" />
      {/* Dot */}
      <rect x="2" y="8" width="1" height="1" />
    </svg>
  );
}

/** Pixel "i" info symbol — ABOUT tab */
export function InfoIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 6 9"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Dot */}
      <rect x="2" y="0" width="2" height="1" />
      {/* Top bar */}
      <rect x="1" y="2" width="4" height="1" />
      {/* Stem */}
      <rect x="2" y="3" width="2" height="3" />
      {/* Base bar */}
      <rect x="1" y="6" width="4" height="1" />
    </svg>
  );
}

/** Pixel shield with cross — GUILD / COMMUNITY tab */
export function ShieldIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 7 8"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Top bar */}
      <rect x="0" y="0" width="7" height="1" />
      {/* Left & right sides */}
      <rect x="0" y="1" width="1" height="4" />
      <rect x="6" y="1" width="1" height="4" />
      {/* Cross — vertical */}
      <rect x="3" y="1" width="1" height="4" />
      {/* Cross — horizontal */}
      <rect x="1" y="3" width="5" height="1" />
      {/* Narrowing toward tip */}
      <rect x="1" y="5" width="1" height="1" />
      <rect x="5" y="5" width="1" height="1" />
      <rect x="2" y="6" width="1" height="1" />
      <rect x="4" y="6" width="1" height="1" />
      <rect x="3" y="7" width="1" height="1" />
    </svg>
  );
}

/** Pixel cogwheel — SETTINGS tab */
export function GearIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 11 9"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Top tooth */}
      <rect x="4" y="0" width="3" height="1" />
      {/* Body — top taper */}
      <rect x="3" y="1" width="5" height="1" />
      {/* Body — wide middle band (left + right teeth here) */}
      <rect x="2" y="2" width="1" height="5" />
      <rect x="8" y="2" width="1" height="5" />
      <rect x="3" y="2" width="5" height="5" />
      {/* Left tooth */}
      <rect x="0" y="3" width="2" height="3" />
      {/* Right tooth */}
      <rect x="9" y="3" width="2" height="3" />
      {/* Body — bottom taper */}
      <rect x="3" y="7" width="5" height="1" />
      {/* Bottom tooth */}
      <rect x="4" y="8" width="3" height="1" />
    </svg>
  );
}

/** Pixel speaker with waves — SOUND ON */
export function SoundOnIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 9 7"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Speaker cone (trapezoid pointing right) */}
      <rect x="2" y="0" width="2" height="1" />
      <rect x="1" y="1" width="3" height="1" />
      <rect x="0" y="2" width="4" height="3" />
      <rect x="1" y="5" width="3" height="1" />
      <rect x="2" y="6" width="2" height="1" />
      {/* Inner wave */}
      <rect x="5" y="2" width="1" height="3" />
      {/* Outer wave */}
      <rect x="7" y="1" width="1" height="5" />
    </svg>
  );
}

/** Pixel camera with hollow lens — SCAN step */
export function CameraIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 8 6"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Viewfinder bump */}
      <rect x="3" y="0" width="2" height="1" />
      {/* Body top */}
      <rect x="0" y="1" width="8" height="1" />
      {/* Body sides */}
      <rect x="0" y="2" width="1" height="3" />
      <rect x="7" y="2" width="1" height="3" />
      {/* Lens ring: top, bottom, left, right arcs */}
      <rect x="2" y="2" width="4" height="1" />
      <rect x="2" y="4" width="4" height="1" />
      <rect x="2" y="2" width="1" height="3" />
      <rect x="5" y="2" width="1" height="3" />
      {/* Body bottom */}
      <rect x="0" y="5" width="8" height="1" />
    </svg>
  );
}

/** Pixel theater mask face — STORY MODE / Objects Awaken */
export function MaskIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 7 7"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Face outline */}
      <rect x="1" y="0" width="5" height="1" />
      <rect x="0" y="1" width="1" height="5" />
      <rect x="6" y="1" width="1" height="5" />
      <rect x="1" y="6" width="5" height="1" />
      {/* Eyes */}
      <rect x="2" y="2" width="1" height="1" />
      <rect x="4" y="2" width="1" height="1" />
      {/* Smile */}
      <rect x="2" y="4" width="3" height="1" />
      <rect x="1" y="5" width="1" height="1" />
      <rect x="5" y="5" width="1" height="1" />
    </svg>
  );
}

/** Pixel sword pointing up — ACTION / Choose step */
export function SwordIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 5 11"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Blade */}
      <rect x="2" y="0" width="1" height="5" />
      {/* Crossguard */}
      <rect x="0" y="5" width="5" height="1" />
      {/* Grip */}
      <rect x="2" y="6" width="1" height="3" />
      {/* Pommel */}
      <rect x="1" y="9" width="3" height="2" />
    </svg>
  );
}

/** Pixel lightning bolt — QUEST MODE / XP */
export function BoltIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 7 8"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Upper part of bolt (top-left to center) */}
      <rect x="1" y="0" width="4" height="1" />
      <rect x="1" y="1" width="3" height="1" />
      <rect x="1" y="2" width="2" height="1" />
      {/* Wide middle bar */}
      <rect x="1" y="3" width="6" height="1" />
      {/* Lower part of bolt (center to bottom-right) */}
      <rect x="3" y="4" width="4" height="1" />
      <rect x="4" y="5" width="3" height="1" />
      <rect x="5" y="6" width="2" height="1" />
      <rect x="6" y="7" width="1" height="1" />
    </svg>
  );
}

/** Pixel speaker with X — SOUND OFF */
export function SoundOffIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 9 7"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Speaker cone (same shape as sound-on) */}
      <rect x="2" y="0" width="2" height="1" />
      <rect x="1" y="1" width="3" height="1" />
      <rect x="0" y="2" width="4" height="3" />
      <rect x="1" y="5" width="3" height="1" />
      <rect x="2" y="6" width="2" height="1" />
      {/* X — two diagonal strokes */}
      <rect x="5" y="2" width="1" height="1" />
      <rect x="7" y="2" width="1" height="1" />
      <rect x="6" y="3" width="1" height="1" />
      <rect x="5" y="4" width="1" height="1" />
      <rect x="7" y="4" width="1" height="1" />
    </svg>
  );
}

/** Pixel trophy cup — LEADERBOARD */
export function TrophyIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 7 6"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Cup top edge */}
      <rect x="1" y="0" width="5" height="1" />
      {/* Cup body + handles extending out on sides */}
      <rect x="0" y="1" width="7" height="2" />
      {/* Cup bottom */}
      <rect x="1" y="3" width="5" height="1" />
      {/* Stem */}
      <rect x="3" y="4" width="1" height="1" />
      {/* Base */}
      <rect x="1" y="5" width="5" height="1" />
    </svg>
  );
}

/** Pixel upload arrow in box — SHARE RECAP */
export function ShareIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 7 8"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Arrow tip */}
      <rect x="3" y="0" width="1" height="1" />
      {/* Arrow head */}
      <rect x="2" y="1" width="3" height="1" />
      {/* Arrow shaft */}
      <rect x="3" y="2" width="1" height="3" />
      {/* Box outline (open top) */}
      <rect x="0" y="4" width="1" height="4" />
      <rect x="6" y="4" width="1" height="4" />
      <rect x="0" y="7" width="7" height="1" />
    </svg>
  );
}

/** Pixel broadcast tower — GUILD CHAT */
export function SignalIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 7 7"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Top dot */}
      <rect x="3" y="0" width="1" height="1" />
      {/* Inner arc waves */}
      <rect x="2" y="1" width="1" height="1" />
      <rect x="4" y="1" width="1" height="1" />
      {/* Outer arc waves */}
      <rect x="1" y="2" width="1" height="1" />
      <rect x="5" y="2" width="1" height="1" />
      {/* Pole */}
      <rect x="3" y="1" width="1" height="4" />
      {/* Base */}
      <rect x="1" y="6" width="5" height="1" />
    </svg>
  );
}

/** Pixel globe with equator + meridian — WORLD MAP */
export function GlobeIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 7 7"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Circle outline */}
      <rect x="1" y="0" width="5" height="1" />
      <rect x="0" y="1" width="1" height="5" />
      <rect x="6" y="1" width="1" height="5" />
      <rect x="1" y="6" width="5" height="1" />
      {/* Equator */}
      <rect x="0" y="3" width="7" height="1" />
      {/* Central meridian */}
      <rect x="3" y="0" width="1" height="7" />
    </svg>
  );
}

/** Pixel padlock — LOCKED CONTENT */
export function LockIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 5 7"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Arch handle */}
      <rect x="1" y="0" width="3" height="1" />
      <rect x="0" y="1" width="1" height="2" />
      <rect x="4" y="1" width="1" height="2" />
      {/* Body top */}
      <rect x="0" y="3" width="5" height="1" />
      {/* Body sides */}
      <rect x="0" y="4" width="1" height="2" />
      <rect x="4" y="4" width="1" height="2" />
      {/* Body bottom */}
      <rect x="0" y="6" width="5" height="1" />
      {/* Keyhole */}
      <rect x="2" y="4" width="1" height="2" />
    </svg>
  );
}

/** Pixel music note — SOUND FX */
export function MusicNoteIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 5 7"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Beam at top */}
      <rect x="2" y="0" width="3" height="1" />
      {/* Stem */}
      <rect x="3" y="0" width="1" height="5" />
      {/* Note head */}
      <rect x="0" y="5" width="3" height="2" />
    </svg>
  );
}

/** Pixel CRT monitor — CRT EFFECTS */
export function MonitorIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 9 7"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Screen border */}
      <rect x="0" y="0" width="9" height="1" />
      <rect x="0" y="1" width="1" height="3" />
      <rect x="8" y="1" width="1" height="3" />
      <rect x="0" y="4" width="9" height="1" />
      {/* Stand neck */}
      <rect x="3" y="5" width="3" height="1" />
      {/* Stand base */}
      <rect x="2" y="6" width="5" height="1" />
    </svg>
  );
}

/** Pixel 2×2 grid — PIXEL GRID */
export function GridIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      viewBox="0 0 7 7"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill={color}
      style={{ display: "block" }}
    >
      {/* Horizontal lines */}
      <rect x="0" y="0" width="7" height="1" />
      <rect x="0" y="3" width="7" height="1" />
      <rect x="0" y="6" width="7" height="1" />
      {/* Vertical lines */}
      <rect x="0" y="0" width="1" height="7" />
      <rect x="3" y="0" width="1" height="7" />
      <rect x="6" y="0" width="1" height="7" />
    </svg>
  );
}
