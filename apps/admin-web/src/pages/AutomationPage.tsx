import { Play, Power, PowerOff } from "lucide-react";
import { EmptyState, Field, SectionHeader, StatusPill } from "../components/ui.js";
import { isSameLocalDay, type ProductionSchedule, type PublishingTarget, type ScheduleRun } from "../lib/admin-data.js";
import type { AdminJob } from "../lib/jobs.js";
import { formatDateTime } from "../lib/view-helpers.js";

interface AutomationPageProps {
  jobs: AdminJob[];
  publishingTargets: PublishingTarget[];
  runSchedule: (scheduleId: string) => void;
  runs: ScheduleRun[];
  schedules: ProductionSchedule[];
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
              jobs={props.jobs}
              key={schedule.id}
              publishingTargets={props.publishingTargets}
              runSchedule={props.runSchedule}
              schedule={schedule}
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
  jobs: AdminJob[];
  publishingTargets: PublishingTarget[];
  runSchedule: (scheduleId: string) => void;
  schedule: ProductionSchedule;
  updateSchedule: AutomationPageProps["updateSchedule"];
}) {
  const todayCases = props.jobs.filter((job) => job.source === "scheduled" && job.scheduleId === props.schedule.id && isSameLocalDay(job.createdAt));
  const enabledTargetCount = props.schedule.targetIds.filter((targetId) => props.publishingTargets.some((target) => target.id === targetId && target.enabled)).length;

  return (
    <section className="panel automation-schedule-card">
      <SectionHeader
        eyebrow="Daily production rule"
        title={props.schedule.name}
        action={
          <>
            <button
              className="secondary-button"
              type="button"
              onClick={() => props.updateSchedule(props.schedule.id, (schedule) => ({ ...schedule, enabled: !schedule.enabled }))}
            >
              {props.schedule.enabled ? <PowerOff size={15} /> : <Power size={15} />}
              {props.schedule.enabled ? "Pause" : "Enable"}
            </button>
            <button className="primary-button" disabled={!props.schedule.enabled} type="button" onClick={() => props.runSchedule(props.schedule.id)}>
              <Play size={15} />
              Run now
            </button>
          </>
        }
      />

      <div className="automation-stat-grid">
        <AutomationStat label="Next run" value={formatDateTime(props.schedule.nextRunAt)} />
        <AutomationStat label="Last run" value={props.schedule.lastRunAt ? formatDateTime(props.schedule.lastRunAt) : "Never"} />
        <AutomationStat label="Today created" value={`${todayCases.length}/${props.schedule.maxVideosPerDay}`} />
        <AutomationStat label="Targets" value={String(enabledTargetCount)} />
      </div>

      <div className="automation-form-grid">
        <Field label="Schedule name">
          <input value={props.schedule.name} onChange={(event) => props.updateSchedule(props.schedule.id, (schedule) => ({ ...schedule, name: event.target.value }))} />
        </Field>
        <Field label="Timezone">
          <input value={props.schedule.timezone} onChange={(event) => props.updateSchedule(props.schedule.id, (schedule) => ({ ...schedule, timezone: event.target.value }))} />
        </Field>
        <Field label="Start time">
          <input type="time" value={props.schedule.startTime} onChange={(event) => props.updateSchedule(props.schedule.id, (schedule) => ({ ...schedule, startTime: event.target.value }))} />
        </Field>
        <Field label="Cases per run">
          <input
            min={1}
            max={50}
            type="number"
            value={props.schedule.maxCasesPerRun}
            onChange={(event) => props.updateSchedule(props.schedule.id, (schedule) => ({ ...schedule, maxCasesPerRun: Number(event.target.value) }))}
          />
        </Field>
        <Field label="Max videos / day">
          <input
            min={1}
            max={100}
            type="number"
            value={props.schedule.maxVideosPerDay}
            onChange={(event) => props.updateSchedule(props.schedule.id, (schedule) => ({ ...schedule, maxVideosPerDay: Number(event.target.value) }))}
          />
        </Field>
        <Field label="Budget limit RM">
          <input
            min={1}
            step={0.5}
            type="number"
            value={props.schedule.budgetLimitRM}
            onChange={(event) => props.updateSchedule(props.schedule.id, (schedule) => ({ ...schedule, budgetLimitRM: Number(event.target.value) }))}
          />
        </Field>
      </div>

      <div className="automation-days">
        {days.map((day) => (
          <label className="toggle-line" key={day.id}>
            <input
              checked={props.schedule.daysOfWeek.includes(day.id)}
              type="checkbox"
              onChange={(event) =>
                props.updateSchedule(props.schedule.id, (schedule) => ({
                  ...schedule,
                  daysOfWeek: event.target.checked ? [...schedule.daysOfWeek, day.id] : schedule.daysOfWeek.filter((candidate) => candidate !== day.id)
                }))
              }
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
              checked={props.schedule.targetIds.includes(target.id)}
              disabled={!target.enabled}
              type="checkbox"
              onChange={(event) =>
                props.updateSchedule(props.schedule.id, (schedule) => ({
                  ...schedule,
                  targetIds: event.target.checked ? [...schedule.targetIds, target.id] : schedule.targetIds.filter((targetId) => targetId !== target.id)
                }))
              }
            />
            <div>
              <span>{target.channelName}</span>
              <small>{target.niche} / quota {target.dailyQuota} / {target.defaultPrivacy}</small>
            </div>
            <StatusPill tone={target.enabled ? "success" : "neutral"}>{target.enabled ? "enabled" : "paused"}</StatusPill>
          </label>
        ))}
      </div>
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
