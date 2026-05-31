import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import type {
  ContentTemplateType,
  GenerateVideoRequest,
  GenerateVideoResponse,
  GeneratedScript,
  GeneratedStoryboardScene
} from "@ai-content-factory/shared-types";
import type { StorageAdapter, StoredObject } from "@ai-content-factory/storage";
import { MissingGenerationDependencyError } from "../../errors.js";

export interface ComposeVideoInput {
  bgmAudioPath?: string | undefined;
  durationSeconds: number;
  sceneClipPaths?: Array<string | null> | undefined;
  outputPath: string;
  sceneFramePaths?: string[] | undefined;
  scenes?: GeneratedStoryboardScene[] | undefined;
  subtitlePath?: string | undefined;
  voiceoverAudioPath?: string | undefined;
}

export type ComposeVideo = (input: ComposeVideoInput) => Promise<void>;

export interface VideoGenerationServiceOptions {
  allowMockContent?: boolean | undefined;
  composeVideo?: ComposeVideo | undefined;
  storage: StorageAdapter;
}

export interface VideoGenerationService {
  generateVideo(input: GenerateVideoRequest): Promise<GenerateVideoResponse>;
}

interface NormalizedGenerateVideoInput extends Omit<GenerateVideoRequest, "durationSeconds" | "jobId"> {
  durationSeconds: number;
  jobId?: string;
}

export function createVideoGenerationService(options: VideoGenerationServiceOptions): VideoGenerationService {
  const composeVideo = options.composeVideo ?? composeLocalMp4;
  const allowMockContent = options.allowMockContent ?? false;

  return {
    async generateVideo(input: GenerateVideoRequest): Promise<GenerateVideoResponse> {
      const normalizedInput = normalizeGenerateVideoInput(input);
      const jobId = normalizedInput.jobId ?? `job_${crypto.randomUUID().slice(0, 8)}`;
      const basePath = `jobs/${jobId}`;
      const generatedContent = await loadGeneratedContent(options.storage, basePath, normalizedInput, allowMockContent);
      const script = generatedContent.script;
      const sceneImages: StoredObject[] = [];
      const voiceoverAudio = findExistingVoiceoverAudio(options.storage, basePath);
      const bgmAudio = findExistingBgmAudio(options.storage, basePath);
      const narrationDurationSeconds = voiceoverAudio ? await probeMediaDurationSeconds(resolveFfmpegPath(), voiceoverAudio.localPath) : normalizedInput.durationSeconds;
      const storyboard = voiceoverAudio ? alignStoryboardToNarration(generatedContent.storyboard, narrationDurationSeconds) : generatedContent.storyboard;
      const subtitles = buildSrt(storyboard);
      const soundEffects = buildSoundEffectsManifest(storyboard);

      const scriptObject = await options.storage.writeFile(`${basePath}/script.json`, JSON.stringify(script, null, 2));
      const storyboardObject = await options.storage.writeFile(`${basePath}/storyboard.json`, JSON.stringify({ scenes: storyboard }, null, 2));
      const subtitlesObject = await options.storage.writeFile(`${basePath}/subtitles.srt`, subtitles);
      const voiceoverObject = voiceoverAudio?.object ?? await options.storage.writeFile(`${basePath}/voiceover.txt`, script.voiceover);
      const soundEffectsObject = await options.storage.writeFile(`${basePath}/sfx.json`, JSON.stringify(soundEffects, null, 2));

      if (!voiceoverAudio && !allowMockContent) {
        throw new MissingGenerationDependencyError("Missing generated voiceover audio. Run Generate voiceover first; video compose will not use mock narration or silent audio.");
      }

      const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-"));
      const sceneClips: StoredObject[] = [];
      const sceneClipPaths: Array<string | null> = [];
      const sceneFramePaths: string[] = [];

      for (const scene of storyboard) {
        const existingImage = findExistingSceneImage(options.storage, basePath, scene.sceneId);
        const existingClip = findExistingSceneClip(options.storage, basePath, scene.sceneId);

        if (existingClip) {
          sceneClips.push(existingClip.object);
          sceneClipPaths.push(existingClip.localPath);
        } else {
          sceneClipPaths.push(null);
        }

        if (existingImage) {
          sceneImages.push(existingImage.object);
          sceneFramePaths.push(existingImage.localPath);
          continue;
        }

        if (!allowMockContent) {
          throw new MissingGenerationDependencyError(`Missing generated image for scene ${scene.sceneId}. Run Generate images first; video compose will not create mock scene art.`);
        }

        sceneImages.push(await options.storage.writeFile(`${basePath}/images/scene_${String(scene.sceneId).padStart(2, "0")}.svg`, createSceneSvg(scene, normalizedInput.topic)));
        sceneFramePaths.push(await writeSceneBmp(tempDirectory, scene, normalizedInput.topic));
      }

      const tempOutputPath = path.join(tempDirectory, `${jobId}.mp4`);
      await composeVideo({
        durationSeconds: narrationDurationSeconds,
        outputPath: tempOutputPath,
        bgmAudioPath: bgmAudio?.localPath,
        sceneClipPaths,
        sceneFramePaths,
        scenes: storyboard,
        subtitlePath: subtitlesObject.localPath,
        voiceoverAudioPath: voiceoverAudio?.localPath
      });
      const finalVideoObject = await options.storage.copyFile(tempOutputPath, `${basePath}/final/video.mp4`);

      return {
        artifacts: {
          finalVideo: toGeneratedObject(finalVideoObject),
          sceneClips: sceneClips.length > 0 ? sceneClips.map(toGeneratedObject) : undefined,
          sceneImages: sceneImages.map(toGeneratedObject),
          script: toGeneratedObject(scriptObject),
          soundEffects: toGeneratedObject(soundEffectsObject),
          storyboard: toGeneratedObject(storyboardObject),
          subtitles: toGeneratedObject(subtitlesObject),
          voiceover: toGeneratedObject(voiceoverObject)
        },
        costRM: 0,
        durationSeconds: Number(narrationDurationSeconds.toFixed(3)),
        jobId,
        script,
        status: "COMPOSED",
        storyboard,
        storage: {
          driver: finalVideoObject.driver,
          fallbackReason: finalVideoObject.fallbackReason,
          rootPath: options.storage.rootDir
        }
      };
    }
  };
}

