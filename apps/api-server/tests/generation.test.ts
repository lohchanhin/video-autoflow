import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStorageAdapter } from "@ai-content-factory/storage";
import { createApp } from "../src/app.js";
import { buildReferenceDesignPromptForTest, createImageGenerationService } from "../src/modules/generation/image-service.js";
import { createBgmGenerationService, type BgmGenerationService } from "../src/modules/generation/bgm-service.js";
import type { ComposeVideoInput } from "../src/modules/generation/local-pipeline.js";
import { createTtsGenerationService, type TtsGenerationService } from "../src/modules/generation/tts-service.js";
import type { VideoClipGenerationService } from "../src/modules/generation/video-clip-service.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reference design prompt fidelity", () => {
  it("keeps the user character design brief above fallback defaults", () => {
    const prompt = buildReferenceDesignPromptForTest(
      {
        costLimitRM: 7.5,
        designType: "character_design",
        jobId: "asset_library",
        language: "zh-CN",
        prompt: "masterpiece, japanese anime style, holy paladin knight, silver-white armor with gold trim, glowing holy sword, blue eyes, silver hair, grand cathedral background",
        sceneCount: 5,
        templateType: "urban_legend",
        topic: "新角色设计"
      },
      {
        character: {
          ageRange: "adult",
          bodyType: "average build",
          expressionRange: "calm",
          fixedProps: ["old cashier key"],
          hair: "short dark hair",
          name: "Fallback protagonist",
          role: "modern city lead",
          signatureDetails: "dark jacket",
          wardrobe: "same dark casual jacket and plain shirt"
        },
        environment: {
          keyObjects: ["central story object"],
          lighting: "low key",
          location: "urban street",
          palette: "muted charcoal",
          recurringDetails: "modern suspense"
        },
        negativePrompt: "no text",
        style: "modern urban mystery"
      }
    );

    expect(prompt).toContain("Highest priority");
    expect(prompt).toContain("USER DESIGN BRIEF: masterpiece, japanese anime style");
    expect(prompt).toContain("silver-white armor with gold trim");
    expect(prompt).toContain("Preserve the requested art style exactly");
    expect(prompt).toContain("Fallback continuity notes, only if compatible");
    expect(prompt).not.toContain("Use a clean neutral background.");
  });

  it("asks scene designs to lock multiple consistent angles and details", () => {
    const prompt = buildReferenceDesignPromptForTest(
      {
        costLimitRM: 7.5,
        designType: "scene_design",
        jobId: "asset_library",
        language: "zh-CN",
        prompt: "rainy night convenience store, cold fluorescent light, old CCTV monitor, coffee machine, wet glass door reflections",
        sceneCount: 5,
        templateType: "urban_legend",
        topic: "雨夜便利店"
      },
      {
        character: {
          ageRange: "adult",
          bodyType: "average",
          expressionRange: "alert",
          fixedProps: [],
          hair: "short hair",
          name: "protagonist",
          role: "night clerk",
          signatureDetails: "",
          wardrobe: "blue uniform"
        },
        environment: {
          keyObjects: ["CCTV monitor", "coffee machine"],
          lighting: "cold fluorescent light",
          location: "convenience store",
          palette: "blue green night",
          recurringDetails: "rain reflections"
        },
        negativePrompt: "no text",
        style: "cinematic realism"
      }
    );

    expect(prompt).toContain("environment bible sheet");
    expect(prompt).toContain("6-8 consistent views/details of the same location");
    expect(prompt).toContain("main establishing angle");
    expect(prompt).toContain("reverse angle");
    expect(prompt).toContain("unlabeled top-down spatial relationship");
    expect(prompt).toContain("key prop close-ups");
    expect(prompt).toContain("material swatches");
    expect(prompt).toContain("safe composition boundaries");
    expect(prompt).toContain("Continuity rule");
    expect(prompt).not.toContain("Do not create UI, readable text, labels, floor plan diagrams");
    expect(prompt).not.toContain("one coherent vertical 9:16 cinematic establishing still");
  });
});

