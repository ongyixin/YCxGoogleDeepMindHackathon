"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useState } from "react";
import { CameraIcon, MaskIcon, SwordIcon, BoltIcon } from "./PixelIcons";

const STEPS = [
  {
    num: "01",
    icon: <CameraIcon size={16} />,
    title: "SCAN YOUR WORLD",
    desc: "Point your camera at any room, outdoor space, or environment. Every surface and object you capture becomes part of the game world — the AI maps your reality in real time.",
    tip: "Works indoors & outdoors",
    color: "#B0C4FF",
  },
  {
    num: "02",
    icon: <MaskIcon size={16} />,
    title: "OBJECTS AWAKEN",
    desc: "The AI identifies everything it sees and instantly generates a unique personality, voice, and hidden agenda for each object. Your lamp is dramatic. Your mug is passive-aggressive.",
    tip: "Every object is uniquely generated",
    color: "#C84B7A",
  },
  {
    num: "03",
    icon: <SwordIcon size={16} />,
    title: "CHOOSE YOUR ACTION",
    desc: "In Story Mode, pick how you engage — flirt, roast, interrogate, befriend, challenge, or console. In Quest Mode, objects assign you real missions tied to your actual environment.",
    tip: "6 interaction modes in Story",
    color: "#FFDE00",
  },
  {
    num: "04",
    icon: <BoltIcon size={16} />,
    title: "EARN XP & PROGRESS",
    desc: "Every meaningful exchange earns XP. Maintain streaks, complete quest chains, and unlock new storylines. The adaptive AI soundtrack intensifies as your momentum builds.",
    tip: "Shared XP across both modes",
    color: "#3B4CCA",
  },
];

const CONTROLS = [
  { key: "TAP",   desc: "Select or confirm action" },
  { key: "HOLD",  desc: "Inspect object details" },
  { key: "←BACK", desc: "Return to previous screen" },
  { key: "SCAN",  desc: "Analyse current environment" },
];

const MODES = [
  {
    icon: <MaskIcon size={18} />,
    name: "STORY MODE",
    desc: "Objects become characters. Drama ensues.",
    color: "#C84B7A",
    bgBack: "rgba(55,8,35,0.97)",
    bullets: [
      "6 interaction styles: Flirt, Interrogate, Roast, Befriend, Challenge & Console — each unlocks different story branches",
      "Every object gets a unique AI-generated personality, backstory & voice based on its real-world context",
      "Dynamic scenes mean no two playthroughs are alike — your kitchen becomes a full cast of characters",
    ],
    tagline: "✦ YOUR WORLD IS A STAGE",
  },
  {
    icon: <BoltIcon size={18} />,
    name: "QUEST MODE",
    desc: "Chores become missions. Life has momentum.",
    color: "#3B4CCA",
    bgBack: "rgba(5,12,55,0.97)",
    bullets: [
      "Real-world tasks transform into narrative missions with escalating stakes and plot twists",
      "AI reads your environment and generates quest arcs, objectives & rewards from your actual to-do list",
      "Complete missions to unlock new chapters — XP carries over seamlessly to Story Mode",
    ],
    tagline: "✦ EVERY TASK IS EPIC",
  },
];

function FlipCard({
  front,
  back,
  height,
}: {
  front: ReactNode;
  back: ReactNode;
  height: number;
}) {
  const [clicked, setClicked] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isFlipped = clicked || hovered;

  return (
    <div
      style={{ perspective: 1600, height, cursor: "pointer" }}
      onClick={() => setClicked((c) => !c)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform 0.7s cubic-bezier(0.35, 0, 0.25, 1)",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
          }}
        >
          {front}
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {back}
        </div>
      </div>
    </div>
  );
}

