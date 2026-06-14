import type {
  ContentTemplateType,
  GenerateScriptStoryRequest,
  GenerateScriptStoryResponse,
  GeneratedBackgroundMusicBrief,
  GeneratedInterpretedIdea,
  GeneratedOutlineQualityCheck,
  GeneratedScript,
  GeneratedStoryboardScene,
  GeneratedVisualBible
} from "@ai-content-factory/shared-types";
import type { StorageAdapter, StoredObject } from "@ai-content-factory/storage";
import { MissingGenerationDependencyError } from "../../errors.js";

export interface OpenAIScriptClientOptions {
  apiKey?: string | undefined;
  baseUrl: string;
  model: string;
  usdToMyrRate: number;
}

export interface ScriptStoryServiceOptions {
  allowLocalFallback?: boolean | undefined;
  openai: OpenAIScriptClientOptions;
  storage: StorageAdapter;
}

export interface ScriptStoryService {
  generateScriptStory(input: GenerateScriptStoryRequest): Promise<GenerateScriptStoryResponse>;
}

interface NormalizedScriptStoryInput extends Omit<GenerateScriptStoryRequest, "durationSeconds" | "jobId"> {
  durationSeconds: number;
  jobId?: string;
}

interface OpenAIResponseBody {
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
    type?: string;
  }>;
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface GeneratedScriptStoryContent {
  backgroundMusic: GeneratedBackgroundMusicBrief;
  interpretedIdea: GeneratedInterpretedIdea;
  outlineQc: GeneratedOutlineQualityCheck;
  requiresReview: boolean;
  script: GeneratedScript;
  storyboard: GeneratedStoryboardScene[];
  visualBible: GeneratedVisualBible;
}

export function createScriptStoryService(options: ScriptStoryServiceOptions): ScriptStoryService {
  return {
    async generateScriptStory(input: GenerateScriptStoryRequest): Promise<GenerateScriptStoryResponse> {
      const normalizedInput = normalizeInput(input);
      const jobId = normalizedInput.jobId ?? `job_${crypto.randomUUID().slice(0, 8)}`;
      const openaiOptions = {
        ...options.openai,
        baseUrl: normalizedInput.baseUrl?.trim() || options.openai.baseUrl,
        model: normalizedInput.model?.trim() || options.openai.model
      };
      const generated = openaiOptions.apiKey
        ? await generateWithOpenAI(normalizedInput, openaiOptions)
        : options.allowLocalFallback
          ? generateLocalScriptStory(normalizedInput)
          : missingOpenAIKey();
      const basePath = `jobs/${jobId}`;
      const scriptObject = await options.storage.writeFile(`${basePath}/script.json`, JSON.stringify(generated.script, null, 2));
      const storyboardObject = await options.storage.writeFile(`${basePath}/storyboard.json`, JSON.stringify({ scenes: generated.storyboard }, null, 2));
      const visualBibleObject = await options.storage.writeFile(`${basePath}/visual-bible.json`, JSON.stringify(generated.visualBible, null, 2));

      return {
        artifacts: {
          script: toGeneratedObject(scriptObject),
          storyboard: toGeneratedObject(storyboardObject),
          visualBible: toGeneratedObject(visualBibleObject)
        },
        costRM: generated.costRM,
        backgroundMusic: generated.backgroundMusic,
        interpretedIdea: generated.interpretedIdea,
        jobId,
        model: generated.model,
        outlineQc: generated.outlineQc,
        provider: generated.provider,
        requiresReview: generated.requiresReview,
        script: generated.script,
        status: "STORYBOARD_DONE",
        storyboard: generated.storyboard,
        usage: generated.usage,
        visualBible: generated.visualBible
      };
    }
  };
}

