import { Play, Power, PowerOff } from "lucide-react";
import { useEffect } from "react";
import { EditableActionBar, EmptyState, Field, SectionHeader, StatusPill } from "../components/ui.js";
import type { StaffAgent } from "../lib/agents.js";
import { isSameLocalDay, type AiToolEndpoint, type BudgetSettings, type ProductionSchedule, type ProviderKeyRecord, type PublishingTarget, type ScheduleRun, type ToolProviderSettings } from "../lib/admin-data.js";
import { createDraftPatch, useEditableDraft } from "../lib/editable-draft.js";
import type { AdminJob } from "../lib/jobs.js";
import { evaluateScheduleRunGuard } from "../lib/schedule-guards.js";
import { formatDateTime } from "../lib/view-helpers.js";

interface AutomationPageProps {
  endpoints: AiToolEndpoint[];
  budgetSettings: BudgetSettings;
  jobs: AdminJob[];
  producerAgent: StaffAgent | null;
  providerKeys: ProviderKeyRecord[];
  publishingTargets: PublishingTarget[];
  reportDirtyState?: (key: string, isDirty: boolean) => void;
  runSchedule: (scheduleId: string) => void;
  runs: ScheduleRun[];
  schedules: ProductionSchedule[];
  settings: ToolProviderSettings[];
  updateSchedule: (id: string, updater: (schedule: ProductionSchedule) => ProductionSchedule) => void;
}

const days = [
  { id: 1, label: "周一" },
  { id: 2, label: "周二" },
  { id: 3, label: "周三" },
  { id: 4, label: "周四" },
  { id: 5, label: "周五" },
  { id: 6, label: "周六" },
  { id: 7, label: "周日" }
];

