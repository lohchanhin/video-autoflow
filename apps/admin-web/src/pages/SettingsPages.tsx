import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, Eye, EyeOff, RefreshCw, Save, Send, ShieldCheck, UploadCloud } from "lucide-react";
import type { CostLog, CostSummaryResponse } from "@ai-content-factory/shared-types";
import { EditableActionBar, EmptyState, Field, SectionHeader, StatusPill } from "../components/ui.js";
import { getCostSummary, listCostLogs } from "../lib/api.js";
import type { BudgetSettings, ProviderKeyRecord, PublishingTarget, StorageSettings, StoredVideo, YouTubeAccount } from "../lib/admin-data.js";
import { createDraftPatch, useEditableDraft } from "../lib/editable-draft.js";
import {
  createLocalDataSnapshot,
  downloadLocalDataSnapshot,
  getLocalDataStats,
  importLocalDataSnapshot,
  isLocalDataSnapshot,
  productionAppOrigin,
  sendLocalDataToProductionDomain
} from "../lib/local-data-portability.js";
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
    setSavedMessage("刚刚保存");
  }

  return (
    <article className="settings-row youtube-account-row">
      <div>
        <strong>{draft.channelName || "未命名频道"}</strong>
        <span>{draft.youtubeChannelId || "缺少 YouTube Channel ID"}</span>
      </div>
      <StatusPill tone={draft.status === "connected" ? "success" : "danger"}>{draft.status === "connected" ? "已连接" : "需重连"}</StatusPill>
      <StatusPill tone="success">{draft.defaultPrivacy}</StatusPill>
      <Field label="频道名称">
        <input value={draft.channelName} onChange={(event) => patchDraft({ channelName: event.target.value })} />
      </Field>
      <Field label="Channel ID">
        <input value={draft.youtubeChannelId} onChange={(event) => patchDraft({ youtubeChannelId: event.target.value })} />
      </Field>
      <Field label="OAuth 状态">
        <select value={draft.status} onChange={(event) => patchDraft({ status: event.target.value as YouTubeAccount["status"] })}>
          <option value="connected">已连接</option>
          <option value="needs_reconnect">需要重连</option>
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

      <LocalDataMigrationPanel />
    </section>
  );
}

function LocalDataMigrationPanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [stats, setStats] = useState(() => getLocalDataStats());
  const currentOrigin = typeof window === "undefined" ? "" : window.location.origin;
  const isProductionOrigin = currentOrigin === productionAppOrigin;
  const formattedBytes = useMemo(() => formatBytes(stats.bytes), [stats.bytes]);

  function refreshStats() {
    setStats(getLocalDataStats());
  }

  function downloadBackup() {
    const snapshot = createLocalDataSnapshot();

    if (snapshot.entries.length === 0) {
      setMessage("当前浏览器没有可导出的本地业务资料。");
      return;
    }

    downloadLocalDataSnapshot(snapshot);
    setMessage(`已导出 ${snapshot.entries.length} 项本地资料备份。`);
    refreshStats();
  }

  function migrateToProductionDomain() {
    const snapshot = createLocalDataSnapshot();

    if (snapshot.entries.length === 0) {
      setMessage("当前浏览器没有可迁移的本地业务资料。");
      return;
    }

    const opened = sendLocalDataToProductionDomain(snapshot);

    setMessage(
      opened
        ? `已打开 ${productionAppOrigin} 并发送 ${snapshot.entries.length} 项资料。请在新页面确认导入。`
        : "浏览器阻止了新窗口。请允许弹窗，或先下载备份 JSON 再到正式域名导入。"
    );
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      const snapshot = JSON.parse(content) as unknown;

      if (!isLocalDataSnapshot(snapshot)) {
        setMessage("这个文件不是 AI Content Factory 本地资料备份。");
        return;
      }

      if (!window.confirm(`将导入来自 ${snapshot.sourceOrigin} 的 ${snapshot.entries.length} 项本地资料，并覆盖当前浏览器资料。继续？`)) {
        return;
      }

      const result = importLocalDataSnapshot(snapshot, { overwrite: true });
      setMessage(`已导入 ${result.imported} 项，跳过 ${result.skipped} 项。页面将刷新。`);
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败，请确认 JSON 文件完整。");
    }
  }

  return (
    <section className="panel local-data-migration-panel">
      <SectionHeader eyebrow="Browser cache" title="本地缓存备份与应急恢复" />
      <div className="migration-status-grid">
        <div>
          <span>当前网址</span>
          <strong>{currentOrigin}</strong>
        </div>
        <div>
          <span>本地资料项</span>
          <strong>{stats.count}</strong>
        </div>
        <div>
          <span>估算大小</span>
          <strong>{formattedBytes}</strong>
        </div>
      </div>
      <p className="migration-copy">
        正常业务资料会通过 API 同步到 MongoDB。这里仅用于旧版本浏览器缓存的备份和应急恢复，不再作为正式资料源。
      </p>
      <div className="migration-actions">
        {!isProductionOrigin ? (
          <button className="primary-button" type="button" onClick={migrateToProductionDomain}>
            <Send size={16} />
            应急发送到 vertex-workflow.com
          </button>
        ) : null}
        <button className="secondary-button" type="button" onClick={downloadBackup}>
          <Download size={16} />
          下载本地资料备份
        </button>
        <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>
          <UploadCloud size={16} />
          导入备份 JSON
        </button>
        <button className="secondary-button" type="button" onClick={refreshStats}>
          <RefreshCw size={16} />
          刷新统计
        </button>
        <input ref={fileInputRef} accept="application/json,.json" hidden type="file" onChange={(event) => void importBackup(event)} />
      </div>
      {message ? <div className="migration-message">{message}</div> : null}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
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
  budgetSettings: BudgetSettings;
  jobs: AdminJob[];
  reportDirtyState?: (key: string, isDirty: boolean) => void;
  storedVideos: StoredVideo[];
  summary: { totalCost: number; activeCases: number };
  updateBudgetSettings: (settings: BudgetSettings) => void;
}) {
  const overLimitJobs = props.jobs.filter((job) => job.actualCostRM >= job.costLimitRM);
  const budgetEditor = useEditableDraft(props.budgetSettings, `${props.budgetSettings.updatedAt}:${JSON.stringify(props.budgetSettings)}`);
  const budgetDraft = budgetEditor.draft ?? props.budgetSettings;
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerLogs, setLedgerLogs] = useState<CostLog[]>([]);
  const [ledgerSummary, setLedgerSummary] = useState<CostSummaryResponse | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);

  useEffect(() => {
    props.reportDirtyState?.("budget:settings", budgetEditor.isDirty);
    return () => props.reportDirtyState?.("budget:settings", false);
  }, [budgetEditor.isDirty, props.reportDirtyState]);

  function patchBudgetDraft(patch: Partial<BudgetSettings>) {
    budgetEditor.setDraftPatch(patch);
  }

  function saveBudgetDraft() {
    const nextSettings: BudgetSettings = {
      ...budgetDraft,
      dailyBudgetRM: Math.max(1, Number(budgetDraft.dailyBudgetRM) || 80),
      defaultCaseBudgetRM: Math.max(0.1, Number(budgetDraft.defaultCaseBudgetRM) || 7.5),
      maxCasesPerRun: Math.max(1, Math.round(Number(budgetDraft.maxCasesPerRun) || 5)),
      maxVideosPerDay: Math.max(1, Math.round(Number(budgetDraft.maxVideosPerDay) || 10)),
      monthlyBudgetRM: Math.max(1, Number(budgetDraft.monthlyBudgetRM) || 2500),
      updatedAt: new Date().toISOString()
    };

    props.updateBudgetSettings(nextSettings);
    budgetEditor.markSaved(nextSettings);
  }

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
        <SectionHeader eyebrow="全局预算设置" title="预算控制中心" action={<StatusPill tone={budgetEditor.isDirty ? "warning" : "success"}>{budgetEditor.isDirty ? "未保存" : "已保存"}</StatusPill>} />
        <p className="muted-copy">这里是全系统预算默认来源。保存后会同步新建 Case 默认预算、自动排程预算、每日产量上限，以及主控 Agent 的单 Case 成本护栏。</p>
        <div className="two-column-fields">
          <Field label="默认单支 Case 预算 RM">
            <input min={0.1} step={0.1} type="number" value={budgetDraft.defaultCaseBudgetRM} onChange={(event) => patchBudgetDraft({ defaultCaseBudgetRM: Number(event.target.value) })} />
          </Field>
          <Field label="每日预算 RM">
            <input min={1} step={1} type="number" value={budgetDraft.dailyBudgetRM} onChange={(event) => patchBudgetDraft({ dailyBudgetRM: Number(event.target.value) })} />
          </Field>
          <Field label="每月预算 RM">
            <input min={1} step={10} type="number" value={budgetDraft.monthlyBudgetRM} onChange={(event) => patchBudgetDraft({ monthlyBudgetRM: Number(event.target.value) })} />
          </Field>
          <Field label="每次排程最多 Case">
            <input min={1} max={50} type="number" value={budgetDraft.maxCasesPerRun} onChange={(event) => patchBudgetDraft({ maxCasesPerRun: Number(event.target.value) })} />
          </Field>
          <Field label="每日最多影片">
            <input min={1} max={1000} type="number" value={budgetDraft.maxVideosPerDay} onChange={(event) => patchBudgetDraft({ maxVideosPerDay: Number(event.target.value) })} />
          </Field>
          <Field label="超预算策略">
            <label className="toggle-line">
              <input checked={budgetDraft.stopWhenBudgetExceeded} type="checkbox" onChange={(event) => patchBudgetDraft({ stopWhenBudgetExceeded: event.target.checked })} />
              <span>超出预算时停止自动付费生成</span>
            </label>
          </Field>
        </div>
        <EditableActionBar
          isDirty={budgetEditor.isDirty}
          onCancel={budgetEditor.resetDraft}
          onSave={saveBudgetDraft}
          saveLabel="保存全局预算"
        />
      </div>

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