async function generateWithOpenAI(
  input: NormalizedScriptStoryInput,
  options: OpenAIScriptClientOptions
): Promise<Omit<GenerateScriptStoryResponse, "artifacts" | "jobId" | "status">> {
  if (!options.apiKey) {
    return missingOpenAIKey();
  }

  let qualityFeedback = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let finalContent: GeneratedScriptStoryContent | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(`${options.baseUrl.replace(/\/$/u, "")}/responses`, {
      body: JSON.stringify({
        input: buildOpenAIPrompt(input, qualityFeedback),
        max_output_tokens: 3200,
        model: options.model,
        text: {
          format: {
            name: "short_script_storyboard",
            schema: scriptStoryJsonSchema,
            strict: true,
            type: "json_schema"
          }
        }
      }),
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    const body = (await response.json().catch(() => ({}))) as OpenAIResponseBody & { error?: { message?: string } };

    if (!response.ok) {
      throw new Error(`OpenAI script generation failed: ${body.error?.message ?? response.statusText}`);
    }

    totalInputTokens += body.usage?.input_tokens ?? 0;
    totalOutputTokens += body.usage?.output_tokens ?? 0;

    const parsed = sanitizeGeneratedContent(input, parseScriptStoryJson(input, extractResponseText(body)));
    const outlineQc = runOutlineQualityCheck(input, parsed);
    finalContent = {
      ...parsed,
      outlineQc,
      requiresReview: outlineQc.status !== "pass"
    };

    if (outlineQc.status === "pass") {
      break;
    }

    qualityFeedback = buildOutlineRewriteFeedback(outlineQc);
  }

  if (!finalContent) {
    throw new Error("OpenAI script generation returned no content.");
  }

  const estimatedCostRM = estimateOpenAICostRM(options.model, totalInputTokens, totalOutputTokens, options.usdToMyrRate, input.cost);
  const costRM = applyScriptCostOverride(estimatedCostRM, input);
  const usage = {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    pricingMode: determineScriptPricingMode(estimatedCostRM, costRM)
  };

  return {
    costRM,
    backgroundMusic: finalContent.backgroundMusic,
    interpretedIdea: finalContent.interpretedIdea,
    model: options.model,
    outlineQc: finalContent.outlineQc,
    provider: input.provider?.trim() || "openai",
    requiresReview: finalContent.requiresReview,
    script: finalContent.script,
    storyboard: finalContent.storyboard,
    usage,
    visualBible: finalContent.visualBible
  };
}

function applyScriptCostOverride(costRM: number, input: NormalizedScriptStoryInput): number {
  if (costRM > 0) {
    return costRM;
  }

  return Number((input.cost?.fallbackCostRM ?? 0).toFixed(4));
}

function determineScriptPricingMode(estimatedCostRM: number, finalCostRM: number): NonNullable<GenerateScriptStoryResponse["usage"]>["pricingMode"] {
  if (estimatedCostRM > 0) {
    return "token_usage";
  }

  if (finalCostRM > 0) {
    return "configured_rate";
  }

  return "pricing_missing";
}

function missingOpenAIKey(): never {
  throw new MissingGenerationDependencyError("Missing OPENAI_API_KEY. Configure the OpenAI key in Keys or .env before generating script/story content. No mock script will be generated.");
}

function generateLocalScriptStory(input: NormalizedScriptStoryInput): Omit<GenerateScriptStoryResponse, "artifacts" | "jobId" | "status"> {
  const script = buildLocalScript(input);
  const storyboard = buildLocalStoryboard(input, script);
  const visualBible = buildLocalVisualBible(input, storyboard);
  const interpretedIdea = buildLocalInterpretedIdea(input, script, storyboard);
  const content = sanitizeGeneratedContent(input, {
    backgroundMusic: inferBackgroundMusicBrief(script, storyboard),
    interpretedIdea,
    outlineQc: createOutlineQc("needs_review", []),
    requiresReview: false,
    script,
    storyboard,
    visualBible
  });
  const outlineQc = runOutlineQualityCheck(input, content);

  return {
    backgroundMusic: content.backgroundMusic,
    costRM: 0,
    interpretedIdea: content.interpretedIdea,
    model: "local-script-mock",
    outlineQc,
    provider: "local",
    requiresReview: outlineQc.status !== "pass",
    script: content.script,
    storyboard: content.storyboard,
    usage: {
      inputTokens: 0,
      outputTokens: 0
    },
    visualBible: content.visualBible
  };
}

function normalizeInput(input: GenerateScriptStoryRequest): NormalizedScriptStoryInput {
  const topic = input.topic.trim();
  const prompt = input.prompt.trim();

  if (!topic) {
    throw new Error("topic is required.");
  }

  if (!prompt) {
    throw new Error("prompt is required.");
  }

  const normalized: NormalizedScriptStoryInput = {
    costLimitRM: input.costLimitRM,
    durationSeconds: input.durationSeconds ?? 45,
    language: input.language,
    prompt,
    productionBrief: input.productionBrief,
    sceneCount: Math.max(3, Math.min(7, Math.round(input.sceneCount))),
    templateType: input.templateType,
    topic
  };

  if (input.jobId?.trim()) {
    normalized.jobId = input.jobId.trim();
  }

  if (input.genre?.trim()) {
    normalized.genre = input.genre.trim();
  }

  return normalized;
}

function buildOpenAIPrompt(input: NormalizedScriptStoryInput, qualityFeedback = ""): string {
  const isGeneric = isGenericRawIdea(input.topic);
  const lines = [
    "You are the scriptwriter for an AI Content Operations Factory that produces original fictional YouTube Shorts.",
    "Generate content from the user's raw idea. If the idea is only a category or a generic word, first expand it into one concrete shootable premise.",
    "Safety: no real people, no minors in risky situations, no gore, no self-harm, no explicit sexual content, no copyrighted characters, and no copied channel scripts.",
    `Raw user idea: ${input.topic}`,
    `Raw idea is generic: ${isGeneric ? "yes" : "no"}`,
    `Requested video type / genre: ${input.genre?.trim() || "auto-detect from topic and brief"}`,
    `Optional production brief: ${input.prompt}`,
    formatProductionBriefForPrompt(input),
    `Internal routing template: ${input.templateType}`,
    `Internal routing guidance, only use when it fits the user's idea: ${getTemplateInstruction(input.templateType)}`,
    `Language: ${input.language}`,
    `Duration: ${input.durationSeconds} seconds`,
    `Scene count: ${input.sceneCount}`,
    "Return interpretedIdea with a concrete expandedPremise, logline, protagonist, goal/conflict, ruleOrConstraint, escalation, twist, endingHook, setting, and centralObject.",
    "If Raw user idea is generic, do not force that exact category word into every visible field. The expanded premise is the story anchor.",
    "If Raw user idea contains specific people/places/objects/actions, preserve those constraints and do not move the story to an unrelated setting.",
    "Visible output must never contain scaffolding phrases such as 'This is the story of', 'Scene narration for', 'Topic:', 'Story topic:', 'A scene centered on', or Chinese equivalents.",
    "The title must sound like a Shorts title, not a category label. Avoid titles like 'Horror: ...' or 'Comedy: ...' when the user only gave a genre.",
    "The 45 second voiceover must have protagonist, goal, anomaly/inciting event, rule or limit, escalation, twist, and an ending hook.",
    "Every storyboard scene must be a visible action: who is in frame, what object changes, what the camera sees. Avoid abstract-only descriptions such as a feeling, mood, atmosphere, or sound entering a mind.",
    "Create one visualBible for the whole case. It must define one fictional adult protagonist, stable wardrobe, face/hair/body details, recurring props, environment, lighting, palette, and negative prompt rules.",
    "If productionBrief.selectedCharacters is present, treat them as the approved reusable cast library. Use the episode-relevant selected character assets, preserve their names/roles/identity notes/wardrobe/silhouette/props, and never replace a character or fruit/person identity that is named in the episode, continuity rules, or prompt.",
    "Do not rename selected assets into unrelated generic names. If the episode names a role such as a fruit-person CEO or secret shop clerk, map it to the closest selected asset label/role and keep that identity visible in the title, voiceover, visualBible, and storyboard.",
    "If productionBrief.selectedScenes or storyWorldContext is present, treat them as the approved reusable location/style library. Use the episode-relevant selected scene assets, preserve their spatial rules/props/lighting/palette/world rules, and do not require every library location to appear in one episode.",
    "If productionBrief.lessonOrTheme is present, the story must make that theme visible through character choices and conflict, not a generic lecture.",
    "If productionBrief.seriesContext.narrativeMode is serialized, write this as one episode of an ongoing serial: preserve continuity rules, use the episode's continuityNote/serialHook when present, and end with a safe next-episode hook instead of fully resetting the premise.",
    "If productionBrief.seriesContext.narrativeMode is standalone, resolve this episode's main conflict inside the short.",
    "If productionBrief.seriesContext.dramaIntensity is high or melodrama, use safe but strong drama: misunderstanding, secret, betrayal, reversal, public confrontation, emotional choice, and cliffhanger. Do not use explicit sexual content, gore, real people, or targeted humiliation.",
    "The storyboard imagePrompt fields must describe single cinematic stills only. Do not ask for text, captions, comic panels, UI, table layouts, or storyboard sheets.",
    "Each storyboard scene must reuse the visualBible character and environment unless the user explicitly asks for a scene change.",
    "Also return a backgroundMusic brief for optional BGM generation: style, tempo, mood, instrumentation, and a provider-ready prompt.",
    "Return a JSON object matching the schema. Keep voiceover pacing suitable for Shorts."
  ];

  if (qualityFeedback) {
    lines.push("Previous outline failed quality checks. Rewrite from scratch and fix these issues:");
    lines.push(qualityFeedback);
  }

  return lines.join("\n");
}

function formatProductionBriefForPrompt(input: NormalizedScriptStoryInput): string {
  const brief = input.productionBrief;

  if (!brief) {
    return "Structured productionBrief: none. Use topic and optional production brief only.";
  }

  const lines = [
    "Structured productionBrief is authoritative for selected series, story world, characters, scenes, and episode theme.",
    brief.seriesContext ? `Series context: ${[
      brief.seriesContext.name,
      brief.seriesContext.contentType,
      brief.seriesContext.audience,
      brief.seriesContext.description,
      brief.seriesContext.values,
      brief.seriesContext.narrativeMode ? `Narrative mode: ${brief.seriesContext.narrativeMode}` : "",
      brief.seriesContext.dramaIntensity ? `Drama intensity: ${brief.seriesContext.dramaIntensity}` : "",
      brief.seriesContext.continuityRules ? `Continuity rules: ${brief.seriesContext.continuityRules}` : "",
      brief.seriesContext.tone,
      brief.seriesContext.visualStyle,
      brief.seriesContext.musicStyle,
      brief.seriesContext.safetyRules
    ].filter(Boolean).join(" | ")}` : "",
    brief.episodeContext ? `Episode context: ${[
      brief.episodeContext.episodeNo ? `Episode ${brief.episodeContext.episodeNo}` : "",
      brief.episodeContext.title,
      brief.episodeContext.lessonOrTheme,
      brief.episodeContext.synopsis,
      brief.episodeContext.promptSeed,
      brief.episodeContext.continuityNote,
      brief.episodeContext.serialHook,
      brief.episodeContext.interactiveEnding
    ].filter(Boolean).join(" | ")}` : "",
    brief.storyWorldContext ? `Story world context: ${[
      brief.storyWorldContext.name,
      brief.storyWorldContext.description,
      brief.storyWorldContext.relationshipMap,
      brief.storyWorldContext.visualStyle,
      brief.storyWorldContext.safetyRules
    ].filter(Boolean).join(" | ")}` : "",
    brief.lessonOrTheme ? `Episode lesson/theme: ${brief.lessonOrTheme}` : "",
    brief.goal ? `Episode goal: ${brief.goal}` : "",
    brief.conflict ? `Episode conflict: ${brief.conflict}` : "",
    brief.tone ? `Requested tone: ${brief.tone}` : "",
    brief.selectedCharacters?.length ? `Selected character assets: ${brief.selectedCharacters.map((character) => [
      character.label,
      character.role,
      character.visualIdentity,
      character.notes
    ].filter(Boolean).join(" / ")).join(" || ")}` : "",
    brief.selectedScenes?.length ? `Selected scene assets: ${brief.selectedScenes.map((scene) => [
      scene.label,
      scene.location,
      scene.visualRules,
      scene.notes
    ].filter(Boolean).join(" / ")).join(" || ")}` : "",
    brief.requiredBeats?.length ? `Required beats: ${brief.requiredBeats.join(" | ")}` : "",
    brief.visualContinuityRules?.length ? `Visual continuity rules: ${brief.visualContinuityRules.join(" | ")}` : "",
    "Do not copy asset prompt-engineering instructions into visible output. Use only visual facts, story rules, and selected names/locations."
  ].filter(Boolean);

  return lines.join("\n");
}

function getTemplateInstruction(templateType: ContentTemplateType): string {
  const instructions: Record<ContentTemplateType, string> = {
    comedy_sketch: "Write a light comedy sketch driven by misunderstanding, escalation, visual business, and a clean final joke. Avoid cruelty and vulgarity.",
    fairy_tale: "Write a whimsical all-ages fairy tale with an original magical rule, warm emotion, and no copyrighted characters.",
    romance_story: "Write a warm restrained romance with clear emotional beats, no explicit sexual content, and a satisfying small twist.",
    rules_horror: "Write low-violence rules horror with clear rules, a violation, a twist, and an ending hook.",
    surveillance_horror: "Write low-violence surveillance suspense with CCTV-style visual reveals, unsettling details, and no gore.",
    urban_legend: "Write a modern urban legend with a believable setup, escalating mystery, and a clear twist."
  };

  return instructions[templateType];
}

function getTemplateGenreLabel(templateType: ContentTemplateType): string {
  const labels: Record<ContentTemplateType, string> = {
    comedy_sketch: "comedy sketch",
    fairy_tale: "fairy tale",
    romance_story: "romance story",
    rules_horror: "rules horror",
    surveillance_horror: "surveillance suspense",
    urban_legend: "urban legend"
  };

  return labels[templateType];
}

function isGenericRawIdea(value: string): boolean {
  const compact = safeCompactForTopicMatch(value);
  const genericIdeas = new Set([
    "恐怖",
    "恐怖故事",
    "规则怪谈",
    "悬疑",
    "监控悬疑",
    "都市传说",
    "喜剧",
    "喜剧短剧",
    "爱情",
    "爱情故事",
    "童话",
    "童话故事",
    "horror",
    "horrorstory",
    "ruleshorror",
    "suspense",
    "surveillancesuspense",
    "urbanlegend",
    "comedy",
    "comedysketch",
    "romance",
    "romancestory",
    "fairytale",
    "story"
  ]);

  return genericIdeas.has(compact) || compact.length <= 3;
}

const scriptStoryJsonSchema = {
  additionalProperties: false,
  properties: {
    backgroundMusic: {
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        instrumentation: { type: "string" },
        mood: { type: "string" },
        prompt: { type: "string" },
        style: { type: "string" },
        tempo: { type: "string" }
      },
      required: ["enabled", "mood", "style", "tempo", "instrumentation", "prompt"],
      type: "object"
    },
    interpretedIdea: {
      additionalProperties: false,
      properties: {
        centralObject: { type: "string" },
        conflict: { type: "string" },
        endingHook: { type: "string" },
        escalation: { type: "string" },
        expandedPremise: { type: "string" },
        genre: { type: "string" },
        logline: { type: "string" },
        protagonist: { type: "string" },
        rawTopic: { type: "string" },
        ruleOrConstraint: { type: "string" },
        setting: { type: "string" },
        twist: { type: "string" }
      },
      required: [
        "rawTopic",
        "expandedPremise",
        "genre",
        "logline",
        "protagonist",
        "setting",
        "centralObject",
        "conflict",
        "ruleOrConstraint",
        "escalation",
        "twist",
        "endingHook"
      ],
      type: "object"
    },
    script: {
      additionalProperties: false,
      properties: {
        hook: { type: "string" },
        title: { type: "string" },
        voiceover: { type: "string" }
      },
      required: ["title", "hook", "voiceover"],
      type: "object"
    },
    storyboard: {
      items: {
        additionalProperties: false,
        properties: {
          camera: { type: "string" },
          durationSeconds: { type: "number" },
          imagePrompt: { type: "string" },
          sceneId: { type: "number" },
          sfx: {
            items: { type: "string" },
            type: "array"
          },
          visual: { type: "string" },
          voiceText: { type: "string" }
        },
        required: ["sceneId", "durationSeconds", "visual", "imagePrompt", "voiceText", "camera", "sfx"],
        type: "object"
      },
      type: "array"
    },
    visualBible: {
      additionalProperties: false,
      properties: {
        character: {
          additionalProperties: false,
          properties: {
            ageRange: { type: "string" },
            bodyType: { type: "string" },
            expressionRange: { type: "string" },
            fixedProps: {
              items: { type: "string" },
              type: "array"
            },
            hair: { type: "string" },
            name: { type: "string" },
            role: { type: "string" },
            signatureDetails: { type: "string" },
            wardrobe: { type: "string" }
          },
          required: ["name", "role", "ageRange", "bodyType", "hair", "wardrobe", "fixedProps", "signatureDetails", "expressionRange"],
          type: "object"
        },
        environment: {
          additionalProperties: false,
          properties: {
            keyObjects: {
              items: { type: "string" },
              type: "array"
            },
            lighting: { type: "string" },
            location: { type: "string" },
            palette: { type: "string" },
            recurringDetails: { type: "string" }
          },
          required: ["location", "lighting", "palette", "keyObjects", "recurringDetails"],
          type: "object"
        },
        negativePrompt: { type: "string" },
        style: { type: "string" }
      },
      required: ["character", "environment", "style", "negativePrompt"],
      type: "object"
    }
  },
  required: ["interpretedIdea", "script", "storyboard", "backgroundMusic", "visualBible"],
  type: "object"
};

