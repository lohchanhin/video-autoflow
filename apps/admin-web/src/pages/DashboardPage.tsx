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
  onOpenCase: (id: string) => void;
}

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
          <p className="eyebrow">Command center</p>
          <h2>Automatic Shorts Factory</h2>
          <p>Track when production starts, how many cases were created today, what is waiting for MP4 review, and which YouTube private targets are ready.</p>
        </div>
        <div className="hero-stat">
          <span>Next auto run</span>
          <strong>{props.summary.nextRunAt ? new Date(props.summary.nextRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Paused"}</strong>
          <small>{props.summary.scheduledToday} scheduled cases today</small>
        </div>
      </div>

      <div className="metric-grid">
        <Metric icon={<Activity size={18} />} label="Active cases" value={props.summary.activeCases} />
        <Metric icon={<CheckCircle2 size={18} />} label="Ready for review" value={props.summary.readyCases} />
        <Metric icon={<AlertTriangle size={18} />} label="Needs attention" value={props.summary.blockedCases} tone="danger" />
        <Metric icon={<CircleDollarSign size={18} />} label="Cost used" value={`RM ${props.summary.totalCost.toFixed(2)}`} />
        <Metric icon={<Upload size={18} />} label="Approved targets" value={approvedTargets} />
        <Metric icon={<Clock3 size={18} />} label="Active agents" value={activeAgents} />
      </div>

      <section className="dashboard-grid">
        <div className="panel table-panel">
          <SectionHeader eyebrow="Operator focus" title="Needs Attention" />
          {attentionCases.length === 0 ? (
            <EmptyState title="No blocking work" body="Cases that fail, exceed budget, or wait for upload will appear here." />
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
          <SectionHeader eyebrow="Readiness" title="Publishing Stack" />
          <Readiness label="Production schedules" value={`${props.schedules.filter((schedule) => schedule.enabled).length} enabled`} ok={props.schedules.some((schedule) => schedule.enabled)} />
          <Readiness label="YouTube accounts" value={`${connectedChannels} connected`} ok={connectedChannels > 0} />
          <Readiness label="Publishing targets" value={`${enabledTargets} enabled`} ok={enabledTargets > 0} />
          <Readiness label="GCS video library" value={`${props.storedVideos.length} files`} ok={props.storedVideos.length > 0} />
          <Readiness label="Human review gate" value={`${props.summary.reviewCases} waiting`} ok />
          <Readiness label="Upload policy" value="Private locked" ok />
        </div>
      </section>
    </section>
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
      <StatusPill tone={props.ok ? "success" : "danger"}>{props.ok ? "OK" : "Action"}</StatusPill>
    </div>
  );
}
