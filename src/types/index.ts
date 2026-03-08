// ─── Mode ─────────────────────────────────────────────────────────────────────

export type ActiveMode = "story" | "quest";
/** Alias for ActiveMode — used by some utility functions */
export type AppMode = ActiveMode;

// ─── Genre ────────────────────────────────────────────────────────────────────

/** Story genre values. UI-facing names use hyphens; engine uses underscores. */
export type Genre =
  | "mystery"
  | "fantasy"
  | "soap-opera"
  | "workplace-drama"
  | "dating-sim"
  | "survival"
  | "cinematic"; // Quest mode pseudo-genre

/** Flat session type used by deriveStoryMood, deriveQuestMood, and utility functions */
export interface Session {
  mode: AppMode;
  xp: number;
  momentumScore?: number;
  missionPhase?: string;
}

// ─── Core Session ─────────────────────────────────────────────────────────────

export interface SessionState {
  id: string;
  activeMode: ActiveMode;
  sceneGraph: SceneGraph;
  narrativeLog: NarrationEvent[];
  musicState: MusicState;
  progression: ProgressionState;
  storyState?: StoryModeState;
  questState?: QuestModeState;
  startedAt: number;
  location?: { lat: number; lng: number };
}

// ─── Scene Understanding ──────────────────────────────────────────────────────

export interface SceneGraph {
  sceneType: string; // "bedroom", "office", "kitchen", "grocery store"
  objects: DetectedObject[];
  /** UI convenience: objects with normalized {x,y} screen positions */
  entities?: SceneEntity[];
  mood: string;
  spatialContext: string;
  rawDescription?: string;
  capturedAt?: number;
}

export interface DetectedObject {
  id: string;
  label: string;
  salience: number; // 0–1
  position: "left" | "center" | "right" | "background";
  context: string;
}

/** Scene entity with screen-position for AR label placement */
export interface SceneEntity {
  id: string;
  label: string;
  description?: string;
  position: { x: number; y: number };
  affordances?: string[];
}

// ─── Narration ────────────────────────────────────────────────────────────────

export type NarrationTone =
  | "dramatic"
  | "documentary"
  | "deadpan"
  | "chaotic"
  | "cinematic_briefing"
  | "mission_control"
  | "field_dispatch";

export interface NarrationEvent {
  id?: string;
  text: string;
  tone: NarrationTone;
  timestamp: number;
  sourceMode?: ActiveMode | "shared";
}

// ─── Music ────────────────────────────────────────────────────────────────────

export type MusicMood =
  | "ambient"
  | "neutral"
  | "romantic"
  | "suspenseful"
  | "chaotic"
  | "tragic"
  | "comedic"
  | "focused"
  | "driving"
  | "triumphant"
  | "urgent"
  | "idle"
  // Legacy aliases used by utils.ts — map to canonical moods in the music engine
  | "tension-rising"
  | "victory"
  | "action"
  | "dialogue"
  | "ambient-explore";

export interface MusicState {
  mood: MusicMood;
  intensity: number; // 0–1
  trackUrl?: string | null;
  trackLabel?: string;
  lastUpdatedAt?: number;
  tempo?: string;
  environment?: string;
  isFallback?: boolean;
}

// ─── Progression ──────────────────────────────────────────────────────────────

export interface ProgressionState {
  xp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  completedToday: number;
  badges: string[];
}

// ─── Story Mode (Engine Types) ────────────────────────────────────────────────

export type StoryGenre =
  | "dating_sim"
  | "mystery"
  | "fantasy"
  | "survival"
  | "workplace_drama"
  | "soap_opera";

export type StoryPhase =
  | "scanning"
  | "exploring"
  | "quest_active"
  | "escalation"
  | "climax"
  | "recap";

export type InteractionMode =
  | "flirt"
  | "interrogate"
  | "recruit"
  | "befriend"
  | "roast"
  | "apologize"
  | "negotiate"
  | "ignore";

export type RelationshipType =
  | "alliance"
  | "rivalry"
  | "crush"
  | "grudge"
  | "indifferent";

export type StoryQuestType =
  | "fetch"
  | "social"
  | "choice"
  | "challenge"
  | "survival";

export type StoryQuestStatus = "available" | "active" | "completed" | "failed";

export interface StoryModeState {
  genre: StoryGenre;
  phase: StoryPhase;
  characters: ObjectCharacter[];
  relationships: RelationshipEdge[];
  activeQuests: StoryQuest[];
  conversationLog: ConversationEntry[];
}

