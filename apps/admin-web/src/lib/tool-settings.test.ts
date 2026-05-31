import { describe, expect, it } from "vitest";
import {
  applyToolProviderPreset,
  getToolModelOptions,
  getToolProviderPresets,
  loadToolProviderSettings,
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

  it("switches provider preset without wiping custom cost values", () => {
    const setting = {
      ...loadToolProviderSettings()[0]!,
      fallbackCostRM: 1.23,
      inputUnitPriceRM: 0.45,
      outputUnitPriceRM: 0.67
    };

    const next = applyToolProviderPreset(setting, "llm_deepseek");

    expect(next.provider).toBe("deepseek");
    expect(next.model).toBe("deepseek-chat");
    expect(next.inputUnitPriceRM).toBe(0.45);
    expect(next.outputUnitPriceRM).toBe(0.67);
    expect(next.fallbackCostRM).toBe(1.23);
  });
});
