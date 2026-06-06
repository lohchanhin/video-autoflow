import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { GenerateVideoClipRequest, ProductionAsset } from "@ai-content-factory/shared-types";
import type { ImageGenerationService } from "../src/modules/generation/image-service.js";
import type { VideoClipGenerationService } from "../src/modules/generation/video-clip-service.js";
import { createApp } from "../src/app.js";
import type { ProductionAssetsRepository } from "@ai-content-factory/database";

describe("production asset API", () => {
  it("bootstraps a case asset plan through the production assets repository", async () => {
    const asset = createProductionAsset({ _id: "job_001_character_design_global", jobId: "job_001", type: "character_design" });
    const repository = createRepositoryMock({
      bootstrapCase: vi.fn().mockResolvedValue({
        assets: [asset],
        created: 1
      })
    });

    const response = await request(createApp({ productionAssetsRepository: repository }))
      .post("/assets/production/bootstrap-case")
      .send({
        jobId: "job_001",
        sceneCount: 5,
        topic: "rainy convenience store"
      })
      .expect(201);

    expect(response.body).toMatchObject({
      created: 1,
      status: "ASSETS_BOOTSTRAPPED"
    });
    expect(repository.bootstrapCase).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "job_001",
      sceneCount: 5,
      topic: "rainy convenience store"
    }));
  });

  it("generates an OpenAI reference design and stores the result in MongoDB", async () => {
    const existingAsset = createProductionAsset({ _id: "asset_001", jobId: "job_001", type: "character_design" });
    const repository = createRepositoryMock({
      findById: vi.fn().mockResolvedValue(existingAsset),
      patch: vi.fn(async (_id: string, patch: Partial<ProductionAsset>) => ({
        ...existingAsset,
        ...patch
      }))
    });
    const imageGenerationService = {
      generateImages: vi.fn(),
      generateSceneImage: vi.fn(),
      generateReferenceDesign: vi.fn().mockResolvedValue({
        asset: {
          driver: "local",
          publicUrl: "http://127.0.0.1:4000/uploads/jobs/job_001/references/character_design.png",
          storagePath: "uploads/jobs/job_001/references/character_design.png"
        },
        costRM: 0.12,
        designType: "character_design",
        jobId: "job_001",
        model: "gpt-image-1",
        prompt: "production character design prompt",
        provider: "openai",
        role: "reference_image",
        status: "REFERENCE_DONE",
        visualBible: {
          character: {
            ageRange: "adult",
            bodyType: "average",
            expressionRange: "calm",
            fixedProps: [],
            hair: "short dark hair",
            name: "Mira",
            role: "protagonist",
            signatureDetails: "navy coat",
            wardrobe: "navy coat"
          },
          environment: {
            keyObjects: [],
            lighting: "soft",
            location: "store",
            palette: "blue",
            recurringDetails: "rain"
          },
          negativePrompt: "no text",
          style: "cinematic"
        }
      })
    } as unknown as ImageGenerationService;

    const response = await request(createApp({ imageGenerationService, productionAssetsRepository: repository }))
      .post("/assets/production/asset_001/generate")
      .send({
        costLimitRM: 7.5,
        language: "zh-CN",
        prompt: "Create a reference design.",
        sceneCount: 5,
        templateType: "urban_legend",
        topic: "rainy convenience store"
      })
      .expect(201);

    expect(response.body).toMatchObject({
      costRM: 0.12,
      status: "ASSET_GENERATED"
    });
    expect(imageGenerationService.generateReferenceDesign).toHaveBeenCalledOnce();
    expect(repository.patch).toHaveBeenLastCalledWith("asset_001", expect.objectContaining({
      provider: "openai",
      role: "reference_image",
      status: "ready",
      url: "http://127.0.0.1:4000/uploads/jobs/job_001/references/character_design.png"
    }));
  });

  it("hydrates Seedance inputs from approved MongoDB production assets", async () => {
    const capturedInputs: GenerateVideoClipRequest[] = [];
    const assets = [
      createProductionAsset({ _id: "ref_ready", jobId: "job_001", role: "reference_image", status: "approved", type: "character_design", url: "https://cdn.example.test/character.png" }),
      createProductionAsset({ _id: "first_ready", jobId: "job_001", role: "first_frame", sceneId: 1, status: "ready", type: "first_frame", url: "https://cdn.example.test/scene-01.png" }),
      createProductionAsset({ _id: "ref_rejected", jobId: "job_001", role: "reference_image", status: "rejected", type: "scene_design", url: "https://cdn.example.test/rejected.png" })
    ];
    const repository = createRepositoryMock({
      list: vi.fn(async (filter) => assets.filter((asset) => filter?.status && Array.isArray(filter.status) ? filter.status.includes(asset.status) : true))
    });
    const videoClipGenerationService = {
      generateVideoClip: vi.fn(async (input: GenerateVideoClipRequest) => {
        capturedInputs.push(input);
        return {
          clip: {
            asset: {
              driver: "local",
              publicUrl: "http://127.0.0.1:4000/uploads/jobs/job_001/clips/scene_01.mp4",
              storagePath: "uploads/jobs/job_001/clips/scene_01.mp4"
            },
            costRM: 1,
            durationSeconds: 5,
            mode: "image-to-video",
            prompt: input.prompt,
            referenceImageUrls: input.referenceImageUrls,
            sceneId: input.sceneId ?? 1,
            sourceImageUrl: input.imageUrl,
            taskId: "task_001"
          },
          costRM: 1,
          jobId: input.jobId ?? "job_001",
          model: "seedance-2-0",
          provider: "seedance",
          status: "VIDEO_DONE"
        };
      })
    } as unknown as VideoClipGenerationService;

    await request(
      createApp({
        productionAssetsRepository: repository,
        videoClipGenerationService
      })
    )
      .post("/generation/video-clips/scene")
      .send({
        jobId: "job_001",
        prompt: "slow camera push",
        referenceImageUrls: ["https://request.example.test/should-not-be-used.png"],
        sceneId: 1,
        topic: "rainy convenience store"
      })
      .expect(201);

    expect(capturedInputs[0]).toMatchObject({
      imageUrl: "https://cdn.example.test/scene-01.png",
      referenceImageUrls: [],
      sceneId: 1
    });
  });
});