async function loadGeneratedContent(
  storage: StorageAdapter,
  basePath: string,
  input: NormalizedGenerateVideoInput,
  allowMockContent: boolean
): Promise<{ script: GeneratedScript; storyboard: GeneratedStoryboardScene[] }> {
  const scriptPath = storage.resolveLocalPath(`${basePath}/script.json`);
  const storyboardPath = storage.resolveLocalPath(`${basePath}/storyboard.json`);

  if (existsSync(scriptPath) && existsSync(storyboardPath)) {
    return {
      script: parseScriptJson(await readFile(scriptPath, "utf8")),
      storyboard: parseStoryboardJson(await readFile(storyboardPath, "utf8"))
    };
  }

  if (allowMockContent) {
    const script = buildScript(input);
    return {
      script,
      storyboard: buildStoryboard(input, script)
    };
  }

  throw new MissingGenerationDependencyError("Missing generated script/storyboard artifacts. Run Generate script/story first; video compose will not invent mock copy or storyboard data.");
}

function parseScriptJson(rawJson: string): GeneratedScript {
  const parsed = JSON.parse(rawJson) as Partial<GeneratedScript>;

  if (!parsed.title || !parsed.hook || !parsed.voiceover) {
    throw new MissingGenerationDependencyError("Generated script artifact is incomplete. Regenerate script/story before composing video.");
  }

  return {
    hook: parsed.hook,
    title: parsed.title,
    voiceover: parsed.voiceover
  };
}

function parseStoryboardJson(rawJson: string): GeneratedStoryboardScene[] {
  const parsed = JSON.parse(rawJson) as { scenes?: GeneratedStoryboardScene[] } | GeneratedStoryboardScene[];
  const scenes = Array.isArray(parsed) ? parsed : parsed.scenes;

  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new MissingGenerationDependencyError("Generated storyboard artifact is missing scenes. Regenerate script/story before composing video.");
  }

  return scenes;
}

function alignStoryboardToNarration(storyboard: GeneratedStoryboardScene[], narrationDurationSeconds: number): GeneratedStoryboardScene[] {
  const safeDuration = Math.max(1, narrationDurationSeconds);
  const weights = storyboard.map((scene) => speechWeight(scene.voiceText));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || storyboard.length || 1;
  const minimumDuration = safeDuration >= storyboard.length ? 0.85 : Math.max(0.25, safeDuration / Math.max(1, storyboard.length) * 0.5);
  const rawDurations = weights.map((weight) => Math.max(minimumDuration, safeDuration * (weight / weightTotal)));
  const scale = safeDuration / rawDurations.reduce((sum, duration) => sum + duration, 0);

  return storyboard.map((scene, index) => ({
    ...scene,
    durationSeconds: Number((rawDurations[index]! * scale).toFixed(3))
  }));
}

function speechWeight(text: string): number {
  const normalized = text.replace(/\s+/gu, "");
  const cjkCount = (normalized.match(/[\u3400-\u9fff]/gu) ?? []).length;
  const latinWordCount = (text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?/gu) ?? []).length;
  const punctuationPauses = (text.match(/[，,。.!?！？；;：:]/gu) ?? []).length * 2;

  return Math.max(1, cjkCount + latinWordCount * 4 + punctuationPauses);
}