describe("POST /generation/video", () => {
  it("generates local video artifacts through the storage fallback", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });

    const response = await request(
      createApp({
        allowMockGeneration: true,
        composeVideo: async ({ outputPath }) => {
          await writeFile(outputPath, "fake mp4");
        },
        storage
      })
    )
      .post("/generation/video")
      .send({
        costLimitRM: 7.5,
        durationSeconds: 6,
        jobId: "job_test_001",
        language: "zh-CN",
        prompt: "Create a safe fictional horror short.",
        sceneCount: 3,
        templateType: "rules_horror",
        topic: "凌晨三点的电梯规则"
      })
      .expect(201);

    expect(response.body).toMatchObject({
      jobId: "job_test_001",
      status: "COMPOSED",
      storage: {
        driver: "local"
      },
      artifacts: {
        finalVideo: {
          publicUrl: "http://localhost:4000/uploads/jobs/job_test_001/final/video.mp4",
          storagePath: "local://uploads/jobs/job_test_001/final/video.mp4"
        },
        soundEffects: {
          publicUrl: "http://localhost:4000/uploads/jobs/job_test_001/sfx.json"
        }
      }
    });
    expect(response.body.artifacts.sceneImages).toHaveLength(3);
    expect(response.body.storyboard).toHaveLength(3);
  });

  it("blocks video composition until generated voiceover audio exists", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-video-gate-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });

    await storage.writeFile(
      "jobs/job_missing_tts/script.json",
      JSON.stringify({
        hook: "Do not press the new elevator button.",
        title: "The Elevator Rule",
        voiceover: "If the elevator shows a new floor after midnight, do not press it."
      })
    );
    await storage.writeFile(
      "jobs/job_missing_tts/storyboard.json",
      JSON.stringify({
        scenes: [
          {
            camera: "CCTV still",
            durationSeconds: 6,
            imagePrompt: "fictional elevator CCTV horror scene",
            sceneId: 1,
            sfx: ["low hum"],
            visual: "A dark elevator panel.",
            voiceText: "If the elevator shows a new floor after midnight, do not press it."
          }
        ]
      })
    );

    const response = await request(
      createApp({
        composeVideo: async ({ outputPath }) => {
          await writeFile(outputPath, "fake mp4");
        },
        storage
      })
    )
      .post("/generation/video")
      .send({
        costLimitRM: 7.5,
        durationSeconds: 6,
        jobId: "job_missing_tts",
        language: "en-US",
        prompt: "Create a safe fictional horror short.",
        sceneCount: 3,
        templateType: "rules_horror",
        topic: "midnight elevator rules"
      })
      .expect(409);

    expect(response.body.error.message).toContain("Missing generated voiceover audio");
  });

  it("retimes storyboard and subtitles to the generated voiceover duration", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-sync-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });
    const capturedComposeInputs: ComposeVideoInput[] = [];

    await storage.writeFile(
      "jobs/job_synced/script.json",
      JSON.stringify({
        hook: "Do not press the new elevator button.",
        title: "The Elevator Rule",
        voiceover: "Do not press it. The button was not there before midnight and it should not know your floor."
      })
    );
    await storage.writeFile(
      "jobs/job_synced/storyboard.json",
      JSON.stringify({
        scenes: [
          {
            camera: "CCTV still",
            durationSeconds: 10,
            imagePrompt: "fictional elevator CCTV horror scene one",
            sceneId: 1,
            sfx: ["low hum"],
            visual: "A dark elevator panel.",
            voiceText: "Do not press it."
          },
          {
            camera: "slow push-in",
            durationSeconds: 10,
            imagePrompt: "fictional elevator CCTV horror scene two",
            sceneId: 2,
            sfx: ["metallic click"],
            visual: "A new button appears.",
            voiceText: "The button was not there before midnight and it should not know your floor."
          }
        ]
      })
    );
    await storage.writeFile("jobs/job_synced/images/scene_01.png", Buffer.from("fake png 1"));
    await storage.writeFile("jobs/job_synced/images/scene_02.png", Buffer.from("fake png 2"));
    await storage.writeFile("jobs/job_synced/clips/scene_01_seedance.mp4", Buffer.from("fake clip 1"));
    await storage.writeFile("jobs/job_synced/clips/scene_02_seedance.mp4", Buffer.from("fake clip 2"));
    await storage.writeFile("jobs/job_synced/audio/voiceover.wav", createSilentWav(2));
    await storage.writeFile("jobs/job_synced/audio/bgm.mp3", Buffer.from("fake bgm"));

    const response = await request(
      createApp({
        composeVideo: async (input) => {
          capturedComposeInputs.push(input);
          await writeFile(input.outputPath, "fake mp4");
        },
        storage
      })
    )
      .post("/generation/video")
      .send({
        costLimitRM: 7.5,
        durationSeconds: 45,
        jobId: "job_synced",
        language: "en-US",
        prompt: "Create a safe fictional horror short.",
        sceneCount: 2,
        templateType: "rules_horror",
        topic: "midnight elevator rules"
      })
      .expect(201);

    const sceneDurations = response.body.storyboard.map((scene: { durationSeconds: number }) => scene.durationSeconds);
    const durationSum = sceneDurations.reduce((sum: number, duration: number) => sum + duration, 0);
    const subtitles = await readFile(storage.resolveLocalPath("jobs/job_synced/subtitles.srt"), "utf8");
    const capturedComposeInput = capturedComposeInputs[0];

    expect(response.body.durationSeconds).toBeCloseTo(2, 1);
    expect(durationSum).toBeCloseTo(2, 1);
    expect(sceneDurations[1]).toBeGreaterThan(sceneDurations[0]);
    expect(capturedComposeInput?.bgmAudioPath).toContain("bgm.mp3");
    expect(capturedComposeInput?.durationSeconds).toBeCloseTo(2, 1);
    expect(capturedComposeInput?.sceneClipPaths?.[0]).toContain("scene_01_seedance.mp4");
    expect(capturedComposeInput?.sceneClipPaths?.[1]).toContain("scene_02_seedance.mp4");
    expect(capturedComposeInput?.voiceoverAudioPath).toContain("voiceover.wav");
    expect(response.body.artifacts.sceneClips).toHaveLength(2);
    expect(subtitles).toContain("00:00:02,000");
  });
});

