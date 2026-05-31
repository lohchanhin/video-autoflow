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
import { createDraftPatch, useEditableDraft } from "../lib/editable-draft.js";
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
              ...patch,
            }
          : agent
      )
    );
    agentEditor.markSaved(nextDraft);
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
          eyebrow="Agent studio"
          title="AI Producer Agent"
          action={
            <button className="secondary-button" type="button" onClick={() => window.confirm("确定重置主控 Agent 设置？未保存修改会被放弃。") && props.setAgents(() => resetStaffAgents())}>
              <RefreshCw size={15} />
              Reset agent
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
            <span>Type</span>
            <strong>{getAgentTypeLabel(agentDraft.type)}</strong>
          </div>
          <div>
            <span>Planning</span>
            <strong>{agentDraft.planningMode}</strong>
          </div>
          <div>
            <span>Budget guard</span>
            <strong>RM {agentDraft.costGuardRM.toFixed(2)}</strong>
          </div>
          <div>
            <span>Updated</span>
            <strong>{formatDateTime(agentDraft.updatedAt)}</strong>
          </div>
        </div>

        <Field label="Agent name">
          <input value={agentDraft.name} onChange={(event) => patchProducerAgent({ name: event.target.value })} />
        </Field>
        <Field label="Mission">
          <textarea rows={4} value={agentDraft.mission} onChange={(event) => patchProducerAgent({ mission: event.target.value })} />
        </Field>
        <Field label="System prompt">
          <textarea rows={8} value={agentDraft.systemPrompt} onChange={(event) => patchProducerAgent({ systemPrompt: event.target.value })} />
        </Field>
        <EditableActionBar
          isDirty={agentEditor.isDirty}
          onCancel={agentEditor.resetDraft}
          onSave={saveProducerAgent}
        />
      </section>

      <section className="panel agent-policy-panel">
        <SectionHeader eyebrow="Operating policy" title="Decision Boundaries" />
        <div className="two-column-fields">
          <Field label="Status">
            <select value={agentDraft.status} onChange={(event) => patchProducerAgent({ status: event.target.value as StaffAgentStatus })}>
              {agentStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Planning mode">
            <select value={agentDraft.planningMode} onChange={(event) => patchProducerAgent({ planningMode: event.target.value as AgentPlanningMode })}>
              {planningModeOptions.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Cost guard RM">
          <input min={0} step={0.1} type="number" value={agentDraft.costGuardRM} onChange={(event) => patchProducerAgent({ costGuardRM: Number(event.target.value) })} />
        </Field>
        <Field label="Human approval policy">
          <textarea rows={4} value={agentDraft.humanApprovalPolicy} onChange={(event) => patchProducerAgent({ humanApprovalPolicy: event.target.value })} />
        </Field>
        <Field label="Publishing policy">
          <textarea rows={4} value={agentDraft.publishingPolicy} onChange={(event) => patchProducerAgent({ publishingPolicy: event.target.value })} />
        </Field>
        <Field label="Fallback strategy">
          <textarea rows={4} value={agentDraft.fallbackStrategy} onChange={(event) => patchProducerAgent({ fallbackStrategy: event.target.value })} />
        </Field>
        <Field label="Memory sources">
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
        <EditableActionBar
          isDirty={agentEditor.isDirty}
          onCancel={agentEditor.resetDraft}
          onSave={saveProducerAgent}
        />
      </section>

      <section className="panel agent-tools-panel">
        <SectionHeader eyebrow="Tool permissions" title="Allowed Tools" />
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
                  {allowed ? (endpoint.enabled ? "allowed" : "tool off") : "blocked"}
                </StatusPill>
              </article>
            );
          })}
        </div>
        <EditableActionBar
          isDirty={agentEditor.isDirty}
          onCancel={agentEditor.resetDraft}
          onSave={saveProducerAgent}
        />
        <div className="policy-note">
          <ShieldCheck size={18} />
          <span>Tool permissions are the Agent's action boundary. Paid, upload, and storage tools should stay auditable and gated.</span>
        </div>
      </section>
    </section>
  );
}