function findExistingSceneImage(storage: StorageAdapter, basePath: string, sceneId: number): { localPath: string; object: StoredObject } | null {
  const sceneName = `scene_${String(sceneId).padStart(2, "0")}`;
  const candidates = [`${basePath}/images/${sceneName}.png`, `${basePath}/images/${sceneName}.jpg`, `${basePath}/images/${sceneName}.jpeg`, `${basePath}/images/${sceneName}.webp`];

  for (const candidate of candidates) {
    const localPath = storage.resolveLocalPath(candidate);

    if (existsSync(localPath)) {
      return {
        localPath,
        object: storage.getFile(candidate)
      };
    }
  }

  return null;
}

function findExistingSceneClip(storage: StorageAdapter, basePath: string, sceneId: number): { localPath: string; object: StoredObject } | null {
  const sceneName = `scene_${String(sceneId).padStart(2, "0")}`;
  const candidates = [`${basePath}/clips/${sceneName}_seedance.mp4`, `${basePath}/clips/${sceneName}.mp4`, `${basePath}/clips/${sceneName}.mov`, `${basePath}/clips/${sceneName}.webm`];

  for (const candidate of candidates) {
    const localPath = storage.resolveLocalPath(candidate);

    if (existsSync(localPath)) {
      return {
        localPath,
        object: storage.getFile(candidate)
      };
    }
  }

  return null;
}

function findExistingVoiceoverAudio(storage: StorageAdapter, basePath: string): { localPath: string; object: StoredObject } | null {
  const candidates = [
    `${basePath}/audio/voiceover.mp3`,
    `${basePath}/audio/voiceover.wav`,
    `${basePath}/audio/voiceover.m4a`,
    `${basePath}/audio/voiceover.aac`,
    `${basePath}/audio/voiceover.opus`,
    `${basePath}/audio/voiceover.flac`,
    `${basePath}/voiceover.mp3`,
    `${basePath}/voiceover.wav`
  ];

  for (const candidate of candidates) {
    const localPath = storage.resolveLocalPath(candidate);

    if (existsSync(localPath)) {
      return {
        localPath,
        object: storage.getFile(candidate)
      };
    }
  }

  return null;
}

function findExistingBgmAudio(storage: StorageAdapter, basePath: string): { localPath: string; object: StoredObject } | null {
  const candidates = [
    `${basePath}/audio/bgm.mp3`,
    `${basePath}/audio/bgm.wav`,
    `${basePath}/audio/bgm.m4a`,
    `${basePath}/audio/bgm.aac`,
    `${basePath}/audio/bgm.ogg`,
    `${basePath}/audio/bgm.opus`,
    `${basePath}/audio/bgm.flac`
  ];

  for (const candidate of candidates) {
    const localPath = storage.resolveLocalPath(candidate);

    if (existsSync(localPath)) {
      return {
        localPath,
        object: storage.getFile(candidate)
      };
    }
  }

  return null;
}

