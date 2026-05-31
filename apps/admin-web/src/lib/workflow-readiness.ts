import type { StaffAgent } from "./agents.js";
import type { AiToolEndpoint, ToolProviderSettings, ToolProviderType } from "./admin-data.js";
import type { ProductionStageId } from "./production.js";

export type WorkflowReadinessTone = "neutral" | "active" | "success" | "danger" | "warning";

export interface WorkflowOperationalState {
  label: string;
  ready: boolean;
  required: boolean;
  tone: WorkflowReadinessTone;
}

const optionalStageIds = new Set<ProductionStageId>(["video", "bgm", "publish", "archive"]);
const internalStageIds = new Set<ProductionStageId>(["brief", "qc"]);

export function getToolTypeForEndpoint(endpoint: AiToolEndpoint): ToolProviderType {
  if (endpoint.id === "tool_llm") return "llm";
  if (endpoint.id === "tool_image") return "image";
  if (endpoint.id === "tool_tts") return "tts";
  if (endpoint.id === "tool_music") return "bgm";
  if (endpoint.id === "tool_video") return "video";
  if (endpoint.id === "tool_subtitle") return "subtitle";
  if (endpoint.id === "tool_compose") return "compose";
  if (endpoint.id === "tool_youtube") return "youtube";
  if (endpoint.id === "tool_storage") return "storage";
  return "llm";
}

export function getToolTypeForStage(stageId: ProductionStageId, endpoint: AiToolEndpoint | null): ToolProviderType | null {
  if (endpoint) {
    return getToolTypeForEndpoint(endpoint);
  }

  if (stageId === "script" || stageId === "storyboard" || stageId === "prompt") return "llm";
  if (stageId === "image") return "image";
  if (stageId === "video") return "video";
  if (stageId === "tts") return "tts";
  if (stageId === "bgm") return "bgm";
  if (stageId === "subtitle") return "subtitle";
  if (stageId === "compose") return "compose";
  if (stageId === "publish") return "youtube";
  if (stageId === "archive") return "storage";

  return null;
}

export function findWorkflowToolSetting(settings: ToolProviderSettings[], toolType: ToolProviderType | null): ToolProviderSettings | null {
  if (!toolType) {
    return null;
  }

  return settings.find((setting) => setting.toolType === toolType && setting.enabled) ?? settings.find((setting) => setting.toolType === toolType) ?? null;
}

export function getWorkflowOperationalState(input: {
  agent: StaffAgent | null;
  endpoint: AiToolEndpoint | null;
  setting: ToolProviderSettings | null;
  stageId: ProductionStageId;
}): WorkflowOperationalState {
  const required = !optionalStageIds.has(input.stageId);

  if (internalStageIds.has(input.stageId)) {
    return { label: "就绪", ready: true, required, tone: "success" };
  }

  if (!input.agent || input.agent.status !== "active") {
    return { label: "Agent 未启用", ready: false, required, tone: required ? "danger" : "warning" };
  }

  if (!input.endpoint && required) {
    return { label: "未绑定流程路由", ready: false, required, tone: "danger" };
  }

  if (!input.setting) {
    return {
      label: required ? "缺少工具设置" : "可选工具未设置",
      ready: !required,
      required,
      tone: required ? "danger" : "neutral"
    };
  }

  if (!input.setting.enabled) {
    return {
      label: required ? "工具已停用" : "可选关闭",
      ready: !required,
      required,
      tone: required ? "danger" : "neutral"
    };
  }

  if (input.endpoint && !input.agent.allowedToolIds.includes(input.endpoint.id)) {
    return {
      label: required ? "Agent 未授权工具" : "可选工具未授权",
      ready: !required,
      required,
      tone: required ? "danger" : "warning"
    };
  }

  if (toolNeedsModel(input.setting) && !input.setting.model.trim()) {
    return { label: "缺少模型", ready: false, required, tone: required ? "danger" : "warning" };
  }

  if (!input.setting.baseUrl.trim()) {
    return { label: "缺少接口地址", ready: false, required, tone: required ? "danger" : "warning" };
  }

  if (!input.setting.allowAutopilot) {
    return { label: "仅手动调用", ready: true, required, tone: required ? "warning" : "neutral" };
  }

  if (isExternalPaidTool(input.setting) && !hasPricing(input.setting)) {
    return { label: "就绪，待补成本单价", ready: true, required, tone: "warning" };
  }

  return { label: "就绪", ready: true, required, tone: "success" };
}

function toolNeedsModel(setting: ToolProviderSettings): boolean {
  return setting.toolType !== "storage";
}

function isExternalPaidTool(setting: ToolProviderSettings): boolean {
  return setting.provider !== "local" && setting.costMode !== "free";
}

function hasPricing(setting: ToolProviderSettings): boolean {
  return setting.inputUnitPriceRM > 0 || setting.outputUnitPriceRM > 0 || setting.fallbackCostRM > 0;
}