function extractResponseText(body: OpenAIResponseBody): string {
  if (typeof body.output_text === "string") {
    return body.output_text;
  }

  const outputText = body.output
    ?.flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" || typeof content.text === "string")
    .map((content) => content.text)
    .filter((text): text is string => Boolean(text))
    .join("\n");

  if (!outputText) {
    throw new Error("OpenAI response did not include output text.");
  }

  return outputText;
}

function parseScriptStoryJson(input: NormalizedScriptStoryInput, rawJson: string): GeneratedScriptStoryContent {
  const parsed = JSON.parse(rawJson) as {
    backgroundMusic?: Partial<GeneratedBackgroundMusicBrief>;
    interpretedIdea?: Partial<GeneratedInterpretedIdea>;
    script?: GeneratedScript;
    storyboard?: GeneratedStoryboardScene[];
    visualBible?: Partial<GeneratedVisualBible>;
  };

  if (!parsed.script?.title || !parsed.script.hook || !parsed.script.voiceover || !Array.isArray(parsed.storyboard)) {
    throw new Error("Generated script response was missing required fields.");
  }

  return {
    backgroundMusic: normalizeBackgroundMusicBrief(parsed.backgroundMusic, parsed.script, parsed.storyboard),
    interpretedIdea: normalizeInterpretedIdea(parsed.interpretedIdea, input, parsed.script, parsed.storyboard),
    outlineQc: createOutlineQc("needs_review", []),
    requiresReview: false,
    script: parsed.script,
    storyboard: parsed.storyboard,
    visualBible: normalizeVisualBible(parsed.visualBible, parsed.script, parsed.storyboard)
  };
}

function normalizeInterpretedIdea(
  idea: Partial<GeneratedInterpretedIdea> | undefined,
  input: NormalizedScriptStoryInput,
  script: GeneratedScript,
  storyboard: GeneratedStoryboardScene[]
): GeneratedInterpretedIdea {
  const firstScene = storyboard[0]?.visual || storyboard[0]?.imagePrompt || script.hook;
  const genre = idea?.genre?.trim() || input.genre?.trim() || getTemplateGenreLabel(input.templateType);
  const expandedPremise = idea?.expandedPremise?.trim() || inferExpandedPremise(input, script, firstScene);

  return {
    centralObject: idea?.centralObject?.trim() || inferFirstKeyObject([script.title, firstScene, input.topic].join(" ")),
    conflict: idea?.conflict?.trim() || script.hook,
    endingHook: idea?.endingHook?.trim() || script.voiceover.split(/(?<=[.!?。！？])/u).filter(Boolean).at(-1)?.trim() || script.hook,
    escalation: idea?.escalation?.trim() || "The visible problem escalates scene by scene.",
    expandedPremise,
    genre,
    logline: idea?.logline?.trim() || expandedPremise,
    protagonist: idea?.protagonist?.trim() || inferProtagonistFromBibleText(script.title, firstScene),
    rawTopic: idea?.rawTopic?.trim() || input.topic,
    ruleOrConstraint: idea?.ruleOrConstraint?.trim() || "The protagonist has one clear limit that forces a decision.",
    setting: idea?.setting?.trim() || firstScene,
    twist: idea?.twist?.trim() || "The final beat recontextualizes the central object."
  };
}

function inferExpandedPremise(input: NormalizedScriptStoryInput, script: GeneratedScript, firstScene: string): string {
  if (!isGenericRawIdea(input.topic)) {
    return `${script.title}: ${script.hook}`;
  }

  return `${script.title}: a fictional adult protagonist faces a concrete problem in ${firstScene}, escalating toward a twist.`;
}

function inferFirstKeyObject(text: string): string {
  return inferKeyObjects(text)[0] ?? "central story object";
}

function inferProtagonistFromBibleText(title: string, firstScene: string): string {
  const context = `${title} ${firstScene}`.toLowerCase();

  if (context.includes("cook") || context.includes("kitchen")) {
    return "an adult home cook";
  }

  if (context.includes("store") || context.includes("shop")) {
    return "an adult night-shift worker";
  }

  if (context.includes("office")) {
    return "an adult office worker";
  }

  return "an adult fictional protagonist";
}

function normalizeBackgroundMusicBrief(
  brief: Partial<GeneratedBackgroundMusicBrief> | undefined,
  script: GeneratedScript,
  storyboard: GeneratedStoryboardScene[]
): GeneratedBackgroundMusicBrief {
  const defaultBrief = inferBackgroundMusicBrief(script, storyboard);

  return {
    enabled: brief?.enabled ?? defaultBrief.enabled,
    instrumentation: brief?.instrumentation?.trim() || defaultBrief.instrumentation,
    mood: brief?.mood?.trim() || defaultBrief.mood,
    prompt: brief?.prompt?.trim() || defaultBrief.prompt,
    style: brief?.style?.trim() || defaultBrief.style,
    tempo: brief?.tempo?.trim() || defaultBrief.tempo
  };
}