export async function composeLocalMp4(input: ComposeVideoInput): Promise<void> {
  const ffmpegPath = resolveFfmpegPath();

  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not provide an FFmpeg binary path.");
  }

  await mkdir(path.dirname(input.outputPath), { recursive: true });

  if (input.sceneFramePaths?.length && input.scenes?.length) {
    await composeSlideshowMp4(ffmpegPath, input);
    return;
  }

  const audioInputArgs = input.voiceoverAudioPath
    ? ["-i", input.voiceoverAudioPath]
    : [
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100"
      ];
  const bgmInputArgs = input.bgmAudioPath ? ["-stream_loop", "-1", "-i", input.bgmAudioPath] : [];
  const subtitleVideoFilterArgs = input.subtitlePath ? ["-vf", buildSubtitleFilter(input.subtitlePath)] : [];
  const audioFilterArgs =
    input.voiceoverAudioPath && input.bgmAudioPath
      ? [
          "-filter_complex",
          `[2:a]volume=0.16,atrim=0:${input.durationSeconds}[bgm];[1:a]volume=1.0[voice];[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]`,
          "-map",
          "0:v",
          "-map",
          "[a]"
        ]
      : ["-af", input.voiceoverAudioPath ? "apad,volume=1.0" : "volume=0.08"];
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x101826:s=1080x1920:r=30:d=${input.durationSeconds}`,
    ...audioInputArgs,
    ...bgmInputArgs,
    ...subtitleVideoFilterArgs,
    ...audioFilterArgs,
    "-shortest",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    input.outputPath
  ];

  await runProcess(ffmpegPath, args);
}

async function probeMediaDurationSeconds(ffmpegPath: string | null, filePath: string): Promise<number> {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not provide an FFmpeg binary path.");
  }

  const stderr = await runProcessForStderr(ffmpegPath, ["-hide_banner", "-i", filePath]);
  const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/u);

  if (!durationMatch) {
    throw new Error("Unable to read generated voiceover audio duration. Regenerate voiceover before composing video.");
  }

  const [, hours, minutes, seconds] = durationMatch;
  const durationSeconds = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Generated voiceover audio duration is invalid. Regenerate voiceover before composing video.");
  }

  return durationSeconds;
}

async function composeSlideshowMp4(ffmpegPath: string, input: ComposeVideoInput): Promise<void> {
  const workDirectory = path.dirname(input.outputPath);
  const listPath = path.join(workDirectory, "segments.txt");
  const segmentsDirectory = path.join(workDirectory, "segments");
  const scenes = input.scenes ?? [];
  const framePaths = input.sceneFramePaths ?? [];
  const clipPaths = input.sceneClipPaths ?? [];
  const concatLines: string[] = [];

  await mkdir(segmentsDirectory, { recursive: true });

  for (const [index, framePath] of framePaths.entries()) {
    const duration = normalizeSceneDuration(scenes[index]?.durationSeconds, input.durationSeconds, framePaths.length);
    const clipPath = clipPaths[index];
    const segmentPath = path.join(segmentsDirectory, `segment_${String(index + 1).padStart(2, "0")}.mp4`);

    if (clipPath && existsSync(clipPath)) {
      await renderClipSegment(ffmpegPath, clipPath, segmentPath, duration);
    } else {
      await renderImageSegment(ffmpegPath, framePath, segmentPath, duration);
    }

    concatLines.push(`file '${escapeConcatPath(segmentPath)}'`);
  }

  await writeFile(listPath, `${concatLines.join("\n")}\n`);

  const audioInputArgs = input.voiceoverAudioPath
    ? ["-i", input.voiceoverAudioPath]
    : [
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=54:sample_rate=44100:duration=${input.durationSeconds}`
      ];
  const bgmInputArgs = input.bgmAudioPath ? ["-stream_loop", "-1", "-i", input.bgmAudioPath] : [];
  const subtitleVideoFilterArgs = input.subtitlePath ? ["-vf", buildSubtitleFilter(input.subtitlePath)] : [];
  const audioFilterArgs =
    input.voiceoverAudioPath && input.bgmAudioPath
      ? [
          "-filter_complex",
          `[2:a]volume=0.16,atrim=0:${input.durationSeconds}[bgm];[1:a]volume=1.0[voice];[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]`,
          "-map",
          "0:v",
          "-map",
          "[a]"
        ]
      : ["-af", input.voiceoverAudioPath ? "apad,volume=1.0" : "volume=0.08"];
  const args = [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    ...audioInputArgs,
    ...bgmInputArgs,
    ...subtitleVideoFilterArgs,
    ...audioFilterArgs,
    "-shortest",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    input.outputPath
  ];

  await runProcess(ffmpegPath, args);
}

async function renderClipSegment(ffmpegPath: string, inputPath: string, outputPath: string, durationSeconds: number): Promise<void> {
  const videoFilter = [
    "scale=1080:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    "fps=30",
    "format=yuv420p",
    `tpad=stop_mode=clone:stop_duration=${formatDurationForFfmpeg(durationSeconds)}`,
    `trim=duration=${formatDurationForFfmpeg(durationSeconds)}`,
    "setpts=PTS-STARTPTS"
  ].join(",");
  const args = [
    "-y",
    "-i",
    inputPath,
    "-vf",
    videoFilter,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    outputPath
  ];

  await runProcess(ffmpegPath, args);
}

async function renderImageSegment(ffmpegPath: string, inputPath: string, outputPath: string, durationSeconds: number): Promise<void> {
  const args = [
    "-y",
    "-loop",
    "1",
    "-t",
    formatDurationForFfmpeg(durationSeconds),
    "-i",
    inputPath,
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    outputPath
  ];

  await runProcess(ffmpegPath, args);
}

function normalizeSceneDuration(sceneDurationSeconds: number | undefined, totalDurationSeconds: number, sceneCount: number): number {
  const fallbackDuration = totalDurationSeconds / Math.max(1, sceneCount);
  const durationSeconds = Number.isFinite(sceneDurationSeconds ?? NaN) && (sceneDurationSeconds ?? 0) > 0 ? sceneDurationSeconds! : fallbackDuration;

  return Math.max(0.25, durationSeconds);
}

function formatDurationForFfmpeg(durationSeconds: number): string {
  return durationSeconds.toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "");
}

function buildSubtitleFilter(subtitlePath: string): string {
  const subtitleStyle = [
    "FontName=Noto Sans CJK SC",
    "FontSize=9",
    "PrimaryColour=&H00FFFFFF",
    "OutlineColour=&H00000000",
    "BorderStyle=1",
    "Outline=2",
    "Shadow=1",
    "Alignment=2",
    "MarginL=52",
    "MarginR=52",
    "MarginV=160"
  ].join(",");

  return `subtitles='${escapeFilterValue(subtitlePath)}':force_style='${escapeFilterValue(subtitleStyle)}'`;
}

