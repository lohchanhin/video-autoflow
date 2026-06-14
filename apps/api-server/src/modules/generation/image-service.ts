import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type {
  ContentTemplateType,
  GenerateImagesRequest,
  GenerateImagesResponse,
  GenerateReferenceDesignRequest,
  GenerateReferenceDesignResponse,
  GenerateSceneImageRequest,
  GenerateSceneImageResponse,
  GeneratedImageAsset,
  GeneratedImageQualityCheck,
  GeneratedStorageObject,
  GeneratedStoryboardScene,
  GeneratedVisualBible
} from "@ai-content-factory/shared-types";
import type { StorageAdapter, StoredObject } from "@ai-content-factory/storage";
import { MissingGenerationDependencyError } from "../../errors.js";

export interface OpenAIImageClientOptions {
  apiKey?: string | undefined;
  baseUrl: string;
  model: string;
  quality: string;
  size: string;
  usdToMyrRate: number;
  visionModel?: string | undefined;
}

export interface ImageGenerationServiceOptions {
  allowLocalFallback?: boolean | undefined;
  openai: OpenAIImageClientOptions;
  storage: StorageAdapter;
}

export interface ImageGenerationService {
  generateImages(input: GenerateImagesRequest): Promise<GenerateImagesResponse>;
  generateReferenceDesign(input: GenerateReferenceDesignRequest): Promise<GenerateReferenceDesignResponse>;
  generateSceneImage(input: GenerateSceneImageRequest): Promise<GenerateSceneImageResponse>;
}

interface NormalizedImageInput extends Omit<GenerateImagesRequest, "jobId"> {
  jobId?: string;
}

interface NormalizedReferenceDesignInput extends NormalizedImageInput {
  designType: GenerateReferenceDesignRequest["designType"];
  sceneId?: number | undefined;
}

interface StoryboardArtifact {
  scenes: GeneratedStoryboardScene[];
}

interface SceneImagePrompt {
  basePrompt: string;
  prompt: string;
  scene: GeneratedStoryboardScene;
  sceneId: number;
}

interface OpenAIImageResponseBody {
  data?: Array<{
    b64_json?: string;
    revised_prompt?: string;
    url?: string;
  }>;
  error?: {
    message?: string;
  };
  usage?: OpenAIImageUsage;
}

interface OpenAIImageUsage {
  input_tokens?: number;
  input_tokens_details?: {
    image_tokens?: number;
    text_tokens?: number;
  };
  output_tokens?: number;
  total_tokens?: number;
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
  error?: {
    message?: string;
  };
}

interface GeneratedOpenAIImage {
  buffer: Buffer;
  costRM: number;
  extension: "png";
  revisedPrompt?: string | undefined;
  usage?: Record<string, number | string> | undefined;
}

interface LoadedReferenceImage {
  buffer?: Buffer | undefined;
  isSelected: boolean;
  label?: string | undefined;
  mimeType?: string | undefined;
  object: GeneratedStorageObject;
}

const maxImageQcRetries = 2;
const referenceCompositePricingMode = "reference_composite_fallback";

export function createImageGenerationService(options: ImageGenerationServiceOptions): ImageGenerationService {
  return {
    async generateImages(input: GenerateImagesRequest): Promise<GenerateImagesResponse> {
      const normalizedInput = normalizeInput(input);
      const runtimeOptions = withRuntimeOpenAIConfig(options, normalizedInput);
      const jobId = normalizedInput.jobId ?? `job_${crypto.randomUUID().slice(0, 8)}`;
      const storyboard = await loadStoryboard(runtimeOptions, jobId, normalizedInput);
      const visualBible = await loadVisualBible(runtimeOptions, jobId, normalizedInput, storyboard.scenes);
      const reference = await loadOrCreateReferenceImage(runtimeOptions, jobId, normalizedInput, visualBible);
      const prompts = buildStoryboardImagePrompts(storyboard.scenes, normalizedInput, visualBible);
      const images: GeneratedImageAsset[] = [];

      for (const prompt of prompts) {
        const generated = await generateSceneAssetWithRetries(runtimeOptions, jobId, normalizedInput, prompt, visualBible, reference);
        images.push(generated);
      }

      return {
        costRM: Number(images.reduce((sum, image) => sum + image.costRM, 0).toFixed(4)),
        images,
        jobId,
        model: runtimeOptions.openai.apiKey ? runtimeOptions.openai.model : "local-image-mock",
        provider: runtimeOptions.openai.apiKey ? normalizedInput.provider?.trim() || "openai" : "local",
        referenceImage: reference?.object,
        requiresReview: images.some((image) => image.qualityCheck?.status === "fail"),
        status: "IMAGE_DONE",
        visualBible
      };
    },

    async generateReferenceDesign(input: GenerateReferenceDesignRequest): Promise<GenerateReferenceDesignResponse> {
      const normalizedInput = normalizeReferenceDesignInput(input);
      const runtimeOptions = withRuntimeOpenAIConfig(options, normalizedInput);
      const jobId = normalizedInput.jobId ?? `job_${crypto.randomUUID().slice(0, 8)}`;
      const storyboard = await loadStoryboardForReferenceDesign(runtimeOptions, jobId, normalizedInput);
      const visualBible = await loadVisualBible(runtimeOptions, jobId, normalizedInput, storyboard.scenes);
      const scene = normalizedInput.sceneId ? storyboard.scenes.find((candidate) => candidate.sceneId === normalizedInput.sceneId) : undefined;
      const prompt = buildReferenceDesignPrompt(normalizedInput, visualBible, scene);
      const generated = runtimeOptions.openai.apiKey
        ? await generateWithOpenAI(prompt, runtimeOptions.openai)
        : runtimeOptions.allowLocalFallback
          ? {
            buffer: Buffer.from(createLocalReferenceDesignSvg(normalizedInput, visualBible, scene)),
            costRM: 0,
            extension: "svg" as const,
            revisedPrompt: undefined,
            usage: undefined
          }
          : missingOpenAIKey();
      const assetPath = `jobs/${jobId}/references/${normalizedInput.designType}${normalizedInput.sceneId ? `_scene_${String(normalizedInput.sceneId).padStart(2, "0")}` : ""}.${generated.extension}`;
      const assetObject = await runtimeOptions.storage.writeFile(assetPath, generated.buffer);

      return {
        asset: toGeneratedObject(assetObject),
        costRM: generated.costRM,
        designType: normalizedInput.designType,
        jobId,
        model: runtimeOptions.openai.apiKey ? runtimeOptions.openai.model : "local-image-mock",
        prompt,
        provider: runtimeOptions.openai.apiKey ? normalizedInput.provider?.trim() || "openai" : "local",
        role: "reference_image",
        sceneId: normalizedInput.sceneId,
        status: "REFERENCE_DONE",
        usage: generated.usage,
        visualBible
      };
    },

    async generateSceneImage(input: GenerateSceneImageRequest): Promise<GenerateSceneImageResponse> {
      const normalizedInput = normalizeInput(input);
      const runtimeOptions = withRuntimeOpenAIConfig(options, normalizedInput);
      const jobId = normalizedInput.jobId ?? `job_${crypto.randomUUID().slice(0, 8)}`;
      const sceneId = Math.max(1, Math.min(normalizedInput.sceneCount, Math.round(input.sceneId)));
      const storyboard = await loadStoryboard(runtimeOptions, jobId, normalizedInput);
      const visualBible = await loadVisualBible(runtimeOptions, jobId, normalizedInput, storyboard.scenes);
      const reference = await loadOrCreateReferenceImage(runtimeOptions, jobId, normalizedInput, visualBible);
      const prompt = buildSingleImagePrompt(storyboard.scenes, normalizedInput, visualBible, sceneId, input.promptOverride);
      const image = await generateSceneAssetWithRetries(runtimeOptions, jobId, normalizedInput, prompt, visualBible, reference);

      return {
        costRM: image.costRM,
        image,
        jobId,
        model: runtimeOptions.openai.apiKey ? runtimeOptions.openai.model : "local-image-mock",
        provider: runtimeOptions.openai.apiKey ? normalizedInput.provider?.trim() || "openai" : "local",
        referenceImage: reference?.object,
        requiresReview: image.qualityCheck?.status === "fail",
        status: "IMAGE_DONE",
        visualBible
      };
    }
  };
}

