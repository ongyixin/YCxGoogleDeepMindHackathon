"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { QuestHUD } from "@/components/quest/QuestHUD";
import { MissionBriefing } from "@/components/quest/MissionBriefing";
import { ActiveMission } from "@/components/quest/ActiveMission";
import { ObjectiveGallery } from "@/components/quest/ObjectiveGallery";
import TaskInput from "@/components/quest/TaskInput";
import { MomentumMeter } from "@/components/quest/MomentumMeter";
import NarrationBanner from "@/components/shared/NarrationBanner";
import { MusicIndicator } from "@/components/shared/MusicIndicator";
import { Camera, type CameraHandle } from "@/components/shared/Camera";
import { MOCK_QUEST_SESSION } from "@/lib/mock-data";
import { DEMO_MODE } from "@/lib/constants";
import type {
  SessionState,
  CreateSessionRequest,
  CreateSessionResponse,
  AddTaskRequest,
  AddTaskResponse,
  ProgressRequest,
  ProgressResponse,
  MusicResponse,
  ObjectiveSnapshot,
} from "@/types";

type UIPhase = "input" | "briefing" | "active" | "done";

// ─── Quest Log persistence ─────────────────────────────────────────────────────

const QUEST_LOG_KEY = "mcm_quest_log";
const DEBRIEF_SNAPSHOTS_KEY = "mcm_debrief_snapshots";
const MAX_LOG_ENTRIES = 20;

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

export interface StoredQuestSession {
  sessionId: string;
  startedAt: number;
  savedAt: number;
  missions: StoredMission[];
  totalXP: number;
  completedCount: number;
}

function persistQuestSession(session: SessionState): void {
  if (!session.questState || session.questState.missions.length === 0) return;
  try {
    const missions: StoredMission[] = session.questState.missions.map((m) => ({
      id: m.id,
      codename: m.codename,
      originalTask: m.originalTask,
      category: m.category,
      status: m.status,
      xpReward: m.xpReward,
      objectives: m.objectives.map((o) => ({
        description: o.description,
        completed: o.completed,
      })),
      completedAt: m.completedAt,
    }));
    const entry: StoredQuestSession = {
      sessionId: session.id,
      startedAt: session.startedAt,
      savedAt: Date.now(),
      missions,
      totalXP: session.progression.xp,
      completedCount: missions.filter((m) => m.status === "completed").length,
    };
    const raw = localStorage.getItem(QUEST_LOG_KEY);
    const log: StoredQuestSession[] = raw ? JSON.parse(raw) : [];
    const idx = log.findIndex((e) => e.sessionId === entry.sessionId);
    if (idx >= 0) {
      log[idx] = entry;
    } else {
      log.unshift(entry);
    }
    localStorage.setItem(QUEST_LOG_KEY, JSON.stringify(log.slice(0, MAX_LOG_ENTRIES)));
  } catch { /* silent */ }
}

/**
 * Quest Mode page shell — tactical pixel-retro overlay.
 *
 * Layer stack (bottom → top):
 *   0. Camera feed
 *   1. Dark tactical overlay
 *   2. HUD + MomentumMeter
 *   3. Main content (briefing / active / task input)
 *   4. NarrationBanner (top)
 *
 * When DEMO_MODE = true  → initializes from MOCK_QUEST_SESSION; handlers are stubs.
 * When DEMO_MODE = false → creates a real session via POST /api/session; all handlers
 *                          call the live API endpoints (task, progress).
 */
