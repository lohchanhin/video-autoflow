import { describe, expect, it, vi } from "vitest";
import { defaultProducerAgent, defaultStaffAgents, getDefaultOwnerAgentIdForStage, loadStaffAgents } from "./agents.js";

describe("staff agents", () => {
  it("loads one AI Producer Agent without browser storage", () => {
    const agents = loadStaffAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]?.id).toBe("agent_ai_producer");
    expect(agents[0]?.type).toBe("ai");
    expect(agents[0]?.assignedStages).toContain("script");
    expect(agents[0]?.allowedToolIds).toContain("tool_llm");
    expect(agents[0]?.allowedToolIds).toContain("tool_video");
  });

  it("resolves the single producer as the owner for every stage", () => {
    expect(getDefaultOwnerAgentIdForStage("script", defaultStaffAgents)).toBe("agent_ai_producer");
    expect(getDefaultOwnerAgentIdForStage("publish", defaultStaffAgents)).toBe("agent_ai_producer");
  });

  it("migrates legacy full-access producer agents to include the video tool", () => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    const legacyAgent = {
      ...defaultProducerAgent,
      allowedToolIds: defaultProducerAgent.allowedToolIds.filter((toolId) => toolId !== "tool_video")
    };

    localStorage.setItem("ai-content-factory:staff-agents", JSON.stringify([legacyAgent]));

    expect(loadStaffAgents()[0]?.allowedToolIds).toContain("tool_video");
    vi.unstubAllGlobals();
  });
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => store.delete(key),
    setItem: (key, value) => store.set(key, value)
  };
}