function missingOpenAIKey(): never {
  throw new MissingGenerationDependencyError("Missing OPENAI_API_KEY. Configure the OpenAI key in Keys or .env before generating scene images. No mock image placeholders will be generated.");
}

function withRuntimeOpenAIConfig(options: ImageGenerationServiceOptions, input?: Partial<GenerateImagesRequest> | undefined): ImageGenerationServiceOptions {
  const params = input?.params ?? {};
  return {
    ...options,
    openai: {
      ...options.openai,
      apiKey: options.allowLocalFallback && !options.openai.apiKey ? undefined : process.env.OPENAI_API_KEY ?? options.openai.apiKey,
      baseUrl: input?.baseUrl?.trim() || process.env.OPENAI_BASE_URL || options.openai.baseUrl,
      model: input?.model?.trim() || process.env.OPENAI_IMAGE_MODEL || options.openai.model,
      quality: stringParam(params.quality) || process.env.OPENAI_IMAGE_QUALITY || options.openai.quality,
      size: stringParam(params.size) || process.env.OPENAI_IMAGE_SIZE || options.openai.size,
      visionModel: process.env.OPENAI_TEXT_MODEL ?? options.openai.visionModel
    }
  };
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function loadStoryboard(
  options: ImageGenerationServiceOptions,
  jobId: string,
  input: NormalizedImageInput
): Promise<StoryboardArtifact> {
  const storyboardPath = options.storage.resolveLocalPath(`jobs/${jobId}/storyboard.json`);

  if (existsSync(storyboardPath)) {
    const parsed = JSON.parse(await readFile(storyboardPath, "utf8")) as Partial<StoryboardArtifact>;
    const scenes = parsed.scenes?.filter(isGeneratedStoryboardScene) ?? [];

    if (scenes.length > 0) {
      return { scenes };
    }

    throw new MissingGenerationDependencyError("Storyboard artifact does not contain valid scenes. Regenerate script/story before generating images.");
  }

  if (options.allowLocalFallback) {
    return { scenes: buildLocalScenes(input) };
  }

  throw new MissingGenerationDependencyError("Missing storyboard artifact. Run Generate script/story first so image generation uses approved scene prompts instead of inventing content from the brief.");
}

async function loadStoryboardForReferenceDesign(
  options: ImageGenerationServiceOptions,
  jobId: string,
  input: NormalizedImageInput
): Promise<StoryboardArtifact> {
  try {
    return await loadStoryboard({ ...options, allowLocalFallback: true }, jobId, input);
  } catch {
    return { scenes: buildLocalScenes(input) };
  }
}

async function loadVisualBible(
  options: ImageGenerationServiceOptions,
  jobId: string,
  input: NormalizedImageInput,
  scenes: GeneratedStoryboardScene[]
): Promise<GeneratedVisualBible> {
  const visualBiblePath = options.storage.resolveLocalPath(`jobs/${jobId}/visual-bible.json`);

  if (existsSync(visualBiblePath)) {
    const parsed = JSON.parse(await readFile(visualBiblePath, "utf8")) as Partial<GeneratedVisualBible>;
    return normalizeVisualBible(parsed, input, scenes);
  }

  return normalizeVisualBible(undefined, input, scenes);
}

function isGeneratedStoryboardScene(scene: unknown): scene is GeneratedStoryboardScene {
  if (typeof scene !== "object" || scene === null) {
    return false;
  }

  const candidate = scene as Partial<GeneratedStoryboardScene>;
  return typeof candidate.sceneId === "number" &&
    typeof candidate.imagePrompt === "string" &&
    typeof candidate.visual === "string" &&
    typeof candidate.voiceText === "string";
}

function buildStoryboardImagePrompts(
  scenes: GeneratedStoryboardScene[],
  input: NormalizedImageInput,
  visualBible: GeneratedVisualBible
): SceneImagePrompt[] {
  return scenes.map((scene) => ({
    basePrompt: scene.imagePrompt,
    prompt: buildScenePrompt(scene, input, visualBible, scene.imagePrompt),
    scene,
    sceneId: scene.sceneId
  }));
}

function buildSingleImagePrompt(
  scenes: GeneratedStoryboardScene[],
  input: NormalizedImageInput,
  visualBible: GeneratedVisualBible,
  sceneId: number,
  promptOverride?: string | undefined
): SceneImagePrompt {
  const scene = scenes.find((candidate) => candidate.sceneId === sceneId);

  if (!scene) {
    throw new MissingGenerationDependencyError(`Storyboard artifact does not contain scene ${sceneId}. Regenerate script/story first.`);
  }

  const basePrompt = promptOverride?.trim() || scene.imagePrompt;

  return {
    basePrompt,
    prompt: buildScenePrompt(scene, input, visualBible, basePrompt),
    scene,
    sceneId
  };
}

function buildScenePrompt(
  scene: GeneratedStoryboardScene,
  input: NormalizedImageInput,
  visualBible: GeneratedVisualBible,
  basePrompt: string
): string {
  const character = input.character
    ? `${input.character.name}. ${input.character.visualIdentity}. ${input.character.referenceNotes ?? ""}`.trim()
    : formatVisualBibleCharacter(visualBible);
  const characterReferenceLock = formatReferencesByType(input.references, ["character_design"]);
  const environmentReferenceLock = formatReferencesByType(input.references, ["scene_design", "style_reference", "first_frame", "last_frame"]);

  return [
    `Create one single vertical 9:16 cinematic still for scene ${scene.sceneId}.`,
    characterReferenceLock
      ? `MANDATORY CAST LOCK: The visible character identity, face, silhouette, species/body type, hairstyle, wardrobe, color palette, and fixed props must match these selected character reference assets exactly. Do not replace them with a new actor or a generic character. ${characterReferenceLock}`
      : "",
    environmentReferenceLock
      ? `MANDATORY SET / STYLE LOCK: The location, layout, key props, lighting, palette, camera zones, and style must follow these selected scene/style reference assets. ${environmentReferenceLock}`
      : "",
    `User topic: ${input.topic}.`,
    `Scene action: ${scene.visual}`,
    `Scene narration context: ${scene.voiceText}`,
    `Approved scene image brief: ${basePrompt}`,
    `Fixed protagonist identity: ${character}`,
    `Fixed environment: ${formatVisualBibleEnvironment(visualBible)}`,
    input.references?.length ? `Selected production reference assets: ${formatGenerationReferences(input.references)}` : "",
    `Camera and motion intent: ${scene.camera}.`,
    `Visual style: ${visualBible.style || getTemplateVisualStyle(input.templateType)}.`,
    characterReferenceLock
      ? "Continuity rule: selected character reference assets override the visual bible when there is any conflict."
      : "Continuity rule: keep the same protagonist face, hair, body type, wardrobe, props, location logic, palette, and lighting as the visual bible and reference image.",
    "Composition rule: one coherent scene, one protagonist unless the scene explicitly requires another person, no split screen, no panel layout.",
    `Negative prompt: ${visualBible.negativePrompt}`,
    "Forbidden: text, captions, subtitles, letters with readable text, logos, watermarks, UI, tables, storyboard sheets, comic panels, contact sheets, collage, duplicated protagonist, different actor, different outfit, unrelated scene."
  ].filter(Boolean).join("\n");
}

async function loadOrCreateReferenceImage(
  options: ImageGenerationServiceOptions,
  jobId: string,
  input: NormalizedImageInput,
  visualBible: GeneratedVisualBible
): Promise<LoadedReferenceImage | null> {
  const selectedReference = await loadSelectedReferenceImage(input);

  if (selectedReference) {
    return selectedReference;
  }

  const referencePath = options.openai.apiKey ? `jobs/${jobId}/references/character_reference.png` : `jobs/${jobId}/references/character_reference.svg`;
  const existingPath = options.storage.resolveLocalPath(referencePath);

  if (existsSync(existingPath)) {
    const buffer = referencePath.endsWith(".png") ? await readFile(existingPath) : undefined;
    return {
      buffer,
      isSelected: false,
      mimeType: buffer ? "image/png" : undefined,
      object: toGeneratedObject(options.storage.getFile(referencePath))
    };
  }

  const prompt = buildReferenceImagePrompt(input, visualBible);

  if (!options.openai.apiKey) {
    if (!options.allowLocalFallback) {
      return null;
    }

    const referenceObject = await options.storage.writeFile(referencePath, createLocalReferenceSvg(input.topic, visualBible));
    return {
      isSelected: false,
      object: toGeneratedObject(referenceObject)
    };
  }

  const generated = await generateWithOpenAI(prompt, options.openai);
  const referenceObject = await options.storage.writeFile(referencePath, generated.buffer);

  return {
    buffer: generated.buffer,
    isSelected: false,
    mimeType: "image/png",
    object: toGeneratedObject(referenceObject)
  };
}

async function loadSelectedReferenceImage(input: NormalizedImageInput): Promise<LoadedReferenceImage | null> {
  const primaryReference = input.references
    ?.filter((reference) => reference.url.trim())
    .sort((left, right) => referencePriority(left.type) - referencePriority(right.type))[0];

  if (!primaryReference) {
    return null;
  }

  try {
    const buffer = await fetchImageUrl(primaryReference.url);

    return {
      buffer,
      isSelected: true,
      label: primaryReference.label,
      mimeType: "image/png",
      object: {
        driver: "local",
        publicUrl: primaryReference.url,
        storagePath: primaryReference.url
      }
    };
  } catch (error) {
    throw new MissingGenerationDependencyError(
      [
        `Selected reference image "${primaryReference.label}" could not be loaded, so image generation was stopped before the model could invent a different character.`,
        `Reference URL: ${primaryReference.url}`,
        `Original error: ${error instanceof Error ? error.message : "unknown fetch error"}`,
        "Fix the asset URL/storage path or regenerate/save the character design asset, then retry this scene."
      ].join(" ")
    );
  }
}

function referencePriority(type: NonNullable<GenerateImagesRequest["references"]>[number]["type"]): number {
  if (type === "character_design") return 0;
  if (type === "scene_design") return 1;
  if (type === "style_reference") return 2;
  if (type === "first_frame") return 3;
  return 9;
}

function buildReferenceImagePrompt(input: NormalizedImageInput, visualBible: GeneratedVisualBible): string {
  return [
    "Create one clean character reference portrait for the main fictional adult protagonist of a vertical short video.",
    `Topic: ${input.topic}.`,
    `Identity: ${formatVisualBibleCharacter(visualBible)}`,
    `Wardrobe lock: ${visualBible.character.wardrobe}`,
    `Style: ${visualBible.style || getTemplateVisualStyle(input.templateType)}.`,
    "Portrait should be waist-up, neutral pose, plain simple background, no text, no labels, no grid, no UI.",
    `Negative prompt: ${visualBible.negativePrompt}`
  ].join("\n");
}

function formatGenerationReferences(references: NonNullable<GenerateImagesRequest["references"]>): string {
  return references
    .map((reference) =>
      [
        `${reference.type}: ${reference.label}`,
        reference.prompt ? `prompt=${reference.prompt}` : "",
        reference.notes ? `notes=${reference.notes}` : ""
      ].filter(Boolean).join("; ")
    )
    .join(" | ");
}

function formatReferencesByType(
  references: GenerateImagesRequest["references"] | undefined,
  types: Array<NonNullable<GenerateImagesRequest["references"]>[number]["type"]>
): string {
  const typeSet = new Set(types);
  const selected = references?.filter((reference) => typeSet.has(reference.type)) ?? [];

  if (selected.length === 0) {
    return "";
  }

  return selected.map((reference) => [
    `${reference.type}: ${reference.label}`,
    reference.prompt ? `visual facts=${reference.prompt}` : "",
    reference.notes ? `continuity contract=${reference.notes}` : "",
    `reference URL=${reference.url}`
  ].filter(Boolean).join("; ")).join(" | ");
}

function buildReferenceDesignPrompt(
  input: NormalizedReferenceDesignInput,
  visualBible: GeneratedVisualBible,
  scene: GeneratedStoryboardScene | undefined
): string {
  const designBrief = input.prompt.trim();
  const caseContext = input.jobId && input.jobId !== "asset_library" ? `Case context: ${input.topic}.` : "";

  if (input.designType === "character_design") {
    return [
      "Create one production-ready character turnaround reference image.",
      "Highest priority: follow the USER DESIGN BRIEF exactly. Do not replace the requested genre, character, costume, armor, weapon, hair color, eye color, art style, mood, era, props, or environment with generic defaults.",
      `USER DESIGN BRIEF: ${designBrief}`,
      caseContext,
      "Frame specification: one image containing exactly three full-body views of the same original adult character: front view, side view, and back view.",
      "The three views must keep the same face, hairstyle, body shape, wardrobe, armor/clothing details, proportions, color palette, and fixed props from the USER DESIGN BRIEF.",
      "Preserve the requested art style exactly. If the brief says anime, generate anime. If it says realistic, generate realistic. If it says fantasy, keep fantasy.",
      "Background rule: if the USER DESIGN BRIEF requests a location or background, keep it as a subtle consistent backdrop behind the turnaround; otherwise use a clean neutral studio background.",
      "Purpose: this image will be reused as a Seedance reference_image, so identity, wardrobe, silhouette, and props must be easy to read.",
      `Fallback continuity notes, only if compatible with the USER DESIGN BRIEF: ${formatVisualBibleCharacter(visualBible)}.`,
      `Fallback style, only if the USER DESIGN BRIEF does not specify one: ${visualBible.style || getTemplateVisualStyle(input.templateType)}.`,
      "Do not create text labels, captions, logos, UI, watermarks, storyboard panels, comic panels, scene thumbnails, multiple character variants, or extra people.",
      `Negative prompt: ${visualBible.negativePrompt}`
    ].filter(Boolean).join("\n");
  }

  return [
    "Create one production-ready environment bible sheet for an original short-form video case.",
    "Highest priority: follow the USER DESIGN BRIEF exactly. Do not replace the requested location, era, color palette, art style, objects, lighting, or mood with generic defaults.",
    `USER DESIGN BRIEF: ${designBrief}`,
    caseContext,
    scene ? `Target scene ${scene.sceneId}: ${scene.visual}` : "Target scene: global environment design for the full case.",
    scene ? `Narration context: ${scene.voiceText}` : "",
    `Fallback environment notes, only if compatible with the USER DESIGN BRIEF: ${formatVisualBibleEnvironment(visualBible)}`,
    `Character continuity if visible and compatible: ${formatVisualBibleCharacter(visualBible)}`,
    `Fallback style, only if the USER DESIGN BRIEF does not specify one: ${visualBible.style || getTemplateVisualStyle(input.templateType)}.`,
    "Frame specification: one clean environment bible sheet containing 6-8 consistent views/details of the same location, not 6-8 different locations.",
    "Required views/details: main establishing angle, reverse angle, side angle, low-angle or high-angle auxiliary view, entrance/camera-path angle, unlabeled top-down spatial relationship, key prop close-ups, material swatches, lighting direction, color palette details, reusable camera zones, and safe composition boundaries.",
    "Continuity rule: every view must map back to the same spatial layout. Door/window/furniture positions, hero props, era, material language, light direction, color palette, and scale must stay consistent across all panels.",
    "Purpose: this image will be reused as a Seedance reference_image for set layout, lighting, color, prop placement, and camera continuity across multiple scene clips.",
    "Do not create UI, readable text, labels, storyboards showing time progression, comic panels, before/after comparisons, unrelated rooms, or random collage pieces. If a top-down layout appears, it must be visual-only with no labels or text.",
    `Negative prompt: ${visualBible.negativePrompt}`
  ].filter(Boolean).join("\n");
}

export function buildReferenceDesignPromptForTest(
  input: GenerateReferenceDesignRequest,
  visualBible: GeneratedVisualBible,
  scene?: GeneratedStoryboardScene | undefined
): string {
  return buildReferenceDesignPrompt(normalizeReferenceDesignInput(input), visualBible, scene);
}

async function generateSceneAssetWithRetries(
  options: ImageGenerationServiceOptions,
  jobId: string,
  input: NormalizedImageInput,
  scenePrompt: SceneImagePrompt,
  visualBible: GeneratedVisualBible,
  reference: LoadedReferenceImage | null
): Promise<GeneratedImageAsset> {
  let totalCostRM = 0;
  let lastGenerated: { buffer: Buffer; extension: "png" | "svg"; revisedPrompt?: string | undefined; usage?: Record<string, number | string> | undefined } | null = null;
  let lastCheck: GeneratedImageQualityCheck | undefined;
  let lastPrompt = scenePrompt.prompt;

  for (let retryCount = 0; retryCount <= maxImageQcRetries; retryCount += 1) {
    const prompt = retryCount === 0 ? scenePrompt.prompt : buildRepairPrompt(scenePrompt.prompt, lastCheck);
    const generated = options.openai.apiKey
      ? await generateWithOpenAIWithCompositeFallback(prompt, options, input, scenePrompt, visualBible, reference)
      : options.allowLocalFallback
        ? {
          buffer: Buffer.from(createLocalSvg(scenePrompt.sceneId, input.topic, prompt, visualBible)),
          costRM: 0,
          extension: "svg" as const,
          revisedPrompt: undefined,
          usage: undefined
        }
        : missingOpenAIKey();

    totalCostRM = Number((totalCostRM + generated.costRM).toFixed(4));
    lastGenerated = generated;
    lastPrompt = prompt;
    lastCheck = isReferenceCompositeFallback(generated)
      ? buildReferenceCompositeQualityCheck(scenePrompt, generated.revisedPrompt, retryCount)
      : await runImageQualityCheck(generated.buffer, scenePrompt, visualBible, options.openai, retryCount);

    if (lastCheck.status !== "fail") {
      break;
    }
  }

  if (!lastGenerated) {
    missingOpenAIKey();
  }

  const imageObject = await options.storage.writeFile(`jobs/${jobId}/images/scene_${String(scenePrompt.sceneId).padStart(2, "0")}.${lastGenerated.extension}`, lastGenerated.buffer);

  return {
    asset: toGeneratedObject(imageObject),
    costRM: totalCostRM,
    prompt: lastPrompt,
    qualityCheck: lastCheck,
    referenceImage: reference?.object,
    revisedPrompt: lastGenerated.revisedPrompt,
    sceneId: scenePrompt.sceneId,
    usage: lastGenerated.usage
  };
}

async function generateWithOpenAIWithCompositeFallback(
  prompt: string,
  options: ImageGenerationServiceOptions,
  input: NormalizedImageInput,
  scenePrompt: SceneImagePrompt,
  visualBible: GeneratedVisualBible,
  reference: LoadedReferenceImage | null
): Promise<GeneratedOpenAIImage> {
  try {
    return await generateWithOpenAI(
      prompt,
      options.openai,
      reference?.buffer
        ? {
          buffer: reference.buffer,
          filename: "character_reference.png",
          isSelected: reference.isSelected,
          label: reference.label,
          mimeType: reference.mimeType ?? "image/png"
        }
        : undefined
    );
  } catch (error) {
    if (!isRecoverableImageTimeout(error) || !hasUsableCompositeReferences(input, reference)) {
      throw error;
    }

    return generateReferenceCompositeFallback(scenePrompt, input, visualBible, reference, error);
  }
}

function isReferenceCompositeFallback(generated: { usage?: Record<string, number | string> | undefined }): boolean {
  return generated.usage?.pricingMode === referenceCompositePricingMode;
}

function isRecoverableImageTimeout(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /504|Gateway Timeout|timed out|TimeoutError|AbortError|fetch failed/iu.test(message);
}

function hasUsableCompositeReferences(input: NormalizedImageInput, reference: LoadedReferenceImage | null): boolean {
  return Boolean(reference?.buffer || pickCompositeReference(input.references, ["scene_design", "style_reference", "first_frame", "last_frame"], 1));
}

async function generateReferenceCompositeFallback(
  scenePrompt: SceneImagePrompt,
  input: NormalizedImageInput,
  visualBible: GeneratedVisualBible,
  reference: LoadedReferenceImage | null,
  error: unknown
): Promise<GeneratedOpenAIImage> {
  const backgroundReference = pickCompositeReference(input.references, ["first_frame", "scene_design", "style_reference", "last_frame"], scenePrompt.sceneId);
  const backgroundBuffer = backgroundReference ? await fetchImageUrl(backgroundReference.url) : undefined;
  const characterBuffer = reference?.buffer;

  if (!backgroundBuffer && !characterBuffer) {
    throw error;
  }

  const buffer = await renderReferenceCompositePng({
    backgroundBuffer,
    characterBuffer,
    sceneId: scenePrompt.sceneId
  });
  const originalMessage = error instanceof Error ? error.message : String(error);
  const revisedPrompt = [
    "External OpenAI image generation timed out, so this production image was built from approved reference assets.",
    backgroundReference ? `Background reference: ${backgroundReference.label}.` : "",
    reference?.label ? `Character reference: ${reference.label}.` : "",
    `Scene action: ${scenePrompt.scene.visual}`,
    `Visual continuity: ${formatVisualBibleCharacter(visualBible)}`
  ].filter(Boolean).join(" ");

  return {
    buffer,
    costRM: 0,
    extension: "png",
    revisedPrompt: `${revisedPrompt} Original provider error: ${originalMessage}`,
    usage: {
      pricingMode: referenceCompositePricingMode,
      providerError: originalMessage,
      sceneId: scenePrompt.sceneId,
      size: "1080x1920"
    }
  };
}

function pickCompositeReference(
  references: NormalizedImageInput["references"],
  types: Array<NonNullable<GenerateImagesRequest["references"]>[number]["type"]>,
  sceneId: number
): NonNullable<GenerateImagesRequest["references"]>[number] | undefined {
  const typeSet = new Set(types);
  const candidates = references?.filter((reference) => typeSet.has(reference.type) && reference.url.trim()) ?? [];

  if (candidates.length === 0) {
    return undefined;
  }

  return candidates[(Math.max(1, sceneId) - 1) % candidates.length];
}

async function renderReferenceCompositePng(input: {
  backgroundBuffer?: Buffer | undefined;
  characterBuffer?: Buffer | undefined;
  sceneId: number;
}): Promise<Buffer> {
  const ffmpegPath = resolveFfmpegPath();

  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not provide an FFmpeg binary path for reference composite image generation.");
  }

  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-image-"));
  const outputPath = path.join(tempDirectory, `scene_${String(input.sceneId).padStart(2, "0")}.png`);

  try {
    if (input.backgroundBuffer) {
      await writeFile(path.join(tempDirectory, "background.image"), input.backgroundBuffer);
    }

    if (input.characterBuffer) {
      await writeFile(path.join(tempDirectory, "character.image"), input.characterBuffer);
    }

    const args = buildReferenceCompositeFfmpegArgs({
      backgroundPath: input.backgroundBuffer ? path.join(tempDirectory, "background.image") : undefined,
      characterPath: input.characterBuffer ? path.join(tempDirectory, "character.image") : undefined,
      outputPath
    });

    await runProcess(ffmpegPath, args);
    return await readFile(outputPath);
  } finally {
    await rm(tempDirectory, { force: true, recursive: true });
  }
}