function escapeFilterValue(value: string): string {
  return value.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
}

function escapeConcatPath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replaceAll("'", "'\\''");
}

function resolveFfmpegPath(): string | null {
  const require = createRequire(import.meta.url);
  return require("ffmpeg-static") as string | null;
}

function normalizeGenerateVideoInput(input: GenerateVideoRequest): NormalizedGenerateVideoInput {
  const topic = input.topic.trim();
  const prompt = input.prompt.trim();
  const durationSeconds = input.durationSeconds ?? 45;
  const sceneCount = Math.max(3, Math.min(7, Math.round(input.sceneCount)));

  if (!topic) {
    throw new Error("topic is required.");
  }

  if (!prompt) {
    throw new Error("prompt is required.");
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds < 5 || durationSeconds > 90) {
    throw new Error("durationSeconds must be between 5 and 90.");
  }

  const normalized: NormalizedGenerateVideoInput = {
    costLimitRM: input.costLimitRM,
    durationSeconds,
    language: input.language,
    prompt,
    sceneCount,
    templateType: input.templateType,
    topic
  };

  if (input.jobId?.trim()) {
    normalized.jobId = input.jobId.trim();
  }

  return normalized;
}

function buildScript(input: NormalizedGenerateVideoInput): GeneratedScript {
  if (input.language === "en-US") {
    const scripts: Record<ContentTemplateType, GeneratedScript> = {
      comedy_sketch: {
        hook: `Everyone thought ${input.topic} was a tiny problem until the third misunderstanding.`,
        title: `${input.topic} - The Office Misread Everything`,
        voiceover: `It started with ${input.topic}, which should have been simple. One person guessed the wrong reason. Another person tried to fix the wrong problem. By the end, everyone was proudly solving something that never happened.`
      },
      fairy_tale: {
        hook: `In a small magical town, ${input.topic} only worked when someone gave something away.`,
        title: `${input.topic} - A Tiny Fairy Tale`,
        voiceover: `In a small magical town, everyone whispered about ${input.topic}. It looked ordinary in daylight, but at night it answered kind wishes. The rule was simple: you could not keep the magic for yourself.`
      },
      romance_story: {
        hook: `${input.topic} looked like a mistake, but it was the first honest clue.`,
        title: `${input.topic} - The Smallest Love Story`,
        voiceover: `${input.topic} began with a quiet mistake. Two people reached for the wrong thing and found the right sentence. Neither of them said too much. By the final scene, the audience understands they were choosing each other all along.`
      },
      rules_horror: {
        hook: `If you see a new rule about ${input.topic}, stop recording and leave.`,
        title: `${input.topic} - Do Not Break Rule 3`,
        voiceover: [
          `If you ever find a handwritten notice about ${input.topic}, do not laugh at it.`,
          "The first rule is always ordinary. The second one sounds fake. The third one is there because someone tested it.",
          "By the time the camera starts glitching, the rules are no longer protecting you.",
          "They are describing what is already inside the room."
        ].join(" ")
      },
      surveillance_horror: {
        hook: `The camera caught ${input.topic}, but the timestamp said it happened tomorrow.`,
        title: `${input.topic} - The Missing Minute`,
        voiceover: `The first replay of ${input.topic} looked harmless. The second replay had one extra detail. By the third replay, the room had changed while nobody was inside.`
      },
      urban_legend: {
        hook: `People in the city still whisper about ${input.topic}, because the ending keeps changing.`,
        title: `${input.topic} - A Modern Urban Legend`,
        voiceover: `The story of ${input.topic} sounds fake until three strangers tell it the same way. Every version begins in an ordinary place. Every version adds one detail nobody can explain.`
      }
    };

    return scripts[input.templateType];
  }

  const scripts: Record<ContentTemplateType, GeneratedScript> = {
    comedy_sketch: {
      hook: `大家以为「${input.topic}」只是小事，结果第三个误会直接把全办公室带偏。`,
      title: `${input.topic}：全办公室都误会了`,
      voiceover: `一开始，「${input.topic}」真的只是一个小问题。第一个人猜错原因，第二个人修错地方，第三个人认真写了一份解决方案。最后那个一直没说话的人一句话，把全场误会收掉。`
    },
    fairy_tale: {
      hook: `在一个小镇里，「${input.topic}」只会回应愿意分享的人。`,
      title: `${input.topic}：一个小小童话`,
      voiceover: `小镇上的人都听说过「${input.topic}」。白天它看起来普通，到了夜里却会回应善意的愿望。唯一的规则是，魔法不能只留给自己。`
    },
    romance_story: {
      hook: `「${input.topic}」看起来像一次拿错，其实是两个人第一次认真靠近。`,
      title: `${input.topic}：一支温柔爱情短片`,
      voiceover: `「${input.topic}」开始于一个很小的错误。两个人拿错了东西，却看见了对方留下的一句话。他们没有说太多，只是一次又一次，把线索留在刚好能被发现的地方。`
    },
    rules_horror: {
      hook: `如果你看到关于「${input.topic}」的新规则，先别拍，马上离开。`,
      title: `${input.topic}：第三条规则千万不要违反`,
      voiceover: [
        `如果你在半夜看到一张关于「${input.topic}」的手写规则，千万不要笑。`,
        "第一条通常很正常，第二条听起来像玩笑，第三条一定是真的。",
        "因为第三条规则，往往是有人违反以后才被写上去的。",
        "当监控画面开始变暗的时候，规则已经不是在保护你。",
        "它只是在告诉你，那个东西已经进来了。"
      ].join("")
    },
    surveillance_horror: {
      hook: `监控拍到了「${input.topic}」，但时间显示那是明天发生的事。`,
      title: `${input.topic}：消失的一分钟`,
      voiceover: `第一次回放「${input.topic}」时，画面看起来很普通。第二次回放，多了一个不该出现的细节。第三次回放，房间在没有人的时候变了位置。`
    },
    urban_legend: {
      hook: `这座城市还在流传「${input.topic}」，因为每个人听到的结局都不一样。`,
      title: `${input.topic}：一个新的都市传说`,
      voiceover: `关于「${input.topic}」的故事，一开始听起来很假。直到三个陌生人说出同样的开头。每个版本都发生在普通地方，每个版本都多出一个无法解释的细节。`
    }
  };

  return scripts[input.templateType];
}

