import { describe, expect, it } from "vitest";
import { defaultStaffAgents, getDefaultOwnerAgentIdForStage, loadStaffAgents } from "./agents.js";

describe("staff agents", () => {
  it("loads one AI Producer Agent without browser storage", () => {
    const agents = loadStaffAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]?.id).toBe("agent_ai_producer");
    expect(agents[0]?.type).toBe("ai");
    expect(agents[0]?.assignedStages).toContain("script");
    expect(agents[0]?.allowedToolIds).toContain("tool_llm");
  });

  it("resolves the single producer as the owner for every stage", () => {
    expect(getDefaultOwnerAgentIdForStage("script", defaultStaffAgents)).toBe("agent_ai_producer");
    expect(getDefaultOwnerAgentIdForStage("publish", defaultStaffAgents)).toBe("agent_ai_producer");
  });
});
