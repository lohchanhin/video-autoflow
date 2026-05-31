import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import type { GenerateQcReportRequest, GenerateQcReportResponse, QcCheck } from "@ai-content-factory/shared-types";
import type { StorageAdapter } from "@ai-content-factory/storage";

const require = createRequire(import.meta.url);

export interface QcReportServiceOptions {
  storage: StorageAdapter;
}

export interface QcReportService {
  generateReport(input: GenerateQcReportRequest): Promise<GenerateQcReportResponse>;
}

export function createQcReportService(options: QcReportServiceOptions): QcReportService {
  return {
    async generateReport(input: GenerateQcReportRequest): Promise<GenerateQcReportResponse> {
      const checks: QcCheck[] = [];
      const finalVideo = input.artifacts.finalVideo ? resolveArtifactPath(options.storage, input.artifacts.finalVideo) : null;
      const voiceover = input.artifacts.voiceover ? resolveArtifactPath(options.storage, input.artifacts.voiceover) : null;
      const subtitles = input.artifacts.subtitles ? resolveArtifactPath(options.storage, input.artifacts.subtitles) : null;
      const bgm = input.artifacts.bgm ? resolveArtifactPath(options.storage, input.artifacts.bgm) : null;
      const sceneImages = input.artifacts.sceneImages.map((artifact) => resolveArtifactPath(options.storage, artifact));

      checks.push(await checkFile("Final MP4", finalVideo, { minBytes: 50_000, required: true }));
      checks.push(checkSceneImages(sceneImages, input.sceneCount));
      checks.push(await checkFile("Voiceover audio", voiceover, { minBytes: 1_000, required: true }));
      checks.push(await checkFile("Subtitles", subtitles, { minBytes: 10, required: true }));
      checks.push(await checkFile("Background music", bgm, { minBytes: 1_000, required: false }));
      checks.push(checkBudget(input.actualCostRM, input.costLimitRM));

      let durationSeconds: number | undefined;
      let resolution: string | undefined;

      if (finalVideo?.localPath && existsSync(finalVideo.localPath)) {
        const mediaInfo = await probeVideo(finalVideo.localPath);

        if (mediaInfo.durationSeconds) {
          durationSeconds = mediaInfo.durationSeconds;
          checks.push({
            detail: `${mediaInfo.durationSeconds.toFixed(2)} seconds`,
            label: "Video duration",
            status: mediaInfo.durationSeconds > 0 && mediaInfo.durationSeconds <= 75 ? "pass" : "warning"
          });
        }

        if (mediaInfo.resolution) {
          resolution = mediaInfo.resolution;
          checks.push({
            detail: mediaInfo.resolution,
            label: "Vertical resolution",
            status: mediaInfo.resolution === "1080x1920" ? "pass" : "warning"
          });
        }

        if (mediaInfo.hasAudio !== undefined) {
          checks.push({
            detail: mediaInfo.hasAudio ? "Audio stream detected" : "No audio stream detected",
            label: "Audio stream",
            status: mediaInfo.hasAudio ? "pass" : "fail"
          });
        }
      }

      const passed = checks.every((check) => check.status !== "fail");
      const failCount = checks.filter((check) => check.status === "fail").length;
      const warningCount = checks.filter((check) => check.status === "warning").length;

      return {
        checks,
        durationSeconds,
        jobId: input.jobId,
        passed,
        resolution,
        status: passed ? "QC_PASSED" : "FAILED",
        summary: passed
          ? `QC passed with ${warningCount} warning(s).`
          : `QC failed with ${failCount} blocking issue(s) and ${warningCount} warning(s).`,
        timestamp: new Date().toISOString()
      };
    }
  };
}

interface ResolvedArtifact {
  localPath: string | null;
  source: string;
}

async function checkFile(label: string, artifact: ResolvedArtifact | null, options: { minBytes: number; required: boolean }): Promise<QcCheck> {
  if (!artifact?.localPath) {
    return {
      detail: options.required ? "Missing required artifact path." : "Optional artifact was not generated.",
      label,
      status: options.required ? "fail" : "warning"
    };
  }

  if (!existsSync(artifact.localPath)) {
    return {
      detail: `File does not exist: ${artifact.source}`,
      label,
      status: options.required ? "fail" : "warning"
    };
  }

  const info = await stat(artifact.localPath);
  return {
    detail: `${info.size} bytes`,
    label,
    status: info.size >= options.minBytes ? "pass" : options.required ? "fail" : "warning"
  };
}

function checkSceneImages(artifacts: ResolvedArtifact[], expectedCount: number): QcCheck {
  const existingCount = artifacts.filter((artifact) => artifact.localPath && existsSync(artifact.localPath)).length;

  return {
    detail: `${existingCount}/${expectedCount} scene image(s) exist`,
    label: "Scene images",
    status: existingCount >= expectedCount ? "pass" : "fail"
  };
}

function checkBudget(actualCostRM: number, costLimitRM: number): QcCheck {
  return {
    detail: `RM ${actualCostRM.toFixed(4)} / RM ${costLimitRM.toFixed(2)}`,
    label: "Budget",
    status: actualCostRM <= costLimitRM ? "pass" : "fail"
  };
}

function resolveArtifactPath(storage: StorageAdapter, source: string): ResolvedArtifact {
  const cleanSource = source.split("?")[0] ?? source;

  if (cleanSource.startsWith("local://uploads/")) {
    return {
      localPath: storage.resolveLocalPath(cleanSource.replace("local://uploads/", "")),
      source
    };
  }

  if (/^https?:\/\//u.test(cleanSource)) {
    try {
      const url = new URL(cleanSource);
      const match = url.pathname.match(/^\/uploads\/(.+)$/u);

      return {
        localPath: match?.[1] ? storage.resolveLocalPath(decodeURIComponent(match[1])) : null,
        source
      };
    } catch {
      return { localPath: null, source };
    }
  }

  if (path.isAbsolute(cleanSource)) {
    return {
      localPath: cleanSource,
      source
    };
  }

  return {
    localPath: null,
    source
  };
}

async function probeVideo(filePath: string): Promise<{ durationSeconds?: number; hasAudio?: boolean; resolution?: string }> {
  const ffmpegPath = resolveFfmpegPath();

  if (!ffmpegPath) {
    return {};
  }

  const stderr = await runProcessForStderr(ffmpegPath, ["-hide_banner", "-i", filePath]);
  const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/u);
  const videoMatch = stderr.match(/Video:.*?,\s*(\d{3,5})x(\d{3,5})/u);
  const mediaInfo: { durationSeconds?: number; hasAudio?: boolean; resolution?: string } = {
    hasAudio: /Audio:/u.test(stderr)
  };

  if (durationMatch) {
    mediaInfo.durationSeconds = Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]);
  }

  if (videoMatch) {
    mediaInfo.resolution = `${videoMatch[1]}x${videoMatch[2]}`;
  }

  return mediaInfo;
}

function resolveFfmpegPath(): string | null {
  return require("ffmpeg-static") as string | null;
}

async function runProcessForStderr(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true
    });
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", () => resolve(stderr));
  });
}
