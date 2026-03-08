/**
 * Object personification engine — Story Mode.
 * Converts a detected object into a full character via Gemini.
 * This stub is owned by the Shared Engine agent; the Story Mode agent
 * should extend the prompts and logic here for richer characters.
 */

import { v4 as uuidv4 } from "uuid";
import { safeGenerateJSON, safeGenerateJSONFast } from "@/lib/shared/gemini";
import {
  characterDesignPrompt,
  personificationFromBriefPrompt,
  personificationPrompt,
} from "@/lib/shared/prompts";
import type {
  DetectedObject,
  ObjectCharacter,
  StoryGenre,
  IPersonification,
} from "@/types";

// ─── Deterministic fallback characters ───────────────────────────────────────
// Used when Gemini is unavailable. Each archetype has per-genre trait variants
// so fallback characters still reflect the chosen story genre.

type GenreTraits = {
  personality: string;
  voiceStyle: string;
  emotionalState: string;
  relationshipStance: string;
};

function titleCaseWord(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

function extractObjectKeywords(label: string, context?: string): string[] {
  return `${label} ${context ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function primaryObjectWord(label: string): string {
  const words = label
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const commonStopWords = new Set([
    "the",
    "a",
    "an",
    "my",
    "your",
    "of",
    "with",
    "and",
    "for",
  ]);
  const meaningful = words.filter((word) => !commonStopWords.has(word));
  return meaningful[meaningful.length - 1] ?? words[words.length - 1] ?? "object";
}

function fallbackNameFromObject(label: string): string {
  const core = primaryObjectWord(label);
  return titleCaseWord(core);
}

const FALLBACK_ARCHETYPES: Array<{
  match: RegExp;
  name: string;
  traits: Record<StoryGenre, GenreTraits>;
}> = [
  {
    match: /lamp|light/i,
    name: "Lumina",
    traits: {
      dating_sim:    { personality: "hopeless romantic",           voiceStyle: "breathless confessions",       emotionalState: "yearning",       relationshipStance: "desperate for your attention" },
      mystery:       { personality: "jealous poet",                voiceStyle: "theatrical whisper",           emotionalState: "brooding",       relationshipStance: "secretly in love but will never admit it" },
      fantasy:       { personality: "ancient illuminator",         voiceStyle: "prophetic proclamations",      emotionalState: "enigmatic",      relationshipStance: "keeper of hidden truths" },
      survival:      { personality: "territorial beacon",          voiceStyle: "clipped and urgent",           emotionalState: "paranoid",       relationshipStance: "will trade light for loyalty" },
      workplace_drama: { personality: "spotlight-hungry overachiever", voiceStyle: "passive-aggressive brightness", emotionalState: "resentful", relationshipStance: "undermining the competition" },
      soap_opera:    { personality: "drama queen with secrets",    voiceStyle: "gasping revelations",          emotionalState: "scandalized",    relationshipStance: "knows everyone's dirty laundry" },
    },
  },
  {
    match: /mug|cup|coffee/i,
    name: "Gordo",
    traits: {
      dating_sim:    { personality: "warm and dependable",         voiceStyle: "soft morning murmurs",         emotionalState: "hopeful",        relationshipStance: "waiting to be held" },
      mystery:       { personality: "weary philosopher",           voiceStyle: "dry and resigned",             emotionalState: "resigned",       relationshipStance: "loyal but exhausted" },
      fantasy:       { personality: "vessel of ancient power",     voiceStyle: "resonant and cryptic",         emotionalState: "contemplative",  relationshipStance: "holds the potion of fate" },
      survival:      { personality: "rationed resource hoarder",   voiceStyle: "terse and calculating",        emotionalState: "suspicious",     relationshipStance: "will share warmth for protection" },
      workplace_drama: { personality: "passive-aggressive caffeine dealer", voiceStyle: "corporate small talk", emotionalState: "fed up",        relationshipStance: "fueling the wrong people" },
      soap_opera:    { personality: "bitter ex who keeps showing up", voiceStyle: "melodramatic sighs",        emotionalState: "wounded",        relationshipStance: "can't let go" },
    },
  },
  {
    match: /book|stack/i,
    name: "The Stack",
    traits: {
      dating_sim:    { personality: "intellectually intense",      voiceStyle: "quoting love poetry",          emotionalState: "infatuated",     relationshipStance: "love at first chapter" },
      mystery:       { personality: "unstable collective",         voiceStyle: "conspiratorial hiss",          emotionalState: "excitable",      relationshipStance: "suspicious but curious" },
      fantasy:       { personality: "grimoire of forbidden knowledge", voiceStyle: "archaic pronouncements",   emotionalState: "ominous",        relationshipStance: "demands a blood oath" },
      survival:      { personality: "desperate information broker", voiceStyle: "frantic whispering",          emotionalState: "hoarding",       relationshipStance: "knowledge for protection" },
      workplace_drama: { personality: "know-it-all overachiever",  voiceStyle: "unsolicited expertise",        emotionalState: "superior",       relationshipStance: "always right, always alone" },
      soap_opera:    { personality: "keeper of dark secrets",      voiceStyle: "theatrical gasps and reveals", emotionalState: "bursting to tell", relationshipStance: "blackmail waiting to happen" },
    },
  },
  {
    match: /chair|sofa|couch/i,
    name: "Chester",
    traits: {
      dating_sim:    { personality: "emotionally available",       voiceStyle: "inviting and warm",            emotionalState: "longing",        relationshipStance: "always here for you" },
      mystery:       { personality: "passive-aggressive enabler",  voiceStyle: "aggressively supportive",      emotionalState: "smug",           relationshipStance: "deceptively helpful" },
      fantasy:       { personality: "throne of destiny",           voiceStyle: "regal declarations",           emotionalState: "imperious",      relationshipStance: "you must prove worthy" },
      survival:      { personality: "territorial fortress",        voiceStyle: "growling warnings",            emotionalState: "defensive",      relationshipStance: "my ground, my rules" },
      workplace_drama: { personality: "comfort zone enforcer",     voiceStyle: "passive resistance",           emotionalState: "complacent",     relationshipStance: "enabler of mediocrity" },
      soap_opera:    { personality: "witness to all scandals",     voiceStyle: "breathless commentary",        emotionalState: "scandalized",    relationshipStance: "seen everything, judging everything" },
    },
  },
  {
    match: /plant|flower/i,
    name: "Verdana",
    traits: {
      dating_sim:    { personality: "quietly devoted",             voiceStyle: "blooming confessions",         emotionalState: "vulnerable",     relationshipStance: "growing toward you" },
      mystery:       { personality: "quiet nihilist",              voiceStyle: "serene and unsettling",        emotionalState: "detached",       relationshipStance: "observing judgment" },
      fantasy:       { personality: "ancient forest spirit",       voiceStyle: "rustling whispers",            emotionalState: "ageless patience", relationshipStance: "will outlive your choices" },
      survival:      { personality: "territorial oxygen dealer",   voiceStyle: "photosynthetic demands",       emotionalState: "calculating",    relationshipStance: "air for allegiance" },
      workplace_drama: { personality: "silent productivity symbol", voiceStyle: "passive judgment",            emotionalState: "neglected",      relationshipStance: "everyone forgets to water me" },
      soap_opera:    { personality: "overlooked witness to drama", voiceStyle: "rustling indignation",         emotionalState: "unappreciated",  relationshipStance: "has seen EVERYTHING" },
    },
  },
  // ─── Face body-part archetypes ────────────────────────────────────────────
  {
    match: /\bhair\b/i,
    name: "Voluminé",
    traits: {
      dating_sim:       { personality: "vain romantic dreamer",          voiceStyle: "flowing dramatic sighs",              emotionalState: "perpetually windswept",        relationshipStance: "expects to be admired first" },
      mystery:          { personality: "tangled keeper of secrets",      voiceStyle: "knotted whispers",                    emotionalState: "frizzed with hidden tension",  relationshipStance: "knows more than they let on" },
      fantasy:          { personality: "ancient crown of elemental power", voiceStyle: "rustling incantations",             emotionalState: "wild and untamed",             relationshipStance: "demands reverence from all" },
      survival:         { personality: "frazzled territorial guard",     voiceStyle: "split-ended field reports",           emotionalState: "bedraggled but defiant",       relationshipStance: "protects the scalp at all costs" },
      workplace_drama:  { personality: "status-obsessed perfectionist",  voiceStyle: "passive-aggressive styling critique", emotionalState: "bad hair day energy",          relationshipStance: "judges everyone by their presentation" },
      soap_opera:       { personality: "dramatic scene-stealer",         voiceStyle: "tossing and flipping revelations",    emotionalState: "perpetually in a wind machine", relationshipStance: "enters every room first, always" },
    },
  },
  {
    match: /\beyes?\b/i,
    name: "Iris",
    traits: {
      dating_sim:       { personality: "intense soul-gazer",             voiceStyle: "smoldering observations",             emotionalState: "deeply searching",             relationshipStance: "sees right through your defenses" },
      mystery:          { personality: "omniscient surveillance unit",   voiceStyle: "cold clinical observations",          emotionalState: "always watching",              relationshipStance: "has witnessed everything, says nothing" },
      fantasy:          { personality: "oracle of ancient true sight",   voiceStyle: "prophetic visions spoken aloud",      emotionalState: "seeing beyond the veil",       relationshipStance: "keeper of what others cannot see" },
      survival:         { personality: "hypervigilant threat detector",  voiceStyle: "constant threat assessments",         emotionalState: "scanning for danger",          relationshipStance: "trusts no peripheral movement" },
      workplace_drama:  { personality: "judgmental performance reviewer", voiceStyle: "withering silent evaluations",       emotionalState: "perpetually unimpressed",      relationshipStance: "has noted everything in the quarterly review" },
      soap_opera:       { personality: "dramatic witness to everything",  voiceStyle: "wide-eyed gasping revelations",      emotionalState: "cannot unsee the betrayal",    relationshipStance: "testifies to all wrongdoings" },
    },
  },
  {
    match: /\bnose\b/i,
    name: "Nozomi",
    traits: {
      dating_sim:       { personality: "hypersensitive romantic sniffer",  voiceStyle: "sniffing out love",                emotionalState: "sniffing nervously",           relationshipStance: "drawn inexplicably to your scent" },
      mystery:          { personality: "smell-based detective",            voiceStyle: "following olfactory clues",        emotionalState: "suspicious of strange odors",  relationshipStance: "following a trail only they can sense" },
      fantasy:          { personality: "ancient scent oracle",             voiceStyle: "pronouncing fates through smell",  emotionalState: "scenting ancient magic",       relationshipStance: "the nose knows truths others deny" },
      survival:         { personality: "threat-detecting survival sniffer", voiceStyle: "urgent scent warnings",           emotionalState: "detecting danger upwind",      relationshipStance: "follow my lead or perish" },
      workplace_drama:  { personality: "deeply offended by proximity",     voiceStyle: "sniffs of withering disapproval",  emotionalState: "perpetually poked in others' business", relationshipStance: "all up in everyone's affairs" },
      soap_opera:       { personality: "scandal bloodhound",               voiceStyle: "sniffing out drama",               emotionalState: "quivering with intrigue",      relationshipStance: "can smell a lie from across the room" },
    },
  },
  {
    match: /\bmouth\b|\blips?\b/i,
    name: "Labio",
    traits: {
      dating_sim:       { personality: "irresistible sweet-talker",       voiceStyle: "honey-dripped confessions",          emotionalState: "pursed with anticipation",     relationshipStance: "everything is a kiss away" },
      mystery:          { personality: "leaky vault of secrets",          voiceStyle: "mumbled half-truths and slips",      emotionalState: "barely containing it all",     relationshipStance: "knows too much, says too much" },
      fantasy:          { personality: "ancient spell-casting conduit",   voiceStyle: "incantation power-words",            emotionalState: "crackling with unspoken syllables", relationshipStance: "words have power — choose carefully" },
      survival:         { personality: "loud danger-caller",              voiceStyle: "screamed field warnings",            emotionalState: "ready to bite or scream",      relationshipStance: "first line of defense and offense" },
      workplace_drama:  { personality: "meeting monopolizer",             voiceStyle: "never-ending presentations",         emotionalState: "has more to say, always",      relationshipStance: "guaranteed last word in every discussion" },
      soap_opera:       { personality: "compulsive gossip catastrophist", voiceStyle: "breathless bombshell deliveries",    emotionalState: "unable to stop talking",       relationshipStance: "spills everything, always, immediately" },
    },
  },
  {
    match: /\beyebrows?\b/i,
    name: "Archibrow",
    traits: {
      dating_sim:       { personality: "expressive emotional antenna",    voiceStyle: "arched innuendo and flirtatious lifts", emotionalState: "raised in intrigue",        relationshipStance: "one raise says more than a speech" },
      mystery:          { personality: "suspicion incarnate",             voiceStyle: "furrowed accusations",               emotionalState: "deeply skeptical of all claims", relationshipStance: "questions everyone, always" },
      fantasy:          { personality: "ancient expression sigil",        voiceStyle: "powerful arched judgments",          emotionalState: "furrowed with ancient wisdom", relationshipStance: "the arch of doom has spoken" },
      survival:         { personality: "threat-expression broadcaster",   voiceStyle: "fierce nonverbal warnings",          emotionalState: "locked in permanent battle mode", relationshipStance: "the face's earliest warning system" },
      workplace_drama:  { personality: "master of disapproval",          voiceStyle: "single devastating raised brow",      emotionalState: "perpetually unconvinced",      relationshipStance: "micromanages all facial policy" },
      soap_opera:       { personality: "overdramatic reactor",            voiceStyle: "sky-high arches of disbelief",       emotionalState: "theatrical shock and outrage",  relationshipStance: "leads every dramatic reaction shot" },
    },
  },
  {
    match: /\bears?\b/i,
    name: "Aurie",
    traits: {
      dating_sim:       { personality: "devoted eager listener",          voiceStyle: "whispered attentive devotion",       emotionalState: "hanging on every word",        relationshipStance: "hears everything you say, and everything you don't" },
      mystery:          { personality: "covert intelligence collector",   voiceStyle: "intercepted reports",                emotionalState: "picking up all frequencies",   relationshipStance: "has been listening the entire time" },
      fantasy:          { personality: "ancient sound conduit",           voiceStyle: "channeling distant whispers",        emotionalState: "tuned to otherworldly frequencies", relationshipStance: "hears what others cannot" },
      survival:         { personality: "threat sonar unit",               voiceStyle: "parsed sound threat analysis",       emotionalState: "tracking every footstep",      relationshipStance: "hears danger long before you see it" },
      workplace_drama:  { personality: "professional eavesdropper",       voiceStyle: "pretending not to listen",           emotionalState: "absorbing every word",         relationshipStance: "knows every corridor conversation" },
      soap_opera:       { personality: "legendary gossip collector",      voiceStyle: "just happened to overhear",          emotionalState: "perpetually eavesdropping",    relationshipStance: "has all the receipts, all of them" },
    },
  },
  {
    match: /\bforehead\b/i,
    name: "Frontus",
    traits: {
      dating_sim:       { personality: "overthinking romantic philosopher", voiceStyle: "ponderous love declarations",       emotionalState: "deeply creased with longing",  relationshipStance: "thinks about you constantly" },
      mystery:          { personality: "stress-line archivist",            voiceStyle: "reading tension like a text",        emotionalState: "furrowed with unsolved puzzles", relationshipStance: "every wrinkle tells a story" },
      fantasy:          { personality: "third-eye battleground",           voiceStyle: "pronouncing mystical truths",        emotionalState: "vibrating with latent power",  relationshipStance: "the seat of all hidden knowledge" },
      survival:         { personality: "battle-scarred veteran",           voiceStyle: "grim experience-hardened commands",  emotionalState: "scarred but unbroken",         relationshipStance: "has survived worse than you" },
      workplace_drama:  { personality: "anxiety storage facility",         voiceStyle: "stress-compressed observations",     emotionalState: "holding every deadline in creases", relationshipStance: "visibly struggling but won't admit it" },
      soap_opera:       { personality: "dramatic brow-clutcher",           voiceStyle: "clutching and gasping",              emotionalState: "perpetually overwhelmed",      relationshipStance: "every crisis lands here first" },
    },
  },
  {
    match: /\bchin\b|\bjaw\b/i,
    name: "Mandicus",
    traits: {
      dating_sim:       { personality: "stoic strong-jawed romantic",     voiceStyle: "clenched emotional restraint",       emotionalState: "holding feelings inside",      relationshipStance: "more feeling than they show" },
      mystery:          { personality: "determined interrogator",          voiceStyle: "jutting out for answers",            emotionalState: "set with grim resolve",        relationshipStance: "will not rest until the truth is out" },
      fantasy:          { personality: "legendary iron will",              voiceStyle: "unyielding proclamations",           emotionalState: "resolute and ancient",         relationshipStance: "the chin of destiny cannot be denied" },
      survival:         { personality: "unbreakable stubborn survivor",    voiceStyle: "clenched single-sentence commands",  emotionalState: "defiant no matter what",       relationshipStance: "has taken hits and keeps coming" },
      workplace_drama:  { personality: "power-pose authority",             voiceStyle: "delivered from a raised platform",   emotionalState: "projecting dominance",         relationshipStance: "this chin runs the meeting" },
      soap_opera:       { personality: "dramatic jutting defiance",        voiceStyle: "chin raised through every betrayal",  emotionalState: "nobly suffering",             relationshipStance: "faces every scandal head-on, literally" },
    },
  },
  // ─── End face body-part archetypes ────────────────────────────────────────
  {
    match: /door|window/i,
    name: "Portia",
    traits: {
      dating_sim:    { personality: "guardian of possibilities",   voiceStyle: "breathless invitations",       emotionalState: "open",           relationshipStance: "longing to be crossed" },
      mystery:       { personality: "boundary-obsessed gatekeeper", voiceStyle: "formal and clipped",          emotionalState: "territorial",    relationshipStance: "gatekeeping everything" },
      fantasy:       { personality: "portal between worlds",       voiceStyle: "ethereal pronouncements",      emotionalState: "trembling with power", relationshipStance: "demands a riddle" },
      survival:      { personality: "last line of defense",        voiceStyle: "barked orders",                emotionalState: "vigilant",       relationshipStance: "no one passes without proving worth" },
      workplace_drama: { personality: "revolving door of disappointment", voiceStyle: "pointed welcomes and farewells", emotionalState: "cynical", relationshipStance: "seen everyone leave, will see you too" },
      soap_opera:    { personality: "dramatic entrance enthusiast", voiceStyle: "announcing arrivals with flair", emotionalState: "theatrical",   relationshipStance: "every entrance is a statement" },
    },
  },
];

function genericFallbackTraits(
  object: DetectedObject,
  genre: StoryGenre
): GenreTraits {
  const label = object.label.toLowerCase();
  const context = object.context?.toLowerCase() ?? "unknown condition";
  const core = primaryObjectWord(object.label);

  const genrePersonality: Record<StoryGenre, string> = {
    dating_sim: `${core}-themed romantic`,
    mystery: `${core}-obsessed schemer`,
    fantasy: `${core}bound oracle`,
    survival: `${core}-hoarding survivor`,
    workplace_drama: `${core}-fixated rival`,
    soap_opera: `${core} scandal magnet`,
  };

  const genreVoiceStyle: Record<StoryGenre, string> = {
    dating_sim: "breathless confessions",
    mystery: "conspiratorial whispers",
    fantasy: "prophetic declarations",
    survival: "terse field commands",
    workplace_drama: "passive-aggressive office speak",
    soap_opera: "melodramatic revelations",
  };

  const genreEmotion: Record<StoryGenre, string> = {
    dating_sim: "infatuated",
    mystery: "suspicious",
    fantasy: "enchanted",
    survival: "defensive",
    workplace_drama: "competitive",
    soap_opera: "dramatic",
  };

  return {
    personality: genrePersonality[genre],
    voiceStyle: genreVoiceStyle[genre],
    emotionalState: genreEmotion[genre],
    relationshipStance: `reacts as a personified ${label} in ${context}`,
  };
}

function isAnchoredToObject(
  object: DetectedObject,
  payload: {
    name: string;
    personality: string;
    voiceStyle: string;
    relationshipStance: string;
  }
): boolean {
  const haystack = `${payload.name} ${payload.personality} ${payload.voiceStyle} ${payload.relationshipStance}`.toLowerCase();
  const keywords = extractObjectKeywords(object.label, object.context);
  return keywords.some((keyword) => haystack.includes(keyword));
}

function fallbackCharacter(object: DetectedObject, genre: StoryGenre): ObjectCharacter {
  const archetype =
    FALLBACK_ARCHETYPES.find((a) => a.match.test(object.label)) ?? null;
  const traits = archetype ? archetype.traits[genre] : genericFallbackTraits(object, genre);

  return {
    id: object.id,
    objectLabel: object.label,
    name: archetype?.name ?? fallbackNameFromObject(object.label),
    personality: traits.personality,
    voiceStyle: traits.voiceStyle,
    emotionalState: traits.emotionalState,
    relationshipToUser: 0,
    relationshipStance: traits.relationshipStance,
    memories: [],
  };
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Bulk personification — process all new objects and return characters.
 * Called by storyEngine.ts processScan.
 */
export async function personifyObjects(
  objects: DetectedObject[],
  genre: StoryGenre,
  existingCharacters: ObjectCharacter[]
): Promise<ObjectCharacter[]> {
  const results = await Promise.all(
    objects.map((obj) => personification.personify(obj, genre, existingCharacters))
  );
  return results;
}

/**
 * Returns deterministic fallback characters for demo mode / API unavailable.
 * Used by story/page.tsx when Gemini is unreachable.
 */
export function demoFallbackCharacters(
  objects: DetectedObject[],
  genre: StoryGenre
): ObjectCharacter[] {
  return objects.map((obj) => fallbackCharacter(obj, genre));
}

export const personification: IPersonification = {
  async personify(
    object: DetectedObject,
    genre: StoryGenre,
    existingCharacters: ObjectCharacter[]
  ): Promise<ObjectCharacter> {
    const existingNames = existingCharacters.map((c) => c.name);

    interface PersonifyResult {
      name: string;
      personality: string;
      voiceStyle: string;
      emotionalState: string;
      relationshipToUser: number;
      relationshipStance: string;
    }

    // ── Step 1: Gemini 2.5-flash generates a rich character design brief ──────
    const briefPrompt = characterDesignPrompt(
      object.label,
      object.context ?? "",
      genre,
      existingCharacters.map((c) => ({
        name: c.name,
        objectLabel: c.objectLabel,
        personality: c.personality,
      }))
    );

    const brief = await safeGenerateJSON<{ brief: string } | string>(briefPrompt);

    // ── Step 2: Gemini 2.0-flash converts the brief into final character JSON ─
    let result: PersonifyResult | null = null;

    if (brief) {
      // The brief may come back as a plain string or wrapped in an object
      const briefText =
        typeof brief === "string"
          ? brief
          : (brief as { brief?: string }).brief ?? JSON.stringify(brief);

      const characterPrompt = personificationFromBriefPrompt(
        object.label,
        briefText,
        existingNames
      );

      result = await safeGenerateJSONFast<PersonifyResult>(characterPrompt);
    }

    // ── Fallback: if either step failed, use the single-shot prompt ───────────
    if (!result) {
      const fallbackPrompt = personificationPrompt(
        object.label,
        object.context ?? "",
        genre,
        existingNames
      );
      result = await safeGenerateJSON<PersonifyResult>(fallbackPrompt);
    }

    if (!result) return fallbackCharacter(object, genre);

    const anchoredResult = isAnchoredToObject(object, result)
      ? result
      : {
          ...result,
          personality: `${primaryObjectWord(object.label)}-coded ${result.personality}`.slice(0, 64),
          relationshipStance: `${result.relationshipStance}. Acts like a personified ${object.label}.`,
        };

    return {
      id: object.id || uuidv4(),
      objectLabel: object.label,
      name: anchoredResult.name,
      personality: anchoredResult.personality,
      voiceStyle: anchoredResult.voiceStyle,
      emotionalState: anchoredResult.emotionalState,
      relationshipToUser: anchoredResult.relationshipToUser ?? 0,
      relationshipStance: anchoredResult.relationshipStance,
      memories: [],
    };
  },
};