export function AutomationPage(props: AutomationPageProps) {
  const latestRuns = props.runs.slice(0, 8);

  return (
    <section className="automation-page">
      <section className="ops-hero automation-hero">
        <div>
          <p className="eyebrow">自动排程</p>
          <h2>每日自动生产控制台</h2>
          <p>设定 AI Producer Agent 什么时候开工、每次产量、每日上限、预算上限，以及每支排程 Case 要准备到哪些 YouTube private 目标。</p>
        </div>
        <div className="hero-stat">
          <span>下次开工</span>
          <strong>{getNextRunLabel(props.schedules)}</strong>
          <small>目前由 Admin Web 本地定时器执行</small>
        </div>
      </section>

      <section className="automation-grid">
        <div className="automation-schedule-list">
          {props.schedules.map((schedule) => (
            <ScheduleCard
              endpoints={props.endpoints}
              budgetSettings={props.budgetSettings}
              jobs={props.jobs}
              key={schedule.id}
              producerAgent={props.producerAgent}
              providerKeys={props.providerKeys}
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
          <SectionHeader eyebrow="运行记录" title="排程执行日志" />
          {latestRuns.length === 0 ? <EmptyState title="还没有排程执行记录" body="点击 Run now，或等待已启用排程到达下次开工时间。" /> : null}
          <div className="automation-run-list">
            {latestRuns.map((run) => (
              <article className="automation-run-row" key={run.id}>
                <div>
                  <strong>{run.status}</strong>
                  <span>{formatDateTime(run.startedAt)}</span>
                </div>
                <span>{run.createdCaseIds.length} cases</span>
                <StatusPill tone={getScheduleRunTone(run.status)}>
                  {run.error ?? getScheduleRunLabel(run.status)}
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
  budgetSettings: BudgetSettings;
  jobs: AdminJob[];
  producerAgent: StaffAgent | null;
  providerKeys: ProviderKeyRecord[];
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
    providerKeys: props.providerKeys,
    publishingTargets: props.publishingTargets,
    schedule: props.schedule,
    settings: props.settings,
    defaultCaseCostRM: props.budgetSettings.defaultCaseBudgetRM,
    stopWhenBudgetExceeded: props.budgetSettings.stopWhenBudgetExceeded
  });
  const runNowTitle = scheduleEditor.isDirty
    ? "保存排程修改后才能 Run now"
    : runGuard.canRun
      ? "立即按当前已保存排程创建 Case"
      : runGuard.blockers[0] ?? "当前排程暂时不能执行";

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
        eyebrow="每日生产规则"
        title={draft.name}
        action={
          <>
            <button className="secondary-button" type="button" onClick={() => patchDraft({ enabled: !draft.enabled })}>
              {draft.enabled ? <PowerOff size={15} /> : <Power size={15} />}
              {draft.enabled ? "暂停草稿" : "启用草稿"}
            </button>
            <button
              className="primary-button"
              disabled={!runGuard.canRun || scheduleEditor.isDirty}
              title={runNowTitle}
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
        <AutomationStat label="状态" value={draft.enabled ? "已启用" : "已暂停"} />
        <AutomationStat label="执行模式" value={draft.executionMode === "autopilot_to_mp4" ? "自动到 MP4/QC" : "仅建立 Case"} />
        <AutomationStat label="下次开工" value={formatDateTime(draft.nextRunAt)} />
        <AutomationStat label="上次执行" value={props.schedule.lastRunAt ? formatDateTime(props.schedule.lastRunAt) : "从未执行"} />
        <AutomationStat label="今日已建" value={`${todayCases.length}/${draft.maxVideosPerDay}`} />
        <AutomationStat label="发布目标" value={String(enabledTargetCount)} />
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
        <Field label="排程名称">
          <input value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} />
        </Field>
        <Field label="时区">
          <input value={draft.timezone} onChange={(event) => patchDraft({ timezone: event.target.value })} />
        </Field>
        <Field label="开工时间">
          <input type="time" value={draft.startTime} onChange={(event) => patchDraft({ startTime: event.target.value })} />
        </Field>
        <Field label="执行模式">
          <select value={draft.executionMode} onChange={(event) => patchDraft({ executionMode: event.target.value === "autopilot_to_mp4" ? "autopilot_to_mp4" : "queue_only" })}>
            <option value="queue_only">仅建立 Case，人工进入生产</option>
            <option value="autopilot_to_mp4">自动生成到 MP4/QC</option>
          </select>
        </Field>
        <Field label="每次创建 Case">
          <input
            min={1}
            max={50}
            type="number"
            value={draft.maxCasesPerRun}
            onChange={(event) => patchDraft({ maxCasesPerRun: Number(event.target.value) })}
          />
        </Field>
        <Field label="每日最多影片">
          <input
            min={1}
            max={100}
            type="number"
            value={draft.maxVideosPerDay}
            onChange={(event) => patchDraft({ maxVideosPerDay: Number(event.target.value) })}
          />
        </Field>
        <Field label="每日预算 RM">
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
        <strong>YouTube private 目标矩阵</strong>
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
              <small>{target.niche} / 每日配额 {target.dailyQuota} / {target.defaultPrivacy}</small>
            </div>
            <StatusPill tone={target.enabled ? "success" : "neutral"}>{target.enabled ? "已启用" : "已暂停"}</StatusPill>
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

function getScheduleRunLabel(status: ScheduleRun["status"]): string {
  if (status === "queued") return "已排队";
  if (status === "running") return "执行中";
  if (status === "completed") return "已完成";
  if (status === "blocked") return "已阻塞";
  return "失败";
}

function getScheduleRunTone(status: ScheduleRun["status"]): "active" | "danger" | "neutral" | "success" | "warning" {
  if (status === "completed") return "success";
  if (status === "running") return "active";
  if (status === "queued") return "neutral";
  if (status === "blocked") return "warning";
  return "danger";
}

function getNextRunLabel(schedules: ProductionSchedule[]): string {
  const nextRun = schedules.filter((schedule) => schedule.enabled).sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime())[0];

  if (!nextRun) {
    return "Paused";
  }

  return new Date(nextRun.nextRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