function buildReferenceCompositeFfmpegArgs(input: {
  backgroundPath?: string | undefined;
  characterPath?: string | undefined;
  outputPath: string;
}): string[] {
  if (input.backgroundPath && input.characterPath) {
    return [
      "-y",
      "-i",
      input.backgroundPath,
      "-i",
      input.characterPath,
      "-frames:v",
      "1",
      "-filter_complex",
      [
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=saturation=1.04:contrast=1.03:brightness=-0.015[bg]",
        "[1:v]scale=660:-1:force_original_aspect_ratio=decrease[fg]",
        "[bg][fg]overlay=(W-w)/2:H-h-96:format=auto,format=rgb24"
      ].join(";"),
      input.outputPath
    ];
  }

  if (input.backgroundPath) {
    return [
      "-y",
      "-i",
      input.backgroundPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=rgb24",
      input.outputPath
    ];
  }

  if (input.characterPath) {
    return [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x101827:s=1080x1920:d=1",
      "-i",
      input.characterPath,
      "-frames:v",
      "1",
      "-filter_complex",
      "[1:v]scale=720:-1:force_original_aspect_ratio=decrease[fg];[0:v][fg]overlay=(W-w)/2:H-h-120:format=auto,format=rgb24",
      input.outputPath
    ];
  }

  throw new Error("At least one reference image is required for reference composite image generation.");
}

