"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Local types (mirror StoredQuestSession in quest/page.tsx) ────────────────

interface StoredMission {
  id: string;
  codename: string;
  originalTask: string;
  category: string;
  status: string;
  xpReward: number;
  objectives: Array<{ description: string; completed: boolean }>;
  completedAt?: number;
}

interface StoredQuestSession {
  sessionId: string;
  startedAt: number;
  savedAt: number;
  missions: StoredMission[];
  totalXP: number;
  completedCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const QUEST_LOG_KEY = "mcm_quest_log";

function loadQuestLog(): StoredQuestSession[] {
  try {
    const raw = localStorage.getItem(QUEST_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")} · ${hh}:${mm}`;
}

function formatDuration(startedAt: number, savedAt: number): string {
  const mins = Math.max(0, Math.floor((savedAt - startedAt) / 60000));
  if (mins < 1) return "<1 MIN";
  if (mins < 60) return `${mins} MIN`;
  return `${Math.floor(mins / 60)}H ${mins % 60}M`;
}

const STATUS_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  completed: { icon: "★", color: "#FFDE00", label: "DONE" },
  abandoned: { icon: "✗", color: "#C84B7A", label: "ABORT" },
  active:    { icon: "▶", color: "#3B4CCA", label: "ACTIVE" },
  briefed:   { icon: "◎", color: "rgba(176,196,255,0.4)", label: "QUEUED" },
};

const CATEGORY_LABELS: Record<string, string> = {
  supply_run:     "SUPPLY RUN",
  restoration:    "RESTORATION",
  containment:    "CONTAINMENT",
  crafting:       "CRAFTING",
  knowledge_raid: "KNOWLEDGE RAID",
  recon:          "RECON",
  endurance:      "ENDURANCE",
};

// ─── Mission row ──────────────────────────────────────────────────────────────

function MissionRow({ mission }: { mission: StoredMission }) {
  const cfg = STATUS_CONFIG[mission.status] ?? STATUS_CONFIG.abandoned;
  const doneObj = mission.objectives.filter((o) => o.completed).length;
  const totalObj = mission.objectives.length;

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "8px 0",
        borderBottom: "1px solid rgba(59,76,202,0.12)",
      }}
    >
      {/* Status icon */}
      <span
        className="font-pixel shrink-0"
        style={{ fontSize: 12, color: cfg.color, lineHeight: 1.9, minWidth: 12 }}
      >
        {cfg.icon}
      </span>

      {/* Mission details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          className="font-pixel"
          style={{ fontSize: 11, color: "#B0C4FF", letterSpacing: "0.1em", lineHeight: 1.7 }}
        >
          {mission.codename}
        </p>
        <p
          className="font-vt"
          style={{ fontSize: 14, color: "rgba(255,228,240,0.42)", lineHeight: 1.4, marginTop: 1 }}
        >
          {mission.originalTask}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
          {mission.category && (
            <span
              className="font-pixel"
              style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", letterSpacing: "0.08em" }}
            >
              {CATEGORY_LABELS[mission.category] ?? mission.category.toUpperCase()}
            </span>
          )}
          {totalObj > 0 && (
            <span
              className="font-pixel"
              style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", letterSpacing: "0.08em" }}
            >
              OBJ {doneObj}/{totalObj}
            </span>
          )}
        </div>
      </div>

      {/* XP */}
      <span
        className="font-pixel shrink-0"
        style={{ fontSize: 11, color: "rgba(255,222,0,0.55)", lineHeight: 2.2 }}
      >
        +{mission.xpReward}
      </span>
    </div>
  );
}

// ─── Session card ─────────────────────────────────────────────────────────────

