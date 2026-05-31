import type { StaffAgent } from "./agents.js";
import { isSameLocalDay, type AiToolEndpoint, type ProductionSchedule, type PublishingTarget, type ToolProviderSettings } from "./admin-data.js";
import type { AdminJob } from "./jobs.js";
import { productionStages } from "./production.js";
import { findWorkflowToolSetting, getToolTypeForStage, getWorkflowOperationalState } from "./workflow-readiness.js";

export interface ScheduleGuardInput {
  defaultCaseCostRM?: number | undefined;
  endpoints: AiToolEndpoint[];
  jobs: Pick<AdminJob, "actualCostRM" | "costLimitRM" | "createdAt" | "scheduleId" | "source">[];
  now?: Date | undefined;
  producerAgent: StaffAgent | null;
  publishingTargets: PublishingTarget[];
  schedule: ProductionSchedule;
  settings: ToolProviderSettings[];
}

export interface ScheduleGuardResult {
  activeTargetIds: string[];
  blockers: string[];
  canRun: boolean;
  plannedCaseCount: number;
  remainingBudgetRM: number;
  remainingDailySlots: number;
  todaysCaseCount: number;
  todaysCostExposureRM: number;
  warnings: string[];
}

const defaultCaseCostRM = 7.5;

export function evaluateScheduleRunGuard(input: ScheduleGuardInput): ScheduleGuardResult {
  const now = input.now ?? new Date();
  const caseCostRM = input.defaultCaseCostRM ?? defaultCaseCostRM;
  const blockers: string[] = [];
  const warnings: string[] = [];
  const todaysScheduledJobs = input.jobs.filter((job) => job.source === "scheduled" && job.scheduleId === input.schedule.id && isSameLocalDay(job.createdAt, now));
  const todaysCostExposureRM = roundRM(todaysScheduledJobs.reduce((sum, job) => sum + Math.max(job.actualCostRM, job.costLimitRM), 0));
  const remainingBudgetRM = roundRM(Math.max(0, input.schedule.budgetLimitRM - todaysCostExposureRM));
  const remainingDailySlots = Math.max(0, input.schedule.maxVideosPerDay - todaysScheduledJobs.length);
  const budgetSlots = Math.max(0, Math.floor(remainingBudgetRM / caseCostRM));
  const activeTargetIds = input.schedule.targetIds.filter((targetId) => input.publishingTargets.some((target) => target.id === targetId && target.enabled));
  const disabledTargetCount = input.schedule.targetIds.length - activeTargetIds.length;

  if (!input.schedule.enabled) {
    blockers.push("排程已暂停，请先启用并保存。");
  }

  if (remainingDailySlots <= 0) {
    blockers.push("今日排程产量已达到上限。");
  }

  if (budgetSlots <= 0) {
    blockers.push("今日排程预算已不足。");
  }

  if (input.schedule.targetIds.length > 0 && activeTargetIds.length === 0) {
    blockers.push("已选择的 YouTube 发布目标都未启用。");
  } else if (input.schedule.targetIds.length === 0) {
    warnings.push("未选择 YouTube 目标；自动排程会先产出到 MP4/QC，等待之后再绑定 private upload。");
  } else if (disabledTargetCount > 0) {
    warnings.push(`${disabledTargetCount} 个发布目标已停用，本次会忽略。`);
  }

  for (const issue of getRequiredWorkflowIssues(input)) {
    blockers.push(issue);
  }

  const canRun = blockers.length === 0;
  const plannedCaseCount = canRun ? Math.min(input.schedule.maxCasesPerRun, remainingDailySlots, budgetSlots) : 0;

  if (canRun && plannedCaseCount <= 0) {
    blockers.push("没有可创建的 Case 数量。");
  }

  return {
    activeTargetIds,
    blockers,
    canRun: blockers.length === 0 && plannedCaseCount > 0,
    plannedCaseCount,
    remainingBudgetRM,
    remainingDailySlots,
    todaysCaseCount: todaysScheduledJobs.length,
    todaysCostExposureRM,
    warnings
  };
}

function getRequiredWorkflowIssues(input: ScheduleGuardInput): string[] {
  const issues: string[] = [];

  for (const stage of productionStages) {
    const endpoint = input.endpoints.find((candidate) => candidate.stageIds.includes(stage.id)) ?? null;
    const toolType = getToolTypeForStage(stage.id, endpoint);
    const setting = findWorkflowToolSetting(input.settings, toolType);
    const state = getWorkflowOperationalState({
      agent: input.producerAgent,
      endpoint,
      setting,
      stageId: stage.id
    });

    if (!state.required) {
      continue;
    }

    if (!state.ready) {
      issues.push(`${stage.label} 未就绪：${state.label}`);
      continue;
    }

    if (setting && !setting.allowAutopilot) {
      issues.push(`${stage.label} 只允许手动调用，不能用于自动排程。`);
    }
  }

  return issues;
}

function roundRM(value: number): number {
  return Math.round(value * 100) / 100;
}