function buildReferenceCompositeQualityCheck(
  scenePrompt: SceneImagePrompt,
  summary: string | undefined,
  retryCount: number
): GeneratedImageQualityCheck {
  return {
    checkedAt: new Date().toISOString(),
    issues: [
      "OpenAI image generation timed out; scene image was composed from approved reference assets.",
      "Manual review is recommended before final publishing."
    ],
    model: "local-reference-composite",
    retryCount,
    status: "warning",
    summary: summary ?? `Scene ${scenePrompt.sceneId} uses approved character/scene references as a recoverable production composite.`
  };
}

function buildRepairPrompt(originalPrompt: string, qualityCheck: GeneratedImageQualityCheck | undefined): string {
  return [
    originalPrompt,
    "",
    "Regenerate because the previous image failed visual QC.",
    qualityCheck ? `QC summary: ${qualityCheck.summary}` : "",
    qualityCheck?.issues.length ? `Issues to fix: ${qualityCheck.issues.join("; ")}` : "",
    "Fix only the failed visual issues. Preserve the same protagonist identity, wardrobe, scene action, environment, camera, and vertical cinematic still format."
  ].filter(Boolean).join("\n");
}

async function generateWithOpenAI(
  prompt: string,
  options: OpenAIImageClientOptions,
  reference?: { buffer: Buffer; filename: string; isSelected?: boolean | undefined; label?: string | undefined; mimeType: string } | undefined
): Promise<GeneratedOpenAIImage> {
  if (reference) {
    try {
      const edited = await generateEditWithOpenAI(prompt, options, reference);
      return edited;
    } catch (error) {
      if (reference.isSelected) {
        throw new Error(
          [
            `Selected character reference "${reference.label ?? reference.filename}" could not be used by the current image model/API.`,
            "Generation stopped to avoid producing a different character.",
            `Original error: ${error instanceof Error ? error.message : "unknown reference edit error"}`,
            "Use an image model/API style that supports reference image edits, or regenerate the reference as a reachable PNG/JPG/WebP asset."
          ].join(" ")
        );
      }

      // Auto-created internal references are helpful but not authoritative; plain generation is still acceptable when no user-selected asset is being enforced.
    }
  }

  const response = await fetch(`${options.baseUrl.replace(/\/$/u, "")}/images/generations`, {
    body: JSON.stringify({
      model: options.model,
      prompt,
      quality: normalizeImageQuality(options.quality),
      size: options.size
    }),
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json"
    },
    method: "POST",
    signal: createOpenAIImageTimeoutSignal()
  }).catch((error: unknown) => {
    throw normalizeOpenAIImageFetchError(error);
  });
  const body = (await response.json().catch(() => ({}))) as OpenAIImageResponseBody;

  if (!response.ok) {
    throw new Error(`OpenAI image generation failed: ${body.error?.message ?? response.statusText}`);
  }

  const image = body.data?.[0];
  const buffer = image?.b64_json ? Buffer.from(image.b64_json, "base64") : image?.url ? await fetchImageUrl(image.url) : null;

  if (!buffer) {
    throw new Error("OpenAI image generation did not return image data.");
  }

  return {
    buffer,
    costRM: estimateImageCostRM(options.model, options.size, normalizeImageQuality(options.quality), options.usdToMyrRate, body.usage),
    extension: "png",
    revisedPrompt: image?.revised_prompt,
    usage: normalizeOpenAIImageUsage(body.usage, options.size, normalizeImageQuality(options.quality))
  };
}