function SessionCard({
  entry,
  index,
  defaultOpen,
}: {
  entry: StoredQuestSession;
  index: number;
  defaultOpen: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const activeMissions = entry.missions.filter((m) => m.status !== "briefed");
  const hasCompleted = entry.completedCount > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, duration: 0.22, type: "spring", stiffness: 200 }}
      style={{
        border: "1px solid rgba(59,76,202,0.35)",
        background: "rgba(6,8,30,0.9)",
        marginBottom: 8,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Left edge accent */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 2,
          background: hasCompleted
            ? "linear-gradient(to bottom, #FFDE00, rgba(255,222,0,0.2))"
            : "linear-gradient(to bottom, #C84B7A, rgba(200,75,122,0.2))",
        }}
      />

      {/* Session header button */}
      <button
        className="w-full text-left"
        onClick={() => setExpanded((v) => !v)}
        style={{
          padding: "10px 12px 10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {/* Date + duration */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            className="font-pixel"
            style={{ fontSize: 11, color: "#FFDE00", letterSpacing: "0.14em", lineHeight: 1.5 }}
          >
            {formatDate(entry.startedAt)}
          </p>
          <p
            className="font-vt"
            style={{ fontSize: 14, color: "rgba(176,196,255,0.5)", marginTop: 2 }}
          >
            {formatDuration(entry.startedAt, entry.savedAt)}
            {" · "}
            {entry.completedCount}/{activeMissions.length} DONE
          </p>
        </div>

        {/* XP badge */}
        <div
          style={{
            padding: "3px 8px",
            border: "1px solid rgba(255,222,0,0.3)",
            background: "rgba(255,222,0,0.07)",
            flexShrink: 0,
          }}
        >
          <span className="font-pixel" style={{ fontSize: 11, color: "#FFDE00" }}>
            +{entry.totalXP} XP
          </span>
        </div>

        {/* Expand chevron */}
        <motion.span
          className="font-pixel shrink-0"
          style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", lineHeight: 1 }}
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.15 }}
        >
          ▼
        </motion.span>
      </button>

      {/* Mission list */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="missions"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                borderTop: "1px solid rgba(59,76,202,0.2)",
                padding: "6px 12px 10px 16px",
              }}
            >
              {entry.missions.length === 0 ? (
                <p
                  className="font-vt"
                  style={{ fontSize: 14, color: "rgba(255,255,255,0.22)", padding: "8px 0" }}
                >
                  No missions recorded.
                </p>
              ) : (
                entry.missions.map((m) => <MissionRow key={m.id} mission={m} />)
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function QuestLogPanel({ onBack }: { onBack: () => void }) {
  const [log, setLog] = useState<StoredQuestSession[]>([]);

  useEffect(() => {
    setLog(loadQuestLog());
  }, []);

  const totalSessions = log.length;
  const totalXP = log.reduce((sum, s) => sum + s.totalXP, 0);
  const totalCompleted = log.reduce((sum, s) => sum + s.completedCount, 0);

  return (
    <motion.div
      key="quest-log"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.22 }}
    >
      {/* Back + header */}
      <div className="px-4 pt-4 pb-3">
        <button
          onClick={onBack}
          className="font-pixel mb-4 block"
          style={{ fontSize: 11, letterSpacing: "0.14em", color: "rgba(255,255,255,0.3)" }}
        >
          ← BACK
        </button>

        {/* Panel chrome */}
        <div
          style={{
            border: "2px solid rgba(59,76,202,0.55)",
            boxShadow: "3px 3px 0 rgba(59,76,202,0.35)",
          }}
        >
          <div
            className="font-pixel px-4 py-2 flex items-center justify-between"
            style={{
              fontSize: 11,
              background: "rgba(59,76,202,0.18)",
              borderBottom: "1px solid rgba(59,76,202,0.25)",
              color: "#B0C4FF",
              letterSpacing: "0.2em",
            }}
          >
            <span>◈ FIELD LOGS</span>
            <span style={{ color: "rgba(255,222,0,0.5)" }}>{totalSessions} SESSION{totalSessions !== 1 ? "S" : ""}</span>
          </div>
          <div
            className="px-4 py-3"
            style={{ background: "rgba(5,2,20,0.96)" }}
          >
            <p
              className="font-vt"
              style={{ fontSize: 14, color: "rgba(255,228,240,0.4)", marginBottom: 10 }}
            >
              Debrief archive — all recorded missions.
            </p>
            {/* Aggregate stats */}
            {totalSessions > 0 && (
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { label: "SESSIONS", value: totalSessions, color: "#B0C4FF" },
                  { label: "MISSIONS", value: totalCompleted, color: "#FFDE00" },
                  { label: "TOTAL XP", value: totalXP, color: "#3B4CCA" },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    style={{
                      flex: 1,
                      border: `1px solid ${color}33`,
                      padding: "5px 4px",
                      background: `${color}08`,
                      textAlign: "center",
                    }}
                  >
                    <div
                      className="font-pixel"
                      style={{ fontSize: 10, color: `${color}88`, letterSpacing: "0.06em", marginBottom: 3, lineHeight: 1 }}
                    >
                      {label}
                    </div>
                    <div
                      className="font-pixel"
                      style={{ fontSize: 14, color, lineHeight: 1 }}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Log entries */}
      <div className="px-4 pb-10">
        {log.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.18 }}
            style={{
              border: "1px solid rgba(59,76,202,0.28)",
              background: "rgba(6,8,30,0.85)",
              padding: "36px 16px",
              textAlign: "center",
            }}
          >
            <div
              className="font-pixel"
              style={{ fontSize: 28, color: "rgba(59,76,202,0.4)", marginBottom: 12, lineHeight: 1 }}
            >
              ◎
            </div>
            <p
              className="font-pixel"
              style={{ fontSize: 11, color: "rgba(176,196,255,0.45)", letterSpacing: "0.15em", marginBottom: 10 }}
            >
              NO MISSIONS LOGGED
            </p>
            <p
              className="font-vt"
              style={{ fontSize: 15, color: "rgba(255,228,240,0.3)", lineHeight: 1.55 }}
            >
              Complete a Quest Mode session
              <br />
              to see your field logs here.
            </p>
          </motion.div>
        ) : (
          log.map((entry, i) => (
            <SessionCard
              key={entry.sessionId}
              entry={entry}
              index={i}
              defaultOpen={i === 0}
            />
          ))
        )}
      </div>
    </motion.div>
  );
}
