import { Play, Power, PowerOff } from "lucide-react";
import { useEffect } from "react";
import { EditableActionBar, EmptyState, Field, SectionHeader, StatusPill } from "../components/ui.js";
import type { StaffAgent } from "../lib/agents.js";
import { isSameLocalDay, type AiToolEndpoint, type ProductionSchedule, type PublishingTarget, type ScheduleRun, type ToolProviderSettings } from "../lib/admin-data.js";
import { createDraftPatch, useEditableDraft } from "../lib/editable-draft.js";
import type { AdminJob } from "../lib/jobs.js";
import { evaluateScheduleRunGuard } from "../lib/schedule-guards.js";
import { formatDateTime } from "../lib/view-helpers.js";

interface AutomationPageProps {
  endpoints: AiToolEndpoint[];
  jobs: AdminJob[];
  producerAgent: StaffAgent | null;
  publishingTargets: PublishingTarget[];
  reportDirtyState?: (key: string, isDirty: boolean) => void;
  runSchedule: (scheduleId: string) => void;
  runs: ScheduleRun[];
  schedules: ProductionSchedule[];
  settings: ToolProviderSettings[];
  updateSchedule: (id: string, updater: (schedule: ProductionSchedule) => ProductionSchedule) => void;
}

const days = [
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
  { id: 7, label: "Sun" }
];

export function AutomationPage(props: AutomationPageProps) {
  const latestRuns = props.runs.slice(0, 8);

  return (
    <section className="automation-page">
      <section className="ops-hero automation-hero">
        <div>
          <p className="eyebrow">Factory scheduler</p>
          <h2>Automatic Daily Production</h2>
          <p>Set when the AI Producer Agent starts work, how many Shorts it may create, and which YouTube private targets each scheduled case should prepare for.</p>
        </div>
        <div className="hero-stat">
          <span>Next run</span>
          <strong>{getNextRunLabel(props.schedules)}</strong>
          <small>local scheduler while admin is open</small>
        </div>
      </section>

      <section className="automation-grid">
        <div className="automation-schedule-list">
          {props.schedules.map((schedule) => (
            <ScheduleCard
              endpoints={props.endpoints}
              jobs={props.jobs}
              key={schedule.id}
              producerAgent={props.producerAgent}
              publishingTargets={props.publishingTargets}
              reportDirtyState={props.reportDirtyState}
              runSchedule={props.runSchedule}
              schedule={schedule}
              settings={props.settings}
              updateSchedule={props.updateSchedule}
            />
          ))}
        </div>

        <aside className="panel automation-run-panel">
          <SectionHeader eyebrow="Run ledger" title="Schedule Runs" />
          {latestRuns.length === 0 ? <EmptyState title="No schedule runs" body="Run now or wait for the next enabled schedule time." /> : null}
          <div className="automation-run-list">
            {latestRuns.map((run) => (
              <article className="automation-run-row" key={run.id}>
                <div>
                  <strong>{run.status}</strong>
                  <span>{formatDateTime(run.startedAt)}</span>
                </div>
                <span>{run.createdCaseIds.length} cases</span>
                <StatusPill tone={run.status === "completed" ? "success" : run.status === "blocked" ? "warning" : "danger"}>
                  {run.error ?? run.status}
                </StatusPill>
              </article>
            ))}
          </div>
        </aside>
      </section>
    </section>
  );
}