function buildStoryboard(input: NormalizedGenerateVideoInput, script: GeneratedScript): GeneratedStoryboardScene[] {
  const baseDuration = Math.floor(input.durationSeconds / input.sceneCount);
  const remainder = input.durationSeconds - baseDuration * input.sceneCount;

  return Array.from({ length: input.sceneCount }, (_, index) => {
    const sceneNumber = index + 1;
    const isLastScene = sceneNumber === input.sceneCount;

    return {
      camera: getStoryboardCamera(input.templateType, sceneNumber),
      durationSeconds: baseDuration + (index < remainder ? 1 : 0),
      imagePrompt: `${input.topic}, scene ${sceneNumber}, ${getStoryboardVisualStyle(input.templateType)}, fictional, no copyrighted characters`,
      sceneId: sceneNumber,
      sfx: getStoryboardSfx(input.templateType, isLastScene),
      visual: getStoryboardVisual(input, isLastScene),
      voiceText: getSceneVoiceText(input, script, sceneNumber, isLastScene)
    };
  });
}

function getSceneVoiceText(input: NormalizedGenerateVideoInput, script: GeneratedScript, sceneNumber: number, isLastScene: boolean): string {
  if (isLastScene) {
    return getFinalSceneLine(input);
  }

  const parts = script.voiceover.match(/[^。.!?]+[。.!?]?/gu) ?? [script.voiceover];
  return parts[(sceneNumber - 1) % parts.length]?.trim() || script.hook;
}

function getStoryboardVisualStyle(templateType: ContentTemplateType): string {
  const styles: Record<ContentTemplateType, string> = {
    comedy_sketch: "bright modern comedy, expressive faces, clean practical location, warm daylight",
    fairy_tale: "whimsical original storybook fantasy, soft glowing light, cozy magical details",
    romance_story: "warm cinematic romance, soft natural light, restrained emotional framing",
    rules_horror: "analog horror, low light, surveillance footage, cinematic shadows",
    surveillance_horror: "CCTV suspense, low light, monitor glow, realistic security camera angle",
    urban_legend: "modern urban mystery, cinematic night street, moody low-violence suspense"
  };

  return styles[templateType];
}

function getStoryboardCamera(templateType: ContentTemplateType, sceneNumber: number): string {
  if (templateType === "comedy_sketch") {
    return sceneNumber % 2 === 0 ? "quick reaction cut" : "wide comedy framing";
  }

  if (templateType === "romance_story") {
    return sceneNumber % 2 === 0 ? "soft close-up" : "gentle tracking shot";
  }

  if (templateType === "fairy_tale") {
    return sceneNumber % 2 === 0 ? "slow magical reveal" : "storybook establishing shot";
  }

  return sceneNumber % 2 === 0 ? "slow push-in, CCTV compression artifacts" : "fixed security camera, slight digital noise";
}

function getStoryboardSfx(templateType: ContentTemplateType, isLastScene: boolean): string[] {
  if (templateType === "comedy_sketch") {
    return isLastScene ? ["light pop", "room reaction"] : ["office ambience"];
  }

  if (templateType === "romance_story") {
    return isLastScene ? ["soft rain", "warm piano resolve"] : ["rain ambience"];
  }

  if (templateType === "fairy_tale") {
    return isLastScene ? ["sparkle swell", "soft chime"] : ["gentle chimes"];
  }

  return isLastScene ? ["low drone", "distant metallic hit", "signal drop"] : ["room tone", "low hum"];
}

