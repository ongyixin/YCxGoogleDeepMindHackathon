"use client";

import { cn } from "@/lib/cn";
import { clamp, formatDuration } from "@/lib/utils";
import type { Mission, MomentumState, NarrationEvent, ObjectiveSnapshot } from "@/types";

interface ActiveMissionProps {
  mission: Mission;
  momentum?: MomentumState;
  latestNarration?: NarrationEvent;
  snapshots?: ObjectiveSnapshot[];
  onComplete?: (missionId: string) => void;
  onAbandon?: (missionId: string) => void;
  onMissionComplete?: (missionId: string) => void;
  onObjectiveComplete?: (missionId: string, objectiveId: string) => void;
  onOpenGallery?: () => void;
  className?: string;
}

const DEFAULT_MOMENTUM: MomentumState = {
  currentCombo: 0,
  sessionProductivityScore: 50,
  lastActivityAt: Date.now(),
  idlePenaltyTriggered: false,
};

function getMomentumColor(combo: number): string {
  if (combo >= 8) return "#FFDE00";
  if (combo >= 5) return "#FF0000";
  if (combo >= 3) return "#FFDE00";
  if (combo >= 1) return "#FFDE00";
  return "rgba(255,255,255,0.3)";
}

export function ActiveMission({
  mission,
  momentum = DEFAULT_MOMENTUM,
  latestNarration,
  snapshots = [],
  onComplete,
  onAbandon,
  onMissionComplete,
  onObjectiveComplete,
  onOpenGallery,
  className,
}: ActiveMissionProps) {
  const handleComplete = () => { onMissionComplete?.(mission.id); onComplete?.(mission.id); };
  const handleAbandon = () => { onAbandon?.(mission.id); };

  const completedObjectives = mission.objectives.filter((o) => o.completed).length;
  const totalObjectives = mission.objectives.length;
  const progressPercent = totalObjectives > 0
    ? Math.round((completedObjectives / totalObjectives) * 100)
    : 0;

  const productivity = clamp(momentum.sessionProductivityScore, 0, 100);
  const comboColor = getMomentumColor(momentum.currentCombo);

  // Progress bar segments
  const PROG_SEGMENTS = 10;
  const filledSegs = Math.round((progressPercent / 100) * PROG_SEGMENTS);

  return (
    <div
      className={cn(className)}
      style={{
        border: "2px solid #3B4CCA",
        background: "rgba(6,8,30,0.98)",
        boxShadow: "4px 4px 0 rgba(59,76,202,0.5)",
      }}
    >
      {/* Window chrome */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: "#3B4CCA", borderBottom: "2px solid rgba(255,222,0,0.35)" }}
      >
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-[#FFDE00] animate-pulse2" />
          <span className="font-pixel text-base tracking-wider" style={{ color: "#FFDE00" }}>
            IN PROGRESS
          </span>
        </div>
        {mission.startedAt && (
          <span className="font-mono-dm text-base tabular-nums" style={{ color: "rgba(255,255,255,0.25)" }}>
            T+{formatDuration(mission.startedAt)}
          </span>
        )}
      </div>

      <div className="px-4 py-3 flex flex-col gap-2.5">
        {/* Codename + original task */}
        <div>
          <h3 className="font-pixel leading-loose" style={{ color: "#FFDE00", fontSize: "16px", letterSpacing: "0.06em" }}>
            {mission.codename}
          </h3>
          <p className="font-vt text-xl" style={{ color: "rgba(255,255,255,0.3)" }}>
            ← {mission.originalTask}
          </p>
        </div>

        {/* Objectives */}
        {mission.objectives.length > 0 && (
          <div
            className="flex flex-col gap-1.5 py-2 px-3"
            style={{ border: "1px solid rgba(59,76,202,0.4)", background: "rgba(6,8,30,0.6)" }}
          >
            {mission.objectives.map((obj) => {
              const hasSnapshot = snapshots.some((s) => s.objectiveId === obj.id);
              return (
                <button
                  key={obj.id}
                  className="flex items-start gap-2 w-full text-left group active:scale-[0.98] transition-transform"
                  onClick={() => !obj.completed && onObjectiveComplete?.(mission.id, obj.id)}
                  disabled={obj.completed}
                  style={{ cursor: obj.completed ? "default" : "pointer" }}
                >
                  <span
                    className="font-pixel text-base mt-0.5 shrink-0 transition-all duration-150"
                    style={{
                      color: obj.completed ? "#FFDE00" : "rgba(255,222,0,0.3)",
                      textShadow: obj.completed ? "0 0 8px rgba(255,222,0,0.6)" : "none",
                    }}
                  >
                    {obj.completed ? "■" : "□"}
                  </span>
                  <span
                    className="font-vt text-xl flex-1"
                    style={{
                      color: obj.completed ? "rgba(255,255,255,0.25)" : "rgba(176,196,255,0.7)",
                      textDecoration: obj.completed ? "line-through" : "none",
                    }}
                  >
                    {obj.description}
                  </span>
                  {hasSnapshot && (
                    <span
                      className="font-pixel shrink-0 mt-0.5"
                      style={{ color: "rgba(59,76,202,0.7)", fontSize: "9px", letterSpacing: "0.05em" }}
                      title="Intel captured"
                    >
                      ▣
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Progress bar — segmented */}
        <div>
          <div className="flex justify-between mb-1.5">
            <span className="font-pixel text-base tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
              PROGRESS
            </span>
            <span className="font-pixel text-base" style={{ color: "#FFDE00" }}>
              {progressPercent}%
            </span>
          </div>
          <div className="flex gap-[2px]">
            {Array.from({ length: PROG_SEGMENTS }).map((_, i) => (
              <div
                key={i}
                className="flex-1 h-2.5 transition-all duration-300"
                style={{
                  border: `1px solid ${i < filledSegs ? "#FFDE00" : "rgba(59,76,202,0.4)"}`,
                  background: i < filledSegs ? "#FFDE00" : "transparent",
                  boxShadow: i === filledSegs - 1 && filledSegs > 0 ? "0 0 4px #FFDE00" : "none",
                }}
              />
            ))}
          </div>
        </div>

        {/* Combo indicator */}
        {momentum.currentCombo > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm">🔥</span>
            <span className="font-pixel text-base" style={{ color: comboColor }}>
              ×{momentum.currentCombo} COMBO
            </span>
            <span className="font-pixel text-base" style={{ color: "rgba(255,255,255,0.25)" }}>
              — {productivity}% PRODUCTIVITY
            </span>
          </div>
        )}

        {/* Narrator line */}
        {latestNarration && (
          <div
            className="px-3 py-2"
            style={{ border: "1px solid rgba(59,76,202,0.3)", background: "rgba(255,222,0,0.04)" }}
          >
            <p className="font-vt text-base italic leading-snug" style={{ color: "rgba(176,196,255,0.6)" }}>
              {latestNarration.text}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-1">
          <button
            onClick={handleComplete}
            className="flex-1 touch-target font-pixel active:translate-x-[2px] active:translate-y-[2px]"
            style={{
              background: "#FFDE00",
              border: "2px solid #1a2880",
              boxShadow: "3px 3px 0 rgba(26,40,128,0.6)",
              color: "#0a0e30",
              fontSize: "11px",
              letterSpacing: "0.08em",
              padding: "12px 8px",
              transition: "box-shadow 0.05s, transform 0.05s",
            }}
          >
            ■ MARK DONE
          </button>
          {snapshots.length > 0 && (
            <button
              onClick={onOpenGallery}
              className="touch-target font-pixel px-3 active:translate-x-[1px] active:translate-y-[1px] relative"
              style={{
                background: "rgba(59,76,202,0.12)",
                border: "2px solid rgba(59,76,202,0.6)",
                boxShadow: "2px 2px 0 rgba(59,76,202,0.3)",
                color: "rgba(176,196,255,0.85)",
                fontSize: "11px",
                letterSpacing: "0.08em",
                transition: "box-shadow 0.05s, transform 0.05s",
              }}
            >
              ▣ LOG
              <span
                className="absolute -top-1.5 -right-1.5 font-pixel flex items-center justify-center"
                style={{
                  background: "#FFDE00",
                  color: "#0a0e30",
                  fontSize: "8px",
                  width: "14px",
                  height: "14px",
                  lineHeight: 1,
                }}
              >
                {snapshots.length}
              </span>
            </button>
          )}
          <button
            onClick={handleAbandon}
            className="touch-target font-pixel px-4 active:translate-x-[1px] active:translate-y-[1px]"
            style={{
              background: "rgba(204,0,0,0.08)",
              border: "2px solid rgba(204,0,0,0.4)",
              boxShadow: "2px 2px 0 rgba(204,0,0,0.25)",
              color: "rgba(255,80,80,0.7)",
              fontSize: "11px",
              letterSpacing: "0.08em",
              transition: "box-shadow 0.05s, transform 0.05s",
            }}
          >
            ABORT
          </button>
        </div>
      </div>
    </div>
  );
}

export default ActiveMission;
