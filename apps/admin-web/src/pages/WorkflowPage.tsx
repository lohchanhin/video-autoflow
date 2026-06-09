import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Settings2 } from "lucide-react";
import { EditableActionBar, EmptyState, Field, SectionHeader, StatusPill } from "../components/ui.js";
import type { StaffAgent } from "../lib/agents.js";
import {
  applyToolModelPricing,
  applyToolProviderPreset,
  customToolModelValue,
  customToolProviderValue,
  getToolModelOptions,
  getToolProviderPreset,
  getToolProviderPresets,
  usesCustomToolModel,
  type AiToolEndpoint,
  type ProviderKeyRecord,
  type ToolProviderSettings,
  type ToolProviderType
} from "../lib/admin-data.js";
import { listOpenAIModels } from "../lib/api.js";
import { confirmDiscardDirtyDraft, createDraftPatch, useEditableDraft } from "../lib/editable-draft.js";
import { getProductionStage, productionStages, type ProductionStageId } from "../lib/production.js";
import {
  findWorkflowToolSetting,
  getToolTypeForEndpoint,
  getToolTypeForStage,
  getWorkflowOperationalState,
  type WorkflowReadinessTone
} from "../lib/workflow-readiness.js";

interface WorkflowPageProps {
  agents: StaffAgent[];
  endpoints: AiToolEndpoint[];
  openAgentSettings: () => void;
  openKeySettings: () => void;
  providerKeys: ProviderKeyRecord[];
  reportDirtyState?: (key: string, isDirty: boolean) => void;
  resetSettings: () => void;
  resetEndpoints: () => void;
  settings: ToolProviderSettings[];
  setEndpoints: (updater: (endpoints: AiToolEndpoint[]) => AiToolEndpoint[]) => void;
  updateToolSetting: (id: string, updater: (setting: ToolProviderSettings) => ToolProviderSettings) => void;
}

type WorkflowTab = "pipeline" | "tools" | "readiness";
type PillTone = WorkflowReadinessTone;
type ModelSyncStatus = "idle" | "loading" | "loaded" | "error";

interface ModelSyncState {
  error?: string | undefined;
  models: string[];
  status: ModelSyncStatus;
  timestamp?: string | undefined;
}

const idleModelSyncState: ModelSyncState = {
  models: [],
  status: "idle"
};

