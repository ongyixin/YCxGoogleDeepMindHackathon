"use client";

import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { StoryHUD } from "@/components/story/StoryHUD";
import { ObjectLabel } from "@/components/story/ObjectLabel";
import { InteractionModal } from "@/components/story/InteractionModal";
import { MusicIndicator } from "@/components/shared/MusicIndicator";
import NarrationBanner from "@/components/shared/NarrationBanner";
import { Camera, type CameraHandle } from "@/components/shared/Camera";
import { GestureOverlay } from "@/components/shared/GestureOverlay";
import { useFrontCamera } from "@/hooks/useFrontCamera";
import { useGestureDetection } from "@/hooks/useGestureDetection";
import { MOCK_STORY_SESSION } from "@/lib/mock-data";
import { DEMO_MODE } from "@/lib/constants";
import { DEMO_CHARACTER, DEMO_SCENE_OBJECT } from "@/lib/demo/demo-data";
import { saveCharacter } from "@/lib/shared/characterCollection";
import type {
  ObjectCharacter,
  InteractionMode,
  StoryGenre,
  SessionState,
  CreateSessionRequest,
  CreateSessionResponse,
  ScanRequest,
  ScanResponse,
  TalkRequest,
  TalkResponse,
  MusicResponse,
  CharacterExpression,
} from "@/types";
import type { VoiceState } from "@/hooks/useVoiceAgent";

// ─── Gesture → UI hint mapping ────────────────────────────────────────────────

const GESTURE_HINT_MAP: Record<string, { icon: string; suggestedMode?: InteractionMode }> = {
  thumbs_up:   { icon: "👍", suggestedMode: "befriend"    },
  thumbs_down: { icon: "👎", suggestedMode: "roast"       },
  victory:     { icon: "✌️", suggestedMode: "befriend"    },
  open_palm:   { icon: "🖐️", suggestedMode: "befriend"    },
  closed_fist: { icon: "✊", suggestedMode: "roast"       },
  pointing:    { icon: "☝️", suggestedMode: "interrogate" },
  i_love_you:  { icon: "🤟", suggestedMode: "flirt"       },
};

/**
 * Story Mode page shell — pixel-retro AR RPG overlay.
 *
 * Layer stack (bottom → top):
 *   0. Camera feed (full-screen background)
 *   1. Dark tint + pixel grid overlay
 *   2. Floating ObjectLabels (per character — retro NPC tags)
 *   3. StoryHUD (bottom)
 *   4. NarrationBanner (top)
 *   5. InteractionModal (conditional — RPG dialogue box)
 *
 * When DEMO_MODE = true  → initializes from MOCK_STORY_SESSION; handlers are stubs.
 * When DEMO_MODE = false → creates a real session via POST /api/session; all handlers
 *                          call the live API endpoints (scan, talk).
 */