export default function QuestPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initLoading, setInitLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [musicState, setMusicState] = useState<MusicResponse | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [objectiveSnapshots, setObjectiveSnapshots] = useState<ObjectiveSnapshot[]>([]);
  const [showGallery, setShowGallery] = useState(false);
  const [phase, setPhase] = useState<UIPhase>("input");
  const cameraRef = useRef<CameraHandle>(null);

  // ── Session initialization ──────────────────────────────────────────────────
  useEffect(() => {
    if (DEMO_MODE) {
      setSession(MOCK_QUEST_SESSION);
      setSessionId(MOCK_QUEST_SESSION.id);
      setMusicState({
        mood: MOCK_QUEST_SESSION.musicState.mood,
        intensity: MOCK_QUEST_SESSION.musicState.intensity,
        trackUrl: MOCK_QUEST_SESSION.musicState.trackUrl ?? null,
        trackLabel:
          MOCK_QUEST_SESSION.musicState.trackLabel ??
          MOCK_QUEST_SESSION.musicState.mood,
        isFallback: MOCK_QUEST_SESSION.musicState.isFallback ?? true,
      });
      setInitLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "quest" } as CreateSessionRequest),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: CreateSessionResponse = await res.json();
        if (!cancelled) {
          setSession(data.initialState);
          setSessionId(data.sessionId);
          setMusicState({
            mood: data.initialState.musicState.mood,
            intensity: data.initialState.musicState.intensity,
            trackUrl: data.initialState.musicState.trackUrl ?? null,
            trackLabel:
              data.initialState.musicState.trackLabel ??
              data.initialState.musicState.mood,
            isFallback: data.initialState.musicState.isFallback ?? true,
          });
        }
      } catch (err) {
        console.error("[Quest] Session init failed:", err);
      } finally {
        if (!cancelled) setInitLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchMusic = useCallback(async () => {
    if (!sessionId || DEMO_MODE) return;
    try {
      const res = await fetch(`/api/music?sessionId=${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MusicResponse = await res.json();
      setMusicState(data);
      setSession((prev) =>
        prev
          ? {
              ...prev,
              musicState: {
                ...prev.musicState,
                mood: data.mood,
                intensity: data.intensity,
                trackUrl: data.trackUrl,
                trackLabel: data.trackLabel,
                isFallback: data.isFallback,
                lastUpdatedAt: Date.now(),
              },
            }
          : prev
      );
    } catch (err) {
      console.error("[Quest] Music fetch failed:", err);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || DEMO_MODE) return;
    fetchMusic();
    const id = setInterval(fetchMusic, 20000);
    return () => clearInterval(id);
  }, [sessionId, fetchMusic]);

  useEffect(() => {
    const unlockAudio = () => setAudioEnabled(true);
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => window.removeEventListener("pointerdown", unlockAudio);
  }, []);

  // Persist session to quest log whenever missions change
  useEffect(() => {
    if (!session?.questState || session.questState.missions.length === 0) return;
    persistQuestSession(session);
  }, [session]);

  // ── Derive quest state ──────────────────────────────────────────────────────
  const questState = session?.questState ?? null;
  const activeMission = questState?.missions.find((m) => m.status === "active") ?? null;
  const briefedMission = questState?.missions.find((m) => m.status === "briefed") ?? null;
  const latestNarration = session?.narrativeLog[session.narrativeLog.length - 1] ?? null;

  // Persist snapshots to sessionStorage when mission completes so recap page can read them
  useEffect(() => {
    if (phase === "done" && objectiveSnapshots.length > 0) {
      try {
        sessionStorage.setItem(DEBRIEF_SNAPSHOTS_KEY, JSON.stringify(objectiveSnapshots));
      } catch { /* silent — quota exceeded */ }
    }
  }, [phase, objectiveSnapshots]);

  // Sync phase with session state after init
  useEffect(() => {
    if (!session) return;
    if (activeMission) setPhase("active");
    else if (briefedMission) setPhase("briefing");
    else setPhase("input");
  }, [session?.id]); // only on session ID change (initial load), not on every mutation

  // ── Task submit ─────────────────────────────────────────────────────────────
  const handleTaskSubmit = useCallback(async (taskText: string) => {
    setIsSubmitting(true);
    if (DEMO_MODE) {
      console.log("[Quest] submit task:", taskText);
      await new Promise((r) => setTimeout(r, 500));
      setIsSubmitting(false);
      setPhase("briefing");
      return;
    }
    if (!sessionId) { setIsSubmitting(false); return; }
    try {
      const res = await fetch("/api/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, taskText } as AddTaskRequest),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AddTaskResponse = await res.json();
      setSession((prev) =>
        prev?.questState
          ? {
              ...prev,
              questState: {
                ...prev.questState,
                missions: [...prev.questState.missions, data.mission],
              },
            }
          : prev
      );
      await fetchMusic();
      setPhase("briefing");
    } catch (err) {
      console.error("[Quest] Task submit failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  }, [sessionId, fetchMusic]);

  // ── Accept mission ──────────────────────────────────────────────────────────
  const handleAcceptMission = useCallback(async (missionId: string) => {
    if (DEMO_MODE) {
      console.log("[Quest] accept mission:", missionId);
      setPhase("active");
      return;
    }
    if (!sessionId) return;
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          missionId,
          signal: "context_detected",
        } as ProgressRequest),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ProgressResponse = await res.json();
      setSession((prev) =>
        prev?.questState
          ? {
              ...prev,
              questState: { ...prev.questState, ...data.update },
              narrativeLog: data.narration
                ? [...prev.narrativeLog, data.narration]
                : prev.narrativeLog,
            }
          : prev
      );
      await fetchMusic();
    } catch (err) {
      console.error("[Quest] Accept mission failed:", err);
    }
    setPhase("active");
  }, [sessionId, fetchMusic]);

  // ── Skip mission ────────────────────────────────────────────────────────────
  const handleSkipMission = useCallback((missionId: string) => {
    console.log("[Quest] skip mission:", missionId);
    setPhase("input");
  }, []);

  // ── Complete mission ────────────────────────────────────────────────────────
  const handleComplete = useCallback(async (missionId: string) => {
    if (DEMO_MODE) {
      console.log("[Quest] complete:", missionId);
      setPhase("done");
      return;
    }
    if (!sessionId) return;
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          missionId,
          signal: "mission_complete",
        } as ProgressRequest),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ProgressResponse = await res.json();
      setSession((prev) =>
        prev?.questState
          ? {
              ...prev,
              questState: { ...prev.questState, ...data.update },
              narrativeLog: data.narration
                ? [...prev.narrativeLog, data.narration]
                : prev.narrativeLog,
            }
          : prev
      );
      await fetchMusic();
    } catch (err) {
      console.error("[Quest] Complete mission failed:", err);
    }
    setPhase("done");
  }, [sessionId, fetchMusic]);

  // ── Abandon mission ─────────────────────────────────────────────────────────
  const handleAbandon = useCallback(async (missionId: string) => {
    if (DEMO_MODE) {
      console.log("[Quest] abandon:", missionId);
      setPhase("input");
      return;
    }
    if (!sessionId) return;
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          missionId,
          signal: "mission_abandon",
        } as ProgressRequest),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ProgressResponse = await res.json();
      setSession((prev) =>
        prev?.questState
          ? {
              ...prev,
              questState: { ...prev.questState, ...data.update },
              narrativeLog: data.narration
                ? [...prev.narrativeLog, data.narration]
                : prev.narrativeLog,
            }
          : prev
      );
      await fetchMusic();
    } catch (err) {
      console.error("[Quest] Abandon mission failed:", err);
    }
    setPhase("input");
  }, [sessionId, fetchMusic]);

  // ── Objective complete (snapshot + local state) ─────────────────────────────
  const handleObjectiveComplete = useCallback((missionId: string, objectiveId: string) => {
    // Find the objective description from current session state
    const mission = session?.questState?.missions.find((m) => m.id === missionId);
    const objective = mission?.objectives.find((o) => o.id === objectiveId);
    if (!objective || objective.completed) return;

    // Capture snapshot from live camera feed
    const base64 = cameraRef.current?.captureFrame() ?? null;
    const dataUrl = base64 ? `data:image/jpeg;base64,${base64}` : "";

    if (dataUrl) {
      setObjectiveSnapshots((prev) => [
        ...prev,
        {
          objectiveId,
          missionId,
          objectiveDescription: objective.description,
          dataUrl,
          capturedAt: Date.now(),
        },
      ]);
    }

    // Mark objective completed in local session state
    setSession((prev) => {
      if (!prev?.questState) return prev;
      return {
        ...prev,
        questState: {
          ...prev.questState,
          missions: prev.questState.missions.map((m) =>
            m.id !== missionId
              ? m
              : {
                  ...m,
                  objectives: m.objectives.map((o) =>
                    o.id !== objectiveId ? o : { ...o, completed: true }
                  ),
                }
          ),
        },
      };
    });
  }, [session]);

  // ── Loading state ───────────────────────────────────────────────────────────
  if (initLoading || !session || !questState) {
    return (
      <div
        className="relative h-full w-full flex items-center justify-center"
        style={{ background: "var(--quest-bg)" }}
      >
        <div
          className="border-2 px-8 py-6 text-center"
          style={{
            borderColor: "#3B4CCA",
            boxShadow: "4px 4px 0 rgba(59,76,202,0.5)",
            background: "rgba(6,8,30,0.95)",
          }}
        >
          <p className="font-pixel text-base animate-pulse2" style={{ color: "#FFDE00" }}>
            LOADING...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: "var(--quest-bg)" }}
    >
      {/* Layer 0: Camera feed */}
      <div className="absolute inset-0 z-0">
        <Camera ref={cameraRef} className="w-full h-full object-cover opacity-25" mode="quest" />
      </div>

      {/* Layer 1: Tactical dark overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background:
            "radial-gradient(ellipse at 20% 80%, rgba(59,76,202,0.25) 0%, transparent 55%), " +
            "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 30%, rgba(0,0,0,0.7) 100%)",
        }}
      />
      {/* Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none z-[2]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)",
        }}
      />

      {/* Layer 2: HUD */}
      <div className="absolute top-0 left-0 z-[20] safe-top px-3 py-3">
        <QuestHUD
          progression={session.progression}
          questState={questState}
          startedAt={session.startedAt}
        />
      </div>

      {/* Adaptive music indicator */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-[21] safe-top px-3 py-3">
        <MusicIndicator
          mode="quest"
          enableAudio={audioEnabled}
          state={
            musicState ?? {
              mood: session.musicState.mood,
              intensity: session.musicState.intensity,
              trackUrl: session.musicState.trackUrl ?? null,
              trackLabel: session.musicState.trackLabel ?? session.musicState.mood,
              isFallback: session.musicState.isFallback ?? true,
            }
          }
        />
      </div>

      {/* Momentum meter (right side, active mission only) */}
      {activeMission && phase === "active" && (
        <div className="absolute top-1/2 right-3 z-[20] -translate-y-1/2">
          <MomentumMeter momentum={questState.momentum} />
        </div>
      )}

      {/* Abort button */}
      <div className="absolute top-0 right-0 z-[20] safe-top px-3 py-3">
        <a
          href="/"
          className="flex items-center touch-target"
          style={{
            background: "rgba(6,8,30,0.92)",
            border: "2px solid #3B4CCA",
            padding: "6px 12px",
            boxShadow: "2px 2px 0 rgba(59,76,202,0.5)",
          }}
        >
          <span className="font-pixel text-base" style={{ color: "rgba(255,222,0,0.6)" }}>
            ← ABORT
          </span>
        </a>
      </div>

      {/* Layer 3: Main content */}
      <div className="absolute inset-0 z-[10] flex flex-col justify-end safe-bottom pb-20 px-3 gap-3">
        {phase === "input" && (
          <TaskInput
            onSubmit={handleTaskSubmit}
            isLoading={isSubmitting}
            placeholder="Enter mission (do laundry, reply to emails...)"
          />
        )}

        {phase === "briefing" && briefedMission && (
          <MissionBriefing
            mission={briefedMission}
            onAccept={handleAcceptMission}
            onSkip={handleSkipMission}
          />
        )}

        {phase === "active" && activeMission && (
          <ActiveMission
            mission={activeMission}
            momentum={questState.momentum}
            latestNarration={latestNarration ?? undefined}
            snapshots={objectiveSnapshots.filter((s) => s.missionId === activeMission.id)}
            onComplete={handleComplete}
            onAbandon={handleAbandon}
            onObjectiveComplete={handleObjectiveComplete}
            onOpenGallery={() => setShowGallery(true)}
          />
        )}

        {phase === "done" && (
          <div
            className="text-center"
            style={{
              border: "2px solid #FFDE00",
              background: "rgba(6,8,30,0.98)",
              boxShadow: "4px 4px 0 rgba(59,76,202,0.6)",
              padding: "20px 16px",
            }}
          >
            {/* Window chrome */}
            <div
              className="flex items-center justify-center gap-2 mb-4 pb-3"
              style={{ borderBottom: "1px solid rgba(255,222,0,0.2)" }}
            >
              <span className="font-pixel text-base animate-blink" style={{ color: "#FFDE00" }}>
                ★
              </span>
              <span className="font-pixel text-base" style={{ color: "#FFDE00" }}>
                MISSION COMPLETE
              </span>
              <span className="font-pixel text-base animate-blink" style={{ color: "#FFDE00" }}>
                ★
              </span>
            </div>
            <p className="font-vt text-lg mb-4" style={{ color: "rgba(176,196,255,0.7)" }}>
              Objective achieved. Well done, operative.
            </p>
            <a
              href="/recap?mode=quest"
              className="inline-flex items-center gap-2 font-pixel touch-target px-5 py-3"
              style={{
                background: "#FFDE00",
                border: "2px solid #1a2880",
                boxShadow: "3px 3px 0 rgba(26,40,128,0.6)",
                color: "#0a0e30",
                fontSize: "11px",
                letterSpacing: "0.08em",
              }}
            >
              VIEW DEBRIEF ▶
            </a>
          </div>
        )}
      </div>

      {/* Layer 4: Narration banner */}
      <div className="absolute top-0 left-0 right-0 z-[30] safe-top pt-16 px-3">
        <NarrationBanner event={latestNarration} mode="quest" />
      </div>

      {/* Pixel corner brackets */}
      <TacticalCorners />

      {/* Objective Gallery overlay */}
      {showGallery && activeMission && (
        <ObjectiveGallery
          snapshots={objectiveSnapshots.filter((s) => s.missionId === activeMission.id)}
          missionCodename={activeMission.codename}
          onClose={() => setShowGallery(false)}
        />
      )}
    </div>
  );
}

function TacticalCorners() {
  const color = "rgba(255,222,0,0.35)";
  return (
    <div className="absolute inset-3 pointer-events-none z-[5]" aria-hidden>
      <div className="absolute top-0 left-0 w-5 h-5" style={{ borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <div className="absolute top-0 left-0 w-2 h-2" style={{ background: color }} />
      <div className="absolute top-0 right-0 w-5 h-5" style={{ borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
      <div className="absolute top-0 right-0 w-2 h-2" style={{ background: color }} />
      <div className="absolute bottom-0 left-0 w-5 h-5" style={{ borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <div className="absolute bottom-0 left-0 w-2 h-2" style={{ background: color }} />
      <div className="absolute bottom-0 right-0 w-5 h-5" style={{ borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
      <div className="absolute bottom-0 right-0 w-2 h-2" style={{ background: color }} />
    </div>
  );
}
