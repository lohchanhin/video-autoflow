import { describe, expect, it } from "vitest";
import {
  applyToolModelPricing,
  applyToolProviderPreset,
  getToolModelOptions,
  getToolProviderPresets,
  loadToolProviderSettings,
  openAILlmModels,
  usesCustomToolModel
} from "./admin-data.js";

describe("tool provider settings", () => {
  it("loads default settings with selectable model presets for every tool", () => {
    const settings = loadToolProviderSettings();

    expect(settings.length).toBeGreaterThan(0);

    for (const setting of settings) {
      const presets = getToolProviderPresets(setting.toolType);
      const models = getToolModelOptions(setting);

      expect(presets.length, `${setting.toolType} presets`).toBeGreaterThan(0);
      expect(models.length, `${setting.toolType} models`).toBeGreaterThan(0);
    }
  });

  it("preserves custom model ids instead of normalizing them away", () => {
    const setting = {
      ...loadToolProviderSettings()[0]!,
      model: "company-private-model-v9"
    };

    expect(usesCustomToolModel(setting)).toBe(true);
    expect(getToolModelOptions(setting)).toContain("company-private-model-v9");
  });

  it("includes current OpenAI frontier presets and synced account models", () => {
    const setting = loadToolProviderSettings().find((candidate) => candidate.toolType === "llm")!;

    expect(openAILlmModels).toContain("gpt-5.5");
    expect(openAILlmModels).toContain("gpt-5.4-mini");
    expect(getToolModelOptions(setting)).toContain("gpt-5.5");
    expect(getToolModelOptions(setting, ["gpt-5.5-account-snapshot"])).toContain("gpt-5.5-account-snapshot");
    expect(usesCustomToolModel({ ...setting, model: "gpt-5.5-account-snapshot" }, ["gpt-5.5-account-snapshot"])).toBe(false);
  });

  it("loads official pricing defaults for paid tools", () => {
    const settings = loadToolProviderSettings();
    const llm = settings.find((candidate) => candidate.toolType === "llm")!;
    const image = settings.find((candidate) => candidate.toolType === "image")!;
    const tts = settings.find((candidate) => candidate.toolType === "tts")!;
    const bgm = settings.find((candidate) => candidate.toolType === "bgm")!;
    const video = settings.find((candidate) => candidate.toolType === "video")!;
    const youtube = settings.find((candidate) => candidate.toolType === "youtube")!;

    expect(llm.inputUnitPriceRM).toBeGreaterThan(0);
    expect(llm.outputUnitPriceRM).toBeGreaterThan(0);
    expect(image.outputUnitPriceRM).toBeGreaterThan(0);
    expect(tts.outputUnitPriceRM).toBeGreaterThan(0);
    expect(bgm.outputUnitPriceRM).toBeGreaterThan(0);
    expect(video.outputUnitPriceRM).toBe(27.65);
    expect(video.fallbackCostRM).toBe(0.28);
    expect(youtube.costMode).toBe("free");
    expect(youtube.pricingSource).toContain("quota");
  });

  it("updates auto pricing when a model changes", () => {
    const setting = loadToolProviderSettings().find((candidate) => candidate.toolType === "llm")!;
    const next = applyToolModelPricing(setting, "gpt-5.5");

    expect(next.model).toBe("gpt-5.5");
    expect(next.inputUnitPriceRM).toBeGreaterThan(setting.inputUnitPriceRM);
    expect(next.outputUnitPriceRM).toBeGreaterThan(setting.outputUnitPriceRM);
    expect(next.pricingSource).toContain("gpt-5.5");
  });

  it("switches provider preset without wiping custom cost values", () => {
    const setting = {
      ...loadToolProviderSettings()[0]!,
      fallbackCostRM: 1.23,
      inputUnitPriceRM: 0.45,
      outputUnitPriceRM: 0.67,
      pricingSource: "manual"
    };

    const next = applyToolProviderPreset(setting, "llm_deepseek");

    expect(next.provider).toBe("deepseek");
    expect(next.model).toBe("deepseek-v4-flash");
    expect(next.inputUnitPriceRM).toBe(0.45);
    expect(next.outputUnitPriceRM).toBe(0.67);
    expect(next.fallbackCostRM).toBe(1.23);
  });

  it("preserves manual pricing when a model changes", () => {
    const setting = {
      ...loadToolProviderSettings().find((candidate) => candidate.toolType === "llm")!,
      inputUnitPriceRM: 0.45,
      outputUnitPriceRM: 0.67,
      pricingSource: "manual"
    };
    const next = applyToolModelPricing(setting, "gpt-5.5");

    expect(next.model).toBe("gpt-5.5");
    expect(next.inputUnitPriceRM).toBe(0.45);
    expect(next.outputUnitPriceRM).toBe(0.67);
    expect(next.pricingSource).toBe("manual");
  });
});