export default function HowToPlay() {
  return (
    <motion.div
      key="howtoplay"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      style={{ padding: "16px 16px 60px" }}
    >
      {/* Header */}
      <div style={{ border: "2px solid rgba(255,222,0,0.35)", marginBottom: 14 }}>
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
          ✿ HOW TO PLAY
        </div>
        <div className="px-3 py-2" style={{ background: "rgba(5,2,20,0.95)" }}>
          <p className="font-vt" style={{ fontSize: 17, color: "rgba(255,238,220,0.58)", lineHeight: 1.5 }}>
            Turn your real world into a living game.
          </p>
        </div>
      </div>

      {/* Mode section label */}
      <div
        className="font-pixel mb-2"
        style={{ fontSize: 16, color: "rgba(255,222,0,0.4)", letterSpacing: "0.2em" }}
      >
        ── GAME MODES ──
      </div>

      {/* Mode flip cards */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {MODES.map((mode) => (
          <div key={mode.name} style={{ flex: 1 }}>
            <FlipCard
              height={240}
              front={
                <div
                  style={{
                    height: "100%",
                    border: `2px solid ${mode.color}44`,
                    padding: "10px 10px 8px",
                    background: "rgba(5,2,20,0.9)",
                    boxShadow: `3px 3px 0 ${mode.color}22`,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div style={{ color: mode.color, marginBottom: 5 }}>{mode.icon}</div>
                  <div
                    className="font-pixel"
                    style={{ fontSize: 16, color: mode.color, letterSpacing: "0.1em", marginBottom: 5, lineHeight: 1.6 }}
                  >
                    {mode.name}
                  </div>
                  <p
                    className="font-vt"
                    style={{ fontSize: 16, color: "rgba(255,255,255,0.38)", lineHeight: 1.4, flex: 1 }}
                  >
                    {mode.desc}
                  </p>
                  <div
                    className="font-pixel"
                    style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", marginTop: 6 }}
                  >
                    ↺ TAP FOR DETAILS
                  </div>
                </div>
              }
              back={
                <div
                  style={{
                    height: "100%",
                    border: `2px solid ${mode.color}77`,
                    padding: "10px 10px 8px",
                    background: mode.bgBack,
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: `inset 0 0 20px ${mode.color}11`,
                  }}
                >
                  <div
                    className="font-pixel"
                    style={{ fontSize: 15, color: mode.color, letterSpacing: "0.1em", marginBottom: 10 }}
                  >
                    {mode.name}
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                    {mode.bullets.map((b, i) => (
                      <p
                        key={i}
                        className="font-vt"
                        style={{ fontSize: 16, color: "rgba(255,255,255,0.82)", lineHeight: 1.4 }}
                      >
                        · {b}
                      </p>
                    ))}
                  </div>
                  <div
                    className="font-pixel"
                    style={{ fontSize: 11, color: mode.color, letterSpacing: "0.12em", marginTop: 8 }}
                  >
                    {mode.tagline}
                  </div>
                </div>
              }
            />
          </div>
        ))}
      </div>

      {/* Steps section label */}
      <div
        className="font-pixel mb-3"
        style={{ fontSize: 16, color: "rgba(255,222,0,0.4)", letterSpacing: "0.2em" }}
      >
        ── GETTING STARTED ──
      </div>

      {/* Step flip cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {STEPS.map((step, i) => (
          <motion.div
            key={step.num}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07, duration: 0.22 }}
          >
            <FlipCard
              height={150}
              front={
                <div
                  style={{
                    height: "100%",
                    border: `2px solid ${step.color}33`,
                    background: "rgba(5,2,20,0.92)",
                    boxShadow: `3px 3px 0 ${step.color}18`,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                  }}
                >
                  <div
                    className="font-pixel shrink-0"
                    style={{
                      fontSize: 16,
                      color: step.color,
                      lineHeight: 1,
                      width: 22,
                      textShadow: `0 0 8px ${step.color}55`,
                    }}
                  >
                    {step.num}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ display: "flex", alignItems: "center", color: step.color }}>{step.icon}</span>
                      <span
                        className="font-pixel"
                        style={{ fontSize: 16, color: step.color, letterSpacing: "0.12em", lineHeight: 1.7 }}
                      >
                        {step.title}
                      </span>
                    </div>
                    <div
                      className="font-pixel"
                      style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}
                    >
                      ↺ TAP TO FLIP
                    </div>
                  </div>
                </div>
              }
              back={
                <div
                  style={{
                    height: "100%",
                    border: `2px solid ${step.color}55`,
                    background: "rgba(8,5,25,0.97)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "10px 12px",
                    boxShadow: `inset 0 0 16px ${step.color}10`,
                  }}
                >
                  <div
                    className="font-pixel shrink-0"
                    style={{
                      fontSize: 16,
                      color: step.color,
                      lineHeight: 1,
                      width: 22,
                      textShadow: `0 0 8px ${step.color}55`,
                    }}
                  >
                    {step.num}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      className="font-vt"
                      style={{ fontSize: 18, color: "rgba(255,255,255,0.75)", lineHeight: 1.45, marginBottom: 8 }}
                    >
                      {step.desc}
                    </p>
                    <div
                      className="font-pixel"
                      style={{
                        fontSize: 13,
                        color: "rgba(255,222,0,0.5)",
                        letterSpacing: "0.1em",
                        padding: "3px 6px",
                        border: "1px solid rgba(255,222,0,0.2)",
                        display: "inline-block",
                      }}
                    >
                      ✦ {step.tip}
                    </div>
                  </div>
                </div>
              }
            />
          </motion.div>
        ))}
      </div>

      {/* Controls reference */}
      <div
        className="font-pixel mb-3"
        style={{ fontSize: 16, color: "rgba(255,222,0,0.4)", letterSpacing: "0.2em" }}
      >
        ── CONTROLS ──
      </div>

      <div
        style={{
          border: "2px solid rgba(255,222,0,0.2)",
          background: "rgba(5,2,20,0.9)",
          boxShadow: "3px 3px 0 rgba(168,54,104,0.3)",
        }}
      >
        {CONTROLS.map((ctrl, i) => (
          <div
            key={ctrl.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "9px 12px",
              borderBottom: i < CONTROLS.length - 1 ? "1px solid rgba(255,222,0,0.08)" : "none",
            }}
          >
            <div
              className="font-pixel shrink-0"
              style={{
                fontSize: 16,
                color: "#FFDE00",
                border: "1px solid rgba(255,222,0,0.4)",
                padding: "3px 6px",
                letterSpacing: "0.08em",
                minWidth: 44,
                textAlign: "center",
              }}
            >
              {ctrl.key}
            </div>
            <p className="font-vt" style={{ fontSize: 16, color: "rgba(255,255,255,0.45)" }}>
              {ctrl.desc}
            </p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