/** Engine character type — used by personification.ts and storyEngine.ts */
export interface ObjectCharacter {
  id: string;
  objectLabel: string;
  name: string;
  personality: string;
  voiceStyle: string;
  emotionalState: string;
  relationshipToUser: number; // -100 to 100
  relationshipStance: string;
  memories: string[];
  portraitUrl?: string;
}

export interface RelationshipEdge {
  fromId: string;
  toId: string;
  type: RelationshipType;
  intensity: number; // 0–1
  reason: string;
}

export interface StoryQuest {
  id: string;
  issuedBy: string;
  title: string;
  description: string;
  type: StoryQuestType;
  status: StoryQuestStatus;
  xpReward?: number;
}

export interface ConversationEntry {
  characterId: string;
  mode: InteractionMode;
  userMessage: string;
  characterResponse: string;
  relationshipDelta: number;
  timestamp: number;
}

// ─── Story Mode (UI / Flat Types) ────────────────────────────────────────────

/** UI-facing character type — used by story UI components */
export interface StoryCharacter {
  entityId: string;
  name: string;
  personality: string;
  voiceTone?: string;
  emotionalState: string;
  relationshipScore: number;
  stance: string;
  memory?: string[];
  /** NanoBanana-generated portrait URL */
  portrait?: string;
}

export interface StoryDialogue {
  lines: string[];
  playerChoices?: string[];
}

export interface StoryActiveQuest {
  id: string;
  title: string;
  description: string;
  issuedBy: string;
  targetEntityId?: string;
  status: string;
  xpReward: number;
}

/** Flat Story Mode session state used by UI components and mock data */
export interface StorySessionState {
  id: string;
  mode: "story";
  genre: string;
  startedAt: number;
  xp: number;
  level: number;
  characters: Record<string, StoryCharacter>;
  activeQuest: StoryActiveQuest | null;
  completedQuests: StoryActiveQuest[];
  narratorText: string;
  sceneGraph: SceneGraph | null;
  activeDialogue: StoryDialogue | null;
}

// ─── Quest Mode (Engine Types) ────────────────────────────────────────────────

export type MissionCategory =
  | "supply_run"
  | "restoration"
  | "containment"
  | "crafting"
  | "knowledge_raid"
  | "recon"
  | "endurance";

export type MissionStatus =
  | "briefed"
  | "active"
  | "completed"
  | "abandoned";

export interface QuestModeState {
  missions: Mission[];
  activeMissionId: string | null;
  completedCampaigns: CampaignRecap[];
  momentum: MomentumState;
}

export interface Mission {
  id: string;
  originalTask: string;
  codename: string;
  briefing: string;
  category: MissionCategory;
  status: MissionStatus;
  xpReward: number;
  contextTrigger?: string;
  objectives: MissionObjective[];
  startedAt?: number;
  completedAt?: number;
}

export interface MissionObjective {
  id: string;
  description: string;
  completed: boolean;
}

export interface ObjectiveSnapshot {
  objectiveId: string;
  missionId: string;
  objectiveDescription: string;
  /** Full data URL — data:image/jpeg;base64,... */
  dataUrl: string;
  capturedAt: number;
}

export interface MomentumState {
  currentCombo: number;
  sessionProductivityScore: number; // 0–100
  lastActivityAt: number;
  idlePenaltyTriggered: boolean;
}

export interface CampaignRecap {
  date: string;
  missionsCompleted: number;
  totalXP: number;
  longestCombo: number;
  highlightMission: string;
  posterUrl?: string;
}

// ─── Quest Mode (UI / Flat Types) ────────────────────────────────────────────

/** UI-facing real task / mission type */
export interface RealTask {
  id: string;
  raw: string;
  missionTitle: string;
  missionBrief: string;
  estimatedMinutes: number;
  xpReward: number;
  status?: "pending" | "active" | "completed" | "abandoned";
  contextTrigger?: string;
  /** NanoBanana-generated mission card image URL */
  missionCardUrl?: string;
}

export interface ActiveMission {
  task: RealTask;
  phase: "briefed" | "active" | "completed" | "abandoned";
  startedAt: number;
  momentumScore: number;
  progressPercent: number;
  narratorLines: string[];
  streakCount: number;
}