function StoryContent() {
  const searchParams = useSearchParams();
  const genre = (searchParams.get("genre") ?? "mystery") as StoryGenre;

  const [session, setSession] = useState<SessionState | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initLoading, setInitLoading] = useState(true);
  const [selectedCharacter, setSelectedCharacter] = useState<ObjectCharacter | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [musicState, setMusicState] = useState<MusicResponse | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  /** Voice state of the currently active character interaction (for ObjectLabel animation) */
  const [speakingVoiceState, setSpeakingVoiceState] = useState<VoiceState>("idle");
  const cameraRef = useRef<CameraHandle>(null);

  // ── Front camera + gesture detection ────────────────────────────────────────
  const frontCamera = useFrontCamera();
  const { gesture, isReady: gestureReady, modelError: gestureError } = useGestureDetection(
    frontCamera.videoRef,
    true
  );

  // ── Session initialization ──────────────────────────────────────────────────
  useEffect(() => {
    if (DEMO_MODE) {
      const mock: SessionState = {
        ...MOCK_STORY_SESSION,
        sceneGraph: { ...MOCK_STORY_SESSION.sceneGraph, objects: [] },
        storyState: MOCK_STORY_SESSION.storyState
          ? { ...MOCK_STORY_SESSION.storyState, genre, characters: [], relationships: [], activeQuests: [] }
          : undefined,
      };
      setSession(mock);
      setSessionId(mock.id);
      setMusicState({
        mood: mock.musicState.mood,
        intensity: mock.musicState.intensity,
        trackUrl: mock.musicState.trackUrl ?? null,
        trackLabel: mock.musicState.trackLabel ?? mock.musicState.mood,
        isFallback: mock.musicState.isFallback ?? true,
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
          body: JSON.stringify({ mode: "story", genre } as CreateSessionRequest),
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
        console.error("[Story] Session init failed:", err);
      } finally {
        if (!cancelled) setInitLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [genre]);

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
      console.error("[Story] Music fetch failed:", err);
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

  // ── Portrait background fetcher ──────────────────────────────────────────────
  const fetchPortraitInBackground = useCallback(
    (characterId: string, referenceFrame?: string) => {
      if (!sessionId) return;
      fetch("/api/portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, characterId, referenceFrame }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data?.portraits) return;
          setSession((prev) => {
            if (!prev?.storyState) return prev;
            return {
              ...prev,
              storyState: {
                ...prev.storyState,
                characters: prev.storyState.characters.map((c) =>
                  c.id === characterId
                    ? { ...c, portraitUrl: data.portraits.neutral ?? c.portraitUrl, portraits: { ...c.portraits, ...data.portraits } }
                    : c
                ),
              },
            };
          });
          // If this character is currently open in the modal, propagate portraits update
          setSelectedCharacter((prev) =>
            prev?.id === characterId
              ? { ...prev, portraitUrl: data.portraits.neutral ?? prev.portraitUrl, portraits: { ...prev.portraits, ...data.portraits } }
              : prev
          );
        })
        .catch(() => {});
    },
    [sessionId]
  );

  // ── Scan handler ────────────────────────────────────────────────────────────
  const handleScan = useCallback(async () => {
    if (DEMO_MODE) {
      setScanLoading(true);
      await new Promise((r) => setTimeout(r, 2500));
      // Inject the demo character into the scene — only once
      setSession((prev) => {
        if (!prev) return prev;
        const alreadyPresent = prev.storyState?.characters.some(
          (c) => c.id === DEMO_CHARACTER.id
        );
        if (alreadyPresent) return prev;
        return {
          ...prev,
          sceneGraph: {
            ...prev.sceneGraph,
            objects: [
              ...prev.sceneGraph.objects.filter((o) => o.id !== DEMO_CHARACTER.id),
              DEMO_SCENE_OBJECT,
            ],
          },
          storyState: prev.storyState
            ? {
                ...prev.storyState,
                characters: [...prev.storyState.characters, DEMO_CHARACTER],
              }
            : prev.storyState,
          narrativeLog: [
            ...prev.narrativeLog,
            {
              id: "demo-n-scan",
              text: "A presence materializes. Fizzy has entered the scene — and she looks like trouble.",
              tone: "dramatic" as const,
              timestamp: Date.now(),
              sourceMode: "story" as const,
            },
          ],
        };
      });
      setScanLoading(false);
      return;
    }
    if (!sessionId || scanLoading) return;
    setScanLoading(true);
    const frame = cameraRef.current?.captureFrame() ?? "";
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, frame } as ScanRequest),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ScanResponse = await res.json();
      setSession((prev) =>
        prev
          ? {
              ...prev,
              sceneGraph: data.sceneGraph,
              narrativeLog: data.narration
                ? [...prev.narrativeLog, data.narration]
                : prev.narrativeLog,
              storyState:
                data.updatedStoryState !== undefined
                  ? data.updatedStoryState
                  : prev.storyState,
            }
          : prev
      );
      // Kick off portrait generation in the background for each new character —
      // scan returns immediately without portraits so the user can interact now.
      const newCharacterIds = data.storyHooks?.newCharacters ?? [];
      for (const cid of newCharacterIds) {
        fetchPortraitInBackground(cid, frame || undefined);
      }
      await fetchMusic();
    } catch (err) {
      console.error("[Story] Scan failed:", err);
    } finally {
      setScanLoading(false);
    }
  }, [sessionId, scanLoading, fetchMusic, fetchPortraitInBackground]);

  // ── Save character to collection ────────────────────────────────────────────
  const handleSaveCharacter = useCallback(
    (character: import("@/types").ObjectCharacter) => {
      saveCharacter(character, genre);
    },
    [genre]
  );

  // ── Portrait update (expression sprites loaded lazily) ───────────────────
  const handlePortraitsUpdate = useCallback(
    (characterId: string, portraits: Partial<Record<CharacterExpression, string>>) => {
      setSession((prev) => {
        if (!prev?.storyState) return prev;
        return {
          ...prev,
          storyState: {
            ...prev.storyState,
            characters: prev.storyState.characters.map((c) =>
              c.id === characterId ? { ...c, portraits } : c
            ),
          },
        };
      });
    },
    []
  );

  // ── Talk handler ────────────────────────────────────────────────────────────
  const handleTalk = useCallback(
    async (mode: InteractionMode, message: string): Promise<{ response: string; relationshipDelta: number; newRelationshipToUser: number; emotionalStateUpdate?: string } | null> => {
      if (DEMO_MODE) {
        console.log("[Story] talk:", selectedCharacter?.id, mode, message);
        return null;
      }
      if (!sessionId || !selectedCharacter) return null;
      try {
        // Capture a selfie frame at the moment of talking so Gemini can see the user.
        const selfieFrame = frontCamera.captureFrame();

        const talkBody: TalkRequest = {
          sessionId,
          characterId: selectedCharacter.id,
          interactionMode: mode,
          message,
          ...(gesture
            ? {
                gestureContext: {
                  gesture: gesture.label,
                  confidence: gesture.confidence,
                  timestamp: gesture.timestamp,
                },
              }
            : {}),
          ...(selfieFrame ? { selfieFrame } : {}),
        };

        const res = await fetch("/api/talk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(talkBody),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: TalkResponse = await res.json();
        const newRelationshipToUser = Math.min(100, Math.max(-100,
          selectedCharacter.relationshipToUser + (data.relationshipDelta ?? 0)
        ));
        // Update narration and character relationship score in local session state
        setSession((prev) => {
          if (!prev?.storyState) return prev;
          return {
            ...prev,
            narrativeLog: data.narration ? [...prev.narrativeLog, data.narration] : prev.narrativeLog,
            storyState: {
              ...prev.storyState,
              characters: prev.storyState.characters.map((c) =>
                c.id === selectedCharacter.id
                  ? { ...c, relationshipToUser: newRelationshipToUser, emotionalState: data.emotionalStateUpdate ?? c.emotionalState }
                  : c
              ),
            },
          };
        });
        await fetchMusic();
        return {
          response: data.response,
          relationshipDelta: data.relationshipDelta ?? 0,
          newRelationshipToUser,
          emotionalStateUpdate: data.emotionalStateUpdate,
        };
      } catch (err) {
        console.error("[Story] Talk failed:", err);
        return null;
      }
    },
    [sessionId, selectedCharacter, fetchMusic, gesture, frontCamera]
  );

  // ── Loading state ───────────────────────────────────────────────────────────
  if (initLoading || !session) {
    return (
      <div
        className="relative h-full w-full flex items-center justify-center"
        style={{ background: "var(--story-bg)" }}
      >
        <div
          className="border-2 px-8 py-6 text-center"
          style={{
            borderColor: "#CC0000",
            boxShadow: "4px 4px 0 rgba(204,0,0,0.5)",
            background: "rgba(30,6,6,0.95)",
          }}
        >
          <p className="font-pixel text-base animate-pulse2" style={{ color: "#FFDE00" }}>
            LOADING...
          </p>
        </div>
      </div>
    );
  }

  const storyState = session.storyState ?? null;
  const latestNarration = session.narrativeLog[session.narrativeLog.length - 1] ?? null;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: "var(--story-bg)" }}
    >
      {/* Layer 0: Camera feed */}
      <div className="absolute inset-0 z-0">
        <Camera
          ref={cameraRef}
          className="w-full h-full object-cover opacity-35"
          mode="story"
        />
      </div>

      {/* Layer 1: Dark atmosphere + pixel grid */}
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background:
            "radial-gradient(ellipse at 30% 25%, rgba(204,0,0,0.22) 0%, transparent 50%), " +
            "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 35%, rgba(0,0,0,0.65) 100%)",
        }}
      />
      {/* Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none z-[2]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)",
        }}
      />

      {/* Layer 2: Floating ObjectLabels */}
      {storyState?.characters.map((character: import("@/types").ObjectCharacter, i: number) => {
        const sceneObject = session.sceneGraph.objects.find((o) => o.id === character.id);
        const isActiveCharacter = selectedCharacter?.id === character.id;
        return (
          <ObjectLabel
            key={character.id}
            character={character}
            position={sceneObject?.position ?? "center"}
            index={i}
            isSelected={isActiveCharacter}
            onClick={() => setSelectedCharacter(character)}
            voiceState={isActiveCharacter ? speakingVoiceState : undefined}
          />
        );
      })}

      {/* Hidden front camera elements (needed by useFrontCamera + useGestureDetection) */}
      <video ref={frontCamera.videoRef} playsInline muted style={{ display: "none" }} />
      <canvas ref={frontCamera.canvasRef} style={{ display: "none" }} />

      {/* Layer 2.5: Gesture overlay PiP */}
      <GestureOverlay
        videoRef={frontCamera.videoRef}
        canvasRef={frontCamera.canvasRef}
        gesture={gesture}
        isReady={gestureReady}
        modelError={gestureError}
      />

      {/* Layer 3: StoryHUD */}
      <StoryHUD
        storyState={storyState}
        sessionStartedAt={session.startedAt}
        onScan={handleScan}
        onSelectCharacter={setSelectedCharacter}
        scanLoading={scanLoading}
        selectedCharacterId={selectedCharacter?.id}
      />

      {/* Music status / player */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-[21] safe-top px-3 py-3">
        <MusicIndicator
          mode="story"
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

      {/* Exit button */}
      <div className="absolute top-0 right-0 z-[20] safe-top px-3 py-3">
        <a
          href="/"
          className="flex items-center touch-target"
          style={{
            background: "rgba(30,6,6,0.92)",
            border: "2px solid #CC0000",
            padding: "6px 12px",
            boxShadow: "2px 2px 0 rgba(204,0,0,0.5)",
          }}
        >
          <span className="font-pixel text-base" style={{ color: "rgba(255,222,0,0.7)" }}>
            ← EXIT
          </span>
        </a>
      </div>

      {/* Layer 4: Narration banner */}
      <div className="absolute top-0 left-0 right-0 z-[30] safe-top pt-16 px-3">
        <NarrationBanner event={latestNarration} mode="story" autoDismissMs={8000} />
      </div>

      {/* Layer 5: Interaction modal */}
      {selectedCharacter && (
        <InteractionModal
          character={selectedCharacter}
          onClose={() => { setSelectedCharacter(null); setSpeakingVoiceState("idle"); }}
          onTalk={handleTalk}
          onSave={handleSaveCharacter}
          sessionId={sessionId ?? undefined}
          onPortraitsUpdate={handlePortraitsUpdate}
          onVoiceStateChange={setSpeakingVoiceState}
          currentGesture={
            gesture && gesture.label !== "none"
              ? {
                  label: gesture.label,
                  icon: GESTURE_HINT_MAP[gesture.label]?.icon ?? "🤚",
                  suggestedMode: GESTURE_HINT_MAP[gesture.label]?.suggestedMode,
                }
              : null
          }
        />
      )}

      {/* Pixel corner brackets */}
      <PixelCorners color="rgba(255,222,0,0.4)" />
    </div>
  );
}

