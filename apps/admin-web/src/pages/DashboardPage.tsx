import type { ReactNode } from "react";
import { Activity, AlertTriangle, CheckCircle2, CircleDollarSign, Clock3, Upload } from "lucide-react";
import { EmptyState, SectionHeader, StatusPill } from "../components/ui.js";
import type { StaffAgent } from "../lib/agents.js";
import type { CasePublishTarget, ProductionSchedule, PublishingTarget, StoredVideo, YouTubeAccount } from "../lib/admin-data.js";
import type { AdminJob, JobProcessRecord } from "../lib/jobs.js";
import { formatDateTime, getStatusTone, statusLabels } from "../lib/view-helpers.js";

interface DashboardSummary {
  activeCases: number;
  readyCases: number;
  blockedCases: number;
  reviewCases: number;
  totalCost: number;
  privateUploads: number;
  nextRunAt: string | null;
  scheduledToday: number;
}

interface DashboardPageProps {
  accounts: YouTubeAccount[];
  agents: StaffAgent[];
  casePublishTargets: CasePublishTarget[];
  jobs: AdminJob[];
  publishingTargets: PublishingTarget[];
  records: JobProcessRecord[];
  schedules: ProductionSchedule[];
  storedVideos: StoredVideo[];
  summary: DashboardSummary;
  onNavigate: (view: DashboardNavigationTarget) => void;
  onOpenCase: (id: string) => void;
}

type DashboardNavigationTarget = "automation" | "cases" | "keys" | "youtube";

export function DashboardPage(props: DashboardPageProps) {
  const attentionCases = props.jobs
    .filter((job) => {
      const caseRecords = props.records.filter((record) => record.jobId === job.id);
      return (
        job.status === "FAILED" ||
        job.status === "QC_PASSED" ||
        job.status === "READY_TO_UPLOAD" ||
        job.actualCostRM >= job.costLimitRM * 0.85 ||
        caseRecords.some((record) => record.status === "failed")
      );
    })
    .slice(0, 6);

  const activeAgents = props.agents.filter((agent) => agent.status === "active").length;
  const connectedChannels = props.accounts.filter((account) => account.status === "connected").length;
  const enabledTargets = props.publishingTargets.filter((target) => target.enabled).length;
  const approvedTargets = props.casePublishTargets.filter((target) => target.status === "approved").length;

  return (
    <section className="dashboard-page">
      <div className="ops-hero">
        <div>
          <p className="eyebrow">运营控制台</p>
          <h2>AI 内容生产总览</h2>
          <p>集中查看自动开工时间、今日产能、待审核 MP4、预算风险和 YouTube 私密发布准备度。这里应该告诉运营者下一步要做什么，而不是只显示数字。</p>
        </div>
        <div className="hero-stat">
          <span>下次自动开工</span>
          <strong>{props.summary.nextRunAt ? new Date(props.summary.nextRunAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "暂停"}</strong>
          <small>今日排程 {props.summary.scheduledToday} 个 Case</small>
        </div>
      </div>

      <div className="metric-grid">
        <Metric icon={<Activity size={18} />} label="生产中 Case" value={props.summary.activeCases} />
        <Metric icon={<CheckCircle2 size={18} />} label="待人工审核" value={props.summary.readyCases} />
        <Metric icon={<AlertTriangle size={18} />} label="需要处理" value={props.summary.blockedCases} tone="danger" />
        <Metric icon={<CircleDollarSign size={18} />} label="已记录成本" value={`RM ${props.summary.totalCost.toFixed(2)}`} />
        <Metric icon={<Upload size={18} />} label="已批准目标" value={approvedTargets} />
        <Metric icon={<Clock3 size={18} />} label="启用 Agent" value={activeAgents} />
      </div>

      <section className="dashboard-grid">
        <div className="panel table-panel">
          <SectionHeader eyebrow="运营焦点" title="需要处理" />
          {attentionCases.length === 0 ? (
            <DashboardEmptyFocus onNavigate={props.onNavigate} />
          ) : (
            <div className="case-table compact">
              {attentionCases.map((job) => (
                <button className="case-table-row" type="button" key={job.id} onClick={() => props.onOpenCase(job.id)}>
                  <div>
                    <strong>{job.topic}</strong>
                    <span>{job.id}</span>
                  </div>
                  <StatusPill tone={getStatusTone(job.status)}>{statusLabels[job.status]}</StatusPill>
                  <span>RM {job.actualCostRM.toFixed(2)}</span>
                  <span>{formatDateTime(job.updatedAt)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="panel ops-sidebar">
          <SectionHeader eyebrow="就绪状态" title="生产与发布栈" />
          <Readiness label="自动排程" value={`${props.schedules.filter((schedule) => schedule.enabled).length} 个启用`} ok={props.schedules.some((schedule) => schedule.enabled)} />
          <Readiness label="YouTube 账号" value={`${connectedChannels} 个已连接`} ok={connectedChannels > 0} />
          <Readiness label="发布目标" value={`${enabledTargets} 个启用`} ok={enabledTargets > 0} />
          <Readiness label="影片档案" value={`${props.storedVideos.length} 个文件`} ok />
          <Readiness label="人工审核闸口" value={`${props.summary.reviewCases} 个等待`} ok />
          <Readiness label="上传策略" value="锁定私密上传" ok />
        </div>
      </section>
    </section>
  );
}

function DashboardEmptyFocus(props: { onNavigate: (view: DashboardNavigationTarget) => void }) {
  return (
    <div className="dashboard-empty-focus">
      <EmptyState title="当前没有阻塞事项" body="失败、超预算、待上传或等待人工审核的 Case 会出现在这里。现在可以继续准备下一轮生产。" />
      <div className="dashboard-action-grid" aria-label="运营下一步">
        <button type="button" onClick={() => props.onNavigate("cases")}>
          <strong>新建影片 Case</strong>
          <span>输入一句话，生成标题、脚本、分镜并进入生产。</span>
        </button>
        <button type="button" onClick={() => props.onNavigate("automation")}>
          <strong>设置自动排程</strong>
          <span>决定每天什么时候开工、一次生成几支影片。</span>
        </button>
        <button type="button" onClick={() => props.onNavigate("keys")}>
          <strong>检查供应商密钥</strong>
          <span>确认 OpenAI、ElevenLabs、BytePlus 等工具可调用。</span>
        </button>
        <button type="button" onClick={() => props.onNavigate("youtube")}>
          <strong>管理 YouTube 目标</strong>
          <span>维护多账号私密上传目标和配额。</span>
        </button>
      </div>
    </div>
  );
}

function Metric(props: { icon: ReactNode; label: string; value: number | string; tone?: "danger" }) {
  return (
    <article className={`metric ${props.tone ?? ""}`.trim()}>
      <div className="metric-icon">{props.icon}</div>
      <div>
        <span>{props.label}</span>
        <strong>{props.value}</strong>
      </div>
    </article>
  );
}

function Readiness(props: { label: string; value: string; ok: boolean }) {
  return (
    <div className="readiness-row">
      <div>
        <strong>{props.label}</strong>
        <span>{props.value}</span>
      </div>
      <StatusPill tone={props.ok ? "success" : "danger"}>{props.ok ? "就绪" : "需处理"}</StatusPill>
    </div>
  );
}