async function generateEditWithOpenAI(
  prompt: string,
  options: OpenAIImageClientOptions,
  reference: { buffer: Buffer; filename: string; mimeType: string }
): Promise<GeneratedOpenAIImage> {
  const formData = new FormData();
  formData.append("model", options.model);
  formData.append("prompt", prompt);
  formData.append("quality", normalizeImageQuality(options.quality));
  formData.append("size", options.size);
  formData.append("image", new Blob([new Uint8Array(reference.buffer)], { type: reference.mimeType }), reference.filename);

  const response = await fetch(`${options.baseUrl.replace(/\/$/u, "")}/images/edits`, {
    body: formData,
    headers: {
      Authorization: `Bearer ${options.apiKey}`
    },
    method: "POST",
    signal: createOpenAIImageTimeoutSignal()
  }).catch((error: unknown) => {
    throw normalizeOpenAIImageFetchError(error);
  });
  const body = (await response.json().catch(() => ({}))) as OpenAIImageResponseBody;

  if (!response.ok) {
    throw new Error(`OpenAI reference image edit failed: ${body.error?.message ?? response.statusText}`);
  }

  const image = body.data?.[0];
  const buffer = image?.b64_json ? Buffer.from(image.b64_json, "base64") : image?.url ? await fetchImageUrl(image.url) : null;

  if (!buffer) {
    throw new Error("OpenAI reference image edit did not return image data.");
  }

  return {
    buffer,
    costRM: estimateImageCostRM(options.model, options.size, normalizeImageQuality(options.quality), options.usdToMyrRate, body.usage),
    extension: "png",
    revisedPrompt: image?.revised_prompt,
    usage: normalizeOpenAIImageUsage(body.usage, options.size, normalizeImageQuality(options.quality))
  };
}