function normalizeVisualBible(
  visualBible: Partial<GeneratedVisualBible> | undefined,
  script: GeneratedScript,
  storyboard: GeneratedStoryboardScene[]
): GeneratedVisualBible {
  const defaultBible = inferVisualBible(script, storyboard);
  const character = visualBible?.character;
  const environment = visualBible?.environment;

  return {
    character: {
      ageRange: character?.ageRange?.trim() || defaultBible.character.ageRange,
      bodyType: character?.bodyType?.trim() || defaultBible.character.bodyType,
      expressionRange: character?.expressionRange?.trim() || defaultBible.character.expressionRange,
      fixedProps: normalizeStringList(character?.fixedProps, defaultBible.character.fixedProps),
      hair: character?.hair?.trim() || defaultBible.character.hair,
      name: character?.name?.trim() || defaultBible.character.name,
      role: character?.role?.trim() || defaultBible.character.role,
      signatureDetails: character?.signatureDetails?.trim() || defaultBible.character.signatureDetails,
      wardrobe: character?.wardrobe?.trim() || defaultBible.character.wardrobe
    },
    environment: {
      keyObjects: normalizeStringList(environment?.keyObjects, defaultBible.environment.keyObjects),
      lighting: environment?.lighting?.trim() || defaultBible.environment.lighting,
      location: environment?.location?.trim() || defaultBible.environment.location,
      palette: environment?.palette?.trim() || defaultBible.environment.palette,
      recurringDetails: environment?.recurringDetails?.trim() || defaultBible.environment.recurringDetails
    },
    negativePrompt: visualBible?.negativePrompt?.trim() || defaultBible.negativePrompt,
    style: visualBible?.style?.trim() || defaultBible.style
  };
}

function normalizeStringList(value: string[] | undefined, fallback: string[]): string[] {
  const normalized = value?.map((item) => item.trim()).filter(Boolean) ?? [];
  return normalized.length > 0 ? normalized : fallback;
}

function inferVisualBible(script: GeneratedScript, storyboard: GeneratedStoryboardScene[]): GeneratedVisualBible {
  const topicContext = [script.title, storyboard[0]?.visual, storyboard[0]?.imagePrompt].filter(Boolean).join(" ");
  const firstScene = storyboard[0]?.visual || script.title;

  return {
    character: {
      ageRange: "adult, late 20s to late 30s",
      bodyType: "average build, natural posture, expressive but realistic",
      expressionRange: "curious, surprised, nervous, relieved, matched to each scene without changing identity",
      fixedProps: inferKeyObjects(topicContext).slice(0, 2),
      hair: "short dark hair with the same hairline and style in every scene",
      name: "Main protagonist",
      role: `fictional protagonist connected to ${script.title}`,
      signatureDetails: "same face structure, same skin tone, same hair, same outfit, same recurring prop in every image",
      wardrobe: "simple neutral jacket over a plain shirt, consistent colors across all scenes"
    },
    environment: {
      keyObjects: inferKeyObjects([topicContext, firstScene].join(" ")),
      lighting: "consistent cinematic practical lighting matched to the genre",
      location: firstScene,
      palette: "controlled cinematic palette with stable background colors",
      recurringDetails: "reuse the same location layout, same important props, and same visual continuity cues"
    },
    negativePrompt: "no text, no captions, no subtitles, no logos, no watermark, no UI, no tables, no storyboard sheet, no comic panels, no collage, no duplicated protagonist, no identity drift, no wardrobe changes",
    style: "single vertical 9:16 cinematic still, realistic fictional subject, coherent scene, production-ready YouTube Shorts frame"
  };
}

function inferKeyObjects(text: string): string[] {
  const normalized = text.toLowerCase();
  const objects = [
    normalized.includes("kitchen") || normalized.includes("cooking") || normalized.includes("pot") ? "same cooking pot" : "",
    normalized.includes("phone") ? "same phone" : "",
    normalized.includes("store") || normalized.includes("convenience") ? "same storefront signage shape without readable text" : "",
    normalized.includes("elevator") ? "same elevator panel without readable text" : "",
    normalized.includes("rain") ? "rain reflections" : "",
    normalized.includes("letter") || normalized.includes("note") ? "same folded note" : ""
  ].filter(Boolean);

  return objects.length > 0 ? objects : ["central story object", "recurring background detail"];
}

function inferBackgroundMusicBrief(script: GeneratedScript, storyboard: GeneratedStoryboardScene[]): GeneratedBackgroundMusicBrief {
  const sceneMood = storyboard
    .flatMap((scene) => [scene.visual, scene.camera, ...scene.sfx])
    .join(", ")
    .slice(0, 500);

  return {
    enabled: true,
    instrumentation: "minimal cinematic pads, soft pulses, subtle percussion",
    mood: "cinematic, restrained, emotionally matched to the script",
    prompt: `Instrumental background music for a short vertical video titled "${script.title}". Mood: cinematic and restrained. Match these scene cues: ${sceneMood}. No vocals, no copyrighted melody, leave space for narration.`,
    style: "cinematic underscore",
    tempo: "slow to medium, narration-friendly"
  };
}

function sanitizeGeneratedContent(input: NormalizedScriptStoryInput, content: GeneratedScriptStoryContent): GeneratedScriptStoryContent {
  const script = {
    hook: sanitizeVisibleText(content.script.hook, input.topic),
    title: sanitizeTitle(content.script.title, input.topic),
    voiceover: sanitizeVisibleText(content.script.voiceover, input.topic)
  };
  const storyboard = content.storyboard.map((scene) => ({
    ...scene,
    imagePrompt: sanitizeImagePrompt(scene.imagePrompt, input.topic),
    visual: sanitizeVisibleText(scene.visual, input.topic),
    voiceText: sanitizeVisibleText(scene.voiceText, input.topic)
  }));
  const backgroundMusic = {
    ...content.backgroundMusic,
    prompt: sanitizeVisibleText(content.backgroundMusic.prompt, input.topic)
  };
  const visualBible = {
    ...content.visualBible,
    character: {
      ...content.visualBible.character,
      role: sanitizeVisibleText(content.visualBible.character.role, input.topic)
    },
    environment: {
      ...content.visualBible.environment,
      recurringDetails: sanitizeVisibleText(content.visualBible.environment.recurringDetails, input.topic)
    }
  };

  return {
    ...content,
    backgroundMusic,
    interpretedIdea: normalizeInterpretedIdea(content.interpretedIdea, input, script, storyboard),
    script,
    storyboard,
    visualBible
  };
}

function sanitizeTitle(value: string, topic: string): string {
  let title = sanitizeVisibleText(value, topic);

  if (isGenericRawIdea(topic)) {
    title = title
      .replace(new RegExp(`^\\s*${escapeRegExp(topic)}\\s*[:：-]\\s*`, "iu"), "")
      .replace(/^\s*(horror|comedy|romance|fairy tale|urban legend)\s*[:：-]\s*/iu, "")
      .trim();
  }

  return title || value.trim();
}

function sanitizeImagePrompt(value: string, topic: string): string {
  return sanitizeVisibleText(value, topic)
    .replace(/\bproduction brief\b\s*[:：].*$/giu, "")
    .replace(/\binternal routing\b\s*[:：].*$/giu, "")
    .trim();
}