/** Flat Quest Mode session state used by UI components and mock data */
export interface QuestSessionState {
  id: string;
  mode: "quest";
  genre: string;
  startedAt: number;
  xp: number;
  level: number;
  pendingTasks: RealTask[];
  activeMission: ActiveMission | null;
  completedMissions: RealTask[];
  totalXP: number;
  streakCount: number;
  sceneGraph: SceneGraph | null;
  narratorText: string;
}

// ─── Recap / Poster ───────────────────────────────────────────────────────────

export interface EpisodeSummaryHighlight {
  type: "relationship" | "quest" | "xp" | "dialogue";
  title: string;
  detail: string;
  iconEmoji: string;
}

export interface EpisodeSummary {
  sessionId: string;
  mode: "story" | "quest";
  genre: string;
  durationMinutes: number;
  totalXP: number;
  highlights: EpisodeSummaryHighlight[];
  generatedAt: number;
  posterUrl?: string;
}

export interface PosterResponse {
  posterUrl: string | null;
  title: string;
  tagline: string;
  summary: string;
  highlights: string[];
  generatedAt: number;
  isFallback: boolean;
}

// ─── API Payloads ─────────────────────────────────────────────────────────────

export interface CreateSessionRequest {
  mode: "story" | "quest";
  genre?: StoryGenre;
}

export interface CreateSessionResponse {
  sessionId: string;
  initialState: SessionState;
}

export interface ScanRequest {
  sessionId: string;
  frame: string; // base64 JPEG
  location?: { lat: number; lng: number };
}

export interface ScanResponse {
  sceneGraph: SceneGraph;
  narration: NarrationEvent;
  storyHooks?: {
    newCharacters?: string[];
    triggeredEscalation?: boolean;
  };
  questHooks?: {
    contextMatches?: string[];
    missionActivations?: string[];
  };
  /** Full updated story state — returned in live mode so client can sync characters/relationships */
  updatedStoryState?: StoryModeState;
  /** Full updated quest state — returned in live mode so client can sync mission activations */
  updatedQuestState?: QuestModeState;
}

export interface MusicResponse {
  mood: MusicMood;
  intensity: number;
  trackUrl: string | null;
  trackLabel: string;
  isFallback: boolean;
}

// ─── Gemini Internals ─────────────────────────────────────────────────────────

export interface GeminiSceneResult {
  sceneType: string;
  objects: Array<{
    label: string;
    salience: number;
    position: "left" | "center" | "right" | "background";
    context: string;
  }>;
  mood: string;
  spatialContext: string;
  activityHint?: string;
  taskRelevance?: string[];
}

// ─── Service Interfaces ───────────────────────────────────────────────────────

export interface INarrator {
  generate(
    event: string,
    mode: ActiveMode,
    context: Partial<SessionState>
  ): Promise<NarrationEvent>;
}

export interface LyriaControlSignal {
  mood: MusicMood;
  tempo: string;
  intensity: number;
  environment?: string;
  activeMode?: ActiveMode;
}

export interface LyriaTrack {
  url: string;
  mood: MusicMood;
  durationMs: number;
}

export type FallbackTrackMap = Partial<Record<MusicMood, string>>;

export interface IMusicController {
  getTrack(signal: LyriaControlSignal): Promise<LyriaTrack>;
  getFallback(mood: MusicMood): string;
}

export type NanoBananaAssetType =
  | "character_portrait"
  | "mission_card"
  | "recap_poster"
  | "quest_item_icon";

export interface NanoBananaRequest {
  type: NanoBananaAssetType;
  prompt: string;
  style?: string;
  sessionContext?: unknown;
  /** Raw base64 JPEG (no data-URI prefix) to use as a reference image for generation. */
  referenceImage?: string;
}

export interface NanoBananaResponse {
  imageUrl: string;
  isFallback: boolean;
  fallbackEmoji?: string;
}

export interface IVisualGenerator {
  generate(req: NanoBananaRequest): Promise<NanoBananaResponse>;
}

export interface IPersonification {
  personify(
    object: DetectedObject,
    genre: StoryGenre,
    existingCharacters: ObjectCharacter[]
  ): Promise<ObjectCharacter>;
}

export interface IProgression {
  awardXP(state: ProgressionState, amount: number): ProgressionState;
  updateStreak(state: ProgressionState): ProgressionState;
  checkLevelUp(state: ProgressionState): { leveled: boolean; newLevel: number };
}

export interface IRelationshipManager {
  updateRelationship(
    state: StoryModeState,
    characterId: string,
    delta: number,
    interactionContext: string
  ): StoryModeState;
  generateInterObjectRelationships(characters: ObjectCharacter[]): RelationshipEdge[];
}

