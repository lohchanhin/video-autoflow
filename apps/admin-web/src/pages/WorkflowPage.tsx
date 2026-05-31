import { useMemo, useState } from "react";
import { RefreshCw, Settings2 } from "lucide-react";
import { EmptyState, Field, SectionHeader, StatusPill } from "../components/ui.js";
import type { StaffAgent } from "../lib/agents.js";
import type { AiToolEndpoint, ToolProviderSettings, ToolProviderType } from "../lib/admin-data.js";
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
          title="Routing, Tools, Readiness"
          action={
            <div className="workflow-header-actions">
              <button className="secondary-button" type="button" onClick={props.resetSettings}>
                <RefreshCw size={15} />
                Reset models
              </button>
              <button className="secondary-button" type="button" onClick={props.resetEndpoints}>
                <RefreshCw size={15} />
                Reset routing
              </button>
            </div>
          }
        />
        <div className="workflow-command-row">
          <WorkflowStat label="Required ready" value={`${readiness.readyRequiredCount}/${readiness.requiredCount}`} tone={readiness.issueCount === 0 ? "success" : "warning"} />
          <WorkflowStat label="Autopilot tools" value={`${props.settings.filter((setting) => setting.allowAutopilot && setting.enabled).length}/${props.settings.length}`} tone="active" />
          <WorkflowStat label="Issues" value={String(readiness.issueCount)} tone={readiness.issueCount === 0 ? "success" : "danger"} />
        </div>
        <div className="workflow-tabs" role="tablist" aria-label="Workflow sections">
          <TabButton active={activeTab === "pipeline"} label="Pipeline" onClick={() => setActiveTab("pipeline")} />
          <TabButton active={activeTab === "tools"} label="Tools" onClick={() => setActiveTab("tools")} />
          <TabButton active={activeTab === "readiness"} label="Readiness" onClick={() => setActiveTab("readiness")} />
        </div>
      </section>

      {activeTab === "pipeline" ? (
        <section className="workflow-tab-layout">
          <section className="panel workflow-list-panel">
            <SectionHeader eyebrow="Stage routing" title="Pipeline Routing" />
            <div className="workflow-table-header workflow-route-header">
              <span>Step</span>
              <span>Output</span>
              <span>Controller</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            <div className="workflow-stage-list">
              {readiness.rows.map(({ stage, label, tone }) => (
                <article className={`workflow-route-row ${selectedStageId === stage.id ? "selected" : ""}`} key={stage.id}>
                  <span className="step-index">{stage.order}</span>
                  <div className="workflow-route-main">
                    <strong>{stage.label}</strong>
                    <span>{stage.defaultOutput}</span>
                  </div>
                  <span className="agent-controller-cell">{producerAgent?.name ?? "No agent"}</span>
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
                    Configure
                  </button>
                </article>
              ))}
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
            <SectionHeader eyebrow="Tool registry" title="AI Tool Endpoints" />
            <div className="workflow-table-header workflow-tools-header">
              <span>Tool</span>
              <span>Provider / model</span>
              <span>Endpoint</span>
              <span>Cost</span>
              <span>Status</span>
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
                    <strong>{formatToolType(setting.toolType)}</strong>
                    <span>{setting.allowAutopilot ? "Autopilot allowed" : "Manual only"}</span>
                  </div>
                  <div>
                    <strong>{setting.provider || "not set"}</strong>
                    <span>{setting.model || "model missing"}</span>
                  </div>
                  <span className="mono-cell">{setting.baseUrl || "no endpoint"}</span>
                  <span>{formatCostMode(setting)}</span>
                  <StatusPill tone={getToolSettingTone(setting)}>{setting.enabled ? "enabled" : "disabled"}</StatusPill>
                </button>
              ))}
            </div>
          </section>

          <aside className="panel workflow-detail-panel">
            {selectedToolSetting ? (
              <>
                <SectionHeader eyebrow="Provider/model inspector" title={formatToolType(selectedToolSetting.toolType)} />
                <ToolProviderEditor setting={selectedToolSetting} updateToolSetting={props.updateToolSetting} />
                <div className="workflow-stage-notes">
                  <strong>Routing layer</strong>
                  <span>Pipeline routing still lives in the Pipeline tab. This panel controls the provider, model, parameters, cost, retry, and autopilot permission used by generation requests.</span>
                </div>
              </>
            ) : (
              <EmptyState title="No tool selected" body="Select a provider setting to edit model, endpoint, parameters, cost mode, and autopilot permission." />
            )}
          </aside>
        </section>
      ) : null}

      {activeTab === "readiness" ? (
        <section className="panel workflow-readiness-panel">
          <SectionHeader eyebrow="Operational checks" title="Readiness Checklist" />
          <div className="readiness-issue-strip">
            {readiness.issues.length === 0 ? (
              <StatusPill tone="success">No blocking issues</StatusPill>
            ) : (
              readiness.issues.map(({ stage, endpoint, label, tone }) => (
                <div className="readiness-issue" key={stage.id}>
                  <strong>{stage.label}</strong>
                  <span>{label} / {endpoint?.provider ?? "No tool"}</span>
                  <StatusPill tone={tone}>{tone === "danger" ? "Blocker" : "Review"}</StatusPill>
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
                  <span className="column-label">Owner</span>
                  <strong>{producerAgent?.name ?? "No agent"}</strong>
                </div>
                <div>
                  <span className="column-label">Tool</span>
                  <strong>{endpoint?.provider ?? "Internal"}</strong>
                </div>
                <div>
                  <span className="column-label">Queue</span>
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
      <SectionHeader eyebrow="Stage inspector" title={props.selectedStage.label} />
      <div className="workflow-summary-strip">
        <div>
          <span>Queue</span>
          <strong>{props.stageEndpoint?.queueName ?? props.selectedStage.queueName}</strong>
        </div>
        <div>
          <span>Controller</span>
          <strong>{props.producerAgent?.name ?? "No agent"}</strong>
        </div>
        <div>
          <span>Tool access</span>
          <strong>{toolAllowed ? "Allowed" : "Blocked"}</strong>
        </div>
      </div>

      <Field label="Tool endpoint">
        <select
          value={props.stageEndpoint?.id ?? ""}
          onChange={(event) => props.updateStageEndpoint(props.selectedStage.id, event.target.value)}
          disabled={props.selectedStage.id === "brief"}
        >
          <option value="">No external tool</option>
          {props.endpoints.map((endpoint) => (
            <option key={endpoint.id} value={endpoint.id}>
              {endpoint.stage} - {endpoint.provider}
            </option>
          ))}
        </select>
      </Field>

      <div className="workflow-stage-notes">
        <strong>Output expected</strong>
        <span>{props.selectedStage.defaultOutput}</span>
      </div>

      {props.stageEndpoint ? (
        <button className="primary-button" type="button" onClick={() => props.openTools(props.stageEndpoint!.id)}>
          Edit endpoint in Tools
        </button>
      ) : (
        <EmptyState title="Internal stage" body="This stage is handled by the admin console and does not require an external tool." />
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

  return (
    <div className="endpoint-editor">
      <label className="toggle-line endpoint-enabled-line">
        <input type="checkbox" checked={props.setting.enabled} onChange={(event) => patch({ enabled: event.target.checked })} />
        <span>Enabled for generation requests</span>
      </label>

      <div className="two-column-fields">
        <Field label="Tool type">
          <input readOnly value={props.setting.toolType} />
        </Field>
        <Field label="API style">
          <input value={props.setting.apiStyle} onChange={(event) => patch({ apiStyle: event.target.value })} />
        </Field>
      </div>

      <div className="two-column-fields">
        <Field label="Provider">
          <input value={props.setting.provider} onChange={(event) => patch({ provider: event.target.value })} />
        </Field>
        <Field label="Model ID">
          <input value={props.setting.model} onChange={(event) => patch({ model: event.target.value })} />
        </Field>
      </div>

      <Field label="Base URL">
        <input value={props.setting.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} />
      </Field>

      <div className="two-column-fields">
        <Field label="Cost mode">
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
        <Field label="Retry limit">
          <input type="number" min={0} max={10} value={props.setting.retryLimit} onChange={(event) => patch({ retryLimit: Number(event.target.value) })} />
        </Field>
      </div>

      <div className="three-column-fields">
        <Field label="Input unit RM">
          <input type="number" min={0} step="0.0001" value={props.setting.inputUnitPriceRM} onChange={(event) => patch({ inputUnitPriceRM: Number(event.target.value) })} />
        </Field>
        <Field label="Output unit RM">
          <input type="number" min={0} step="0.0001" value={props.setting.outputUnitPriceRM} onChange={(event) => patch({ outputUnitPriceRM: Number(event.target.value) })} />
        </Field>
        <Field label="Fallback RM">
          <input type="number" min={0} step="0.0001" value={props.setting.fallbackCostRM} onChange={(event) => patch({ fallbackCostRM: Number(event.target.value) })} />
        </Field>
      </div>

      <label className="toggle-line endpoint-enabled-line">
        <input type="checkbox" checked={props.setting.allowAutopilot} onChange={(event) => patch({ allowAutopilot: event.target.checked })} />
        <span>Allow autopilot to call this tool</span>
      </label>

      <div className="tool-param-list">
        <div className="section-heading-row">
          <div>
            <span>Tool params</span>
            <strong>Editable request parameters</strong>
          </div>
        </div>
        {params.length === 0 ? <EmptyState title="No params yet" body="Add provider parameters like quality, size, voice, format, aspectRatio, or custom switches." /> : null}
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
              Remove
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
          Add param
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
    bgm: "BGM / music",
    compose: "FFmpeg compose",
    design_image: "Design image",
    image: "Scene image",
    llm: "Script / storyboard",
    storage: "Storage",
    subtitle: "Subtitles",
    tts: "Voiceover / TTS",
    video: "Video clips",
    youtube: "YouTube publish"
  };

  return labels[toolType];
}

function formatCostMode(setting: ToolProviderSettings): string {
  if (setting.costMode === "free") return "free";
  if (setting.inputUnitPriceRM > 0 || setting.outputUnitPriceRM > 0) {
    return `${setting.costMode} / RM ${setting.inputUnitPriceRM.toFixed(4)} + ${setting.outputUnitPriceRM.toFixed(4)}`;
  }
  if (setting.fallbackCostRM > 0) return `${setting.costMode} / fallback RM ${setting.fallbackCostRM.toFixed(4)}`;
  return `${setting.costMode} / not priced`;
}

function getOperationalState(stageId: ProductionStageId, endpoint: AiToolEndpoint | null, agent: StaffAgent | null): { label: string; tone: PillTone; ready: boolean; required: boolean } {
  if (!agent || agent.status !== "active") {
    return { label: "agent off", tone: "danger", ready: false, required: stageId !== "video" };
  }

  if (stageId === "brief") {
    return { label: "ready", tone: "success", ready: true, required: true };
  }

  if (!endpoint) {
    return { label: "needs tool", tone: "danger", ready: false, required: stageId !== "video" };
  }

  if (!agent.allowedToolIds.includes(endpoint.id)) {
    return { label: "tool blocked", tone: "danger", ready: false, required: stageId !== "video" };
  }

  if (!endpoint.enabled || endpoint.status === "disabled") {
    if (stageId === "video") {
      return { label: "optional off", tone: "neutral", ready: true, required: false };
    }

    return { label: "disabled", tone: "danger", ready: false, required: true };
  }

  if (endpoint.status === "needs_setup") {
    return { label: "needs setup", tone: "danger", ready: false, required: stageId !== "video" };
  }

  return { label: "ready", tone: "success", ready: true, required: stageId !== "video" };
}