function createRepositoryMock(overrides: Partial<ProductionAssetsRepository> = {}): ProductionAssetsRepository {
  return {
    bootstrapCase: vi.fn().mockResolvedValue({ assets: [], created: 0 }),
    create: vi.fn(),
    delete: vi.fn(),
    ensureIndexes: vi.fn(),
    findById: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    patch: vi.fn(),
    upsertByPlanningKey: vi.fn(),
    ...overrides
  } as unknown as ProductionAssetsRepository;
}

function createProductionAsset(overrides: Partial<ProductionAsset>): ProductionAsset {
  const now = "2026-05-30T00:00:00.000Z";

  return {
    _id: overrides._id ?? "asset_001",
    costRM: overrides.costRM ?? 0,
    createdAt: now,
    error: overrides.error ?? "",
    folderName: overrides.folderName ?? "未分类",
    jobId: overrides.jobId ?? "job_001",
    label: overrides.label ?? "Production asset",
    notes: overrides.notes ?? "",
    prompt: overrides.prompt ?? "Asset prompt",
    provider: overrides.provider ?? "openai",
    role: overrides.role ?? "reference_image",
    sceneId: overrides.sceneId ?? null,
    scope: overrides.scope ?? (overrides.sceneId ? "scene" : "case"),
    status: overrides.status ?? "planned",
    storagePath: overrides.storagePath ?? "",
    tags: overrides.tags ?? [],
    type: overrides.type ?? "character_design",
    updatedAt: now,
    url: overrides.url ?? ""
  };
}