export interface IContextDetector {
  match(
    sceneGraph: SceneGraph,
    missions: Mission[]
  ): { activations: string[]; matches: string[] };
}

export interface IMissionFramer {
  frame(
    taskText: string,
    sceneContext: string,
    userHistory: string
  ): Promise<Mission>;
}

export interface IMomentumTracker {
  recordActivity(state: MomentumState): MomentumState;
  recordObjectiveComplete(state: MomentumState): MomentumState;
  recordMissionComplete(state: MomentumState): MomentumState;
  checkIdle(state: MomentumState, thresholdMs?: number): boolean;
  computeProductivityScore(state: MomentumState, missions: Mission[]): number;
  applyIdlePenalty(state: MomentumState): MomentumState;
  breakCombo(state: MomentumState): MomentumState;
}

// ─── API error / utility ──────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  code?: string;
}

// ─── Scan API ─────────────────────────────────────────────────────────────────

export interface StoryScanUpdate {
  characters: ObjectCharacter[];
  relationships: RelationshipEdge[];
}

export interface QuestScanUpdate {
  contextMatches: string[];
  missionActivations: string[];
}

// ─── Gesture detection ────────────────────────────────────────────────────────

/** Real-time gesture snapshot captured from the front camera via MediaPipe. */
export interface GestureContext {
  /** Normalised gesture label e.g. "thumbs_up", "victory", "open_palm" */
  gesture: string;
  /** Detection confidence 0–1 */
  confidence: number;
  /** Unix timestamp of the detection */
  timestamp: number;
}

// ─── Talk API (Story Mode) ────────────────────────────────────────────────────

export interface TalkRequest {
  sessionId: string;
  characterId: string;
  interactionMode: InteractionMode;
  message: string;
  /** Optional real-time gesture the user is showing via the front camera */
  gestureContext?: GestureContext;
  /** Optional base64 JPEG selfie frame from the front camera (no data-URI prefix) */
  selfieFrame?: string;
}

export interface TalkResponse {
  response: string;
  relationshipDelta: number;
  emotionalStateUpdate?: string;
  narration?: NarrationEvent;
  quest?: StoryQuest;
  escalation?: EscalationEvent;
}

// ─── Story escalation event ───────────────────────────────────────────────────

export interface EscalationEvent {
  id: string;
  type: "heartbreak" | "argument" | "alliance_formed" | "boss_sequence" | "revelation";
  title: string;
  description: string;
  affectedCharacterIds: string[];
  narrativeText: string;
  timestamp: number;
}

// ─── Action API (Story quests / choices) ─────────────────────────────────────

export interface ActionRequest {
  sessionId: string;
  actionType:
    | "accept_quest"
    | "complete_quest"
    | "fail_quest"
    | "make_choice"
    | "use_item"
    | "dismiss_escalation";
  payload: Record<string, unknown>;
}

export interface ActionResponse {
  gameUpdate: Partial<StoryModeState>;
  narration?: NarrationEvent;
  xpEarned?: number;
}

// ─── Task API (Quest Mode) ────────────────────────────────────────────────────

export interface AddTaskRequest {
  sessionId: string;
  taskText: string;
}

export interface AddTaskResponse {
  mission: Mission;
}

export interface ListMissionsResponse {
  missions: Mission[];
}

// ─── Progress API (Quest Mode) ────────────────────────────────────────────────

export type ProgressSignal =
  | "objective_complete"
  | "mission_complete"
  | "mission_abandon"
  | "context_detected"
  | "idle_detected";

export interface ProgressRequest {
  sessionId: string;
  missionId: string;
  objectiveId?: string;
  signal: ProgressSignal;
}

export interface ProgressResponse {
  update: Partial<QuestModeState>;
  narration?: NarrationEvent;
  xpEarned?: number;
  combo?: number;
  musicUpdate?: Partial<MusicState>;
}

// ─── Poster API ───────────────────────────────────────────────────────────────

export interface PosterRequest {
  sessionId: string;
}

// ─── Character Collection (localStorage) ─────────────────────────────────────

/** A character saved to the player's permanent collection index. */
export interface SavedCharacter {
  id: string;
  objectLabel: string;
  name: string;
  personality: string;
  voiceStyle: string;
  emotionalState: string;
  portraitUrl?: string;
  genre: StoryGenre;
  relationshipScore: number;
  savedAt: number;
  memories: string[];
  interactionCount: number;
}
