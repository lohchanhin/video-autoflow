import { describe, expect, it } from "vitest";
import { defaultProducerAgent } from "./agents.js";
import { loadAiToolEndpoints, loadToolProviderSettings, type ToolProviderSettings } from "./admin-data.js";
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
});
