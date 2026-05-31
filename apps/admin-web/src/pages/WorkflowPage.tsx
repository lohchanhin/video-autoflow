import { useMemo, useState } from "react";
import { RefreshCw, Settings2 } from "lucide-react";
import { EmptyState, Field, SectionHeader, StatusPill } from "../components/ui.js";
import type { StaffAgent } from "../lib/agents.js";
import {
  applyToolProviderPreset,
  customToolModelValue,
  customToolProviderValue,
  getToolModelOptions,
  getToolProviderPreset,
  getToolProviderPresets,
  usesCustomToolModel,
  type AiToolEndpoint,
  type ToolProviderSettings,
  type ToolProviderType
} from "../lib/admin-data.js";
import { getProductionStage, productionStages, type ProductionStageId } from "../lib/production.js";

interface WorkflowPageProps {
  agents: StaffAgent[];
  endpoints: AiToolEndpoint[];
  resetSettings: () => void;
  resetEndpoints: () => void;
  settings: ToolProviderSettings[];
  setEndpoints: (updater: (endpoints: AiToolEndpoint[]) => AiToolEndpoint[]) => void;
  updateToolSetting: (id: string, updater: (setting: ToolProviderSettings) => ToolProviderSettings) => void;
}

type WorkflowTab = "pipeline" | "tools" | "readiness";
type PillTone = "neutral" | "active" | "success" | "danger" | "warning";