describe("POST /generation/tts", () => {
  it("applies TTS tool provider overrides from workflow settings", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-tts-override-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(Buffer.from("fake wav"), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = createTtsGenerationService({
      openai: {
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        costUsdPer1KChars: 0,
        format: "mp3",
        model: "gpt-4o-mini-tts",
        usdToMyrRate: 4,
        voice: "cedar"
      },
      storage
    });

    const response = await service.generateTts({
      baseUrl: "https://custom-tts.example/v1",
      cost: {
        costMode: "character",
        outputUnitPriceRM: 0.01
      },
      costLimitRM: 7.5,
      jobId: "job_tts_override",
      language: "zh-CN",
      model: "custom-tts-model",
      params: {
        format: "wav",
        voice: "nova"
      },
      provider: "openai-compatible",
      voiceoverText: "hello"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://custom-tts.example/v1/audio/speech",
      expect.objectContaining({
        body: JSON.stringify({
          input: "hello",
          model: "custom-tts-model",
          response_format: "wav",
          voice: "nova"
        })
      })
    );
    expect(response).toMatchObject({
      costRM: 0.05,
      format: "wav",
      model: "custom-tts-model",
      provider: "openai-compatible",
      voice: "nova"
    });
  });

  it("stores generated OpenAI TTS audio through the storage adapter", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-tts-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });
    const ttsGenerationService: TtsGenerationService = {
      async generateTts(input) {
        const audio = await storage.writeFile(`jobs/${input.jobId}/audio/voiceover.mp3`, Buffer.from("fake mp3"));

        return {
          audio,
          costRM: 0.01,
          format: "mp3",
          jobId: input.jobId ?? "job_tts_test",
          model: "gpt-4o-mini-tts",
          provider: "openai",
          status: "TTS_DONE",
          voice: "cedar",
          voiceoverText: input.voiceoverText
        };
      }
    };

    const response = await request(createApp({ storage, ttsGenerationService }))
      .post("/generation/tts")
      .send({
        costLimitRM: 7.5,
        jobId: "job_tts_test",
        language: "en-US",
        voiceoverText: "Do not press the new elevator button."
      })
      .expect(201);

    expect(response.body).toMatchObject({
      audio: {
        publicUrl: "http://localhost:4000/uploads/jobs/job_tts_test/audio/voiceover.mp3",
        storagePath: "local://uploads/jobs/job_tts_test/audio/voiceover.mp3"
      },
      jobId: "job_tts_test",
      provider: "openai",
      status: "TTS_DONE"
    });
  });
});

