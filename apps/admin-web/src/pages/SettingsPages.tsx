import { useEffect, useState } from "react";
import { Eye, EyeOff, RefreshCw, Save, ShieldCheck } from "lucide-react";
import type { CostLog, CostSummaryResponse } from "@ai-content-factory/shared-types";
import { EditableActionBar, EmptyState, Field, SectionHeader, StatusPill } from "../components/ui.js";
import { getCostSummary, listCostLogs } from "../lib/api.js";
import type { ProviderKeyRecord, PublishingTarget, StorageSettings, StoredVideo, YouTubeAccount } from "../lib/admin-data.js";
import { createDraftPatch, useEditableDraft } from "../lib/editable-draft.js";
import type { AdminJob } from "../lib/jobs.js";

export function KeysPage(props: {
  keys: ProviderKeyRecord[];
  reportDirtyState?: (key: string, isDirty: boolean) => void;
  resetKeys: () => void;
  saveProviderSecret: (id: string) => void;
  secretDrafts: Record<string, string>;
  toggleSecretDraftVisibility: (id: string) => void;
  updateSecretDraft: (id: string, value: string) => void;
  updateProviderKey: (id: string, updater: (key: ProviderKeyRecord) => ProviderKeyRecord) => void;
  visibleDrafts: Record<string, boolean>;
}) {
  return (
    <section className="panel table-panel">
      <SectionHeader
        eyebrow="Provider access"
        title="Key Management"
        action={
          <button
            className="secondary-button"
            type="button"
            onClick={() => window.confirm("确定重置密钥状态记录？已保存到 API server 的真实密钥不会显示在前端，但本地状态会被覆盖。") && props.resetKeys()}
          >
            <RefreshCw size={15} />
            Reset
          </button>
        }
      />
      <div className="settings-table">
        {props.keys.map((key) => (
          <article className="settings-row key-settings-row" key={key.id}>
            <div>
              <strong>{key.provider}</strong>
              <span>{key.service}</span>
            </div>
            <StatusPill tone={key.status === "configured" ? "success" : key.status === "needs_rotation" ? "warning" : "danger"}>{key.status}</StatusPill>
            <span>{key.keyName}</span>
            <ProviderKeyEnabledDraft providerKey={key} reportDirtyState={props.reportDirtyState} updateProviderKey={props.updateProviderKey} />
            <div className="secret-control">
              <input
                type={props.visibleDrafts[key.id] ? "text" : "password"}
                value={props.secretDrafts[key.id] ?? ""}
                placeholder={key.lastFour ? `configured · ${key.lastFour}` : "Paste key locally"}
                onChange={(event) => props.updateSecretDraft(key.id, event.target.value)}
              />
              <button className="icon-button" type="button" onClick={() => props.toggleSecretDraftVisibility(key.id)} aria-label="Toggle secret visibility">
                {props.visibleDrafts[key.id] ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button className="icon-button primary" type="button" onClick={() => props.saveProviderSecret(key.id)} aria-label="Save key status">
                <Save size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProviderKeyEnabledDraft(props: {
  providerKey: ProviderKeyRecord;
  reportDirtyState?: ((key: string, isDirty: boolean) => void) | undefined;
  updateProviderKey: (id: string, updater: (key: ProviderKeyRecord) => ProviderKeyRecord) => void;
}) {
  const editor = useEditableDraft(props.providerKey, `${props.providerKey.id}:${props.providerKey.updatedAt ?? ""}:${props.providerKey.enabled}`);
  const draft = editor.draft ?? props.providerKey;
  const providerKeyId = props.providerKey.id;
  const reportDirtyState = props.reportDirtyState;

  useEffect(() => {
    reportDirtyState?.(`keys-provider:${providerKeyId}`, editor.isDirty);
    return () => reportDirtyState?.(`keys-provider:${providerKeyId}`, false);
  }, [editor.isDirty, providerKeyId, reportDirtyState]);

  function saveDraft() {
    const nextDraft = { ...draft, updatedAt: new Date().toISOString() };
    const patch = createDraftPatch(props.providerKey, nextDraft);

    props.updateProviderKey(props.providerKey.id, (current) => ({ ...current, ...patch }));
    editor.markSaved(nextDraft);
  }

  return (
    <div className="settings-draft-cell">
      <label className="toggle-line">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => editor.setDraftPatch({ enabled: event.target.checked })}
        />
        <span>Enabled</span>
      </label>
      <EditableActionBar
        isDirty={editor.isDirty}
        onCancel={editor.resetDraft}
        onSave={saveDraft}
      />
    </div>
  );
}

export function YouTubePage(props: {
  accounts: YouTubeAccount[];
  canUpload: boolean;
  createPublishingTarget: (input: { accountId: string; channelName: string; youtubeChannelId: string }) => void;
  handleConnectAccount: (input: { channelName: string; youtubeChannelId: string }) => void;
  publishingTargets: PublishingTarget[];
  reportDirtyState?: (key: string, isDirty: boolean) => void;
  updateAccount: (id: string, updater: (account: YouTubeAccount) => YouTubeAccount) => void;
  updatePublishingTarget: (id: string, updater: (target: PublishingTarget) => PublishingTarget) => void;
}) {
  const accountCreateEditor = useEditableDraft({ channelName: "", youtubeChannelId: "" }, "youtube-account-create");
  const accountCreateDraft = accountCreateEditor.draft ?? { channelName: "", youtubeChannelId: "" };
  const defaultTargetDraft = { accountId: props.accounts[0]?.id ?? "", channelName: "", youtubeChannelId: "" };
  const targetCreateEditor = useEditableDraft(defaultTargetDraft, `publishing-target-create:${defaultTargetDraft.accountId}`);
  const targetCreateDraft = targetCreateEditor.draft ?? defaultTargetDraft;
  const reportDirtyState = props.reportDirtyState;

  useEffect(() => {
    reportDirtyState?.("youtube-create-account", accountCreateEditor.isDirty);
    return () => reportDirtyState?.("youtube-create-account", false);
  }, [accountCreateEditor.isDirty, reportDirtyState]);

  useEffect(() => {
    reportDirtyState?.("youtube-create-target", targetCreateEditor.isDirty);
    return () => reportDirtyState?.("youtube-create-target", false);
  }, [reportDirtyState, targetCreateEditor.isDirty]);

  function saveAccountDraft() {
    props.handleConnectAccount(accountCreateDraft);
    accountCreateEditor.markSaved({ channelName: "", youtubeChannelId: "" });
  }

  function saveTargetDraft() {
    props.createPublishingTarget(targetCreateDraft);
    targetCreateEditor.markSaved({ accountId: targetCreateDraft.accountId, channelName: "", youtubeChannelId: "" });
  }

  return (
    <section className="youtube-console">
      <section className="panel">
        <SectionHeader eyebrow="YouTube OAuth" title="Connected Channels" action={<StatusPill tone={props.canUpload ? "success" : "danger"}>{props.canUpload ? "Ready" : "Missing"}</StatusPill>} />
        <Field label="Channel name">
          <input value={accountCreateDraft.channelName} onChange={(event) => accountCreateEditor.setDraftPatch({ channelName: event.target.value })} />
        </Field>
        <Field label="YouTube channel ID">
          <input value={accountCreateDraft.youtubeChannelId} onChange={(event) => accountCreateEditor.setDraftPatch({ youtubeChannelId: event.target.value })} />
        </Field>
        <EditableActionBar
          disabled={!accountCreateDraft.channelName.trim() || !accountCreateDraft.youtubeChannelId.trim()}
          isDirty={accountCreateEditor.isDirty}
          onCancel={accountCreateEditor.resetDraft}
          onSave={saveAccountDraft}
          saveLabel="Register channel"
        />
        <div className="policy-note">
          <ShieldCheck size={18} />
          <span>MVP uploads are locked to private. Public upload is not available here.</span>
        </div>
      </section>

      <div className="panel table-panel">
        <SectionHeader eyebrow="Publishing accounts" title="Channel Registry" />
        {props.accounts.length === 0 ? <EmptyState title="No YouTube accounts" body="Register a channel, then connect real OAuth credentials before private upload is available." /> : null}
        <div className="settings-table">
          {props.accounts.map((account) => (
            <YouTubeAccountSettingsRow key={account.id} account={account} reportDirtyState={props.reportDirtyState} updateAccount={props.updateAccount} />
          ))}
        </div>
      </div>

      <section className="panel youtube-target-form">
        <SectionHeader eyebrow="Target matrix" title="Add Publishing Target" action={<StatusPill tone="success">private only</StatusPill>} />
        <Field label="Google / YouTube account">
          <select value={targetCreateDraft.accountId} onChange={(event) => targetCreateEditor.setDraftPatch({ accountId: event.target.value })}>
            <option value="">Select registered account</option>
            {props.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.channelName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target channel name">
          <input value={targetCreateDraft.channelName} onChange={(event) => targetCreateEditor.setDraftPatch({ channelName: event.target.value })} />
        </Field>
        <Field label="Target channel ID">
          <input value={targetCreateDraft.youtubeChannelId} onChange={(event) => targetCreateEditor.setDraftPatch({ youtubeChannelId: event.target.value })} />
        </Field>
        <EditableActionBar
          disabled={!targetCreateDraft.accountId && props.accounts.length === 0}
          isDirty={targetCreateEditor.isDirty}
          onCancel={targetCreateEditor.resetDraft}
          onSave={saveTargetDraft}
          saveLabel="Add target"
        />
      </section>

      <div className="panel table-panel youtube-target-panel">
        <SectionHeader eyebrow="Multi-account publishing" title="Publishing Targets" />
        {props.publishingTargets.length === 0 ? <EmptyState title="No publishing targets" body="Add real channel targets after registering a YouTube account. Upload remains blocked until OAuth is connected." /> : null}
        <div className="settings-table">
          {props.publishingTargets.map((target) => (
            <PublishingTargetSettingsRow key={target.id} reportDirtyState={props.reportDirtyState} target={target} updatePublishingTarget={props.updatePublishingTarget} />
          ))}
        </div>
      </div>
    </section>
  );
}

function YouTubeAccountSettingsRow(props: {
  account: YouTubeAccount;
  reportDirtyState?: ((key: string, isDirty: boolean) => void) | undefined;
  updateAccount: (id: string, updater: (account: YouTubeAccount) => YouTubeAccount) => void;
}) {
  const editor = useEditableDraft(props.account, `${props.account.id}:${props.account.updatedAt}`);
  const draft = editor.draft ?? props.account;
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const accountId = props.account.id;
  const reportDirtyState = props.reportDirtyState;

  useEffect(() => {
    reportDirtyState?.(`youtube-account:${accountId}`, editor.isDirty);
    return () => reportDirtyState?.(`youtube-account:${accountId}`, false);
  }, [accountId, editor.isDirty, reportDirtyState]);

  function patchDraft(patch: Partial<YouTubeAccount>) {
    editor.setDraftPatch(patch);
    setSavedMessage(null);
  }

  function saveDraft() {
    const nextDraft: YouTubeAccount = {
      ...draft,
      channelName: draft.channelName.trim() || props.account.channelName,
      defaultPrivacy: "private",
      updatedAt: new Date().toISOString(),
      youtubeChannelId: draft.youtubeChannelId.trim() || props.account.youtubeChannelId
    };
    const patch = createDraftPatch(props.account, nextDraft);

    if (Object.keys(patch).length > 0) {
      props.updateAccount(props.account.id, (current) => ({ ...current, ...patch, defaultPrivacy: "private" }));
    }

    editor.markSaved(nextDraft);
    setSavedMessage("åˆšåˆšä¿å­˜");
  }

  return (
    <article className="settings-row youtube-account-row">
      <div>
        <strong>{draft.channelName || "æœªå‘½åé¢‘é“"}</strong>
        <span>{draft.youtubeChannelId || "ç¼ºå°‘ YouTube Channel ID"}</span>
      </div>
      <StatusPill tone={draft.status === "connected" ? "success" : "danger"}>{draft.status === "connected" ? "å·²è¿žæŽ¥" : "éœ€é‡è¿ž"}</StatusPill>
      <StatusPill tone="success">{draft.defaultPrivacy}</StatusPill>
      <Field label="é¢‘é“åç§°">
        <input value={draft.channelName} onChange={(event) => patchDraft({ channelName: event.target.value })} />
      </Field>
      <Field label="Channel ID">
        <input value={draft.youtubeChannelId} onChange={(event) => patchDraft({ youtubeChannelId: event.target.value })} />
      </Field>
      <Field label="OAuth çŠ¶æ€">
        <select value={draft.status} onChange={(event) => patchDraft({ status: event.target.value as YouTubeAccount["status"] })}>
          <option value="connected">å·²è¿žæŽ¥</option>
          <option value="needs_reconnect">éœ€è¦é‡è¿ž</option>
        </select>
      </Field>
      <button className="secondary-button" type="button" onClick={() => patchDraft({ status: "needs_reconnect" })}>
        标记需要重连
      </button>
      <EditableActionBar
        isDirty={editor.isDirty}
        onCancel={() => {
          editor.resetDraft();
          setSavedMessage(null);
        }}
        onSave={saveDraft}
        savedMessage={savedMessage}
      />
    </article>
  );
}

function PublishingTargetSettingsRow(props: {
  reportDirtyState?: ((key: string, isDirty: boolean) => void) | undefined;
  target: PublishingTarget;
  updatePublishingTarget: (id: string, updater: (target: PublishingTarget) => PublishingTarget) => void;
}) {
  const editor = useEditableDraft(props.target, `${props.target.id}:${props.target.updatedAt}`);
  const draft = editor.draft ?? props.target;
  const reportDirtyState = props.reportDirtyState;
  const targetId = props.target.id;

  useEffect(() => {
    reportDirtyState?.(`publishing-target:${targetId}`, editor.isDirty);
    return () => reportDirtyState?.(`publishing-target:${targetId}`, false);
  }, [editor.isDirty, reportDirtyState, targetId]);

  function patchDraft(patch: Partial<PublishingTarget>) {
    editor.setDraftPatch(patch);
  }

  function saveDraft() {
    const nextDraft = { ...draft, updatedAt: new Date().toISOString(), defaultPrivacy: "private" as const };
    const patch = createDraftPatch(props.target, nextDraft);

    props.updatePublishingTarget(props.target.id, (current) => ({ ...current, ...patch }));
    editor.markSaved(nextDraft);
  }

  return (
    <article className="settings-row publishing-target-row">
      <div>
        <strong>{draft.channelName}</strong>
        <span>{draft.youtubeChannelId}</span>
      </div>
      <StatusPill tone={draft.enabled ? "success" : "neutral"}>{draft.enabled ? "enabled" : "paused"}</StatusPill>
      <Field label="Daily quota">
        <input
          min={1}
          max={50}
          type="number"
          value={draft.dailyQuota}
          onChange={(event) => patchDraft({ dailyQuota: Number(event.target.value) })}
        />
      </Field>
      <Field label="Niche">
        <input value={draft.niche} onChange={(event) => patchDraft({ niche: event.target.value })} />
      </Field>
      <Field label="Upload window">
        <input value={draft.uploadWindow} onChange={(event) => patchDraft({ uploadWindow: event.target.value })} />
      </Field>
      <label className="toggle-line">
        <input checked={draft.enabled} type="checkbox" onChange={(event) => patchDraft({ enabled: event.target.checked })} />
        <span>Enabled</span>
      </label>
      <EditableActionBar
        isDirty={editor.isDirty}
        onCancel={editor.resetDraft}
        onSave={saveDraft}
      />
    </article>
  );
}

export function StoragePage(props: {
  canUpload: boolean;
  reportDirtyState?: (key: string, isDirty: boolean) => void;
  settings: StorageSettings;
  setSettings: (settings: StorageSettings) => void;
  storedVideos: StoredVideo[];
  updateStoredVideo: (id: string, updater: (video: StoredVideo) => StoredVideo) => void;
}) {
  const settingsEditor = useEditableDraft(props.settings, JSON.stringify(props.settings));
  const settingsDraft = settingsEditor.draft ?? props.settings;
  const reportDirtyState = props.reportDirtyState;

  useEffect(() => {
    reportDirtyState?.("storage:settings", settingsEditor.isDirty);
    return () => reportDirtyState?.("storage:settings", false);
  }, [reportDirtyState, settingsEditor.isDirty]);

  function patchSettingsDraft(patch: Partial<StorageSettings>) {
    settingsEditor.setDraftPatch(patch);
  }

  function saveStorageSettings() {
    props.setSettings(settingsDraft);
    settingsEditor.markSaved(settingsDraft);
  }

  return (
    <section className="settings-grid">
      <div className="panel">
        <SectionHeader eyebrow="Video library" title="GCP / GCS Storage" action={<StatusPill tone={props.canUpload ? "success" : "warning"}>{settingsDraft.driver}</StatusPill>} />
        <Field label="Storage driver">
          <select value={settingsDraft.driver} onChange={(event) => patchSettingsDraft({ driver: event.target.value as StorageSettings["driver"] })}>
            <option value="gcs">Google Cloud Storage</option>
            <option value="minio">MinIO local</option>
            <option value="local">Project uploads folder</option>
          </select>
        </Field>
        <Field label="Local uploads path">
          <input value={settingsDraft.localUploadsPath} onChange={(event) => patchSettingsDraft({ localUploadsPath: event.target.value })} />
        </Field>
        <Field label="GCP project ID">
          <input value={settingsDraft.gcpProjectId} onChange={(event) => patchSettingsDraft({ gcpProjectId: event.target.value })} />
        </Field>
        <Field label="GCS bucket">
          <input value={settingsDraft.gcsBucket} onChange={(event) => patchSettingsDraft({ gcsBucket: event.target.value })} />
        </Field>
        <Field label="GCS prefix">
          <input value={settingsDraft.gcsPrefix} onChange={(event) => patchSettingsDraft({ gcsPrefix: event.target.value })} />
        </Field>
        <Field label="MinIO bucket">
          <input value={settingsDraft.minioBucket} onChange={(event) => patchSettingsDraft({ minioBucket: event.target.value })} />
        </Field>
        <EditableActionBar
          isDirty={settingsEditor.isDirty}
          onCancel={settingsEditor.resetDraft}
          onSave={saveStorageSettings}
        />
      </div>

      <div className="panel table-panel">
        <SectionHeader eyebrow="Artifacts" title="Stored Videos" />
        {props.storedVideos.length === 0 ? <EmptyState title="No stored videos" body="Final MP4 records will appear here after QC." /> : null}
        <div className="settings-table">
          {props.storedVideos.map((video) => (
            <StoredVideoSettingsRow key={video.id} reportDirtyState={props.reportDirtyState} updateStoredVideo={props.updateStoredVideo} video={video} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StoredVideoSettingsRow(props: {
  reportDirtyState?: ((key: string, isDirty: boolean) => void) | undefined;
  updateStoredVideo: (id: string, updater: (video: StoredVideo) => StoredVideo) => void;
  video: StoredVideo;
}) {
  const editor = useEditableDraft(props.video, `${props.video.id}:${props.video.status}`);
  const draft = editor.draft ?? props.video;
  const reportDirtyState = props.reportDirtyState;
  const videoId = props.video.id;

  useEffect(() => {
    reportDirtyState?.(`stored-video:${videoId}`, editor.isDirty);
    return () => reportDirtyState?.(`stored-video:${videoId}`, false);
  }, [editor.isDirty, reportDirtyState, videoId]);

  function saveDraft() {
    const patch = createDraftPatch(props.video, draft);

    props.updateStoredVideo(props.video.id, (current) => ({ ...current, ...patch }));
    editor.markSaved(draft);
  }

  return (
    <article className="settings-row video-row">
      <div>
        <strong>{draft.title}</strong>
        <span>{draft.publicUrl ?? draft.storagePath}</span>
      </div>
      <StatusPill tone={draft.status === "uploaded_private" ? "success" : "active"}>{draft.status}</StatusPill>
      <span>{draft.resolution}</span>
      {draft.publicUrl ? (
        <a className="secondary-button" href={draft.publicUrl} target="_blank" rel="noreferrer">
          Open
        </a>
      ) : null}
      <select value={draft.status} onChange={(event) => editor.setDraftPatch({ status: event.target.value as StoredVideo["status"] })}>
        <option value="draft">draft</option>
        <option value="ready_to_upload">ready_to_upload</option>
        <option value="uploaded_private">uploaded_private</option>
      </select>
      <EditableActionBar
        isDirty={editor.isDirty}
        onCancel={editor.resetDraft}
        onSave={saveDraft}
      />
    </article>
  );
}

export function CostPage(props: {
  jobs: AdminJob[];
  storedVideos: StoredVideo[];
  summary: { totalCost: number; activeCases: number };
}) {
  const overLimitJobs = props.jobs.filter((job) => job.actualCostRM >= job.costLimitRM);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerLogs, setLedgerLogs] = useState<CostLog[]>([]);
  const [ledgerSummary, setLedgerSummary] = useState<CostSummaryResponse | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);

  async function refreshLedger() {
    setLoadingLedger(true);
    try {
      const [summaryResponse, logsResponse] = await Promise.all([
        getCostSummary(),
        listCostLogs({ limit: 80 })
      ]);
      setLedgerSummary(summaryResponse);
      setLedgerLogs(logsResponse.logs);
      setLedgerError(null);
    } catch (error) {
      setLedgerError(error instanceof Error ? error.message : "成本记录读取失败。");
    } finally {
      setLoadingLedger(false);
    }
  }

  useEffect(() => {
    void refreshLedger();
  }, []);

  return (
    <section className="settings-grid">
      <div className="panel">
        <SectionHeader eyebrow="成本控制" title="真实成本记录" action={<StatusPill tone={ledgerSummary?.pricingMissingCount ? "warning" : overLimitJobs.length > 0 ? "danger" : "success"}>{ledgerSummary?.pricingMissingCount ? "有待补价" : overLimitJobs.length > 0 ? "超预算" : "正常"}</StatusPill>} />
        <div className="budget-stack">
          <BudgetLine label="MongoDB 成本总计" value={`RM ${(ledgerSummary?.totalCostRM ?? 0).toFixed(4)}`} />
          <BudgetLine label="本地 Case 累计" value={`RM ${props.summary.totalCost.toFixed(2)}`} />
          <BudgetLine label="完成影片档案" value={String(props.storedVideos.length)} />
          <BudgetLine label="成本记录笔数" value={String(ledgerSummary?.totalLogs ?? 0)} />
          <BudgetLine label="缺少 RM 单价" value={String(ledgerSummary?.pricingMissingCount ?? 0)} />
        </div>
        {ledgerError ? <div className="inline-error">{ledgerError}</div> : null}
        <button className="secondary-button" type="button" onClick={() => void refreshLedger()}>
          <RefreshCw size={15} className={loadingLedger ? "spin" : ""} />
          刷新成本记录
        </button>
      </div>

      <div className="panel table-panel">
        <SectionHeader eyebrow="Provider ledger" title="每次 API 调用记录" />
        <div className="settings-table">
          {ledgerLogs.length === 0 ? (
            <EmptyState title="暂无 MongoDB 成本记录" body="之后脚本、图片、配音、BGM、Seedance 影片生成成功后，会自动写入 cost_logs collection。" />
          ) : ledgerLogs.map((log) => (
            <article className="settings-row" key={log._id}>
              <div>
                <strong>{costServiceLabel(log.service)} / {log.provider}</strong>
                <span>{log.jobId} · {log.model}</span>
              </div>
              <span>RM {log.costRM.toFixed(4)}</span>
              <span>{log.quantity} {log.unit}</span>
              <StatusPill tone={log.pricingStatus === "pricing_missing" ? "warning" : log.pricingStatus === "local_zero" ? "neutral" : "success"}>{costPricingStatusLabel(log.pricingStatus)}</StatusPill>
            </article>
          ))}
        </div>
      </div>

      <div className="panel table-panel">
        <SectionHeader eyebrow="Case guard" title="每支影片预算" />
        <div className="settings-table">
          {props.jobs.map((job) => (
            <article className="settings-row" key={job.id}>
              <div>
                <strong>{job.topic}</strong>
                <span>{job.id}</span>
              </div>
              <span>RM {job.actualCostRM.toFixed(2)}</span>
              <span>上限 RM {job.costLimitRM.toFixed(2)}</span>
              <StatusPill tone={job.actualCostRM >= job.costLimitRM ? "danger" : "success"}>{job.actualCostRM >= job.costLimitRM ? "停止" : "OK"}</StatusPill>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function costServiceLabel(service: CostLog["service"]): string {
  const labels: Record<CostLog["service"], string> = {
    bgm: "背景音乐",
    compose: "合成",
    image: "图片",
    other: "其他",
    qc: "质检",
    reference_design: "设计图",
    script: "脚本",
    tts: "配音",
    video: "影片"
  };
  return labels[service];
}

function costPricingStatusLabel(status: CostLog["pricingStatus"]): string {
  const labels: Record<CostLog["pricingStatus"], string> = {
    actual_usage: "真实用量",
    configured_rate: "配置单价",
    local_zero: "本地零成本",
    pricing_missing: "待补单价"
  };
  return labels[status];
}

function BudgetLine(props: { label: string; value: string }) {
  return (
    <div className="budget-line">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