async function runImageQualityCheck(
  imageBuffer: Buffer,
  scenePrompt: SceneImagePrompt,
  visualBible: GeneratedVisualBible,
  options: OpenAIImageClientOptions,
  retryCount: number
): Promise<GeneratedImageQualityCheck> {
  const checkedAt = new Date().toISOString();

  if (!options.apiKey) {
    return {
      checkedAt,
      issues: ["Local fallback image was not inspected by vision QC."],
      model: "local-qc",
      retryCount,
      status: "warning",
      summary: "Local fallback image generated for tests only."
    };
  }

  try {
    const response = await fetch(`${options.baseUrl.replace(/\/$/u, "")}/responses`, {
      body: JSON.stringify({
        input: [
          {
            content: [
              {
                text: buildImageQcPrompt(scenePrompt, visualBible),
                type: "input_text"
              },
              {
                detail: "low",
                image_url: `data:image/png;base64,${imageBuffer.toString("base64")}`,
                type: "input_image"
              }
            ],
            role: "user"
          }
        ],
        max_output_tokens: 500,
        model: options.visionModel ?? "gpt-4.1-mini",
        text: {
          format: {
            name: "image_quality_check",
            schema: imageQualityCheckJsonSchema,
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
    const body = (await response.json().catch(() => ({}))) as OpenAIResponseBody;

    if (!response.ok) {
      return {
        checkedAt,
        issues: [body.error?.message ?? response.statusText],
        model: options.visionModel ?? "gpt-4.1-mini",
        retryCount,
        status: "warning",
        summary: "Vision QC could not run; manual review recommended."
      };
    }

    return normalizeImageQualityCheck(JSON.parse(extractResponseText(body)) as Partial<GeneratedImageQualityCheck>, options.visionModel ?? "gpt-4.1-mini", retryCount, checkedAt);
  } catch (error) {
    return {
      checkedAt,
      issues: [error instanceof Error ? error.message : "Unknown vision QC error."],
      model: options.visionModel ?? "gpt-4.1-mini",
      retryCount,
      status: "warning",
      summary: "Vision QC could not parse its result; manual review recommended."
    };
  }
}

function buildImageQcPrompt(scenePrompt: SceneImagePrompt, visualBible: GeneratedVisualBible): string {
  return [
    "Evaluate whether this generated image is production-ready for the requested scene.",
    "Return pass only if the image is a single coherent vertical cinematic still, has no visible text/UI/table/panel/collage, matches the scene action, and preserves the same selected reference character identity.",
    `Scene ${scenePrompt.sceneId}: ${scenePrompt.scene.visual}`,
    `Narration: ${scenePrompt.scene.voiceText}`,
    `Generation constraints: ${scenePrompt.prompt}`,
    `Expected protagonist: ${formatVisualBibleCharacter(visualBible)}`,
    `Expected environment: ${formatVisualBibleEnvironment(visualBible)}`,
    "If the image contains storyboard sheets, readable text, multiple unrelated panels, wrong setting, wrong selected character, wrong species/body type, wrong hair/wardrobe/color palette, or inconsistent face, return fail."
  ].join("\n");
}

const imageQualityCheckJsonSchema = {
  additionalProperties: false,
  properties: {
    issues: {
      items: { type: "string" },
      type: "array"
    },
    status: {
      enum: ["pass", "warning", "fail"],
      type: "string"
    },
    summary: { type: "string" }
  },
  required: ["status", "summary", "issues"],
  type: "object"
};

function normalizeImageQualityCheck(
  check: Partial<GeneratedImageQualityCheck>,
  model: string,
  retryCount: number,
  checkedAt: string
): GeneratedImageQualityCheck {
  return {
    checkedAt,
    issues: check.issues?.map((issue) => issue.trim()).filter(Boolean) ?? [],
    model,
    retryCount,
    status: check.status === "pass" || check.status === "fail" || check.status === "warning" ? check.status : "warning",
    summary: check.summary?.trim() || "Vision QC completed."
  };
}

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
    throw new Error("OpenAI vision QC response did not include output text.");
  }

  return outputText;
}

async function fetchImageUrl(url: string): Promise<Buffer> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`OpenAI image URL fetch failed with HTTP ${response.status}.`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function createOpenAIImageTimeoutSignal(): AbortSignal {
  return AbortSignal.timeout(readOpenAIImageTimeoutMs());
}

function readOpenAIImageTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.OPENAI_IMAGE_TIMEOUT_MS ?? "45000", 10);

  if (!Number.isFinite(parsed)) {
    return 45000;
  }

  return Math.max(15000, Math.min(parsed, 240000));
}

function normalizeOpenAIImageFetchError(error: unknown): Error {
  if (error instanceof Error && /AbortError|TimeoutError/iu.test(error.name)) {
    return new Error(`OpenAI image request timed out after ${readOpenAIImageTimeoutMs()}ms.`);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

function resolveFfmpegPath(): string | null {
  const require = createRequire(import.meta.url);
  return require("ffmpeg-static") as string | null;
}

async function runProcess(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"]
    });
    const stderr: string[] = [];

    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk.toString("utf8"));
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`FFmpeg exited with code ${code ?? "unknown"}: ${stderr.join("").slice(-800)}`));
    });
  });
}

function normalizeInput(input: GenerateImagesRequest): NormalizedImageInput {
  const topic = input.topic.trim();
  const prompt = input.prompt.trim();

  if (!topic) {
    throw new Error("topic is required.");
  }

  if (!prompt) {
    throw new Error("prompt is required.");
  }

  const normalized: NormalizedImageInput = {
    costLimitRM: input.costLimitRM,
    language: input.language,
    prompt,
    references: input.references?.filter((reference) => reference.url.trim()).slice(0, 8),
    sceneCount: Math.max(1, Math.min(7, Math.round(input.sceneCount))),
    templateType: input.templateType,
    topic
  };

  if (input.character) {
    normalized.character = input.character;
  }

  if (input.jobId?.trim()) {
    normalized.jobId = input.jobId.trim();
  }

  return normalized;
}

function normalizeReferenceDesignInput(input: GenerateReferenceDesignRequest): NormalizedReferenceDesignInput {
  const normalized = normalizeInput(input);
  const sceneId = input.sceneId === undefined || input.sceneId === null
    ? undefined
    : Math.max(1, Math.min(normalized.sceneCount, Math.round(Number(input.sceneId) || 1)));

  return {
    ...normalized,
    designType: input.designType === "scene_design" ? "scene_design" : "character_design",
    sceneId
  };
}

function buildLocalScenes(input: NormalizedImageInput): GeneratedStoryboardScene[] {
  return Array.from({ length: input.sceneCount }, (_, index) => {
    const sceneId = index + 1;

    return {
      camera: sceneId % 2 === 0 ? "medium reaction shot" : "vertical establishing shot",
      durationSeconds: Math.floor(45 / input.sceneCount),
      imagePrompt: `Single cinematic still for ${input.topic}, scene ${sceneId}, same adult protagonist, no text`,
      sceneId,
      sfx: sceneId === input.sceneCount ? ["soft resolve"] : ["room tone"],
      visual: `${input.topic}, scene ${sceneId}, ${buildSceneBeat(sceneId, input.sceneCount)}`,
      voiceText: `Scene ${sceneId} narration for ${input.topic}.`
    };
  });
}