describe("POST /generation/bgm", () => {
  it("applies BGM tool provider overrides from workflow settings", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-bgm-override-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlValue = String(url);

      if (urlValue.includes("/user/subscription")) {
        return new Response(JSON.stringify({ character_count: 10, character_limit: 1000 }), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }

      if (urlValue.includes("/music")) {
        return new Response(Buffer.from("fake music"), {
          headers: {
            "content-type": "audio/mpeg",
            "song-id": "song_override"
          },
          status: 200
        });
      }

      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const bgmGenerationService = createBgmGenerationService({
      elevenlabs: {
        apiKey: "test-key",
        baseUrl: "https://api.elevenlabs.io/v1",
        costRMPerMinute: 0,
        model: "music_v1",
        outputFormat: "mp3_44100_128"
      },
      storage
    });

    const response = await bgmGenerationService.generateBgm({
      baseUrl: "https://custom-music.example/v1",
      cost: {
        costMode: "second",
        outputUnitPriceRM: 0.2
      },
      costLimitRM: 7.5,
      durationSeconds: 12,
      jobId: "job_bgm_override",
      language: "zh-CN",
      model: "music_custom_v2",
      params: {
        outputFormat: "mp3_22050_64"
      },
      prompt: "gentle forest music",
      provider: "elevenlabs-compatible",
      sceneCount: 3,
      templateType: "fairy_tale",
      topic: "forest lesson"
    });

    const musicCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/music"));
    expect(String(musicCall?.[0])).toBe("https://custom-music.example/v1/music?output_format=mp3_22050_64");
    expect(JSON.parse(String(musicCall?.[1]?.body))).toMatchObject({
      force_instrumental: true,
      model_id: "music_custom_v2",
      music_length_ms: 12000
    });
    expect(response).toMatchObject({
      costRM: 0.04,
      durationSeconds: 12,
      format: "mp3",
      model: "music_custom_v2",
      provider: "elevenlabs-compatible",
      songId: "song_override"
    });
  });

  it("stores generated ElevenLabs background music through the storage adapter", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-bgm-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });
    const bgmGenerationService: BgmGenerationService = {
      async generateBgm(input) {
        const audio = await storage.writeFile(`jobs/${input.jobId}/audio/bgm.mp3`, Buffer.from("fake bgm"));

        return {
          audio,
          costRM: 0.02,
          durationSeconds: input.durationSeconds ?? 45,
          format: "mp3",
          jobId: input.jobId ?? "job_bgm_test",
          model: "music_v1",
          prompt: "Instrumental background music.",
          provider: "elevenlabs",
          songId: "song_test",
          status: "BGM_DONE"
        };
      }
    };

    const response = await request(createApp({ bgmGenerationService, storage }))
      .post("/generation/bgm")
      .send({
        costLimitRM: 7.5,
        durationSeconds: 45,
        jobId: "job_bgm_test",
        language: "en-US",
        prompt: "Create a comedy short.",
        sceneCount: 5,
        templateType: "comedy_sketch",
        topic: "office coffee misunderstanding"
      })
      .expect(201);

    expect(response.body).toMatchObject({
      audio: {
        publicUrl: "http://localhost:4000/uploads/jobs/job_bgm_test/audio/bgm.mp3",
        storagePath: "local://uploads/jobs/job_bgm_test/audio/bgm.mp3"
      },
      jobId: "job_bgm_test",
      provider: "elevenlabs",
      status: "BGM_DONE"
    });
  });

  it("returns readable ElevenLabs validation errors instead of object placeholders", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-bgm-error-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });
    const bgmGenerationService = createBgmGenerationService({
      elevenlabs: {
        apiKey: "test-key",
        baseUrl: "https://api.elevenlabs.io/v1",
        costRMPerMinute: 0,
        model: "music_v1",
        outputFormat: ""
      },
      storage
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            detail: [
              {
                loc: ["body", "music_length_ms"],
                msg: "Input should be greater than or equal to 3000"
              }
            ]
          }),
          {
            headers: {
              "content-type": "application/json"
            },
            status: 422,
            statusText: "Unprocessable Entity"
          }
        )
      )
    );

    const response = await request(createApp({ bgmGenerationService, storage }))
      .post("/generation/bgm")
      .send({
        costLimitRM: 7.5,
        durationSeconds: 45,
        jobId: "job_bgm_error_test",
        language: "en-US",
        prompt: "Create a comedy short.",
        sceneCount: 5,
        templateType: "comedy_sketch",
        topic: "office coffee misunderstanding"
      })
      .expect(502);

    expect(response.body.error.message).toContain("body.music_length_ms: Input should be greater than or equal to 3000");
    expect(response.body.error.message).not.toContain("[object Object]");
  });

  it("explains ElevenLabs API key quota errors separately from account balance", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-bgm-quota-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });
    const bgmGenerationService = createBgmGenerationService({
      elevenlabs: {
        apiKey: "test-key",
        baseUrl: "https://api.elevenlabs.io/v1",
        costRMPerMinute: 0,
        model: "music_v1",
        outputFormat: "mp3_44100_128"
      },
      storage
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();

        if (url.includes("/user/subscription")) {
          return new Response(JSON.stringify({ character_count: 680, character_limit: 1000 }), {
            headers: {
              "content-type": "application/json"
            },
            status: 200
          });
        }

        return new Response(
          JSON.stringify({
            detail: {
              message: "This request exceeds your API key (factory) quota of 1000. You have 320 credits remaining, while 619 credits are required for this request."
            }
          }),
          {
            headers: {
              "content-type": "application/json"
            },
            status: 401,
            statusText: "Unauthorized"
          }
        );
      })
    );

    const response = await request(createApp({ bgmGenerationService, storage }))
      .post("/generation/bgm")
      .send({
        costLimitRM: 7.5,
        durationSeconds: 45,
        jobId: "job_bgm_quota_test",
        language: "en-US",
        prompt: "Create a comedy short.",
        sceneCount: 5,
        templateType: "comedy_sketch",
        topic: "office coffee misunderstanding"
      })
      .expect(502);

    expect(response.body.error.message).toContain("API key「factory」自己的用量上限");
    expect(response.body.error.message).toContain("不是账户 top-up balance");
    expect(response.body.error.message).toContain("Monthly credits 调高或设为 Unlimited");
  });
});