export function WorkflowPage(props: WorkflowPageProps) {
  const [activeTab, setActiveTab] = useState<WorkflowTab>("pipeline");
  const [modelSyncStates, setModelSyncStates] = useState<Record<string, ModelSyncState>>({});
  const [selectedStageId, setSelectedStageId] = useState<ProductionStageId>("script");
  const [selectedToolSettingId, setSelectedToolSettingId] = useState<string>(props.settings[0]?.id ?? "");
  const [dirtyWorkflowDrafts, setDirtyWorkflowDrafts] = useState<Record<string, boolean>>({});
  const selectedStage = getProductionStage(selectedStageId);
  const producerAgent = props.agents[0] ?? null;
  const stageEndpoint = props.endpoints.find((endpoint) => endpoint.stageIds.includes(selectedStage.id)) ?? null;
  const selectedToolSetting = props.settings.find((setting) => setting.id === selectedToolSettingId) ?? props.settings[0] ?? null;
  const selectedModelSyncState = selectedToolSetting ? modelSyncStates[getModelSyncKey(selectedToolSetting)] ?? idleModelSyncState : idleModelSyncState;
  const hasDirtyWorkflowDraft = Object.values(dirtyWorkflowDrafts).some(Boolean);

  const reportWorkflowDirtyState = useCallback((key: string, isDirty: boolean) => {
    setDirtyWorkflowDrafts((currentDrafts) => {
      if (isDirty) {
        return { ...currentDrafts, [key]: true };
      }

      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[key];
      return nextDrafts;
    });
    props.reportDirtyState?.(key, isDirty);
  }, [props.reportDirtyState]);

  const readiness = useMemo(() => {
    const rows = productionStages.map((stage) => {
      const endpoint = props.endpoints.find((candidate) => candidate.stageIds.includes(stage.id)) ?? null;
      const toolType = getToolTypeForStage(stage.id, endpoint);
      const setting = findWorkflowToolSetting(props.settings, toolType);
      const state = getWorkflowOperationalState({ agent: producerAgent, endpoint, providerKeys: props.providerKeys, setting, stageId: stage.id });
      return { stage, endpoint, setting, ...state };
    });
    const requiredRows = rows.filter((row) => row.required);
    const blockingIssues = rows.filter((row) => row.required && !row.ready);
    const attentionItems = rows.filter((row) => row.tone === "warning" && row.ready);
    const optionalIssues = rows.filter((row) => !row.required && !row.ready);
    const attentionCount = attentionItems.length + optionalIssues.length;

    return {
      rows,
      readyRequiredCount: requiredRows.filter((row) => row.ready).length,
      requiredCount: requiredRows.length,
      attentionItems,
      blockingIssues,
      attentionCount,
      issueCount: blockingIssues.length,
      optionalIssues
    };
  }, [producerAgent, props.endpoints, props.providerKeys, props.settings]);

  useEffect(() => {
    if (selectedToolSetting?.provider !== "openai") {
      return;
    }

    if (selectedModelSyncState.status !== "idle") {
      return;
    }

    void syncOpenAIModels(selectedToolSetting);
  }, [selectedToolSetting?.id, selectedToolSetting?.provider, selectedToolSetting?.toolType, selectedModelSyncState.status]);

  async function syncOpenAIModels(setting: ToolProviderSettings) {
    const key = getModelSyncKey(setting);

    setModelSyncStates((current) => ({
      ...current,
      [key]: {
        models: current[key]?.models ?? [],
        status: "loading"
      }
    }));

    try {
      const response = await listOpenAIModels(setting.toolType);
      setModelSyncStates((current) => ({
        ...current,
        [key]: {
          models: response.models.map((model) => model.id),
          status: "loaded",
          timestamp: response.timestamp
        }
      }));
    } catch (error) {
      setModelSyncStates((current) => ({
        ...current,
        [key]: {
          error: error instanceof Error ? error.message : "OpenAI model sync failed.",
          models: current[key]?.models ?? [],
          status: "error"
        }
      }));
    }
  }

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

  function canLeaveWorkflowDrafts(message = "Workflow 有未保存修改。确定要放弃这些修改并切换吗？") {
    return confirmDiscardDirtyDraft(hasDirtyWorkflowDraft, message);
  }

  function openWorkflowTab(tab: WorkflowTab) {
    if (tab === activeTab) {
      return;
    }

    if (!canLeaveWorkflowDrafts()) {
      return;
    }

    setActiveTab(tab);
  }

  function selectWorkflowStage(stageId: ProductionStageId) {
    if (stageId === selectedStageId) {
      return;
    }

    if (!canLeaveWorkflowDrafts("当前流程路由有未保存修改。确定要放弃并切换阶段吗？")) {
      return;
    }

    setSelectedStageId(stageId);
    const endpoint = props.endpoints.find((candidate) => candidate.stageIds.includes(stageId));
    const setting = props.settings.find((candidate) => endpoint && candidate.toolType === getToolTypeForEndpoint(endpoint));
    if (setting) setSelectedToolSettingId(setting.id);
  }

  function selectWorkflowTool(settingId: string) {
    if (settingId === selectedToolSettingId) {
      return;
    }

    if (!canLeaveWorkflowDrafts("当前工具设置有未保存修改。确定要放弃并切换工具吗？")) {
      return;
    }

    setSelectedToolSettingId(settingId);
  }

  function openToolsForEndpoint(endpointId: string) {
    if (!canLeaveWorkflowDrafts()) {
      return;
    }

    const endpoint = props.endpoints.find((candidate) => candidate.id === endpointId);
    const toolType = endpoint ? getToolTypeForEndpoint(endpoint) : null;
    const setting = props.settings.find((candidate) => candidate.toolType === toolType);
    if (setting) {
      setSelectedToolSettingId(setting.id);
    }
    setActiveTab("tools");
  }

  function openToolSetting(settingId: string) {
    if (!canLeaveWorkflowDrafts()) {
      return;
    }

    setSelectedToolSettingId(settingId);
    setActiveTab("tools");
  }

  function openRouteForStage(stageId: ProductionStageId) {
    if (!canLeaveWorkflowDrafts()) {
      return;
    }

    setSelectedStageId(stageId);
    setActiveTab("pipeline");
  }

  function handleReadinessAction(input: {
    endpoint: AiToolEndpoint | null;
    label: string;
    setting: ToolProviderSettings | null;
    stageId: ProductionStageId;
  }) {
    if (input.label.includes("密钥")) {
      if (canLeaveWorkflowDrafts()) props.openKeySettings();
      return;
    }

    if (input.label.includes("Agent")) {
      if (canLeaveWorkflowDrafts()) props.openAgentSettings();
      return;
    }

    if (input.setting) {
      openToolSetting(input.setting.id);
      return;
    }

    if (input.endpoint) {
      openToolsForEndpoint(input.endpoint.id);
      return;
    }

    openRouteForStage(input.stageId);
  }

  return (
    <section className="workflow-shell">
      <section className="panel workflow-command-panel">
        <SectionHeader
          eyebrow="流程管理"
          title="路由、工具、就绪检查"
          action={
            <div className="workflow-header-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => window.confirm("确定重置所有工具模型设置？这会覆盖当前工具配置。") && props.resetSettings()}
              >
                <RefreshCw size={15} />
                重置模型设置
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => window.confirm("确定重置生产流程路由？这会覆盖当前阶段与工具绑定。") && props.resetEndpoints()}
              >
                <RefreshCw size={15} />
                重置流程路由
              </button>
            </div>
          }
        />
        <div className="workflow-command-row">
          <WorkflowStat label="必要阶段就绪" value={`${readiness.readyRequiredCount}/${readiness.requiredCount}`} tone={readiness.issueCount === 0 ? "success" : "warning"} />
          <WorkflowStat label="允许自动调用" value={`${props.settings.filter((setting) => setting.allowAutopilot && setting.enabled).length}/${props.settings.length}`} tone="active" />
          <WorkflowStat label="硬阻塞" value={String(readiness.issueCount)} tone={readiness.issueCount === 0 ? "success" : "danger"} />
          <WorkflowStat label="提醒事项" value={String(readiness.attentionCount)} tone={readiness.attentionCount === 0 ? "success" : "warning"} />
        </div>
        <div className="workflow-tabs" role="tablist" aria-label="Workflow sections">
          <TabButton active={activeTab === "pipeline"} label="流程路由" onClick={() => openWorkflowTab("pipeline")} />
          <TabButton active={activeTab === "tools"} label="工具设置" onClick={() => openWorkflowTab("tools")} />
          <TabButton active={activeTab === "readiness"} label="就绪检查" onClick={() => openWorkflowTab("readiness")} />
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
                        onClick={() => selectWorkflowStage(stage.id)}
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
              reportDirtyState={reportWorkflowDirtyState}
              updateStageEndpoint={updateStageEndpoint}
              producerAgent={producerAgent}
              openTools={openToolsForEndpoint}
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
                      onClick={() => selectWorkflowTool(setting.id)}
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
                <ToolProviderEditor
                  modelSyncState={selectedModelSyncState}
                  onSyncModels={syncOpenAIModels}
                  reportDirtyState={reportWorkflowDirtyState}
                  setting={selectedToolSetting}
                  updateToolSetting={props.updateToolSetting}
                />
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
          <SectionHeader eyebrow="运行检查" title="就绪检查清单" action={<StatusPill tone={readiness.issueCount === 0 ? "success" : "danger"}>{readiness.issueCount === 0 ? "MP4 链路可执行" : `${readiness.issueCount} 个硬阻塞`}</StatusPill>} />
          <div className="workflow-readiness-groups">
            <section className="readiness-group">
              <div className="readiness-group-header">
                <div>
                  <strong>MP4 必需链路</strong>
                  <span>脚本、分镜、图片、配音、字幕、合成与 QC。这里没有阻塞时，可以先做到影片完成。</span>
                </div>
                <StatusPill tone={readiness.issueCount === 0 ? "success" : "danger"}>{readiness.issueCount === 0 ? "可执行" : "阻塞"}</StatusPill>
              </div>
              <div className="readiness-issue-strip">
                {readiness.blockingIssues.length === 0 ? (
                  <StatusPill tone="success">没有 MP4 必需阻塞</StatusPill>
                ) : (
                  readiness.blockingIssues.map(({ stage, endpoint, label, setting, tone }) => (
                    <div className="readiness-issue" key={stage.id}>
                      <strong>{stage.label}</strong>
                      <StatusPill tone={tone}>阻塞</StatusPill>
                      <span>{label} / {setting ? `${setting.provider} ${setting.model}` : endpoint?.provider ?? "未绑定工具"}</span>
                      <button
                        className="secondary-button compact-button readiness-action-button"
                        type="button"
                        onClick={() => handleReadinessAction({ endpoint, label, setting, stageId: stage.id })}
                      >
                        {getReadinessActionLabel(label, setting, endpoint)}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="readiness-group optional">
              <div className="readiness-group-header">
                <div>
                  <strong>提醒事项 / 可选增强</strong>
                  <span>BGM、Seedance 影片片段、YouTube 私密上传、GCS 归档不会阻止先生成 MP4；成本单价缺失也只影响成本精度。</span>
                </div>
                <StatusPill tone={readiness.attentionCount === 0 ? "success" : "warning"}>{readiness.attentionCount === 0 ? "无提醒" : `${readiness.attentionCount} 项提醒`}</StatusPill>
              </div>
              <div className="readiness-issue-strip optional">
                {readiness.attentionCount === 0 ? (
                  <StatusPill tone="success">没有低风险提醒</StatusPill>
                ) : (
                  [...readiness.optionalIssues, ...readiness.attentionItems].map(({ stage, endpoint, label, setting, tone }) => (
                    <div className="readiness-issue" key={stage.id}>
                      <strong>{stage.label}</strong>
                      <StatusPill tone={tone}>{stage.id === "publish" || stage.id === "archive" || stage.id === "video" || stage.id === "bgm" ? "可选" : "需检查"}</StatusPill>
                      <span>{label} / {setting ? `${setting.provider} ${setting.model}` : endpoint?.provider ?? "未绑定工具"}</span>
                      <button
                        className="secondary-button compact-button readiness-action-button"
                        type="button"
                        onClick={() => handleReadinessAction({ endpoint, label, setting, stageId: stage.id })}
                      >
                        {getReadinessActionLabel(label, setting, endpoint)}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
          <div className="workflow-readiness-list">
            {readiness.rows.map(({ stage, endpoint, label, setting, tone, required }) => (
              <article className="workflow-readiness-row" key={stage.id}>
                <span className="step-index">{stage.order}</span>
                <div>
                  <strong>{stage.label}</strong>
                  <span>{stage.defaultInput}</span>
                </div>
                <div>
                  <span className="column-label">类型</span>
                  <strong>{required ? "MP4 必需" : "可选增强"}</strong>
                </div>
                <div>
                  <span className="column-label">负责人</span>
                  <strong>{producerAgent?.name ?? "未设置 Agent"}</strong>
                </div>
                <div>
                  <span className="column-label">工具</span>
                  <strong>{setting ? `${setting.provider} / ${setting.model}` : endpoint?.provider ?? "内部处理"}</strong>
                </div>
                <div>
                  <span className="column-label">队列</span>
                  <strong>{endpoint?.queueName ?? stage.queueName}</strong>
                </div>
                <StatusPill tone={tone}>{label}</StatusPill>
                <button
                  className="secondary-button compact-button readiness-row-action"
                  type="button"
                  onClick={() => handleReadinessAction({ endpoint, label, setting, stageId: stage.id })}
                >
                  {getReadinessActionLabel(label, setting, endpoint)}
                </button>
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
  reportDirtyState?: WorkflowPageProps["reportDirtyState"];
  selectedStage: ReturnType<typeof getProductionStage>;
  stageEndpoint: AiToolEndpoint | null;
  updateStageEndpoint: (stageId: ProductionStageId, endpointId: string) => void;
  openTools: (endpointId: string) => void;
}) {
  const toolAllowed = props.stageEndpoint ? Boolean(props.producerAgent?.allowedToolIds.includes(props.stageEndpoint.id)) : true;
  const routeEditor = useEditableDraft({ endpointId: props.stageEndpoint?.id ?? "" }, props.selectedStage.id);
  const draftEndpointId = routeEditor.draft?.endpointId ?? "";
  const reportDirtyState = props.reportDirtyState;
  const selectedStageId = props.selectedStage.id;

  useEffect(() => {
    reportDirtyState?.(`workflow-route:${selectedStageId}`, routeEditor.isDirty);
    return () => reportDirtyState?.(`workflow-route:${selectedStageId}`, false);
  }, [reportDirtyState, routeEditor.isDirty, selectedStageId]);

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
          value={draftEndpointId}
          onChange={(event) => routeEditor.setDraftPatch({ endpointId: event.target.value })}
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
        <button className="primary-button" type="button" onClick={() => props.openTools(draftEndpointId || props.stageEndpoint!.id)}>
          前往工具设置
        </button>
      ) : (
        <EmptyState title="内部阶段" body="这个阶段由后台内部处理，不需要绑定外部工具。" />
      )}
      <EditableActionBar
        isDirty={routeEditor.isDirty}
        onCancel={routeEditor.resetDraft}
        onSave={() => {
          props.updateStageEndpoint(props.selectedStage.id, draftEndpointId);
          routeEditor.markSaved({ endpointId: draftEndpointId });
        }}
      />
    </>
  );
}

function ToolProviderEditor(props: {
  modelSyncState: ModelSyncState;
  onSyncModels: (setting: ToolProviderSettings) => void;
  reportDirtyState?: WorkflowPageProps["reportDirtyState"];
  setting: ToolProviderSettings;
  updateToolSetting: (id: string, updater: (setting: ToolProviderSettings) => ToolProviderSettings) => void;
}) {
  const editor = useEditableDraft(props.setting, `${props.setting.id}:${props.setting.updatedAt}`);
  const setting = editor.draft ?? props.setting;
  const reportDirtyState = props.reportDirtyState;
  const settingId = props.setting.id;

  useEffect(() => {
    reportDirtyState?.(`workflow-tool:${settingId}`, editor.isDirty);
    return () => reportDirtyState?.(`workflow-tool:${settingId}`, false);
  }, [editor.isDirty, reportDirtyState, settingId]);

  function patch(patchValue: Partial<ToolProviderSettings>) {
    editor.setDraftPatch({
      ...patchValue,
      updatedAt: new Date().toISOString()
    });
  }

  function updateParam(name: string, value: string) {
    patch({
      params: {
        ...setting.params,
        [name]: coerceParamValue(value)
      }
    });
  }

  function saveDraft() {
    const patchValue = createDraftPatch(props.setting, setting);
    props.updateToolSetting(props.setting.id, (current) => ({
      ...current,
      ...patchValue,
      updatedAt: new Date().toISOString()
    }));
    editor.markSaved({ ...setting, updatedAt: new Date().toISOString() });
  }

  const params = Object.entries(setting.params);
  const providerPresets = getToolProviderPresets(setting.toolType);
  const selectedProviderPreset = getToolProviderPreset(setting.toolType, setting.provider);
  const modelOptions = getToolModelOptions(setting, props.modelSyncState.models);
  const usesCustomProvider = !selectedProviderPreset;
  const usesCustomModel = usesCustomToolModel(setting, props.modelSyncState.models);
  const providerSelectValue = selectedProviderPreset?.id ?? customToolProviderValue;
  const modelSelectValue = usesCustomModel ? customToolModelValue : setting.model;

  function applyPreset(presetId: string) {
    editor.setDraft(applyToolProviderPreset(setting, presetId));
  }

  return (
    <div className="endpoint-editor">
      <label className="toggle-line endpoint-enabled-line">
        <input type="checkbox" checked={setting.enabled} onChange={(event) => patch({ enabled: event.target.checked })} />
        <span>启用这个工具</span>
      </label>

      <div className="two-column-fields">
        <Field label="工具类型">
          <input readOnly value={setting.toolType} />
        </Field>
        <Field label="API 风格">
          <input value={setting.apiStyle} onChange={(event) => patch({ apiStyle: event.target.value })} />
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
          <select value={modelSelectValue} onChange={(event) => editor.setDraft(applyToolModelPricing(setting, event.target.value === customToolModelValue ? "" : event.target.value))}>
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
            <option value={customToolModelValue}>自定义模型...</option>
          </select>
        </Field>
      </div>

      {setting.provider === "openai" ? (
        <div className="model-sync-row">
          <button className="secondary-button compact-button" type="button" onClick={() => props.onSyncModels(setting)} disabled={props.modelSyncState.status === "loading"}>
            <RefreshCw size={14} />
            {props.modelSyncState.status === "loading" ? "同步中" : "同步 OpenAI 模型"}
          </button>
          <span>
            {props.modelSyncState.status === "loaded"
              ? `已同步 ${props.modelSyncState.models.length} 个账户可用模型`
              : props.modelSyncState.status === "error"
                ? props.modelSyncState.error
                : "可从当前 OpenAI key 的 /v1/models 拉取可用模型"}
          </span>
        </div>
      ) : null}

      {usesCustomProvider ? (
        <Field label="自定义供应商 ID">
          <input value={setting.provider} onChange={(event) => patch({ provider: event.target.value })} placeholder="例如 custom-video-api" />
        </Field>
      ) : null}

      {usesCustomModel ? (
        <Field label="自定义模型 ID">
          <input value={setting.model} onChange={(event) => patch({ model: event.target.value })} placeholder="输入自定义 model id" />
        </Field>
      ) : null}

      <Field label="接口地址">
        <input value={setting.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} />
      </Field>

      <div className="two-column-fields">
        <Field label="成本模式">
          <select value={setting.costMode} onChange={(event) => patch({ costMode: event.target.value as ToolProviderSettings["costMode"] })}>
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
          <input type="number" min={0} max={10} value={setting.retryLimit} onChange={(event) => patch({ retryLimit: Number(event.target.value) })} />
        </Field>
      </div>

      <div className="three-column-fields">
        <Field label="输入单价 RM">
          <input type="number" min={0} step="0.000001" value={setting.inputUnitPriceRM} onChange={(event) => patch({ inputUnitPriceRM: Number(event.target.value), pricingSource: "manual" })} />
        </Field>
        <Field label="输出单价 RM">
          <input type="number" min={0} step="0.000001" value={setting.outputUnitPriceRM} onChange={(event) => patch({ outputUnitPriceRM: Number(event.target.value), pricingSource: "manual" })} />
        </Field>
        <Field label="保底成本 RM">
          <input type="number" min={0} step="0.000001" value={setting.fallbackCostRM} onChange={(event) => patch({ fallbackCostRM: Number(event.target.value), pricingSource: "manual" })} />
        </Field>
      </div>

      <Field label="价格来源">
        <input value={setting.pricingSource} onChange={(event) => patch({ pricingSource: event.target.value })} placeholder="manual / official pricing URL / internal cost note" />
      </Field>

      <label className="toggle-line endpoint-enabled-line">
        <input type="checkbox" checked={setting.allowAutopilot} onChange={(event) => patch({ allowAutopilot: event.target.checked })} />
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
                  params: Object.fromEntries(Object.entries(setting.params).filter(([key]) => key !== name))
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
      <EditableActionBar
        isDirty={editor.isDirty}
        onCancel={editor.resetDraft}
        onSave={saveDraft}
      />
    </div>
  );
}

function coerceParamValue(value: string): boolean | number | string {
  if (value === "true") return true;
  if (value === "false") return false;

  const numericValue = Number(value);
  return value.trim() !== "" && Number.isFinite(numericValue) ? numericValue : value;
}

function getReadinessActionLabel(label: string, setting: ToolProviderSettings | null, endpoint: AiToolEndpoint | null): string {
  if (label.includes("密钥")) return "打开密钥";
  if (label.includes("Agent")) return "打开 Agent";
  if (label.includes("路由") || (!setting && !endpoint)) return "检查路由";
  return "打开工具";
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

function getModelSyncKey(setting: Pick<ToolProviderSettings, "provider" | "toolType">): string {
  return `${setting.provider}:${setting.toolType}`;
}

function getToolSettingTone(setting: ToolProviderSettings): PillTone {
  if (!setting.enabled) return "neutral";
  if (!setting.model.trim() && setting.toolType !== "storage") return "danger";
  if (!setting.baseUrl.trim()) return "warning";
  return "success";
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