function getStoryboardVisual(input: NormalizedGenerateVideoInput, isLastScene: boolean): string {
  if (input.templateType === "comedy_sketch") {
    return isLastScene ? "The final reaction reveals the clean punchline." : `A fast comic beat connected to ${input.topic}.`;
  }

  if (input.templateType === "romance_story") {
    return isLastScene ? "The two clues finally meet in a warm quiet frame." : `A restrained romantic moment connected to ${input.topic}.`;
  }

  if (input.templateType === "fairy_tale") {
    return isLastScene ? "The magical gift lights up the whole scene." : `A whimsical magical detail connected to ${input.topic}.`;
  }

  return isLastScene ? "The frame reveals the final unsettling twist." : `A quiet monitored location connected to ${input.topic}.`;
}

function getFinalSceneLine(input: NormalizedGenerateVideoInput): string {
  if (input.templateType === "comedy_sketch") {
    return input.language === "en-US" ? "And that is when everyone realized they had solved the wrong problem." : "就在这时，所有人才发现，他们解决的是一个根本不存在的问题。";
  }

  if (input.templateType === "romance_story") {
    return input.language === "en-US" ? "They did not say forever. They simply chose the next page together." : "他们没有说永远，只是一起翻开了下一页。";
  }

  if (input.templateType === "fairy_tale") {
    return input.language === "en-US" ? "The wish worked only after it was given away." : "愿望是在被送出去以后，才真正实现的。";
  }

  return input.language === "en-US" ? "The last rule was never a warning. It was a timestamp." : "最后一条规则不是警告，而是时间。";
}

function buildSrt(storyboard: GeneratedStoryboardScene[]): string {
  let cursor = 0;

  return storyboard
    .map((scene, index) => {
      const start = cursor;
      const end = cursor + scene.durationSeconds;
      cursor = end;

      return [String(index + 1), `${formatSrtTime(start)} --> ${formatSrtTime(end)}`, wrapSubtitleText(scene.voiceText), ""].join("\n");
    })
    .join("\n");
}

function wrapSubtitleText(text: string): string {
  const normalized = text.replace(/\s+/gu, " ").trim();

  if (!normalized) {
    return "";
  }

  const cjkCount = (normalized.match(/[\u3400-\u9fff]/gu) ?? []).length;

  if (cjkCount >= Math.max(4, normalized.length * 0.35)) {
    return wrapCjkSubtitle(normalized, 16);
  }

  return wrapWordSubtitle(normalized, 34);
}

function wrapCjkSubtitle(text: string, maxUnitsPerLine: number): string {
  const lines: string[] = [];
  let line = "";
  let units = 0;

  for (const char of [...text]) {
    const charUnits = /[\u3400-\u9fff]/u.test(char) ? 1 : char === " " ? 0.4 : 0.55;

    if (line && units + charUnits > maxUnitsPerLine) {
      lines.push(line.trim());
      line = "";
      units = 0;
    }

    line += char;
    units += charUnits;
  }

  if (line.trim()) {
    lines.push(line.trim());
  }

  return lines.join("\n");
}

