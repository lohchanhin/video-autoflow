import { Bot, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { EditableActionBar, Field, SectionHeader, StatusPill } from "../components/ui.js";
import {
  getAgentTypeLabel,
  resetStaffAgents,
  type AgentPlanningMode,
  type StaffAgent,
  type StaffAgentStatus
} from "../lib/agents.js";
import type { AiToolEndpoint } from "../lib/admin-data.js";
import { confirmDiscardDirtyDraft, createDraftPatch, useEditableDraft } from "../lib/editable-draft.js";
import { formatDateTime } from "../lib/view-helpers.js";

interface AgentsPageProps {
  agents: StaffAgent[];
  endpoints: AiToolEndpoint[];
  reportDirtyState?: (key: string, isDirty: boolean) => void;
  setAgents: (updater: (agents: StaffAgent[]) => StaffAgent[]) => void;
}

const agentStatusOptions: StaffAgentStatus[] = ["active", "paused", "needs_setup"];
const planningModeOptions: AgentPlanningMode[] = ["guided", "autonomous_reviewed", "manual_only"];

export function AgentsPage(props: AgentsPageProps) {
  const { reportDirtyState } = props;
  const producerAgent = props.agents[0];
  const agentEditor = useEditableDraft(producerAgent ?? null, producerAgent ? `${producerAgent.id}:${producerAgent.updatedAt}` : null);
  const agentDraft = agentEditor.draft;

  useEffect(() => {
    reportDirtyState?.("agents:producer", agentEditor.isDirty);
    return () => reportDirtyState?.("agents:producer", false);
  }, [agentEditor.isDirty, reportDirtyState]);

  function patchProducerAgent(patch: Partial<StaffAgent>) {
    agentEditor.setDraftPatch(patch);
  }

  function saveProducerAgent() {
    if (!producerAgent || !agentDraft) {
      return;
    }

    const nextDraft = { ...agentDraft, updatedAt: new Date().toISOString() };
    const patch = createDraftPatch(producerAgent, nextDraft);

    props.setAgents((currentAgents) =>
      currentAgents.map((agent, index) =>
        index === 0
          ? {
              ...agent,
              ...patch
            }
          : agent
      )
    );
    agentEditor.markSaved(nextDraft);
  }

  function resetAgentSettings() {
    if (!confirmDiscardDirtyDraft(agentEditor.isDirty, "当前主控 Agent 有未保存修改。确定要放弃修改并重置吗？")) {
      return;
    }

    if (window.confirm("确定重置主控 Agent 设置吗？")) {
      props.setAgents(() => resetStaffAgents());
    }
  }

  function toggleTool(toolId: string) {
    if (!agentDraft) {
      return;
    }

    const allowedToolIds = agentDraft.allowedToolIds.includes(toolId)
      ? agentDraft.allowedToolIds.filter((allowedToolId) => allowedToolId !== toolId)
      : [...agentDraft.allowedToolIds, toolId];

    patchProducerAgent({ allowedToolIds });
  }

  if (!producerAgent || !agentDraft) {
    return null;
  }

  return (
    <section className="agent-studio-layout">
      <section className="panel agent-profile-panel">
        <SectionHeader
          eyebrow="主控 Agent"
          title="AI Producer Agent"
          action={
            <button className="secondary-button" type="button" onClick={resetAgentSettings}>
              <RefreshCw size={15} />
              重置 Agent
            </button>
          }
        />

        <div className="agent-hero-card">
          <span className="agent-avatar large">
            <Bot size={24} />
          </span>
          <div>
            <strong>{agentDraft.name}</strong>
            <span>{agentDraft.role}</span>
          </div>
          <StatusPill tone={agentDraft.status === "active" ? "success" : agentDraft.status === "paused" ? "neutral" : "warning"}>
            {agentDraft.status}
          </StatusPill>
        </div>

        <div className="inspector-summary">
          <div>
            <span>类型</span>
            <strong>{getAgentTypeLabel(agentDraft.type)}</strong>
          </div>
          <div>
            <span>规划模式</span>
            <strong>{agentDraft.planningMode}</strong>
          </div>
          <div>
            <span>预算上限</span>
            <strong>RM {agentDraft.costGuardRM.toFixed(2)}</strong>
          </div>
          <div>
            <span>更新时间</span>
            <strong>{formatDateTime(agentDraft.updatedAt)}</strong>
          </div>
        </div>

        <Field label="Agent 名称">
          <input value={agentDraft.name} onChange={(event) => patchProducerAgent({ name: event.target.value })} />
        </Field>
        <Field label="任务定位">
          <textarea rows={4} value={agentDraft.mission} onChange={(event) => patchProducerAgent({ mission: event.target.value })} />
        </Field>
        <Field label="系统提示词">
          <textarea rows={8} value={agentDraft.systemPrompt} onChange={(event) => patchProducerAgent({ systemPrompt: event.target.value })} />
        </Field>
        <EditableActionBar isDirty={agentEditor.isDirty} onCancel={agentEditor.resetDraft} onSave={saveProducerAgent} />
      </section>

      <section className="panel agent-policy-panel">
        <SectionHeader eyebrow="运行策略" title="决策边界" />
        <div className="two-column-fields">
          <Field label="状态">
            <select value={agentDraft.status} onChange={(event) => patchProducerAgent({ status: event.target.value as StaffAgentStatus })}>
              {agentStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
          <Field label="规划模式">
            <select value={agentDraft.planningMode} onChange={(event) => patchProducerAgent({ planningMode: event.target.value as AgentPlanningMode })}>
              {planningModeOptions.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="单 Case 成本上限 RM">
          <input min={0} step={0.1} type="number" value={agentDraft.costGuardRM} onChange={(event) => patchProducerAgent({ costGuardRM: Number(event.target.value) })} />
        </Field>
        <Field label="人工审核策略">
          <textarea rows={4} value={agentDraft.humanApprovalPolicy} onChange={(event) => patchProducerAgent({ humanApprovalPolicy: event.target.value })} />
        </Field>
        <Field label="发布策略">
          <textarea rows={4} value={agentDraft.publishingPolicy} onChange={(event) => patchProducerAgent({ publishingPolicy: event.target.value })} />
        </Field>
        <Field label="失败处理策略">
          <textarea rows={4} value={agentDraft.fallbackStrategy} onChange={(event) => patchProducerAgent({ fallbackStrategy: event.target.value })} />
        </Field>
        <Field label="记忆来源">
          <input
            value={agentDraft.memorySources.join(", ")}
            onChange={(event) =>
              patchProducerAgent({
                memorySources: event.target.value
                  .split(",")
                  .map((source) => source.trim())
                  .filter(Boolean)
              })
            }
          />
        </Field>
        <EditableActionBar isDirty={agentEditor.isDirty} onCancel={agentEditor.resetDraft} onSave={saveProducerAgent} />
      </section>

      <section className="panel agent-tools-panel">
        <SectionHeader eyebrow="工具权限" title="允许调用的工具" />
        <div className="agent-tool-permission-list">
          {props.endpoints.map((endpoint) => {
            const allowed = agentDraft.allowedToolIds.includes(endpoint.id);

            return (
              <article className="agent-tool-permission-row" key={endpoint.id}>
                <label className="toggle-line">
                  <input type="checkbox" checked={allowed} onChange={() => toggleTool(endpoint.id)} />
                  <span>{endpoint.stage}</span>
                </label>
                <div>
                  <strong>{endpoint.provider}</strong>
                  <span>{endpoint.queueName}</span>
                </div>
                <StatusPill tone={allowed && endpoint.enabled ? "success" : allowed ? "warning" : "neutral"}>
                  {allowed ? (endpoint.enabled ? "允许" : "工具关闭") : "阻止"}
                </StatusPill>
              </article>
            );
          })}
        </div>
        <EditableActionBar isDirty={agentEditor.isDirty} onCancel={agentEditor.resetDraft} onSave={saveProducerAgent} />
        <div className="policy-note">
          <ShieldCheck size={18} />
          <span>工具权限就是主控 Agent 的行动边界。付费、上传和存储工具必须保持可审计，并保留人工审核入口。</span>
        </div>
      </section>
    </section>
  );
}
