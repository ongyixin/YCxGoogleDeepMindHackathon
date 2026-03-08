"use client";

import { motion } from "framer-motion";
import { MusicNoteIcon, MonitorIcon, GridIcon } from "./PixelIcons";

export interface Settings {
  sound: boolean;
  crt: boolean;
  pixelGrid: boolean;
}

interface SettingsPanelProps {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
}

type IconComponent = React.ComponentType<{ size?: number; color?: string }>;

const SETTING_ROWS: { key: keyof Settings; label: string; desc: string; Icon: IconComponent }[] = [
  { key: "sound",     label: "SOUND FX",     desc: "Ambient audio and UI sound effects",    Icon: MusicNoteIcon },
  { key: "crt",       label: "CRT EFFECTS",  desc: "Scanlines and screen vignette overlay",  Icon: MonitorIcon },
  { key: "pixelGrid", label: "PIXEL GRID",   desc: "Subtle background grid texture",         Icon: GridIcon },
];

function PixelToggle({
  enabled,
  onToggle,
  color = "#FFDE00",
}: {
  enabled: boolean;
  onToggle: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 0,
      }}
    >
      {/* Track */}
      <div
        style={{
          width: 36,
          height: 14,
          border: `2px solid ${enabled ? color : "rgba(255,255,255,0.2)"}`,
          background: enabled ? `${color}18` : "rgba(5,2,20,0.9)",
          position: "relative",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        {/* Thumb */}
        <motion.div
          animate={{ x: enabled ? 20 : 2 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          style={{
            position: "absolute",
            top: 1,
            width: 8,
            height: 8,
            background: enabled ? color : "rgba(255,255,255,0.22)",
            boxShadow: enabled ? `0 0 6px ${color}88` : "none",
            transition: "background 0.15s, box-shadow 0.15s",
          }}
        />
      </div>

      {/* Label */}
      <span
        className="font-pixel"
        style={{
          fontSize: 16,
          color: enabled ? color : "rgba(255,255,255,0.3)",
          letterSpacing: "0.08em",
          minWidth: 20,
          transition: "color 0.15s",
        }}
      >
        {enabled ? "ON" : "OFF"}
      </span>
    </button>
  );
}

const TOGGLE_COLORS: Record<keyof Settings, string> = {
  sound:     "#FFDE00",
  crt:       "#3B4CCA",
  pixelGrid: "#B0C4FF",
};

export default function SettingsPanel({ settings, onSettingsChange }: SettingsPanelProps) {
  function toggle(key: keyof Settings) {
    onSettingsChange({ ...settings, [key]: !settings[key] });
  }

  function resetSettings() {
    onSettingsChange({ sound: false, crt: true, pixelGrid: true });
  }

  return (
    <motion.div
      key="settings"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      style={{ padding: "16px 16px 60px" }}
    >
      {/* Header */}
      <div
        style={{
          border: "2px solid rgba(255,222,0,0.35)",
          marginBottom: 14,
        }}
      >
        <div
          className="font-pixel px-3 py-2"
          style={{
            background: "rgba(110,40,90,0.55)",
            borderBottom: "1px solid rgba(255,222,0,0.2)",
            fontSize: 16,
            letterSpacing: "0.18em",
            color: "#FFDE00",
          }}
        >
          ✿ OPTIONS
        </div>
        <div className="px-3 py-2" style={{ background: "rgba(5,2,20,0.95)" }}>
          <p className="font-vt" style={{ fontSize: 17, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
            Settings are saved automatically.
          </p>
        </div>
      </div>

      {/* Toggle rows */}
      <div
        className="font-pixel mb-3"
        style={{ fontSize: 16, color: "rgba(255,222,0,0.4)", letterSpacing: "0.2em" }}
      >
        ── DISPLAY / AUDIO ──
      </div>

      <div
        style={{
          border: "2px solid rgba(255,222,0,0.2)",
          background: "rgba(5,2,20,0.9)",
          boxShadow: "3px 3px 0 rgba(168,54,104,0.3)",
          marginBottom: 14,
        }}
      >
        {SETTING_ROWS.map((row, i) => (
          <div
            key={row.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderBottom: i < SETTING_ROWS.length - 1 ? "1px solid rgba(255,222,0,0.08)" : "none",
            }}
          >
            {/* Icon */}
            <div
              style={{
                color: settings[row.key] ? TOGGLE_COLORS[row.key] : "rgba(255,255,255,0.2)",
                flexShrink: 0,
                width: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color 0.15s",
              }}
            >
              <row.Icon size={14} color={settings[row.key] ? TOGGLE_COLORS[row.key] : "rgba(255,255,255,0.2)"} />
            </div>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="font-pixel"
                style={{ fontSize: 16, color: "rgba(255,255,255,0.55)", letterSpacing: "0.1em", marginBottom: 3, lineHeight: 1.6 }}
              >
                {row.label}
              </div>
              <p className="font-vt" style={{ fontSize: 16, color: "rgba(255,255,255,0.3)", lineHeight: 1.3 }}>
                {row.desc}
              </p>
            </div>

            {/* Toggle */}
            <PixelToggle
              enabled={settings[row.key]}
              onToggle={() => toggle(row.key)}
              color={TOGGLE_COLORS[row.key]}
            />
          </div>
        ))}
      </div>

      {/* Accessibility note */}
      <div
        className="font-pixel mb-3"
        style={{ fontSize: 16, color: "rgba(255,222,0,0.4)", letterSpacing: "0.2em" }}
      >
        ── ACCESSIBILITY ──
      </div>
      <div
        style={{
          border: "2px solid rgba(255,255,255,0.06)",
          background: "rgba(5,2,20,0.8)",
          padding: "10px 14px",
          marginBottom: 14,
        }}
      >
        <p className="font-vt" style={{ fontSize: 16, color: "rgba(255,255,255,0.32)", lineHeight: 1.5 }}>
          Disabling CRT Effects removes scanlines and vignette — recommended for users sensitive to screen flicker.
        </p>
      </div>

      {/* Reset button */}
      <button
        onClick={resetSettings}
        className="font-pixel w-full"
        style={{
          padding: "11px 0",
          background: "transparent",
          border: "2px solid rgba(255,255,255,0.15)",
          color: "rgba(255,255,255,0.32)",
          fontSize: 16,
          letterSpacing: "0.15em",
          cursor: "pointer",
          boxShadow: "3px 3px 0 rgba(255,255,255,0.06)",
          transition: "border-color 0.1s, color 0.1s",
        }}
      >
        ↺ RESET TO DEFAULTS
      </button>
    </motion.div>
  );
}