export function WorkflowPage(props: WorkflowPageProps) {
  const [activeTab, setActiveTab] = useState<WorkflowTab>("pipeline");
  const [selectedStageId, setSelectedStageId] = useState<ProductionStageId>("script");
  const [selectedToolSettingId, setSelectedToolSettingId] = useState<string>(props.settings[0]?.id ?? "");
  const selectedStage = getProductionStage(selectedStageId);
  const producerAgent = props.agents[0] ?? null;
  const stageEndpoint = props.endpoints.find((endpoint) => endpoint.stageIds.includes(selectedStage.id)) ?? null;
  const selectedToolSetting = props.settings.find((setting) => setting.id === selectedToolSettingId) ?? props.settings[0] ?? null;

  const readiness = useMemo(() => {
    const rows = productionStages.map((stage) => {
      const endpoint = props.endpoints.find((candidate) => candidate.stageIds.includes(stage.id)) ?? null;
      const state = getOperationalState(stage.id, endpoint, producerAgent);
      return { stage, endpoint, ...state };
    });
    const requiredRows = rows.filter((row) => row.required);

    return {
      rows,
      readyRequiredCount: requiredRows.filter((row) => row.ready).length,
      requiredCount: requiredRows.length,
      issues: rows.filter((row) => row.tone === "danger" || row.tone === "warning"),
      issueCount: rows.filter((row) => row.tone === "danger").length
    };
  }, [producerAgent, props.endpoints]);

  function updateStageEndpoint(stageId: ProductionStageId, endpointId: string) {
    props.setEndpoints((currentEndpoints) =>
      currentEndpoints.map((endpoint) => {
        const stageIds = endpoint.stageIds.filter((candidate) => candidate !== stageId);

        return {
          ...endpoint,
          stageIds: endpoint.id === endpointId ? [...stageIds, stageId] : stageIds
        };
      })
    );
  }

  return (
    <section className="workflow-shell">
      <section className="panel workflow-command-panel">
        <SectionHeader
          eyebrow="Workflow manager"
          title="路由、工具、就绪检查"
          action={
            <div className="workflow-header-actions">
              <button className="secondary-button" type="button" onClick={props.resetSettings}>
                <RefreshCw size={15} />
                重置模型设置
              </button>
              <button className="secondary-button" type="button" onClick={props.resetEndpoints}>
                <RefreshCw size={15} />
                重置流程路由
              </button>
            </div>
          }
        />
        <div className="workflow-command-row">
          <WorkflowStat label="必要阶段就绪" value={`${readiness.readyRequiredCount}/${readiness.requiredCount}`} tone={readiness.issueCount === 0 ? "success" : "warning"} />
          <WorkflowStat label="允许自动调用" value={`${props.settings.filter((setting) => setting.allowAutopilot && setting.enabled).length}/${props.settings.length}`} tone="active" />
          <WorkflowStat label="阻塞问题" value={String(readiness.issueCount)} tone={readiness.issueCount === 0 ? "success" : "danger"} />
        </div>
        <div className="workflow-tabs" role="tablist" aria-label="Workflow sections">
          <TabButton active={activeTab === "pipeline"} label="流程路由" onClick={() => setActiveTab("pipeline")} />
          <TabButton active={activeTab === "tools"} label="工具设置" onClick={() => setActiveTab("tools")} />
          <TabButton active={activeTab === "readiness"} label="就绪检查" onClick={() => setActiveTab("readiness")} />
        </div>
      </section>

      {activeTab === "pipeline" ? (
        <section className="workflow-tab-layout">
          <section className="panel workflow-list-panel">
            <SectionHeader eyebrow="Stage routing" title="生产流程路由" />
            <div className="workflow-table-scroll">
              <div className="workflow-route-table">
                <div className="workflow-table-header workflow-route-header">
                  <span>步骤</span>
                  <span>输出</span>
                  <span>控制者</span>
                  <span>状态</span>
                  <span>操作</span>
                </div>
                <div className="workflow-stage-list">
                  {readiness.rows.map(({ stage, label, tone }) => (
                    <article className={`workflow-route-row ${selectedStageId === stage.id ? "selected" : ""}`} key={stage.id}>
                      <span className="step-index">{stage.order}</span>
                      <div className="workflow-route-main">
                        <strong title={stage.label}>{stage.label}</strong>
                        <span title={stage.defaultOutput}>{stage.defaultOutput}</span>
                      </div>
                      <span className="agent-controller-cell" title={producerAgent?.name ?? "No agent"}>{producerAgent?.name ?? "No agent"}</span>
                      <StatusPill tone={tone}>{label}</StatusPill>
                      <button
                        className="secondary-button compact-button"
                        type="button"
                        onClick={() => {
                          setSelectedStageId(stage.id);
                          const endpoint = props.endpoints.find((candidate) => candidate.stageIds.includes(stage.id));
                          const setting = props.settings.find((candidate) => endpoint && candidate.toolType === getToolTypeForEndpoint(endpoint));
                          if (setting) setSelectedToolSettingId(setting.id);
                        }}
                      >
                        <Settings2 size={14} />
                        设置
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <aside className="panel workflow-detail-panel">
            <StageInspector
              endpoints={props.endpoints}
              selectedStage={selectedStage}
              stageEndpoint={stageEndpoint}
              updateStageEndpoint={updateStageEndpoint}
              producerAgent={producerAgent}
              openTools={(endpointId) => {
                const endpoint = props.endpoints.find((candidate) => candidate.id === endpointId);
                const toolType = endpoint ? getToolTypeForEndpoint(endpoint) : null;
                const setting = props.settings.find((candidate) => candidate.toolType === toolType);
                if (setting) {
                  setSelectedToolSettingId(setting.id);
                }
                setActiveTab("tools");
              }}
            />
          </aside>
        </section>
      ) : null}

      {activeTab === "tools" ? (
        <section className="workflow-tab-layout">
          <section className="panel workflow-list-panel">
            <SectionHeader eyebrow="Tool registry" title="AI 工具端点" />
            <div className="workflow-table-scroll">
              <div className="workflow-tools-table">
                <div className="workflow-table-header workflow-tools-header">
                  <span>工具</span>
                  <span>供应商 / 模型</span>
                  <span>接口地址</span>
                  <span>成本</span>
                  <span>状态</span>
                </div>
                <div className="workflow-tool-list">
                  {props.settings.map((setting) => (
                    <button
                      className={`workflow-tool-row ${selectedToolSetting?.id === setting.id ? "selected" : ""}`}
                      key={setting.id}
                      type="button"
                      onClick={() => setSelectedToolSettingId(setting.id)}
                    >
                      <div>
                        <strong title={formatToolType(setting.toolType)}>{formatToolType(setting.toolType)}</strong>
                        <span>{setting.allowAutopilot ? "允许自动调用" : "仅手动调用"}</span>
                      </div>
                      <div>
                        <strong title={setting.provider || "未设置"}>{setting.provider || "未设置"}</strong>
                        <span title={setting.model || "缺少模型"}>{setting.model || "缺少模型"}</span>
                      </div>
                      <span className="mono-cell" title={setting.baseUrl || "缺少接口地址"}>{setting.baseUrl || "缺少接口地址"}</span>
                      <span title={formatCostMode(setting)}>{formatCostMode(setting)}</span>
                      <StatusPill tone={getToolSettingTone(setting)}>{setting.enabled ? "启用" : "停用"}</StatusPill>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <aside className="panel workflow-detail-panel">
            {selectedToolSetting ? (
              <>
                <SectionHeader eyebrow="供应商与模型设置" title={formatToolType(selectedToolSetting.toolType)} />
                <ToolProviderEditor setting={selectedToolSetting} updateToolSetting={props.updateToolSetting} />
                <div className="workflow-stage-notes">
                  <strong>路由说明</strong>
                  <span>流程阶段绑定放在“流程路由”。这里负责每个工具的供应商、模型、参数、成本、重试与自动调用权限。</span>
                </div>
              </>
            ) : (
              <EmptyState title="尚未选择工具" body="选择一个工具后，可以编辑供应商、模型、接口、参数、成本和自动调用权限。" />
            )}
          </aside>
        </section>
      ) : null}

      {activeTab === "readiness" ? (
        <section className="panel workflow-readiness-panel">
          <SectionHeader eyebrow="Operational checks" title="就绪检查清单" />
          <div className="readiness-issue-strip">
            {readiness.issues.length === 0 ? (
              <StatusPill tone="success">没有阻塞问题</StatusPill>
            ) : (
              readiness.issues.map(({ stage, endpoint, label, tone }) => (
                <div className="readiness-issue" key={stage.id}>
                  <strong>{stage.label}</strong>
                  <span>{label} / {endpoint?.provider ?? "未绑定工具"}</span>
                  <StatusPill tone={tone}>{tone === "danger" ? "阻塞" : "需检查"}</StatusPill>
                </div>
              ))
            )}
          </div>
          <div className="workflow-readiness-list">
            {readiness.rows.map(({ stage, endpoint, label, tone }) => (
              <article className="workflow-readiness-row" key={stage.id}>
                <span className="step-index">{stage.order}</span>
                <div>
                  <strong>{stage.label}</strong>
                  <span>{stage.defaultInput}</span>
                </div>
                <div>
                  <span className="column-label">负责人</span>
                  <strong>{producerAgent?.name ?? "未设置 Agent"}</strong>
                </div>
                <div>
                  <span className="column-label">工具</span>
                  <strong>{endpoint?.provider ?? "内部处理"}</strong>
                </div>
                <div>
                  <span className="column-label">队列</span>
                  <strong>{endpoint?.queueName ?? stage.queueName}</strong>
                </div>
                <StatusPill tone={tone}>{label}</StatusPill>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function StageInspector(props: {
  endpoints: AiToolEndpoint[];
  producerAgent: StaffAgent | null;
  selectedStage: ReturnType<typeof getProductionStage>;
  stageEndpoint: AiToolEndpoint | null;
  updateStageEndpoint: (stageId: ProductionStageId, endpointId: string) => void;
  openTools: (endpointId: string) => void;
}) {
  const toolAllowed = props.stageEndpoint ? Boolean(props.producerAgent?.allowedToolIds.includes(props.stageEndpoint.id)) : true;

  return (
    <>
      <SectionHeader eyebrow="阶段设置" title={props.selectedStage.label} />
      <div className="workflow-summary-strip">
        <div>
          <span>队列</span>
          <strong>{props.stageEndpoint?.queueName ?? props.selectedStage.queueName}</strong>
        </div>
        <div>
          <span>控制者</span>
          <strong>{props.producerAgent?.name ?? "未设置 Agent"}</strong>
        </div>
        <div>
          <span>工具权限</span>
          <strong>{toolAllowed ? "允许" : "阻止"}</strong>
        </div>
      </div>

      <Field label="阶段工具">
        <select
          value={props.stageEndpoint?.id ?? ""}
          onChange={(event) => props.updateStageEndpoint(props.selectedStage.id, event.target.value)}
          disabled={props.selectedStage.id === "brief"}
        >
          <option value="">不使用外部工具</option>
          {props.endpoints.map((endpoint) => (
            <option key={endpoint.id} value={endpoint.id}>
              {endpoint.stage} - {endpoint.provider}
            </option>
          ))}
        </select>
      </Field>

      <div className="workflow-stage-notes">
        <strong>预期输出</strong>
        <span>{props.selectedStage.defaultOutput}</span>
      </div>

      {props.stageEndpoint ? (
        <button className="primary-button" type="button" onClick={() => props.openTools(props.stageEndpoint!.id)}>
          前往工具设置
        </button>
      ) : (
        <EmptyState title="内部阶段" body="这个阶段由后台内部处理，不需要绑定外部工具。" />
      )}
    </>
  );
}

function ToolProviderEditor(props: {
  setting: ToolProviderSettings;
  updateToolSetting: (id: string, updater: (setting: ToolProviderSettings) => ToolProviderSettings) => void;
}) {
  function patch(patchValue: Partial<ToolProviderSettings>) {
    props.updateToolSetting(props.setting.id, (current) => ({
      ...current,
      ...patchValue,
      updatedAt: new Date().toISOString()
    }));
  }

  function updateParam(name: string, value: string) {
    patch({
      params: {
        ...props.setting.params,
        [name]: coerceParamValue(value)
      }
    });
  }

  const params = Object.entries(props.setting.params);
  const providerPresets = getToolProviderPresets(props.setting.toolType);
  const selectedProviderPreset = getToolProviderPreset(props.setting.toolType, props.setting.provider);
  const modelOptions = getToolModelOptions(props.setting);
  const usesCustomProvider = !selectedProviderPreset;
  const usesCustomModel = usesCustomToolModel(props.setting);
  const providerSelectValue = selectedProviderPreset?.id ?? customToolProviderValue;
  const modelSelectValue = usesCustomModel ? customToolModelValue : props.setting.model;

  function applyPreset(presetId: string) {
    props.updateToolSetting(props.setting.id, (current) => applyToolProviderPreset(current, presetId));
  }

  return (
    <div className="endpoint-editor">
      <label className="toggle-line endpoint-enabled-line">
        <input type="checkbox" checked={props.setting.enabled} onChange={(event) => patch({ enabled: event.target.checked })} />
        <span>启用这个工具</span>
      </label>

      <div className="two-column-fields">
        <Field label="工具类型">
          <input readOnly value={props.setting.toolType} />
        </Field>
        <Field label="API 风格">
          <input value={props.setting.apiStyle} onChange={(event) => patch({ apiStyle: event.target.value })} />
        </Field>
      </div>

      <div className="two-column-fields">
        <Field label="供应商">
          <select value={providerSelectValue} onChange={(event) => applyPreset(event.target.value)}>
            {providerPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
            <option value={customToolProviderValue}>自定义供应商...</option>
          </select>
        </Field>
        <Field label="模型">
          <select value={modelSelectValue} onChange={(event) => patch({ model: event.target.value === customToolModelValue ? "" : event.target.value })}>
            {modelOptions.filter((model) => selectedProviderPreset?.models.includes(model)).map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
            <option value={customToolModelValue}>自定义模型...</option>
          </select>
        </Field>
      </div>

      {usesCustomProvider ? (
        <Field label="自定义供应商 ID">
          <input value={props.setting.provider} onChange={(event) => patch({ provider: event.target.value })} placeholder="例如 custom-video-api" />
        </Field>
      ) : null}

      {usesCustomModel ? (
        <Field label="自定义模型 ID">
          <input value={props.setting.model} onChange={(event) => patch({ model: event.target.value })} placeholder="输入自定义 model id" />
        </Field>
      ) : null}

      <Field label="接口地址">
        <input value={props.setting.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} />
      </Field>

      <div className="two-column-fields">
        <Field label="成本模式">
          <select value={props.setting.costMode} onChange={(event) => patch({ costMode: event.target.value as ToolProviderSettings["costMode"] })}>
            <option value="tokens">tokens</option>
            <option value="image">image</option>
            <option value="second">second</option>
            <option value="character">character</option>
            <option value="credit">credit</option>
            <option value="free">free</option>
            <option value="custom">custom</option>
          </select>
        </Field>
        <Field label="重试次数">
          <input type="number" min={0} max={10} value={props.setting.retryLimit} onChange={(event) => patch({ retryLimit: Number(event.target.value) })} />
        </Field>
      </div>

      <div className="three-column-fields">
        <Field label="输入单价 RM">
          <input type="number" min={0} step="0.0001" value={props.setting.inputUnitPriceRM} onChange={(event) => patch({ inputUnitPriceRM: Number(event.target.value) })} />
        </Field>
        <Field label="输出单价 RM">
          <input type="number" min={0} step="0.0001" value={props.setting.outputUnitPriceRM} onChange={(event) => patch({ outputUnitPriceRM: Number(event.target.value) })} />
        </Field>
        <Field label="保底成本 RM">
          <input type="number" min={0} step="0.0001" value={props.setting.fallbackCostRM} onChange={(event) => patch({ fallbackCostRM: Number(event.target.value) })} />
        </Field>
      </div>

      <label className="toggle-line endpoint-enabled-line">
        <input type="checkbox" checked={props.setting.allowAutopilot} onChange={(event) => patch({ allowAutopilot: event.target.checked })} />
        <span>允许主控 Agent 自动调用这个工具</span>
      </label>

      <div className="tool-param-list">
        <div className="section-heading-row">
          <div>
            <span>工具参数</span>
            <strong>随请求传入的可编辑参数</strong>
          </div>
        </div>
        {params.length === 0 ? <EmptyState title="还没有参数" body="可加入 quality、size、voice、format、aspectRatio 等供应商参数。" /> : null}
        {params.map(([name, value]) => (
          <div className="tool-param-row" key={name}>
            <strong>{name}</strong>
            <input value={String(value)} onChange={(event) => updateParam(name, event.target.value)} />
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() =>
                patch({
                  params: Object.fromEntries(Object.entries(props.setting.params).filter(([key]) => key !== name))
                })
              }
            >
              移除
            </button>
          </div>
        ))}
        <button
          className="secondary-button compact-button"
          type="button"
          onClick={() => {
            const nextName = `param_${params.length + 1}`;
            updateParam(nextName, "");
          }}
        >
          新增参数
        </button>
      </div>
    </div>
  );
}

function coerceParamValue(value: string): boolean | number | string {
  if (value === "true") return true;
  if (value === "false") return false;

  const numericValue = Number(value);
  return value.trim() !== "" && Number.isFinite(numericValue) ? numericValue : value;
}

function WorkflowStat(props: { label: string; value: string; tone: PillTone }) {
  return (
    <div className="workflow-stat">
      <span>{props.label}</span>
      <StatusPill tone={props.tone}>{props.value}</StatusPill>
    </div>
  );
}

function TabButton(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`workflow-tab ${props.active ? "active" : ""}`} type="button" role="tab" aria-selected={props.active} onClick={props.onClick}>
      {props.label}
    </button>
  );
}

function getToolSettingTone(setting: ToolProviderSettings): PillTone {
  if (!setting.enabled) return "neutral";
  if (!setting.model.trim() && setting.toolType !== "storage") return "danger";
  if (!setting.baseUrl.trim()) return "warning";
  return "success";
}

function getToolTypeForEndpoint(endpoint: AiToolEndpoint): ToolProviderType {
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

function formatToolType(toolType: ToolProviderType): string {
  const labels: Record<ToolProviderType, string> = {
    bgm: "背景音乐",
    compose: "FFmpeg 合成",
    design_image: "设计图",
    image: "场景图片",
    llm: "脚本 / 分镜",
    storage: "存储",
    subtitle: "字幕",
    tts: "配音 / TTS",
    video: "视频片段",
    youtube: "YouTube 发布"
  };

  return labels[toolType];
}

function formatCostMode(setting: ToolProviderSettings): string {
  if (setting.costMode === "free") return "免费";
  if (setting.inputUnitPriceRM > 0 || setting.outputUnitPriceRM > 0) {
    return `${setting.costMode} / RM ${setting.inputUnitPriceRM.toFixed(4)} + ${setting.outputUnitPriceRM.toFixed(4)}`;
  }
  if (setting.fallbackCostRM > 0) return `${setting.costMode} / 保底 RM ${setting.fallbackCostRM.toFixed(4)}`;
  return `${setting.costMode} / 未定价`;
}

function getOperationalState(stageId: ProductionStageId, endpoint: AiToolEndpoint | null, agent: StaffAgent | null): { label: string; tone: PillTone; ready: boolean; required: boolean } {
  if (!agent || agent.status !== "active") {
    return { label: "Agent 未启用", tone: "danger", ready: false, required: stageId !== "video" };
  }

  if (stageId === "brief") {
    return { label: "就绪", tone: "success", ready: true, required: true };
  }

  if (!endpoint) {
    return { label: "缺少工具", tone: "danger", ready: false, required: stageId !== "video" };
  }

  if (!agent.allowedToolIds.includes(endpoint.id)) {
    return { label: "工具未授权", tone: "danger", ready: false, required: stageId !== "video" };
  }

  if (!endpoint.enabled || endpoint.status === "disabled") {
    if (stageId === "video") {
      return { label: "可选关闭", tone: "neutral", ready: true, required: false };
    }

    return { label: "已停用", tone: "danger", ready: false, required: true };
  }

  if (endpoint.status === "needs_setup") {
    return { label: "需要设置", tone: "danger", ready: false, required: stageId !== "video" };
  }

  return { label: "就绪", tone: "success", ready: true, required: stageId !== "video" };
}