function normalizeVisualBible(
  visualBible: Partial<GeneratedVisualBible> | undefined,
  input: NormalizedImageInput,
  scenes: GeneratedStoryboardScene[]
): GeneratedVisualBible {
  const fallback = buildFallbackVisualBible(input, scenes);
  const character = input.character
    ? {
      ...fallback.character,
      name: input.character.name,
      role: `fictional lead for ${input.topic}`,
      signatureDetails: input.character.visualIdentity,
      wardrobe: input.character.referenceNotes || fallback.character.wardrobe
    }
    : visualBible?.character;
  const environment = visualBible?.environment;

  return {
    character: {
      ageRange: character?.ageRange?.trim() || fallback.character.ageRange,
      bodyType: character?.bodyType?.trim() || fallback.character.bodyType,
      expressionRange: character?.expressionRange?.trim() || fallback.character.expressionRange,
      fixedProps: normalizeStringList(character?.fixedProps, fallback.character.fixedProps),
      hair: character?.hair?.trim() || fallback.character.hair,
      name: character?.name?.trim() || fallback.character.name,
      role: character?.role?.trim() || fallback.character.role,
      signatureDetails: character?.signatureDetails?.trim() || fallback.character.signatureDetails,
      wardrobe: character?.wardrobe?.trim() || fallback.character.wardrobe
    },
    environment: {
      keyObjects: normalizeStringList(environment?.keyObjects, fallback.environment.keyObjects),
      lighting: environment?.lighting?.trim() || fallback.environment.lighting,
      location: environment?.location?.trim() || fallback.environment.location,
      palette: environment?.palette?.trim() || fallback.environment.palette,
      recurringDetails: environment?.recurringDetails?.trim() || fallback.environment.recurringDetails
    },
    negativePrompt: visualBible?.negativePrompt?.trim() || fallback.negativePrompt,
    style: visualBible?.style?.trim() || fallback.style
  };
}

function normalizeStringList(value: string[] | undefined, fallback: string[]): string[] {
  const normalized = value?.map((item) => item.trim()).filter(Boolean) ?? [];
  return normalized.length > 0 ? normalized : fallback;
}

function buildFallbackVisualBible(input: NormalizedImageInput, scenes: GeneratedStoryboardScene[]): GeneratedVisualBible {
  const firstScene = scenes[0]?.visual ?? input.topic;

  return {
    character: {
      ageRange: "adult, late 20s to late 30s",
      bodyType: "average build, realistic fictional person",
      expressionRange: "consistent face with scene-appropriate expressions",
      fixedProps: inferKeyObjects(`${input.topic} ${firstScene}`).slice(0, 2),
      hair: "short dark hair, same hairline in every scene",
      name: "Main protagonist",
      role: `fictional lead for ${input.topic}`,
      signatureDetails: "same face, skin tone, hair, body type, and recognizable silhouette across all images",
      wardrobe: getTemplateWardrobe(input.templateType)
    },
    environment: {
      keyObjects: inferKeyObjects(`${input.topic} ${firstScene}`),
      lighting: getTemplateLighting(input.templateType),
      location: firstScene,
      palette: getTemplatePalette(input.templateType),
      recurringDetails: `Keep every scene visually connected to ${input.topic}; reuse the same protagonist, location logic, props, palette, and lighting.`
    },
    negativePrompt: "no text, no captions, no subtitles, no logos, no watermark, no UI, no tables, no storyboard sheet, no comic panels, no collage, no duplicated protagonist, no identity drift, no wardrobe changes",
    style: getTemplateVisualStyle(input.templateType)
  };
}

function formatVisualBibleCharacter(visualBible: GeneratedVisualBible): string {
  return [
    `${visualBible.character.name}, ${visualBible.character.role}`,
    visualBible.character.ageRange,
    visualBible.character.bodyType,
    visualBible.character.hair,
    visualBible.character.wardrobe,
    visualBible.character.signatureDetails,
    visualBible.character.fixedProps.length ? `fixed props: ${visualBible.character.fixedProps.join(", ")}` : "",
    `expression range: ${visualBible.character.expressionRange}`
  ].filter(Boolean).join("; ");
}

function formatVisualBibleEnvironment(visualBible: GeneratedVisualBible): string {
  return [
    visualBible.environment.location,
    `lighting: ${visualBible.environment.lighting}`,
    `palette: ${visualBible.environment.palette}`,
    visualBible.environment.keyObjects.length ? `key objects: ${visualBible.environment.keyObjects.join(", ")}` : "",
    visualBible.environment.recurringDetails
  ].filter(Boolean).join("; ");
}

function buildSceneBeat(sceneId: number, sceneCount: number): string {
  if (sceneId === 1) {
    return "establish the location, central object, and first story hook";
  }

  if (sceneId === sceneCount) {
    return "final payoff, twist, joke, or emotional reveal";
  }

  return sceneId % 2 === 0 ? "escalate the situation with a clear visual action" : "show a new detail that changes how the audience reads the story";
}

function getTemplateVisualStyle(templateType: ContentTemplateType): string {
  const styles: Record<ContentTemplateType, string> = {
    comedy_sketch: "bright modern comedy, expressive fictional adult protagonist, clean practical setting, warm daylight, vertical 9:16 composition",
    fairy_tale: "whimsical original storybook fantasy, soft glowing light, cozy magical details, all-ages friendly, vertical 9:16 composition",
    romance_story: "warm cinematic romance, soft natural light, gentle rain reflections or cozy interiors, intimate but restrained, vertical 9:16 composition",
    rules_horror: "analog horror, low light, cinematic shadows, tense atmosphere, low gore, vertical 9:16 composition",
    surveillance_horror: "CCTV suspense, low light, monitor glow, realistic security camera angle, tense atmosphere, vertical 9:16 composition",
    urban_legend: "modern urban mystery, cinematic night street or transit setting, moody low-violence suspense, vertical 9:16 composition"
  };

  return styles[templateType];
}

function getTemplateWardrobe(templateType: ContentTemplateType): string {
  const wardrobes: Record<ContentTemplateType, string> = {
    comedy_sketch: "same casual light jacket over a plain shirt, everyday outfit",
    fairy_tale: "same original simple travel cloak and tunic, no copyrighted costume",
    romance_story: "same warm neutral coat over a soft shirt",
    rules_horror: "same dark casual jacket and plain shirt",
    surveillance_horror: "same dark casual jacket and plain shirt",
    urban_legend: "same modern streetwear jacket and plain shirt"
  };

  return wardrobes[templateType];
}

function getTemplateLighting(templateType: ContentTemplateType): string {
  if (templateType === "comedy_sketch") {
    return "bright warm practical daylight";
  }

  if (templateType === "romance_story" || templateType === "fairy_tale") {
    return "soft warm cinematic practical light";
  }

  return "low key cinematic practical light, suspenseful but readable";
}

