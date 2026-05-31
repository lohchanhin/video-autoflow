import { productionStageIds, type ProductionStageId } from "./production.js";
import { readJson, writeJson } from "./local-storage.js";
import { createId } from "./ids.js";

export type StaffAgentType = "ai" | "human" | "system";
export type StaffAgentStatus = "active" | "paused" | "needs_setup";
export type AgentPlanningMode = "guided" | "autonomous_reviewed" | "manual_only";

export interface StaffAgent {
  id: string;
  name: string;
  type: StaffAgentType;
  role: string;
  responsibilities: string;
  assignedStages: ProductionStageId[];
  defaultProvider: string;
  queueNames: string[];
  status: StaffAgentStatus;
  costGuardRM: number;
  notes: string;
  mission: string;
  systemPrompt: string;
  allowedToolIds: string[];
  memorySources: string[];
  planningMode: AgentPlanningMode;
  humanApprovalPolicy: string;
  publishingPolicy: string;
  fallbackStrategy: string;
  updatedAt: string;
}

export interface NewStaffAgentInput {
  name: string;
  type: StaffAgentType;
  role: string;
}

const staffAgentsStorageKey = "ai-content-factory:staff-agents";
export const producerAgentId = "agent_ai_producer";

const allQueueNames = [
  "jobs.create",
  "script.queue",
  "storyboard.queue",
  "prompt.queue",
  "image.queue",
  "video.queue",
  "tts.queue",
  "bgm.queue",
  "subtitle.queue",
  "compose.queue",
  "qc.queue",
  "publish.queue",
  "storage.write"
];

const legacyAgentNames = new Set([
  "Content Producer",
  "Script Agent",
  "Storyboard Agent",
  "Prompt Agent",
  "Image Agent",
  "Voice Agent",
  "Subtitle Agent",
  "Composer Agent",
  "QC Reviewer",
  "Publisher Agent",
  "Storage Operator",
  "Human Reviewer"
]);

export const defaultProducerAgent: StaffAgent = {
  id: producerAgentId,
  name: "AI Producer Agent",
  type: "ai",
  role: "Autonomous content producer",
  responsibilities:
    "Plans each Shorts case, selects tools, invokes generation/assembly tools, reviews outputs, controls budget, and asks for human approval before risky actions.",
  assignedStages: [...productionStageIds],
  defaultProvider: "Agent Runtime + Tool Registry",
  queueNames: allQueueNames,
  status: "active",
  costGuardRM: 7.5,
  mission:
    "Create high-retention fictional Shorts across approved genres from a topic brief while keeping uploads private, costs controlled, and every tool call auditable.",
  systemPrompt:
    "You are the AI Producer Agent for an AI Content Operations Factory. Observe the case brief, selected genre, and channel target; plan the production steps; choose only approved tools; create or request artifacts; critique outputs; record decisions; respect safety rules; and require human review before publishing actions.",
  allowedToolIds: [
    "tool_llm",
    "tool_image",
    "tool_tts",
    "tool_music",
    "tool_subtitle",
    "tool_compose",
    "tool_youtube",
    "tool_storage"
  ],
  memorySources: ["channel profile", "content templates", "case history", "cost logs", "analytics feedback"],
  planningMode: "autonomous_reviewed",
  humanApprovalPolicy: "Require human approval before YouTube upload, scheduling, public publishing, or budget override.",
  publishingPolicy: "YouTube upload must remain private in MVP. Public publishing is not allowed.",
  fallbackStrategy:
    "If a required paid tool is disabled, unavailable, missing credentials, or over budget, stop the stage and show a setup reminder. Do not create mock production content.",
  notes: "This is the only decision-making agent. Stage workers are tools, not separate agents.",
  updatedAt: new Date(Date.now() - 1000 * 60 * 20).toISOString()
};

export const defaultStaffAgents: StaffAgent[] = [defaultProducerAgent];

export function loadStaffAgents(): StaffAgent[] {
  return normalizeStaffAgents(readJson(staffAgentsStorageKey, defaultStaffAgents));
}

export function saveStaffAgents(agents: StaffAgent[]): void {
  writeJson(staffAgentsStorageKey, normalizeStaffAgents(agents));
}

export function resetStaffAgents(): StaffAgent[] {
  writeJson(staffAgentsStorageKey, defaultStaffAgents);
  return defaultStaffAgents;
}

export function createStaffAgent(input: NewStaffAgentInput): StaffAgent {
  return {
    ...defaultProducerAgent,
    id: createId("agent"),
    name: input.name,
    type: input.type,
    role: input.role,
    responsibilities: "Define this agent's operating responsibilities.",
    updatedAt: new Date().toISOString()
  };
}

export function getDefaultOwnerAgentIdForStage(_stageId: ProductionStageId, agents: StaffAgent[]): string {
  return agents[0]?.id ?? producerAgentId;
}

export function getAgentLabel(agentId: string, agents: StaffAgent[]): string {
  return agents.find((agent) => agent.id === agentId)?.name ?? defaultProducerAgent.name;
}

export function getAgentTypeLabel(type: StaffAgentType): string {
  if (type === "ai") {
    return "AI";
  }

  if (type === "human") {
    return "Human";
  }

  return "System";
}

function normalizeStaffAgents(agents: StaffAgent[]): StaffAgent[] {
  const storedProducer = agents.find((agent) => agent.id === producerAgentId) ?? agents.find((agent) => agent.type === "ai") ?? agents[0];
  if (!storedProducer) {
    return defaultStaffAgents;
  }
  const producerCandidate = storedProducer.id === producerAgentId ? storedProducer : defaultProducerAgent;

  return [
    {
      ...defaultProducerAgent,
      ...producerCandidate,
      id: producerAgentId,
      name: legacyAgentNames.has(producerCandidate.name) ? defaultProducerAgent.name : producerCandidate.name || defaultProducerAgent.name,
      type: "ai",
      assignedStages: [...productionStageIds],
      queueNames: producerCandidate.queueNames?.length ? producerCandidate.queueNames : allQueueNames,
      status: producerCandidate.status ?? defaultProducerAgent.status,
      costGuardRM: producerCandidate.costGuardRM ?? defaultProducerAgent.costGuardRM,
      mission: normalizeLegacyAgentText(producerCandidate.mission, defaultProducerAgent.mission),
      systemPrompt: normalizeLegacyAgentText(producerCandidate.systemPrompt, defaultProducerAgent.systemPrompt),
      allowedToolIds: producerCandidate.allowedToolIds ?? defaultProducerAgent.allowedToolIds,
      memorySources: producerCandidate.memorySources ?? defaultProducerAgent.memorySources,
      planningMode: producerCandidate.planningMode ?? defaultProducerAgent.planningMode,
      humanApprovalPolicy: producerCandidate.humanApprovalPolicy ?? defaultProducerAgent.humanApprovalPolicy,
      publishingPolicy: producerCandidate.publishingPolicy ?? defaultProducerAgent.publishingPolicy,
      fallbackStrategy: producerCandidate.fallbackStrategy ?? defaultProducerAgent.fallbackStrategy,
      notes: producerCandidate.notes ?? defaultProducerAgent.notes,
      updatedAt: producerCandidate.updatedAt ?? new Date().toISOString()
    }
  ];
}

function normalizeLegacyAgentText(value: string | undefined, fallback: string): string {
  if (!value || value.includes("AI Horror Shorts") || value.includes("fictional horror Shorts")) {
    return fallback;
  }

  return value;
}