function wrapWordSubtitle(text: string, maxCharsPerLine: number): string {
  const lines: string[] = [];
  let line = "";

  for (const word of text.split(" ")) {
    if (line && `${line} ${word}`.length > maxCharsPerLine) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines.join("\n");
}

function buildSoundEffectsManifest(storyboard: GeneratedStoryboardScene[]): Array<{ durationSeconds: number; sceneId: number; sfx: string[]; startSeconds: number }> {
  let cursor = 0;

  return storyboard.map((scene) => {
    const entry = {
      durationSeconds: scene.durationSeconds,
      sceneId: scene.sceneId,
      sfx: scene.sfx,
      startSeconds: cursor
    };
    cursor += scene.durationSeconds;
    return entry;
  });
}

function formatSrtTime(totalSeconds: number): string {
  const totalMilliseconds = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

function createSceneSvg(scene: GeneratedStoryboardScene, topic: string): string {
  const title = escapeXml(topic);
  const body = escapeXml(scene.voiceText);
  const accent = scene.sceneId % 2 === 0 ? "#2563eb" : "#14b8a6";

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">',
    '<rect width="1080" height="1920" fill="#101826"/>',
    `<rect x="72" y="72" width="936" height="1776" fill="#121a2a" stroke="#263348" stroke-width="3"/>`,
    `<rect x="96" y="112" width="888" height="12" fill="${accent}"/>`,
    '<text x="96" y="210" font-family="Arial, sans-serif" font-size="34" fill="#94a3b8">AI CONTENT FACTORY / LOCAL MOCK IMAGE</text>',
    `<text x="96" y="320" font-family="Arial, sans-serif" font-size="54" font-weight="700" fill="#f8fafc">SCENE ${scene.sceneId}</text>`,
    `<text x="96" y="410" font-family="Arial, sans-serif" font-size="42" fill="#e2e8f0">${title}</text>`,
    `<text x="96" y="520" font-family="Arial, sans-serif" font-size="30" fill="#94a3b8">${escapeXml(scene.camera)}</text>`,
    `<text x="96" y="1420" font-family="Arial, sans-serif" font-size="42" fill="#f8fafc">${body}</text>`,
    '<text x="96" y="1760" font-family="Arial, sans-serif" font-size="30" fill="#64748b">Replace this with fal / OpenAI Images after provider keys are configured.</text>',
    "</svg>"
  ].join("");
}

async function writeSceneBmp(directory: string, scene: GeneratedStoryboardScene, topic: string): Promise<string> {
  const width = 1080;
  const height = 1920;
  const filePath = path.join(directory, `scene_${String(scene.sceneId).padStart(2, "0")}.bmp`);
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelArraySize = rowStride * height;
  const fileSize = 54 + pixelArraySize;
  const buffer = Buffer.alloc(fileSize);

  buffer.write("BM", 0, "ascii");
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelArraySize, 34);

  const palette: { accent: [number, number, number]; haze: [number, number, number] } =
    scene.sceneId % 2 === 0 ? { accent: [31, 91, 197], haze: [21, 43, 72] } : { accent: [20, 130, 105], haze: [18, 52, 48] };

  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y;
    const rowOffset = 54 + y * rowStride;

    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + x * 3;
      const vignette = Math.min(1, Math.hypot((x - width / 2) / width, (sourceY - height / 2) / height) * 1.35);
      const scan = sourceY % 12 < 2 ? 12 : 0;
      const noise = (x * 17 + sourceY * 31 + scene.sceneId * 47) % 18;
      let r = 14 + noise - scan;
      let g = 22 + noise - scan;
      let b = 34 + noise - scan;

      if (x > 70 && x < 1010 && sourceY > 70 && sourceY < 1850) {
        r += 8;
        g += 12;
        b += 20;
      }

      const hallwayLeft = 290 + Math.floor(sourceY * 0.08);
      const hallwayRight = width - hallwayLeft;
      if (sourceY > 480 && sourceY < 1480 && x > hallwayLeft && x < hallwayRight) {
        const depth = (sourceY - 480) / 1000;
        r = palette.haze[0] + Math.floor(depth * 28) + noise;
        g = palette.haze[1] + Math.floor(depth * 24) + noise;
        b = palette.haze[2] + Math.floor(depth * 18) + noise;
      }

      if (sourceY > 86 && sourceY < 120 && x > 96 && x < 984) {
        r = palette.accent[0];
        g = palette.accent[1];
        b = palette.accent[2];
      }

      if (sourceY > 1580 && sourceY < 1670 && x > 96 && x < 984) {
        r = 230;
        g = 237;
        b = 246;
      }

      if (isRecIndicatorPixel(x, sourceY)) {
        r = 220;
        g = 38;
        b = 38;
      }

      if (isSceneMarkerPixel(x, sourceY, scene.sceneId)) {
        r = 248;
        g = 250;
        b = 252;
      }

      const dim = 1 - vignette * 0.45;
      buffer[offset] = clampByte(b * dim);
      buffer[offset + 1] = clampByte(g * dim);
      buffer[offset + 2] = clampByte(r * dim);
    }
  }

  await writeFile(filePath, buffer);
  void topic;
  return filePath;
}

function isRecIndicatorPixel(x: number, y: number): boolean {
  const dx = x - 910;
  const dy = y - 190;
  return dx * dx + dy * dy < 18 * 18;
}

function isSceneMarkerPixel(x: number, y: number, sceneId: number): boolean {
  const top = 260;
  const left = 96;
  const cell = 24;
  const gap = 8;

  if (y < top || y > top + cell) {
    return false;
  }

  for (let index = 0; index < sceneId; index += 1) {
    const markerLeft = left + index * (cell + gap);
    if (x >= markerLeft && x <= markerLeft + cell) {
      return true;
    }
  }

  return false;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toGeneratedObject(object: StoredObject): GenerateVideoResponse["artifacts"]["finalVideo"] {
  return {
    driver: object.driver,
    fallbackReason: object.fallbackReason,
    localPath: object.localPath,
    publicUrl: object.publicUrl,
    storagePath: object.storagePath
  };
}

async function runProcess(command: string, args: string[]): Promise<void> {
  const stderr: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr.push(chunk);
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

async function runProcessForStderr(command: string, args: string[]): Promise<string> {
  const stderr: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr.push(chunk);
    });
    child.on("error", reject);
    child.on("close", () => resolve());
  });

  return stderr.join("");
}
