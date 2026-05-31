import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createStorageAdapter } from "@ai-content-factory/storage";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("createVideoClipGenerationService", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("calls BytePlus ModelArk content generation tasks and stores the returned clip", async () => {
    vi.stubEnv("BYTEPLUS_ARK_API_KEY", "ark-test-key");
    vi.stubEnv("SEEDANCE_API_STYLE", "byteplus-ark");
    vi.stubEnv("SEEDANCE_BASE_URL", "https://ark.ap-southeast.bytepluses.com/api/v3");
    vi.stubEnv("SEEDANCE_MODEL", "dreamina-seedance-2-0-260128");
    vi.stubEnv("SEEDANCE_POLL_INTERVAL_MS", "100");
    vi.stubEnv("SEEDANCE_TIMEOUT_MS", "1000");
    vi.stubEnv("SEEDANCE_COST_RM_PER_M_TOKENS", "27.65");
    vi.resetModules();

    const { createVideoClipGenerationService } = await import("../src/modules/generation/video-clip-service.js");
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-byteplus-video-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });
    const calls: Array<{ body?: unknown; method?: string | undefined; url: string }> = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      calls.push({
        body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined,
        method: init?.method,
        url
      });

      if (url.endsWith("/contents/generations/tasks")) {
        return new Response(JSON.stringify({ id: "cgt-test-001", status: "submitted" }), { status: 200 });
      }

      if (url.endsWith("/contents/generations/tasks/cgt-test-001")) {
        return new Response(
          JSON.stringify({
            content: {
              video_url: "https://cdn.example.test/generated.mp4"
            },
            id: "cgt-test-001",
            status: "succeeded",
            usage: {
              total_tokens: 100_000
            }
          }),
          { status: 200 }
        );
      }

      if (url === "https://cdn.example.test/generated.mp4") {
        return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
      }

      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const service = createVideoClipGenerationService({ fetchFn, storage });
    const response = await service.generateVideoClip({
      costLimitRM: 7.5,
      durationSeconds: 5,
      imageUrl: "https://cdn.example.test/scene.png",
      jobId: "job_byteplus_video",
      prompt: "A consistent main character walks into a neon kitchen, slow camera push in.",
      referenceImageUrls: ["https://cdn.example.test/character.png", "https://cdn.example.test/set-design.png"],
      sceneId: 1,
      topic: "comedy kitchen"
    });

    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks"
    });
    expect(calls[0]?.body).toMatchObject({
      duration: 5,
      generate_audio: false,
      model: "dreamina-seedance-2-0-260128",
      ratio: "9:16",
      resolution: "720p",
      watermark: false
    });
    expect(JSON.stringify(calls[0]?.body)).toContain("--duration 5");
    expect(JSON.stringify(calls[0]?.body)).toContain("first_frame");
    expect(JSON.stringify(calls[0]?.body)).toContain("reference_image");
    expect(JSON.stringify(calls[0]?.body)).toContain("https://cdn.example.test/character.png");
    expect(calls[1]?.url).toBe("https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/cgt-test-001");
    expect(response).toMatchObject({
      costRM: 2.765,
      jobId: "job_byteplus_video",
      model: "dreamina-seedance-2-0-260128",
      provider: "seedance",
      status: "VIDEO_DONE"
    });
    expect(response.clip.mode).toBe("image-to-video");
    expect(response.clip.referenceImageUrls).toContain("https://cdn.example.test/character.png");
    expect(response.clip.asset.publicUrl).toBe("http://localhost:4000/uploads/jobs/job_byteplus_video/clips/scene_01_seedance.mp4");
  });
});
