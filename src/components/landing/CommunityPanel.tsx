"use client";

import { motion } from "framer-motion";
import { TrophyIcon, ShareIcon, SignalIcon, GlobeIcon, LockIcon } from "./PixelIcons";

type IconComponent = React.ComponentType<{ size?: number; color?: string }>;

const LOCKED_FEATURES: { Icon: IconComponent; label: string; desc: string; color: string }[] = [
  {
    Icon: TrophyIcon,
    label: "LEADERBOARD",
    desc: "Global rankings by XP, sessions completed, and longest streak.",
    color: "#FFDE00",
  },
  {
    Icon: ShareIcon,
    label: "SHARE RECAP",
    desc: "Post your generated episode poster to the community feed.",
    color: "#C84B7A",
  },
  {
    Icon: SignalIcon,
    label: "GUILD CHAT",
    desc: "Real-time channel for main characters worldwide.",
    color: "#B0C4FF",
  },
  {
    Icon: GlobeIcon,
    label: "WORLD MAP",
    desc: "See active sessions and hotspots across the globe.",
    color: "#3B4CCA",
  },
];

export default function CommunityPanel() {
  return (
    <motion.div
      key="community"
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
          ✿ THE GUILD
        </div>
        <div className="px-3 py-3" style={{ background: "rgba(5,2,20,0.95)" }}>
          <p className="font-vt" style={{ fontSize: 17, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
            Community features are in development.
          </p>
          <p className="font-vt" style={{ fontSize: 16, color: "rgba(255,255,255,0.28)", lineHeight: 1.4, marginTop: 4 }}>
            Complete missions to unlock guild content.
          </p>
        </div>
      </div>

      {/* Coming soon banner */}
      <div
        style={{
        border: "2px solid rgba(255,222,0,0.3)",
        background: "rgba(120,40,100,0.14)",
          padding: "12px 14px",
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <motion.div
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          style={{ width: 8, height: 8, background: "#FFDE00", flexShrink: 0, boxShadow: "0 0 8px rgba(255,222,0,0.5)" }}
        />
        <div>
          <div
            className="font-pixel"
            style={{ fontSize: 16, color: "#FFDE00", letterSpacing: "0.16em", marginBottom: 3, lineHeight: 1 }}
          >
            INCOMING TRANSMISSION
          </div>
          <p className="font-vt" style={{ fontSize: 16, color: "rgba(255,255,255,0.4)" }}>
            Guild features unlock after 5 completed sessions.
          </p>
        </div>
      </div>

      {/* Locked feature cards */}
      <div
        className="font-pixel mb-3"
        style={{ fontSize: 16, color: "rgba(255,222,0,0.4)", letterSpacing: "0.2em" }}
      >
        ── LOCKED CONTENT ──
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {LOCKED_FEATURES.map((feat, i) => (
          <motion.div
            key={feat.label}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06, duration: 0.2 }}
            style={{
              border: "2px solid rgba(255,255,255,0.07)",
              background: "rgba(5,2,20,0.75)",
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              opacity: 0.55,
              position: "relative",
            }}
          >
            {/* Lock overlay */}
            <div
              style={{
                position: "absolute",
                top: 8,
                right: 10,
                display: "flex",
                alignItems: "center",
              }}
            >
              <LockIcon size={12} color="rgba(255,255,255,0.3)" />
            </div>

            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", width: 20, justifyContent: "center" }}>
              <feat.Icon size={16} color={feat.color} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="font-pixel"
                style={{ fontSize: 16, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", marginBottom: 3, lineHeight: 1.6 }}
              >
                {feat.label}
              </div>
              <p className="font-vt" style={{ fontSize: 16, color: "rgba(255,255,255,0.25)", lineHeight: 1.35 }}>
                {feat.desc}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Progress hint */}
      <div
        style={{
          marginTop: 16,
          border: "1px solid rgba(255,222,0,0.12)",
          background: "rgba(5,2,20,0.8)",
          padding: "10px 14px",
        }}
      >
        <div className="font-pixel mb-2" style={{ fontSize: 16, color: "rgba(255,222,0,0.3)", letterSpacing: "0.14em" }}>
          GUILD PROGRESS
        </div>
        {/* Progress bar */}
        <div style={{ height: 6, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,222,0,0.12)", marginBottom: 5 }}>
          <div style={{ width: "0%", height: "100%", background: "#FFDE00" }} />
        </div>
        <div className="font-vt" style={{ fontSize: 16, color: "rgba(255,255,255,0.28)" }}>
          0 / 5 sessions completed
        </div>
      </div>
    </motion.div>
  );
}