function sanitizeVisibleText(value: string, topic: string): string {
  let cleaned = value.trim();
  const looseTopic = escapeRegExp(topic);
  const prefixPatterns = [
    /^This is the story of\s+["“][^"”]+["”][.。]?\s*/iu,
    /^Story topic\s*[:：]\s*["“][^"”]+["”][.。]?\s*/iu,
    /^Topic\s*[:：]\s*[^.。!?！？]+[.。]?\s*/iu,
    /^Scene narration for\s+["“][^"”]+["”][.。]?\s*/iu,
    /^A scene centered on\s+["“][^"”]+["”][.。]?\s*/iu,
    /^Scene centered on\s+["“][^"”]+["”][.。]?\s*/iu,
    /^这是关于[「《“"]?[^」》”"]+[」》”"]?的故事[。.\s]*/iu,
    /^关于[「《“"]?[^」》”"]+[」》”"]?的传闻[，,]?是从这里开始的[。.\s]*/iu,
    /^围绕[「《“"]?[^」》”"]+[」》”"]?的画面[。.\s]*/iu,
    new RegExp(`^\\s*Story topic\\s*[:：]\\s*["“]?${looseTopic}["”]?[.。]?\\s*`, "iu"),
    new RegExp(`^\\s*Topic\\s*[:：]\\s*${looseTopic}[.。]?\\s*`, "iu")
  ];

  for (const pattern of prefixPatterns) {
    cleaned = cleaned.replace(pattern, "").trim();
  }

  return cleaned;
}

function runOutlineQualityCheck(input: NormalizedScriptStoryInput, content: GeneratedScriptStoryContent): GeneratedOutlineQualityCheck {
  const checks = [
    checkIdeaExpansion(input, content.interpretedIdea),
    checkVisibleScaffolding(content),
    checkStoryStructure(content),
    checkShootableScenes(content.storyboard),
    checkGenreTone(input, content),
    checkProductionBriefAlignment(input, content)
  ];
  const failed = checks.filter((check) => check.status === "fail");

  return createOutlineQc(
    failed.length > 0 ? "needs_review" : "pass",
    checks,
    failed.length > 0
      ? `Outline needs review: ${failed.map((check) => check.label).join(", ")}.`
      : "Outline is concrete, clean, and shootable."
  );
}

function createOutlineQc(
  status: GeneratedOutlineQualityCheck["status"],
  checks: GeneratedOutlineQualityCheck["checks"],
  summary?: string
): GeneratedOutlineQualityCheck {
  return {
    checkedAt: new Date().toISOString(),
    checks,
    status,
    summary: summary ?? (status === "pass" ? "Outline passed quality checks." : "Outline needs review.")
  };
}

function checkIdeaExpansion(input: NormalizedScriptStoryInput, idea: GeneratedInterpretedIdea): GeneratedOutlineQualityCheck["checks"][number] {
  const expanded = idea.expandedPremise.trim();
  const logline = idea.logline.trim();
  const rawCompact = safeCompactForTopicMatch(input.topic);
  const expandedCompact = safeCompactForTopicMatch(expanded);
  const generic = isGenericRawIdea(input.topic);
  const hasConcretePremise =
    expanded.length >= 18 &&
    logline.length >= 18 &&
    idea.protagonist.trim().length >= 3 &&
    idea.setting.trim().length >= 3 &&
    idea.conflict.trim().length >= 8 &&
    (!generic || (expandedCompact !== rawCompact && !isTooGenericStoryText(expanded)));

  return {
    detail: hasConcretePremise
      ? `Expanded premise: ${expanded}`
      : "Generic input was not expanded into a concrete protagonist, setting, and conflict.",
    label: "idea_expansion",
    status: hasConcretePremise ? "pass" : "fail"
  };
}

function checkVisibleScaffolding(content: GeneratedScriptStoryContent): GeneratedOutlineQualityCheck["checks"][number] {
  const bad = collectVisibleTexts(content).filter((value) => containsScaffoldingPhrase(value));

  return {
    detail: bad.length > 0 ? `Scaffolding leaked into visible fields: ${bad.slice(0, 3).join(" | ")}` : "No system scaffolding leaked into visible fields.",
    label: "visible_output_clean",
    status: bad.length > 0 ? "fail" : "pass"
  };
}

function checkStoryStructure(content: GeneratedScriptStoryContent): GeneratedOutlineQualityCheck["checks"][number] {
  const idea = content.interpretedIdea;
  const missing = [
    ["protagonist", idea.protagonist, 2],
    ["conflict", idea.conflict, 5],
    ["rule/limit", idea.ruleOrConstraint, 5],
    ["escalation", idea.escalation, 5],
    ["twist", idea.twist, 5],
    ["ending hook", idea.endingHook, 5]
  ]
    .filter(([, value, minLength]) => !value || String(value).trim().length < Number(minLength))
    .map(([label]) => label);
  const voiceoverHasPacing = content.script.voiceover.length >= 80 && content.script.hook.length >= 12;

  return {
    detail: missing.length > 0 ? `Missing story beats: ${missing.join(", ")}.` : "Story has protagonist, conflict, escalation, twist, and ending hook.",
    label: "story_structure",
    status: missing.length === 0 && voiceoverHasPacing ? "pass" : "fail"
  };
}

function checkShootableScenes(storyboard: GeneratedStoryboardScene[]): GeneratedOutlineQualityCheck["checks"][number] {
  const failedScenes = storyboard
    .filter((scene) => !isShootableScene(scene))
    .map((scene) => `Scene ${scene.sceneId}`);

  return {
    detail: failedScenes.length > 0 ? `${failedScenes.join(", ")} needs visible subject/action/object.` : "Every scene has visible action and image-ready prompt text.",
    label: "shootable_scenes",
    status: failedScenes.length > 0 ? "fail" : "pass"
  };
}

function checkGenreTone(input: NormalizedScriptStoryInput, content: GeneratedScriptStoryContent): GeneratedOutlineQualityCheck["checks"][number] {
  const combined = collectVisibleTexts(content).join("\n").toLowerCase();
  const requested = `${input.genre ?? ""} ${input.topic} ${input.templateType}`.toLowerCase();
  const isComedy = requested.includes("comedy") || requested.includes("喜剧") || input.templateType === "comedy_sketch";
  const isRomance = requested.includes("romance") || requested.includes("爱情") || input.templateType === "romance_story";
  const isFairyTale = requested.includes("fairy") || requested.includes("童话") || input.templateType === "fairy_tale";
  const horrorOnlyTerms = ["诅咒", "鬼影", "不要读第三条", "rule three", "curse", "ghost shadow"];
  const wrongTone = (isComedy || isRomance || isFairyTale) && horrorOnlyTerms.some((term) => combined.includes(term));

  return {
    detail: wrongTone ? "Non-horror request still contains horror-template language." : "Genre tone matches the requested or inferred type.",
    label: "genre_tone",
    status: wrongTone ? "fail" : "pass"
  };
}

function checkProductionBriefAlignment(input: NormalizedScriptStoryInput, content: GeneratedScriptStoryContent): GeneratedOutlineQualityCheck["checks"][number] {
  const brief = input.productionBrief;

  if (!brief) {
    return {
      detail: "No structured production brief was supplied.",
      label: "production_brief_alignment",
      status: "pass"
    };
  }

  const visibleText = collectVisibleTexts(content).join("\n").toLowerCase();
  const briefText = collectProductionBriefTexts(brief).join("\n").toLowerCase();
  const requiredCharacters = (brief.selectedCharacters ?? [])
    .filter((character) => hasMeaningfulRequiredTerm(character.label) && assetLabelAppearsInText(character.label, briefText));
  const requiredScenes = (brief.selectedScenes ?? [])
    .filter((scene) => hasMeaningfulRequiredTerm(scene.label) && assetLabelAppearsInText(scene.label, briefText));
  const missingCharacters = requiredCharacters
    .filter((character) => !assetLabelAppearsInText(character.label, visibleText))
    .map((character) => character.label);
  const missingScenes = requiredScenes
    .filter((scene) => !assetLabelAppearsInText(scene.label, visibleText))
    .map((scene) => scene.label);
  const missingCharacterLibraryUse = (brief.selectedCharacters?.length ?? 0) > 0
    && !brief.selectedCharacters?.some((character) => assetLabelAppearsInText(character.label, visibleText))
    ? "no selected character asset is visible in the outline"
    : "";
  const missingSceneLibraryUse = (brief.selectedScenes?.length ?? 0) > 0
    && !brief.selectedScenes?.some((scene) => assetLabelAppearsInText(scene.label, visibleText))
    ? "no selected scene asset is visible in the outline"
    : "";
  const missingTheme = brief.lessonOrTheme && hasMeaningfulRequiredTerm(brief.lessonOrTheme) && !meaningfulTermsAppearInText(brief.lessonOrTheme, visibleText)
    ? brief.lessonOrTheme
    : "";
  const problems = [
    ...missingCharacters.map((label) => `missing selected character: ${label}`),
    ...missingScenes.map((label) => `missing selected scene: ${label}`),
    missingCharacterLibraryUse,
    missingSceneLibraryUse,
    missingTheme ? `missing episode theme: ${missingTheme}` : ""
  ].filter(Boolean);

  return {
    detail: problems.length > 0
      ? problems.join("; ")
      : "The outline uses selected characters, selected scenes, story world/series context, and episode theme when provided.",
    label: "production_brief_alignment",
    status: problems.length > 0 ? "fail" : "pass"
  };
}

function hasMeaningfulRequiredTerm(value: string | undefined): value is string {
  return Boolean(value && value.trim().length >= 2 && !/^(new|untitled|未命名|参考|角色|场景|scene|character)$/iu.test(value.trim()));
}

function collectProductionBriefTexts(brief: NonNullable<NormalizedScriptStoryInput["productionBrief"]>): string[] {
  return [
    brief.goal,
    brief.conflict,
    brief.lessonOrTheme,
    brief.seriesContext?.name,
    brief.seriesContext?.description,
    brief.seriesContext?.values,
    brief.seriesContext?.tone,
    brief.seriesContext?.visualStyle,
    brief.seriesContext?.musicStyle,
    brief.seriesContext?.safetyRules,
    brief.seriesContext?.continuityRules,
    brief.episodeContext?.title,
    brief.episodeContext?.lessonOrTheme,
    brief.episodeContext?.synopsis,
    brief.episodeContext?.promptSeed,
    brief.episodeContext?.continuityNote,
    brief.episodeContext?.serialHook,
    brief.storyWorldContext?.name,
    brief.storyWorldContext?.description,
    brief.storyWorldContext?.relationshipMap,
    brief.storyWorldContext?.visualStyle,
    brief.storyWorldContext?.safetyRules,
    ...(brief.requiredBeats ?? []),
    ...(brief.visualContinuityRules ?? []).filter((rule) => !isReferenceAssetLibraryRule(rule))
  ].filter((value): value is string => Boolean(value && value.trim()));
}

function isReferenceAssetLibraryRule(value: string): boolean {
  const normalized = value.toLowerCase();

  return normalized.includes("approved design asset")
    || normalized.includes("preserve character identity")
    || normalized.includes("preserve environment layout")
    || normalized.includes("角色参考：")
    || normalized.includes("背景参考：");
}

function assetLabelAppearsInText(label: string | undefined, text: string): boolean {
  if (!label || !text) {
    return false;
  }

  return buildSearchTerms(label).some((term) => text.includes(term));
}

function meaningfulTermsAppearInText(value: string, text: string): boolean {
  const terms = buildSearchTerms(value);

  if (terms.length === 0) {
    return true;
  }

  return terms.some((term) => text.includes(term));
}

function buildSearchTerms(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const genericTerms = new Set([
    "asset",
    "case",
    "character",
    "design",
    "reference",
    "scene",
    "style",
    "三视图",
    "人物",
    "参考",
    "场景",
    "总裁",
    "素材",
    "角色",
    "设定",
    "设计"
  ]);
  const normalized = value
    .toLowerCase()
    .replace(/[_/|,，。:：;；()（）【】<>《》"'“”‘’]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = normalized
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !genericTerms.has(word));
  const cjkCompact = normalized.replace(/[^\p{Script=Han}]/gu, "");
  const cjkTerms = new Set<string>();

  if (cjkCompact.length >= 2) {
    cjkTerms.add(cjkCompact);

    for (let size = 3; size >= 2; size -= 1) {
      for (let index = 0; index <= cjkCompact.length - size; index += 1) {
        const term = cjkCompact.slice(index, index + size);

        if (!genericTerms.has(term)) {
          cjkTerms.add(term);
        }
      }
    }
  }

  return [...new Set([...words, ...cjkTerms])].filter((term) => term.length >= 2);
}

function buildOutlineRewriteFeedback(outlineQc: GeneratedOutlineQualityCheck): string {
  return outlineQc.checks
    .filter((check) => check.status === "fail")
    .map((check) => `- ${check.label}: ${check.detail}`)
    .join("\n");
}

function collectVisibleTexts(content: GeneratedScriptStoryContent): string[] {
  return [
    content.script.title,
    content.script.hook,
    content.script.voiceover,
    content.backgroundMusic.prompt,
    content.visualBible.character.role,
    content.visualBible.environment.recurringDetails,
    ...content.storyboard.flatMap((scene) => [scene.visual, scene.voiceText, scene.imagePrompt])
  ].filter(Boolean);
}

function containsScaffoldingPhrase(value: string): boolean {
  const normalized = value.toLowerCase();
  return [
    "this is the story of",
    "story topic:",
    "scene narration for",
    "scene centered on",
    "a scene centered on",
    "production brief:",
    "internal routing",
    "这是关于",
    "围绕"
  ].some((phrase) => normalized.includes(phrase.toLowerCase())) || /^topic\s*[:：]/iu.test(value.trim());
}

function isShootableScene(scene: GeneratedStoryboardScene): boolean {
  const text = `${scene.visual} ${scene.imagePrompt}`;
  const longEnough = scene.visual.trim().length >= 12 && scene.imagePrompt.trim().length >= 24;
  const abstractOnly = [
    "声音侵入心灵",
    "气氛变",
    "气氛骤然",
    "感觉",
    "情绪",
    "氛围",
    "恐怖的画面",
    "围绕",
    "mood",
    "feeling",
    "atmosphere"
  ].some((phrase) => text.toLowerCase().includes(phrase.toLowerCase()));
  const hasVisibleAction =
    /[走跑拿看开关递放翻拨按进入离开发现举起指向躲擦拍写接煮端笑哭等站坐推拉敲]/u.test(text) ||
    /\b(opens?|holds?|walks?|runs?|looks?|presses?|places?|finds?|enters?|leaves?|turns?|points?|cooks?|answers?|drops?|sees?|reveals?)\b/iu.test(text);

  return longEnough && !abstractOnly && hasVisibleAction && !containsScaffoldingPhrase(text);
}

function isTooGenericStoryText(value: string): boolean {
  const compact = safeCompactForTopicMatch(value);
  return [
    "恐怖",
    "喜剧",
    "爱情",
    "童话",
    "故事",
    "horror",
    "comedy",
    "romance",
    "fairytale",
    "story"
  ].includes(compact) || value.trim().length < 18;
}

function _applyTopicLock(
  input: NormalizedScriptStoryInput,
  parsed: GeneratedScriptStoryContent
): GeneratedScriptStoryContent {
  const topic = input.topic.trim();

  if (!topic) {
    return parsed;
  }

  const script = {
    ...parsed.script,
    hook: ensureTopicReference(parsed.script.hook, topic, input.language === "zh-CN" ? `关于「${topic}」的传闻，是从这里开始的。` : `This is the story of "${topic}."`),
    title: hasExactTopicReference(parsed.script.title, topic) ? parsed.script.title : topic,
    voiceover: ensureTopicReference(parsed.script.voiceover, topic, input.language === "zh-CN" ? `这是关于「${topic}」的故事。` : `This is the story of "${topic}."`)
  };
  const storyboard = parsed.storyboard.map((scene) => ({
    ...scene,
    imagePrompt: ensureTopicReference(scene.imagePrompt, topic, `Topic: ${topic}.`),
    visual: ensureTopicReference(scene.visual, topic, input.language === "zh-CN" ? `围绕「${topic}」的画面。` : `A scene centered on "${topic}."`)
  }));

  return {
    backgroundMusic: {
      ...parsed.backgroundMusic,
      prompt: ensureTopicReference(parsed.backgroundMusic.prompt, topic, `Instrumental background music for "${topic}."`)
    },
    interpretedIdea: parsed.interpretedIdea,
    outlineQc: parsed.outlineQc,
    requiresReview: parsed.requiresReview,
    script,
    storyboard,
    visualBible: ensureVisualBibleTopicReference(parsed.visualBible, topic)
  };
}

function _forceTopicLock(
  input: NormalizedScriptStoryInput,
  parsed: GeneratedScriptStoryContent
): GeneratedScriptStoryContent {
  const topic = input.topic.trim();

  if (!topic) {
    return parsed;
  }

  return {
    backgroundMusic: {
      ...parsed.backgroundMusic,
      prompt: ensureTopicReference(parsed.backgroundMusic.prompt, topic, `Instrumental background music for "${topic}".`)
    },
    interpretedIdea: parsed.interpretedIdea,
    outlineQc: parsed.outlineQc,
    requiresReview: parsed.requiresReview,
    script: {
      ...parsed.script,
      hook: ensureTopicReference(removeNonHorrorRumorPrefix(parsed.script.hook, topic, input.templateType), topic, `Story topic: "${topic}".`),
      title: hasExactTopicReference(parsed.script.title, topic) ? parsed.script.title : `${topic}: ${parsed.script.title}`,
      voiceover: ensureTopicReference(removeNonHorrorRumorPrefix(parsed.script.voiceover, topic, input.templateType), topic, `Story topic: "${topic}".`)
    },
    storyboard: parsed.storyboard.map((scene) => ({
      ...scene,
      imagePrompt: ensureTopicReference(scene.imagePrompt, topic, `Topic: ${topic}.`),
      visual: ensureTopicReference(scene.visual, topic, `Scene centered on "${topic}".`),
      voiceText: ensureTopicReference(scene.voiceText, topic, `Scene narration for "${topic}".`)
    })),
    visualBible: ensureVisualBibleTopicReference(parsed.visualBible, topic)
  };
}

function ensureVisualBibleTopicReference(visualBible: GeneratedVisualBible, topic: string): GeneratedVisualBible {
  return {
    ...visualBible,
    character: {
      ...visualBible.character,
      role: ensureTopicReference(visualBible.character.role, topic, `Connected to "${topic}".`)
    },
    environment: {
      ...visualBible.environment,
      recurringDetails: ensureTopicReference(visualBible.environment.recurringDetails, topic, `Continuity for "${topic}".`)
    }
  };
}

function removeNonHorrorRumorPrefix(value: string, topic: string, templateType: ContentTemplateType): string {
  if (templateType === "rules_horror" || templateType === "surveillance_horror" || templateType === "urban_legend") {
    return value;
  }

  const compact = safeCompactForTopicMatch(value.slice(0, 80));
  const compactTopic = safeCompactForTopicMatch(topic);
  const looksLikeRumorPrefix =
    compact.includes(compactTopic) &&
    (value.slice(0, 80).includes("传闻") || value.slice(0, 80).includes("ä¼") || value.slice(0, 80).toLowerCase().includes("rumor"));

  if (!looksLikeRumorPrefix) {
    return value;
  }

  return value
    .replace(new RegExp(`^\\s*Story topic:\\s*["']?${escapeRegExp(topic)}["']?[.。]?\\s*`, "iu"), "")
    .replace(new RegExp(`^\\s*[^.。!?！？]{0,40}${escapeRegExp(topic)}[^.。!?！？]{0,40}[.。!?！？]\\s*`, "iu"), "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureTopicReference(value: string, topic: string, prefix: string): string {
  return hasExactTopicReference(value, topic) ? value : `${prefix} ${value}`.trim();
}

function hasExactTopicReference(value: string, topic: string): boolean {
  return safeCompactForTopicMatch(value).includes(safeCompactForTopicMatch(topic));
}

function safeCompactForTopicMatch(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s"'`.,!?;:()[\]{}<>|\\/_-]/g, "");
}

function _compactForTopicMatch(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s"'“”‘’「」『』《》，,。.!！?？:：;；\-_/\\()[\]{}]/gu, "");
}

function buildLocalInterpretedIdea(
  input: NormalizedScriptStoryInput,
  script: GeneratedScript,
  storyboard: GeneratedStoryboardScene[]
): GeneratedInterpretedIdea {
  const firstScene = storyboard[0]?.visual || script.hook;
  const genre = input.genre?.trim() || getTemplateGenreLabel(input.templateType);
  const protagonist = inferProtagonistFromBibleText(script.title, firstScene);
  const centralObject = inferFirstKeyObject(`${input.topic} ${script.title} ${firstScene}`);

  return {
    centralObject,
    conflict: script.hook,
    endingHook: script.voiceover.split(/(?<=[.!?。！？])/u).filter(Boolean).at(-1)?.trim() || script.hook,
    escalation: "Each scene visibly increases the problem before the final reveal.",
    expandedPremise: inferExpandedPremise(input, script, firstScene),
    genre,
    logline: `${protagonist} must deal with ${centralObject} before the situation flips in the final beat.`,
    protagonist,
    rawTopic: input.topic,
    ruleOrConstraint: "The protagonist has one clear limit and cannot solve the problem directly.",
    setting: firstScene,
    twist: "The final reveal shows the central object was pointing to the wrong assumption."
  };
}

function buildLocalScript(input: NormalizedScriptStoryInput): GeneratedScript {
  if (input.language === "en-US") {
    const scripts: Record<ContentTemplateType, GeneratedScript> = {
      comedy_sketch: {
        hook: `Everyone thought ${input.topic} was a tiny problem until the third misunderstanding.`,
        title: `${input.topic}: The Office Misread Everything`,
        voiceover: `It started with ${input.topic}, which should have been simple. One person guessed the wrong reason. Another person tried to fix the wrong problem. By the end, everyone was proudly solving something that never happened. The punchline is that the quietest person understood it from the start.`
      },
      fairy_tale: {
        hook: `In a small magical town, ${input.topic} only worked when someone gave something away.`,
        title: `${input.topic}: A Tiny Fairy Tale`,
        voiceover: `In a small magical town, everyone whispered about ${input.topic}. It looked ordinary in daylight, but at night it answered kind wishes. The rule was simple: you could not keep the magic for yourself. When one child shared it, the whole street began to glow.`
      },
      romance_story: {
        hook: `${input.topic} looked like a mistake, but it was the first honest clue.`,
        title: `${input.topic}: The Smallest Love Story`,
        voiceover: `${input.topic} began with a quiet mistake. Two people reached for the wrong thing and found the right sentence. Neither of them said too much. They only left one small clue, then another. By the final scene, the audience understands they were choosing each other all along.`
      },
      rules_horror: {
        hook: `If you find a new rule about ${input.topic}, leave before reading rule three.`,
        title: `${input.topic}: Rule Three Was Added Last Night`,
        voiceover: `If you find a new rule about ${input.topic}, do not treat it like a joke. The first rule is normal. The second rule sounds impossible. The third rule was added after someone ignored the first two.`
      },
      surveillance_horror: {
        hook: `The camera caught ${input.topic}, but the timestamp said it happened tomorrow.`,
        title: `${input.topic}: The Missing Minute`,
        voiceover: `The first replay of ${input.topic} looked harmless. The second replay had one extra detail. By the third replay, the room had changed while nobody was inside. The final frame was not a warning. It was proof the camera was late.`
      },
      urban_legend: {
        hook: `People in the city still whisper about ${input.topic}, because the ending keeps changing.`,
        title: `${input.topic}: A Modern Urban Legend`,
        voiceover: `The story of ${input.topic} sounds fake until three strangers tell it the same way. Every version begins in an ordinary place. Every version adds one detail nobody can explain. The last detail is always the same: someone else is about to repeat it.`
      }
    };

    return scripts[input.templateType];
  }

  const scripts: Record<ContentTemplateType, GeneratedScript> = {
    comedy_sketch: {
      hook: `大家以为「${input.topic}」只是小事，结果第三个误会直接把全办公室带偏。`,
      title: `${input.topic}：全办公室都误会了`,
      voiceover: `一开始，「${input.topic}」真的只是一个小问题。第一个人猜错原因，第二个人修错地方，第三个人认真写了一份解决方案。最离谱的是，所有人都觉得自己立功了。直到最后，那个一直没说话的人拿起杯子，轻轻一句话，把全场误会一次收掉。`
    },
    fairy_tale: {
      hook: `在一个小镇里，「${input.topic}」只会回应愿意分享的人。`,
      title: `${input.topic}：一个小小童话`,
      voiceover: `小镇上的人都听说过「${input.topic}」。白天它看起来普通，到了夜里却会回应善意的愿望。唯一的规则是，魔法不能只留给自己。当主角把愿望送给别人时，整条街的灯，一盏一盏亮了起来。`
    },
    romance_story: {
      hook: `「${input.topic}」看起来像一次拿错，其实是两个人第一次认真靠近。`,
      title: `${input.topic}：一支温柔爱情短片`,
      voiceover: `「${input.topic}」开始于一个很小的错误。两个人拿错了东西，却看见了对方留下的一句话。他们没有说太多，只是一次又一次，把线索留在刚好能被发现的地方。到最后你才明白，他们不是偶遇，是慢慢选择了彼此。`
    },
    rules_horror: {
      hook: `如果你看到关于「${input.topic}」的新规则，千万不要读第三条。`,
      title: `${input.topic}：第三条规则是昨晚才加上的`,
      voiceover: `如果你看到关于「${input.topic}」的新规则，千万不要当成玩笑。第一条通常很正常，第二条听起来不可能，第三条是有人违反前两条之后才被加上的。`
    },
    surveillance_horror: {
      hook: `监控拍到了「${input.topic}」，但时间显示那是明天发生的事。`,
      title: `${input.topic}：消失的一分钟`,
      voiceover: `第一次回放「${input.topic}」时，画面看起来很普通。第二次回放，多了一个不该出现的细节。第三次回放，房间在没有人的时候变了位置。最后一帧不是警告，而是证明监控慢了一分钟。`
    },
    urban_legend: {
      hook: `这座城市还在流传「${input.topic}」，因为每个人听到的结局都不一样。`,
      title: `${input.topic}：一个新的都市传说`,
      voiceover: `关于「${input.topic}」的故事，一开始听起来很假。直到三个陌生人说出同样的开头。每个版本都发生在普通地方，每个版本都多出一个无法解释的细节。最可怕的是，最后那个细节，永远指向下一个讲故事的人。`
    }
  };

  return scripts[input.templateType];
}

function buildLocalStoryboard(input: NormalizedScriptStoryInput, script: GeneratedScript): GeneratedStoryboardScene[] {
  const baseDuration = Math.floor(input.durationSeconds / input.sceneCount);
  const remainder = input.durationSeconds - baseDuration * input.sceneCount;

  return Array.from({ length: input.sceneCount }, (_, index) => {
    const sceneId = index + 1;

    return {
      camera: getLocalCamera(input.templateType, sceneId),
      durationSeconds: baseDuration + (index < remainder ? 1 : 0),
      imagePrompt: `${input.topic}, scene ${sceneId}, ${getLocalVisualStyle(input.templateType)}, fictional, no copyrighted characters`,
      sceneId,
      sfx: getLocalSfx(input.templateType, sceneId === input.sceneCount),
      visual: getLocalVisual(input, sceneId === input.sceneCount),
      voiceText: getLocalSceneVoiceText(script, sceneId)
    };
  });
}

function buildLocalVisualBible(input: NormalizedScriptStoryInput, storyboard: GeneratedStoryboardScene[]): GeneratedVisualBible {
  const style = getLocalVisualStyle(input.templateType);
  const firstVisual = storyboard[0]?.visual ?? input.topic;

  return {
    character: {
      ageRange: "adult, late 20s to late 30s",
      bodyType: "average build, expressive posture, realistic fictional person",
      expressionRange: "consistent face with expressions adjusted to the scene beat",
      fixedProps: inferKeyObjects(`${input.topic} ${firstVisual}`).slice(0, 2),
      hair: "short dark hair, same hairline and style across all scenes",
      name: "Main protagonist",
      role: `fictional lead for ${input.topic}`,
      signatureDetails: "same face, same skin tone, same hairstyle, same outfit, no identity drift",
      wardrobe: getLocalWardrobe(input.templateType)
    },
    environment: {
      keyObjects: inferKeyObjects(`${input.topic} ${firstVisual}`),
      lighting: getLocalLighting(input.templateType),
      location: firstVisual,
      palette: getLocalPalette(input.templateType),
      recurringDetails: `Every scene must stay visually connected to ${input.topic} with the same protagonist, location logic, and recurring props.`
    },
    negativePrompt: "no text, no captions, no subtitles, no logos, no watermark, no UI, no tables, no storyboard sheet, no comic panels, no collage, no duplicate protagonist, no face change, no outfit change",
    style
  };
}

function getLocalVisualStyle(templateType: ContentTemplateType): string {
  const styles: Record<ContentTemplateType, string> = {
    comedy_sketch: "bright modern workplace comedy, expressive faces, clean vertical framing, warm daylight",
    fairy_tale: "whimsical storybook fantasy, soft glowing light, cozy magical details, vertical composition",
    romance_story: "warm cinematic romance, rainy reflections, soft natural light, intimate but restrained",
    rules_horror: "analog horror, low light, surveillance footage, cinematic shadows",
    surveillance_horror: "CCTV suspense, low light, monitor glow, realistic security camera angle",
    urban_legend: "modern urban mystery, cinematic night street, moody but low-violence"
  };

  return styles[templateType];
}

function getLocalWardrobe(templateType: ContentTemplateType): string {
  const wardrobes: Record<ContentTemplateType, string> = {
    comedy_sketch: "same casual light jacket over a plain shirt, clean modern everyday outfit",
    fairy_tale: "same original storybook travel cloak and simple tunic, no copyrighted costume",
    romance_story: "same warm neutral coat over a soft shirt, restrained romantic styling",
    rules_horror: "same dark casual jacket and plain shirt, grounded modern outfit",
    surveillance_horror: "same dark casual jacket and plain shirt, grounded modern outfit",
    urban_legend: "same modern streetwear jacket and plain shirt, recognizable silhouette"
  };

  return wardrobes[templateType];
}

function getLocalLighting(templateType: ContentTemplateType): string {
  if (templateType === "comedy_sketch") {
    return "bright warm practical daylight";
  }

  if (templateType === "romance_story" || templateType === "fairy_tale") {
    return "soft warm cinematic practical light";
  }

  return "low key cinematic practical light, suspenseful but readable";
}

function getLocalPalette(templateType: ContentTemplateType): string {
  if (templateType === "comedy_sketch") {
    return "warm neutrals with small blue and green accents";
  }

  if (templateType === "fairy_tale") {
    return "soft greens, golds, and warm natural tones";
  }

  if (templateType === "romance_story") {
    return "warm amber, muted rose, and soft gray-blue";
  }

  return "muted charcoal, cool blue-gray, and practical amber highlights";
}

function getLocalCamera(templateType: ContentTemplateType, sceneId: number): string {
  if (templateType === "comedy_sketch") {
    return sceneId % 2 === 0 ? "quick reaction cut" : "wide office sitcom framing";
  }

  if (templateType === "romance_story") {
    return sceneId % 2 === 0 ? "soft close-up" : "gentle tracking shot";
  }

  if (templateType === "fairy_tale") {
    return sceneId % 2 === 0 ? "slow magical reveal" : "storybook establishing shot";
  }

  return sceneId % 2 === 0 ? "slow CCTV push-in" : "fixed surveillance angle";
}

function getLocalSfx(templateType: ContentTemplateType, isLastScene: boolean): string[] {
  if (templateType === "comedy_sketch") {
    return isLastScene ? ["light pop", "room reaction"] : ["office ambience"];
  }

  if (templateType === "romance_story") {
    return isLastScene ? ["soft rain", "warm piano resolve"] : ["rain ambience"];
  }

  if (templateType === "fairy_tale") {
    return isLastScene ? ["sparkle swell", "soft chime"] : ["gentle chimes"];
  }

  return isLastScene ? ["signal drop", "low drone"] : ["low hum"];
}

function getLocalVisual(input: NormalizedScriptStoryInput, isLastScene: boolean): string {
  if (input.templateType === "comedy_sketch") {
    return isLastScene ? "The final reaction reveals everyone solved the wrong problem." : `A fast comic beat connected to ${input.topic}.`;
  }

  if (input.templateType === "romance_story") {
    return isLastScene ? "The two clues finally meet in a warm quiet frame." : `A restrained romantic moment connected to ${input.topic}.`;
  }

  if (input.templateType === "fairy_tale") {
    return isLastScene ? "The magical gift lights up the whole scene." : `A whimsical magical detail connected to ${input.topic}.`;
  }

  return isLastScene ? "The final frame reveals the unsettling twist." : `A quiet location connected to ${input.topic}.`;
}

function getLocalSceneVoiceText(script: GeneratedScript, sceneId: number): string {
  if (sceneId === 1) {
    return script.hook;
  }

  const parts = script.voiceover.match(/[^。.!?！？]+[。.!?！？]?/gu) ?? [script.voiceover];
  return parts[(sceneId - 1) % parts.length]?.trim() || script.voiceover;
}

function estimateOpenAICostRM(
  model: string,
  inputTokens: number,
  outputTokens: number,
  usdToMyrRate: number,
  costOverride?: NormalizedScriptStoryInput["cost"]
): number {
  if ((costOverride?.inputUnitPriceRM ?? 0) > 0 || (costOverride?.outputUnitPriceRM ?? 0) > 0) {
    return Number((inputTokens * (costOverride?.inputUnitPriceRM ?? 0) + outputTokens * (costOverride?.outputUnitPriceRM ?? 0)).toFixed(4));
  }

  const pricing = getOpenAITextPricingUSD(model);
  const usd = (inputTokens / 1_000_000) * pricing.inputPerMillionUSD + (outputTokens / 1_000_000) * pricing.outputPerMillionUSD;
  return Number((usd * usdToMyrRate).toFixed(4));
}

function getOpenAITextPricingUSD(model: string): { inputPerMillionUSD: number; outputPerMillionUSD: number } {
  const table: Record<string, { inputPerMillionUSD: number; outputPerMillionUSD: number }> = {
    "gpt-4.1": { inputPerMillionUSD: 2, outputPerMillionUSD: 8 },
    "gpt-4.1-mini": { inputPerMillionUSD: 0.4, outputPerMillionUSD: 1.6 },
    "gpt-4o-mini": { inputPerMillionUSD: 0.15, outputPerMillionUSD: 0.6 },
    "gpt-5": { inputPerMillionUSD: 1.25, outputPerMillionUSD: 10 },
    "gpt-5-mini": { inputPerMillionUSD: 0.25, outputPerMillionUSD: 2 },
    "gpt-5-nano": { inputPerMillionUSD: 0.05, outputPerMillionUSD: 0.4 },
    "gpt-5.4": { inputPerMillionUSD: 2.5, outputPerMillionUSD: 15 },
    "gpt-5.4-mini": { inputPerMillionUSD: 0.75, outputPerMillionUSD: 4.5 },
    "gpt-5.4-nano": { inputPerMillionUSD: 0.2, outputPerMillionUSD: 1.25 },
    "gpt-5.4-pro": { inputPerMillionUSD: 30, outputPerMillionUSD: 180 },
    "gpt-5.5": { inputPerMillionUSD: 5, outputPerMillionUSD: 30 },
    "gpt-5.5-pro": { inputPerMillionUSD: 30, outputPerMillionUSD: 180 }
  };

  return table[model] ?? { inputPerMillionUSD: 0, outputPerMillionUSD: 0 };
}

function toGeneratedObject(object: StoredObject): GenerateScriptStoryResponse["artifacts"]["script"] {
  return {
    driver: object.driver,
    fallbackReason: object.fallbackReason,
    localPath: object.localPath,
    publicUrl: object.publicUrl,
    storagePath: object.storagePath
  };
}