function PixelCorners({ color }: { color: string }) {
  return (
    <div className="absolute inset-3 pointer-events-none z-[5]" aria-hidden>
      {/* Top-left */}
      <div className="absolute top-0 left-0 w-5 h-5" style={{ borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <div className="absolute top-0 left-0 w-2 h-2" style={{ background: color, opacity: 0.4, borderRadius: 0 }} />
      {/* Top-right */}
      <div className="absolute top-0 right-0 w-5 h-5" style={{ borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
      <div className="absolute top-0 right-0 w-2 h-2" style={{ background: color, opacity: 0.4 }} />
      {/* Bottom-left */}
      <div className="absolute bottom-0 left-0 w-5 h-5" style={{ borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <div className="absolute bottom-0 left-0 w-2 h-2" style={{ background: color, opacity: 0.4 }} />
      {/* Bottom-right */}
      <div className="absolute bottom-0 right-0 w-5 h-5" style={{ borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
      <div className="absolute bottom-0 right-0 w-2 h-2" style={{ background: color, opacity: 0.4 }} />
    </div>
  );
}

export default function StoryPage() {
  return (
    <Suspense
      fallback={
        <div
          className="relative h-full w-full flex items-center justify-center"
          style={{ background: "var(--story-bg)" }}
        >
          <div
            className="border-2 px-8 py-6 text-center"
            style={{ borderColor: "#CC0000", boxShadow: "4px 4px 0 rgba(204,0,0,0.5)", background: "rgba(30,6,6,0.95)" }}
          >
            <p className="font-pixel text-base animate-pulse2" style={{ color: "#FFDE00" }}>
              LOADING...
            </p>
          </div>
        </div>
      }
    >
      <StoryContent />
    </Suspense>
  );
}
