import { Bot, RefreshCw, ShieldCheck } from "lucide-react";
import { Field, SectionHeader, StatusPill } from "../components/ui.js";
import {
  getAgentTypeLabel,
  resetStaffAgents,
  type AgentPlanningMode,
  type StaffAgent,
  type StaffAgentStatus
} from "../lib/agents.js";
import type { AiToolEndpoint } from "../lib/admin-data.js";
import { formatDateTime } from "../lib/view-helpers.js";

interface AgentsPageProps {
  agents: StaffAgent[];
  endpoints: AiToolEndpoint[];
  setAgents: (updater: (agents: StaffAgent[]) => StaffAgent[]) => void;
}

const agentStatusOptions: StaffAgentStatus[] = ["active", "paused", "needs_setup"];
const planningModeOptions: AgentPlanningMode[] = ["guided", "autonomous_reviewed", "manual_only"];

export function AgentsPage(props: AgentsPageProps) {
  const producerAgent = props.agents[0];

  function updateProducerAgent(patch: Partial<StaffAgent>) {
    props.setAgents((currentAgents) =>
      currentAgents.map((agent, index) =>
        index === 0
          ? {
              ...agent,
              ...patch,
              updatedAt: new Date().toISOString()
            }
          : agent
      )
    );
  }

  function toggleTool(toolId: string) {
    if (!producerAgent) {
      return;
    }

    const allowedToolIds = producerAgent.allowedToolIds.includes(toolId)
      ? producerAgent.allowedToolIds.filter((allowedToolId) => allowedToolId !== toolId)
      : [...producerAgent.allowedToolIds, toolId];

    updateProducerAgent({ allowedToolIds });
  }

  if (!producerAgent) {
    return null;
  }

  return (
    <section className="agent-studio-layout">
      <section className="panel agent-profile-panel">
        <SectionHeader
          eyebrow="Agent studio"
          title="AI Producer Agent"
          action={
            <button className="secondary-button" type="button" onClick={() => props.setAgents(() => resetStaffAgents())}>
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
            <strong>{producerAgent.name}</strong>
            <span>{producerAgent.role}</span>
          </div>
          <StatusPill tone={producerAgent.status === "active" ? "success" : producerAgent.status === "paused" ? "neutral" : "warning"}>
            {producerAgent.status}
          </StatusPill>
        </div>

        <div className="inspector-summary">
          <div>
            <span>Type</span>
            <strong>{getAgentTypeLabel(producerAgent.type)}</strong>
          </div>
          <div>
            <span>Planning</span>
            <strong>{producerAgent.planningMode}</strong>
          </div>
          <div>
            <span>Budget guard</span>
            <strong>RM {producerAgent.costGuardRM.toFixed(2)}</strong>
          </div>
          <div>
            <span>Updated</span>
            <strong>{formatDateTime(producerAgent.updatedAt)}</strong>
          </div>
        </div>

        <Field label="Agent name">
          <input value={producerAgent.name} onChange={(event) => updateProducerAgent({ name: event.target.value })} />
        </Field>
        <Field label="Mission">
          <textarea rows={4} value={producerAgent.mission} onChange={(event) => updateProducerAgent({ mission: event.target.value })} />
        </Field>
        <Field label="System prompt">
          <textarea rows={8} value={producerAgent.systemPrompt} onChange={(event) => updateProducerAgent({ systemPrompt: event.target.value })} />
        </Field>
      </section>

      <section className="panel agent-policy-panel">
        <SectionHeader eyebrow="Operating policy" title="Decision Boundaries" />
        <div className="two-column-fields">
          <Field label="Status">
            <select value={producerAgent.status} onChange={(event) => updateProducerAgent({ status: event.target.value as StaffAgentStatus })}>
              {agentStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Planning mode">
            <select value={producerAgent.planningMode} onChange={(event) => updateProducerAgent({ planningMode: event.target.value as AgentPlanningMode })}>
              {planningModeOptions.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Cost guard RM">
          <input min={0} step={0.1} type="number" value={producerAgent.costGuardRM} onChange={(event) => updateProducerAgent({ costGuardRM: Number(event.target.value) })} />
        </Field>
        <Field label="Human approval policy">
          <textarea rows={4} value={producerAgent.humanApprovalPolicy} onChange={(event) => updateProducerAgent({ humanApprovalPolicy: event.target.value })} />
        </Field>
        <Field label="Publishing policy">
          <textarea rows={4} value={producerAgent.publishingPolicy} onChange={(event) => updateProducerAgent({ publishingPolicy: event.target.value })} />
        </Field>
        <Field label="Fallback strategy">
          <textarea rows={4} value={producerAgent.fallbackStrategy} onChange={(event) => updateProducerAgent({ fallbackStrategy: event.target.value })} />
        </Field>
        <Field label="Memory sources">
          <input
            value={producerAgent.memorySources.join(", ")}
            onChange={(event) =>
              updateProducerAgent({
                memorySources: event.target.value
                  .split(",")
                  .map((source) => source.trim())
                  .filter(Boolean)
              })
            }
          />
        </Field>
      </section>

      <section className="panel agent-tools-panel">
        <SectionHeader eyebrow="Tool permissions" title="Allowed Tools" />
        <div className="agent-tool-permission-list">
          {props.endpoints.map((endpoint) => {
            const allowed = producerAgent.allowedToolIds.includes(endpoint.id);

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
        <div className="policy-note">
          <ShieldCheck size={18} />
          <span>Tool permissions are the Agent's action boundary. Paid, upload, and storage tools should stay auditable and gated.</span>
        </div>
      </section>
    </section>
  );
}