function getTemplatePalette(templateType: ContentTemplateType): string {
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

function inferKeyObjects(text: string): string[] {
  const normalized = text.toLowerCase();
  const objects = [
    normalized.includes("kitchen") || normalized.includes("cooking") || normalized.includes("pot") ? "same cooking pot" : "",
    normalized.includes("phone") ? "same phone" : "",
    normalized.includes("store") || normalized.includes("convenience") ? "same storefront shape without readable text" : "",
    normalized.includes("elevator") ? "same elevator panel without readable text" : "",
    normalized.includes("rain") ? "rain reflections" : "",
    normalized.includes("letter") || normalized.includes("note") ? "same folded note" : "",
    normalized.includes("dog") ? "same small background dog shape only if safe and non-threatening" : ""
  ].filter(Boolean);

  return objects.length > 0 ? objects : ["central story object", "recurring background detail"];
}

function normalizeImageQuality(quality: string): string {
  return quality === "high" || quality === "medium" || quality === "low" ? quality : "medium";
}

function normalizeOpenAIImageUsage(usage: OpenAIImageUsage | undefined, size: string, quality: string): Record<string, number | string> | undefined {
  if (!usage) {
    return {
      pricingMode: "fallback_fixed_image_estimate",
      quality,
      size
    };
  }

  const imageInputTokens = usage.input_tokens_details?.image_tokens ?? 0;
  const textInputTokens = usage.input_tokens_details?.text_tokens ?? Math.max((usage.input_tokens ?? 0) - imageInputTokens, 0);
  const outputTokens = usage.output_tokens ?? 0;

  return {
    imageInputTokens,
    inputTokens: usage.input_tokens ?? imageInputTokens + textInputTokens,
    outputTokens,
    pricingMode: "token_usage",
    quality,
    size,
    textInputTokens,
    totalTokens: usage.total_tokens ?? imageInputTokens + textInputTokens + outputTokens
  };
}

function estimateImageCostRM(model: string, size: string, quality: string, usdToMyrRate: number, usage?: OpenAIImageUsage | undefined): number {
  const tokenRates = getOpenAIImageTokenRates(model);
  if (usage && tokenRates) {
    const imageInputTokens = usage.input_tokens_details?.image_tokens ?? 0;
    const textInputTokens = usage.input_tokens_details?.text_tokens ?? Math.max((usage.input_tokens ?? 0) - imageInputTokens, 0);
    const outputTokens = usage.output_tokens ?? 0;
    const usd =
      imageInputTokens / 1_000_000 * tokenRates.imageInputUsdPer1M +
      textInputTokens / 1_000_000 * tokenRates.textInputUsdPer1M +
      outputTokens / 1_000_000 * tokenRates.imageOutputUsdPer1M;

    return Number((usd * usdToMyrRate).toFixed(4));
  }

  if (!model.startsWith("gpt-image-1")) {
    return 0;
  }

  const byQuality: Record<string, Record<string, number>> = {
    high: { "1024x1024": 0.167, "1024x1536": 0.25, "1536x1024": 0.25 },
    low: { "1024x1024": 0.011, "1024x1536": 0.016, "1536x1024": 0.016 },
    medium: { "1024x1024": 0.042, "1024x1536": 0.063, "1536x1024": 0.063 }
  };
  const lowQuality = byQuality.low!;
  const usd = byQuality[quality]?.[size] ?? lowQuality["1024x1536"]!;
  return Number((usd * usdToMyrRate).toFixed(4));
}

function getOpenAIImageTokenRates(model: string): { imageInputUsdPer1M: number; imageOutputUsdPer1M: number; textInputUsdPer1M: number } | null {
  if (model === "gpt-image-2" || model.startsWith("gpt-image-2-")) {
    return {
      imageInputUsdPer1M: 8,
      imageOutputUsdPer1M: 30,
      textInputUsdPer1M: 5
    };
  }

  if (model === "gpt-image-1.5" || model.startsWith("gpt-image-1.5-") || model === "chatgpt-image-latest") {
    return {
      imageInputUsdPer1M: 8,
      imageOutputUsdPer1M: 32,
      textInputUsdPer1M: 5
    };
  }

  if (model === "gpt-image-1-mini" || model.startsWith("gpt-image-1-mini-")) {
    return {
      imageInputUsdPer1M: 2.5,
      imageOutputUsdPer1M: 8,
      textInputUsdPer1M: 2
    };
  }

  return null;
}

function createLocalSvg(sceneId: number, topic: string, prompt: string, visualBible: GeneratedVisualBible): string {
  const accent = sceneId % 2 === 0 ? "#2563eb" : "#14b8a6";

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536">',
    '<rect width="1024" height="1536" fill="#101826"/>',
    `<rect x="48" y="48" width="928" height="1440" fill="#121a2a" stroke="#263348" stroke-width="3"/>`,
    `<rect x="72" y="88" width="880" height="12" fill="${accent}"/>`,
    '<circle cx="512" cy="520" r="150" fill="#334155"/>',
    '<rect x="390" y="680" width="244" height="420" rx="56" fill="#475569"/>',
    `<text x="72" y="1240" font-family="Arial, sans-serif" font-size="24" fill="#e2e8f0">${escapeXml(visualBible.character.name).slice(0, 42)}</text>`,
    `<text x="72" y="1290" font-family="Arial, sans-serif" font-size="22" fill="#94a3b8">${escapeXml(topic).slice(0, 56)}</text>`,
    `<text x="72" y="1340" font-family="Arial, sans-serif" font-size="18" fill="#94a3b8">${escapeXml(prompt).slice(0, 96)}</text>`,
    "</svg>"
  ].join("");
}

function createLocalReferenceSvg(topic: string, visualBible: GeneratedVisualBible): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536">',
    '<rect width="1024" height="1536" fill="#0f172a"/>',
    '<circle cx="512" cy="450" r="170" fill="#334155"/>',
    '<rect x="340" y="650" width="344" height="520" rx="80" fill="#475569"/>',
    '<rect x="72" y="96" width="880" height="12" fill="#38bdf8"/>',
    `<text x="96" y="1270" font-family="Arial, sans-serif" font-size="34" fill="#f8fafc">${escapeXml(visualBible.character.name).slice(0, 42)}</text>`,
    `<text x="96" y="1330" font-family="Arial, sans-serif" font-size="22" fill="#cbd5e1">${escapeXml(topic).slice(0, 56)}</text>`,
    "</svg>"
  ].join("");
}

function createLocalReferenceDesignSvg(
  input: NormalizedReferenceDesignInput,
  visualBible: GeneratedVisualBible,
  scene: GeneratedStoryboardScene | undefined
): string {
  const accent = input.designType === "character_design" ? "#38bdf8" : "#22c55e";
  const label = input.designType === "character_design" ? "Character design" : scene ? `Scene ${scene.sceneId} environment sheet` : "Environment design sheet";
  const description = input.designType === "character_design" ? formatVisualBibleCharacter(visualBible) : formatVisualBibleEnvironment(visualBible);

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536">',
    '<rect width="1024" height="1536" fill="#0f172a"/>',
    `<rect x="48" y="48" width="928" height="1440" rx="36" fill="#111827" stroke="${accent}" stroke-width="4"/>`,
    `<rect x="88" y="104" width="848" height="12" fill="${accent}"/>`,
    input.designType === "character_design"
      ? '<circle cx="512" cy="440" r="150" fill="#334155"/><rect x="350" y="640" width="324" height="540" rx="92" fill="#475569"/><rect x="404" y="760" width="216" height="44" rx="22" fill="#64748b"/>'
      : '<rect x="120" y="260" width="360" height="300" rx="24" fill="#1f2937"/><rect x="544" y="260" width="320" height="300" rx="24" fill="#243244"/><rect x="120" y="620" width="300" height="230" rx="24" fill="#334155"/><rect x="460" y="620" width="180" height="230" rx="24" fill="#475569"/><rect x="684" y="620" width="180" height="230" rx="24" fill="#64748b"/><rect x="120" y="910" width="744" height="190" rx="24" fill="#1f2937"/><circle cx="794" cy="218" r="62" fill="#64748b"/>',
    `<text x="96" y="1240" font-family="Arial, sans-serif" font-size="34" fill="#f8fafc">${escapeXml(label).slice(0, 48)}</text>`,
    `<text x="96" y="1302" font-family="Arial, sans-serif" font-size="24" fill="#cbd5e1">${escapeXml(input.topic).slice(0, 58)}</text>`,
    `<text x="96" y="1362" font-family="Arial, sans-serif" font-size="18" fill="#94a3b8">${escapeXml(description).slice(0, 110)}</text>`,
    "</svg>"
  ].join("");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toGeneratedObject(object: StoredObject): GeneratedStorageObject {
  return {
    driver: object.driver,
    fallbackReason: object.fallbackReason,
    localPath: object.localPath,
    publicUrl: object.publicUrl,
    storagePath: object.storagePath
  };
}
