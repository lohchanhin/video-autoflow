import { describe, expect, it } from "vitest";
import { defaultProducerAgent } from "./agents.js";
import { loadAiToolEndpoints, loadProviderKeys, loadToolProviderSettings, type ProviderKeyRecord, type ToolProviderSettings } from "./admin-data.js";
import {
  findWorkflowToolSetting,
  getToolTypeForStage,
  getWorkflowOperationalState
} from "./workflow-readiness.js";

describe("workflow readiness", () => {
  it("uses tool provider settings instead of legacy endpoint setup flags", () => {
    const endpoints = loadAiToolEndpoints();
    const settings = loadToolProviderSettings();
    const endpoint = endpoints.find((candidate) => candidate.id === "tool_llm")!;
    const setting = findWorkflowToolSetting(settings, getToolTypeForStage("script", endpoint));

    expect(endpoint.status).toBe("needs_setup");

    const state = getWorkflowOperationalState({
      agent: defaultProducerAgent,
      endpoint,
      setting,
      stageId: "script"
    });

    expect(state.ready).toBe(true);
    expect(state.tone).not.toBe("danger");
  });

  it("treats QC as an internal stage that does not need an external tool", () => {
    const state = getWorkflowOperationalState({
      agent: defaultProducerAgent,
      endpoint: null,
      setting: null,
      stageId: "qc"
    });

    expect(state).toMatchObject({
      ready: true,
      required: true,
      tone: "success"
    });
  });

  it("does not hard-block optional publishing and archive stages", () => {
    const publishState = getWorkflowOperationalState({
      agent: defaultProducerAgent,
      endpoint: null,
      setting: null,
      stageId: "publish"
    });
    const archiveState = getWorkflowOperationalState({
      agent: defaultProducerAgent,
      endpoint: null,
      setting: null,
      stageId: "archive"
    });

    expect(publishState.ready).toBe(true);
    expect(publishState.required).toBe(false);
    expect(publishState.tone).not.toBe("danger");
    expect(archiveState.ready).toBe(true);
    expect(archiveState.required).toBe(false);
    expect(archiveState.tone).not.toBe("danger");
  });

  it("still blocks required stages when their configured model is missing", () => {
    const endpoint = loadAiToolEndpoints().find((candidate) => candidate.id === "tool_llm")!;
    const setting = {
      ...loadToolProviderSettings().find((candidate) => candidate.toolType === "llm")!,
      model: ""
    } satisfies ToolProviderSettings;

    const state = getWorkflowOperationalState({
      agent: defaultProducerAgent,
      endpoint,
      setting,
      stageId: "script"
    });

    expect(state).toMatchObject({
      ready: false,
      required: true,
      tone: "danger"
    });
  });

  it("blocks required external tools when the matching provider key is missing", () => {
    const endpoint = loadAiToolEndpoints().find((candidate) => candidate.id === "tool_llm")!;
    const setting = loadToolProviderSettings().find((candidate) => candidate.toolType === "llm")!;
    const state = getWorkflowOperationalState({
      agent: defaultProducerAgent,
      endpoint,
      providerKeys: loadProviderKeys(),
      setting,
      stageId: "script"
    });

    expect(state.ready).toBe(false);
    expect(state.tone).toBe("danger");
    expect(state.label).toContain("OPENAI_API_KEY");
  });

  it("allows required external tools after the matching provider key is configured", () => {
    const endpoint = loadAiToolEndpoints().find((candidate) => candidate.id === "tool_llm")!;
    const setting = loadToolProviderSettings().find((candidate) => candidate.toolType === "llm")!;
    const state = getWorkflowOperationalState({
      agent: defaultProducerAgent,
      endpoint,
      providerKeys: configuredProviderKeys(["OPENAI_API_KEY"]),
      setting,
      stageId: "script"
    });

    expect(state.ready).toBe(true);
    expect(state.tone).not.toBe("danger");
  });

  it("warns instead of hard-blocking optional video tools when Seedance key is missing", () => {
    const endpoint = loadAiToolEndpoints().find((candidate) => candidate.id === "tool_video")!;
    const setting = loadToolProviderSettings().find((candidate) => candidate.toolType === "video")!;
    const state = getWorkflowOperationalState({
      agent: defaultProducerAgent,
      endpoint,
      providerKeys: loadProviderKeys(),
      setting,
      stageId: "video"
    });

    expect(state.ready).toBe(true);
    expect(state.required).toBe(false);
    expect(state.tone).toBe("warning");
    expect(state.label).toContain("BYTEPLUS_ARK_API_KEY");
  });
});

function configuredProviderKeys(keyNames: string[]): ProviderKeyRecord[] {
  return loadProviderKeys().map((key) =>
    keyNames.includes(key.keyName)
      ? {
          ...key,
          lastFour: "test",
          status: "configured",
          updatedAt: new Date(0).toISOString()
        }
      : key
  );
}