function ScheduleCard(props: {
  endpoints: AiToolEndpoint[];
  jobs: AdminJob[];
  producerAgent: StaffAgent | null;
  publishingTargets: PublishingTarget[];
  reportDirtyState?: AutomationPageProps["reportDirtyState"];
  runSchedule: (scheduleId: string) => void;
  schedule: ProductionSchedule;
  settings: ToolProviderSettings[];
  updateSchedule: AutomationPageProps["updateSchedule"];
}) {
  const scheduleEditor = useEditableDraft(props.schedule, JSON.stringify(props.schedule));
  const draft = scheduleEditor.draft ?? props.schedule;
  const reportDirtyState = props.reportDirtyState;
  const scheduleId = props.schedule.id;
  const todayCases = props.jobs.filter((job) => job.source === "scheduled" && job.scheduleId === props.schedule.id && isSameLocalDay(job.createdAt));
  const enabledTargetCount = draft.targetIds.filter((targetId) => props.publishingTargets.some((target) => target.id === targetId && target.enabled)).length;
  const runGuard = evaluateScheduleRunGuard({
    endpoints: props.endpoints,
    jobs: props.jobs,
    producerAgent: props.producerAgent,
    publishingTargets: props.publishingTargets,
    schedule: props.schedule,
    settings: props.settings
  });

  useEffect(() => {
    reportDirtyState?.(`automation:${scheduleId}`, scheduleEditor.isDirty);
    return () => reportDirtyState?.(`automation:${scheduleId}`, false);
  }, [reportDirtyState, scheduleEditor.isDirty, scheduleId]);

  function patchDraft(patch: Partial<ProductionSchedule>) {
    scheduleEditor.setDraftPatch(patch);
  }

  function saveDraft() {
    const patch = createDraftPatch(props.schedule, draft);
    props.updateSchedule(props.schedule.id, (schedule) => ({ ...schedule, ...patch }));
    scheduleEditor.markSaved(draft);
  }

  return (
    <section className="panel automation-schedule-card">
      <SectionHeader
        eyebrow="Daily production rule"
        title={draft.name}
        action={
          <>
            <button className="secondary-button" type="button" onClick={() => patchDraft({ enabled: !draft.enabled })}>
              {draft.enabled ? <PowerOff size={15} /> : <Power size={15} />}
              {draft.enabled ? "Pause draft" : "Enable draft"}
            </button>
            <button
              className="primary-button"
              disabled={!runGuard.canRun || scheduleEditor.isDirty}
              title={scheduleEditor.isDirty ? "保存排程修改后才能 Run now" : undefined}
              type="button"
              onClick={() => props.runSchedule(props.schedule.id)}
            >
              <Play size={15} />
              Run now
            </button>
          </>
        }
      />

      <div className="automation-stat-grid">
        <AutomationStat label="Status" value={draft.enabled ? "Enabled" : "Paused"} />
        <AutomationStat label="Next run" value={formatDateTime(draft.nextRunAt)} />
        <AutomationStat label="Last run" value={props.schedule.lastRunAt ? formatDateTime(props.schedule.lastRunAt) : "Never"} />
        <AutomationStat label="Today created" value={`${todayCases.length}/${draft.maxVideosPerDay}`} />
        <AutomationStat label="Targets" value={String(enabledTargetCount)} />
      </div>

      <div className="automation-guard-panel">
        <div>
          <span>开工检查</span>
          <strong>{runGuard.canRun ? `可创建 ${runGuard.plannedCaseCount} 支` : "暂时阻塞"}</strong>
        </div>
        <div>
          <span>今日预算余额</span>
          <strong>RM {runGuard.remainingBudgetRM.toFixed(2)}</strong>
        </div>
        <div>
          <span>剩余名额</span>
          <strong>{runGuard.remainingDailySlots}</strong>
        </div>
        <div>
          <span>发布目标</span>
          <strong>{runGuard.activeTargetIds.length > 0 ? `${runGuard.activeTargetIds.length} 个 private` : "MP4/QC"}</strong>
        </div>
      </div>

      {runGuard.blockers.length > 0 || runGuard.warnings.length > 0 ? (
        <div className="automation-guard-list">
          {runGuard.blockers.map((blocker) => (
            <StatusPill key={blocker} tone="danger">{blocker}</StatusPill>
          ))}
          {runGuard.warnings.map((warning) => (
            <StatusPill key={warning} tone="warning">{warning}</StatusPill>
          ))}
        </div>
      ) : null}

      <div className="automation-form-grid">
        <Field label="Schedule name">
          <input value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} />
        </Field>
        <Field label="Timezone">
          <input value={draft.timezone} onChange={(event) => patchDraft({ timezone: event.target.value })} />
        </Field>
        <Field label="Start time">
          <input type="time" value={draft.startTime} onChange={(event) => patchDraft({ startTime: event.target.value })} />
        </Field>
        <Field label="Cases per run">
          <input
            min={1}
            max={50}
            type="number"
            value={draft.maxCasesPerRun}
            onChange={(event) => patchDraft({ maxCasesPerRun: Number(event.target.value) })}
          />
        </Field>
        <Field label="Max videos / day">
          <input
            min={1}
            max={100}
            type="number"
            value={draft.maxVideosPerDay}
            onChange={(event) => patchDraft({ maxVideosPerDay: Number(event.target.value) })}
          />
        </Field>
        <Field label="Budget limit RM">
          <input
            min={1}
            step={0.5}
            type="number"
            value={draft.budgetLimitRM}
            onChange={(event) => patchDraft({ budgetLimitRM: Number(event.target.value) })}
          />
        </Field>
      </div>

      <div className="automation-days">
        {days.map((day) => (
          <label className="toggle-line" key={day.id}>
            <input
              checked={draft.daysOfWeek.includes(day.id)}
              type="checkbox"
              onChange={(event) => patchDraft({ daysOfWeek: event.target.checked ? [...draft.daysOfWeek, day.id] : draft.daysOfWeek.filter((candidate) => candidate !== day.id) })}
            />
            <span>{day.label}</span>
          </label>
        ))}
      </div>

      <div className="automation-target-list">
        <strong>Publishing target matrix</strong>
        {props.publishingTargets.map((target) => (
          <label className="automation-target-row" key={target.id}>
            <input
              checked={draft.targetIds.includes(target.id)}
              disabled={!target.enabled}
              type="checkbox"
              onChange={(event) => patchDraft({ targetIds: event.target.checked ? [...draft.targetIds, target.id] : draft.targetIds.filter((targetId) => targetId !== target.id) })}
            />
            <div>
              <span>{target.channelName}</span>
              <small>{target.niche} / quota {target.dailyQuota} / {target.defaultPrivacy}</small>
            </div>
            <StatusPill tone={target.enabled ? "success" : "neutral"}>{target.enabled ? "enabled" : "paused"}</StatusPill>
          </label>
        ))}
      </div>
      <EditableActionBar
        isDirty={scheduleEditor.isDirty}
        onCancel={scheduleEditor.resetDraft}
        onSave={saveDraft}
      />
    </section>
  );
}

function AutomationStat(props: { label: string; value: string }) {
  return (
    <div className="automation-stat">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function getNextRunLabel(schedules: ProductionSchedule[]): string {
  const nextRun = schedules.filter((schedule) => schedule.enabled).sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime())[0];

  if (!nextRun) {
    return "Paused";
  }

  return new Date(nextRun.nextRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