describe("POST /generation/images", () => {
  it("generates inspectable image assets without calling OpenAI when no key is configured", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-image-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });
    const imageGenerationService = createImageGenerationService({
      allowLocalFallback: true,
      openai: {
        apiKey: undefined,
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-image-1",
        quality: "low",
        size: "1024x1536",
        usdToMyrRate: 3.95
      },
      storage
    });

    const response = await request(createApp({ imageGenerationService, storage }))
      .post("/generation/images")
      .send({
        costLimitRM: 7.5,
        jobId: "job_image_test",
        language: "zh-CN",
        prompt: "Create fictional analog horror scene images.",
        sceneCount: 3,
        templateType: "rules_horror",
        topic: "凌晨三点的电梯规则"
      })
      .expect(201);

    expect(response.body).toMatchObject({
      jobId: "job_image_test",
      provider: "local",
      status: "IMAGE_DONE"
    });
    expect(response.body.images).toHaveLength(3);
    expect(response.body.images[0].asset.publicUrl).toBe("http://localhost:4000/uploads/jobs/job_image_test/images/scene_01.svg");
  });

  it("builds image prompts from storyboard and visual bible without leaking production brief instructions", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-image-prompt-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });

    await storage.writeFile(
      "jobs/job_visual_bible_image/storyboard.json",
      JSON.stringify({
        scenes: [
          {
            camera: "medium comedy reaction",
            durationSeconds: 8,
            imagePrompt: "Alex lifts the same pan and sees harmless smoke.",
            sceneId: 1,
            sfx: ["pan clink"],
            visual: "Alex stands in the same small kitchen with a pan.",
            voiceText: "Alex thought the pan was empty."
          }
        ]
      })
    );
    await storage.writeFile(
      "jobs/job_visual_bible_image/visual-bible.json",
      JSON.stringify({
        character: {
          ageRange: "adult, 30s",
          bodyType: "average build",
          expressionRange: "confused to relieved",
          fixedProps: ["same pan"],
          hair: "short dark hair",
          name: "Alex",
          role: "home cook",
          signatureDetails: "same face, same hair, same blue apron",
          wardrobe: "blue apron over white shirt"
        },
        environment: {
          keyObjects: ["same pan", "same kitchen counter"],
          lighting: "warm daylight",
          location: "small apartment kitchen",
          palette: "warm neutral kitchen colors",
          recurringDetails: "same kitchen layout and pan"
        },
        negativePrompt: "no text, no panels, no storyboard sheet",
        style: "single vertical comedy still"
      })
    );

    const imageGenerationService = createImageGenerationService({
      allowLocalFallback: true,
      openai: {
        apiKey: undefined,
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-image-1",
        quality: "medium",
        size: "1024x1536",
        usdToMyrRate: 3.95
      },
      storage
    });

    const response = await request(createApp({ imageGenerationService, storage }))
      .post("/generation/images")
      .send({
        costLimitRM: 7.5,
        jobId: "job_visual_bible_image",
        language: "en-US",
        prompt: "Output title, full script, storyboard, and image prompts.",
        references: [
          {
            label: "Mimi rabbit",
            prompt: "white rabbit girl, pink dress, blue vest, warm smile, fixed pastel palette",
            role: "reference_image",
            type: "character_design",
            url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
          }
        ],
        sceneCount: 1,
        templateType: "comedy_sketch",
        topic: "kitchen comedy"
      })
      .expect(201);

    expect(response.body.images).toHaveLength(1);
    expect(response.body.images[0].prompt).toContain("MANDATORY CAST LOCK");
    expect(response.body.images[0].prompt).toContain("Mimi rabbit");
    expect(response.body.images[0].prompt).toContain("white rabbit girl");
    expect(response.body.images[0].prompt).toContain("Fixed protagonist identity");
    expect(response.body.images[0].prompt).toContain("Alex");
    expect(response.body.images[0].prompt).not.toContain("Production brief");
    expect(response.body.images[0].prompt).not.toContain("Output title");
    expect(response.body.referenceImage.publicUrl).toMatch(/^data:image\/png/u);
    expect(response.body.visualBible.character.name).toBe("Alex");
    expect(response.body.requiresReview).toBe(false);
  });

  it("blocks image generation when a selected character reference image cannot be loaded", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-selected-reference-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });

    await storage.writeFile(
      "jobs/job_selected_reference_block/storyboard.json",
      JSON.stringify({
        scenes: [
          {
            camera: "medium shot",
            durationSeconds: 8,
            imagePrompt: "The selected character opens the office door.",
            sceneId: 1,
            sfx: ["door"],
            visual: "The selected character enters the office.",
            voiceText: "The door opened."
          }
        ]
      })
    );

    const imageGenerationService = createImageGenerationService({
      allowLocalFallback: true,
      openai: {
        apiKey: undefined,
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-image-1",
        quality: "medium",
        size: "1024x1536",
        usdToMyrRate: 3.95
      },
      storage
    });

    const response = await request(createApp({ imageGenerationService, storage }))
      .post("/generation/images/scene")
      .send({
        costLimitRM: 7.5,
        jobId: "job_selected_reference_block",
        language: "en-US",
        prompt: "Create a scene using the selected character.",
        references: [
          {
            label: "Banana CEO",
            prompt: "anthropomorphic banana CEO in a black suit, fixed face and wardrobe",
            role: "reference_image",
            type: "character_design",
            url: "http://127.0.0.1:9/missing-reference.png"
          }
        ],
        sceneCount: 1,
        sceneId: 1,
        templateType: "comedy_sketch",
        topic: "office drama"
      })
      .expect(409);

    expect(response.body.error.message).toContain("Selected reference image");
    expect(response.body.error.message).toContain("Banana CEO");
    expect(response.body.error.message).toContain("stopped before the model could invent a different character");
  });

  it("regenerates one scene image with an override prompt", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-scene-image-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });
    const imageGenerationService = createImageGenerationService({
      allowLocalFallback: true,
      openai: {
        apiKey: undefined,
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-image-1",
        quality: "low",
        size: "1024x1536",
        usdToMyrRate: 3.95
      },
      storage
    });

    const response = await request(createApp({ imageGenerationService, storage }))
      .post("/generation/images/scene")
      .send({
        costLimitRM: 7.5,
        jobId: "job_scene_image_test",
        language: "en-US",
        prompt: "Create a fictional romance story.",
        promptOverride: "A consistent adult protagonist reading a note in a warm library.",
        sceneCount: 5,
        sceneId: 3,
        templateType: "romance_story",
        topic: "rainy bookstore letter"
      })
      .expect(201);

    expect(response.body).toMatchObject({
      image: {
        sceneId: 3
      },
      jobId: "job_scene_image_test",
      provider: "local",
      status: "IMAGE_DONE"
    });
    expect(response.body.image.asset.publicUrl).toBe("http://localhost:4000/uploads/jobs/job_scene_image_test/images/scene_03.svg");
  });

  it("generates OpenAI-owned reference design assets for Seedance inputs", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-reference-design-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });
    const imageGenerationService = createImageGenerationService({
      allowLocalFallback: true,
      openai: {
        apiKey: undefined,
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-image-1",
        quality: "medium",
        size: "1024x1536",
        usdToMyrRate: 3.95
      },
      storage
    });

    const response = await request(createApp({ imageGenerationService, storage }))
      .post("/generation/reference-designs")
      .send({
        costLimitRM: 7.5,
        designType: "scene_design",
        jobId: "job_reference_design_test",
        language: "en-US",
        prompt: "Create reference design art for a comedy short.",
        sceneCount: 5,
        templateType: "comedy_sketch",
        topic: "kitchen comedy"
      })
      .expect(201);

    expect(response.body).toMatchObject({
      designType: "scene_design",
      jobId: "job_reference_design_test",
      provider: "local",
      role: "reference_image",
      status: "REFERENCE_DONE"
    });
    expect(response.body.asset.publicUrl).toBe("http://localhost:4000/uploads/jobs/job_reference_design_test/references/scene_design.svg");
    expect(response.body.prompt).toContain("Seedance reference_image");
    expect(response.body.prompt).not.toContain("Output title");
  });
});

describe("POST /generation/qc", () => {
  it("returns a blocking report when required artifacts are missing", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-qc-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });

    const response = await request(createApp({ storage }))
      .post("/generation/qc")
      .send({
        actualCostRM: 1.2,
        artifacts: {
          sceneImages: []
        },
        costLimitRM: 7.5,
        jobId: "job_qc_test",
        sceneCount: 5
      })
      .expect(201);

    expect(response.body).toMatchObject({
      jobId: "job_qc_test",
      passed: false,
      status: "FAILED"
    });
    expect(response.body.checks.some((check: { label: string; status: string }) => check.label === "Final MP4" && check.status === "fail")).toBe(true);
  });
});

describe("POST /generation/video-clips/scene", () => {
  it("uses the configured video clip provider and stores returned metadata", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-seedance-route-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });
    const clip = await storage.writeFile("jobs/job_seedance_route/clips/scene_01_seedance.mp4", "fake seedance mp4");
    const videoClipGenerationService: VideoClipGenerationService = {
      async generateVideoClip() {
        return {
          clip: {
            asset: clip,
            costRM: 0.5,
            durationSeconds: 5,
            mode: "text-to-video",
            prompt: "slow camera motion",
            sceneId: 1,
            taskId: "task_test_001"
          },
          costRM: 0.5,
          jobId: "job_seedance_route",
          model: "seedance-2.0-text-to-video",
          provider: "seedance",
          status: "VIDEO_DONE"
        };
      }
    };

    const response = await request(createApp({ storage, videoClipGenerationService }))
      .post("/generation/video-clips/scene")
      .send({
        costLimitRM: 7.5,
        jobId: "job_seedance_route",
        prompt: "slow camera motion",
        sceneId: 1,
        topic: "seedance connection test"
      })
      .expect(201);

    expect(response.body).toMatchObject({
      jobId: "job_seedance_route",
      provider: "seedance",
      status: "VIDEO_DONE",
      clip: {
        mode: "text-to-video",
        taskId: "task_test_001"
      }
    });
  });
});

function createSilentWav(durationSeconds: number): Buffer {
  const sampleRate = 44_100;
  const channelCount = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.floor(durationSeconds * sampleRate);
  const dataSize = sampleCount * channelCount * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
  buffer.writeUInt16LE(channelCount * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}
