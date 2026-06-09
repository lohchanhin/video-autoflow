import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Captions, CheckCircle2, Clock3, FilePenLine, FileVideo, Image as ImageIcon, Loader2, LockKeyhole, Music2, Play, RefreshCw, RotateCcw, Save, Search, Sparkles, Square, UserRound, X } from "lucide-react";
import type { ContentSeries, CostLog, CostSummaryResponse, ProductionAsset, SeriesEpisodeIdea, StoryWorld } from "@ai-content-factory/shared-types";
import { EditableActionBar, EmptyState, Field, MediaFallback, MediaImage, SectionHeader, StatusPill } from "../components/ui.js";
import { getAgentLabel, getAgentTypeLabel, type StaffAgent } from "../lib/agents.js";
import { getCostSummary, listCostLogs } from "../lib/api.js";
import type { CasePublishTarget, CaseQcReport, CharacterProfile, ProductionSchedule, PublishingTarget, StoredVideo, ToolProviderSettings } from "../lib/admin-data.js";
import { advanceJob, markFailed, retryJob, type AdminJob, type CaseActivity, type JobProcessRecord, type ProcessRecordStatus, type SceneReviewItem } from "../lib/jobs.js";
import { confirmDiscardDirtyDraft, createDraftPatch, updateDirtyDraftMap, useEditableDraft } from "../lib/editable-draft.js";
import { estimateNextCaseCost, type CaseNextCostEstimate } from "../lib/case-cost-estimates.js";
import { getCaseBudgetRecoveryAmount } from "../lib/budget-ux.js";
import { isReusableDraftReferenceAsset, isSelectableDraftReferenceAsset, shouldHideFromNewCaseReferencePicker } from "../lib/draft-reference-assets.js";
import { formatDateTime, formatProcessRecordStatus, formatSceneQcStatus, formatSceneReviewStatus, formatTime, getRecordTone, getStatusTone, statusLabels } from "../lib/view-helpers.js";
import { isAudioMediaUrl, isImageMediaUrl, isRasterImageMediaUrl, isVideoMediaUrl, resolveMediaUrl } from "../lib/media-url.js";
import { resolveProductionAssetMediaUrl, resolveProductionAssetPreviewUrl } from "../lib/production-asset-media.js";
import type { ProductionStageId } from "../lib/production.js";
import type { CaseDraftPreview } from "../App.js";

interface CasesPageProps {
  agents: StaffAgent[];
  apiState: "checking" | "online" | "offline";
  costLimitRM: number;
  characters: CharacterProfile[];
  draftBackgroundAssetId: string | null;
  draftCharacterAssetIds: string[];
  draftCharacterId: string | null;
  draftCharacterAssetId: string | null;
  draftSceneAssetIds: string[];
  draftReferenceAssets: ProductionAsset[];
  draftSeriesId: string;
  draftEpisodeId: string;
  draftStoryWorldId: string;
  draftLessonOrTheme: string;
  draftGoal: string;
  draftConflict: string;
  draftTone: string;
  jobs: AdminJob[];
  language: AdminJob["language"];
  prompt: string;
  records: JobProcessRecord[];
  reportDirtyState?: (key: string, isDirty: boolean) => void;
  sceneCount: number;
  selectedJob: AdminJob | null;
  selectedActivities: CaseActivity[];
  selectedPublishTargets: CasePublishTarget[];
  selectedCharacter: CharacterProfile | null;
  selectedProductionAssets: ProductionAsset[];
  selectedSceneReviews: SceneReviewItem[];
  selectedQcReport: CaseQcReport | null;
  selectedRecords: JobProcessRecord[];
  series: ContentSeries[];
  seriesEpisodes: SeriesEpisodeIdea[];
  storyWorlds: StoryWorld[];
  publishingTargets: PublishingTarget[];
  productionSchedules: ProductionSchedule[];
  storedVideos: StoredVideo[];
  templateType: AdminJob["templateType"];
  toolProviderSettings: ToolProviderSettings[];
  topic: string;
  addVideoForJob: (job: AdminJob) => void;
  approveCaseForPublishing: (job: AdminJob) => void;
  autoGenerateCase: () => void;
  autoGenerateStep: string | null;
  clearCases: () => void;
  clearDraftPreview: () => void;
  confirmDraftCase: () => void;
  createCase: () => void;
  draftPreview: CaseDraftPreview | null;
  generateBgmForJob: (job: AdminJob) => void;
  generateDraftScriptStory: () => void;
  generateImagesForJob: (job: AdminJob) => void;
  generateScriptStoryForJob: (job: AdminJob) => void;
  generateTtsForJob: (job: AdminJob) => void;
  generateVideoClipForJob: (job: AdminJob) => void;
  generateVideoForJob: (job: AdminJob) => void;
  generateSceneImageForJob: (job: AdminJob, scene: SceneReviewItem) => void;
  runQcForJob: (job: AdminJob) => void;
  generatingCaseIds: string[];
  generatingBgmCaseIds: string[];
  generatingImageCaseIds: string[];
  generatingSceneImageIds: string[];
  generatingQcCaseIds: string[];
  generatingScriptCaseIds: string[];
  generatingTtsCaseIds: string[];
  generatingVideoClipCaseIds: string[];
  generationError: string | null;
  genreText: string;
  isGeneratingDraftPreview: boolean;
  isAutoGeneratingCase: boolean;
  selectCase: (id: string) => void;
  setCostLimitRM: (value: number) => void;
  setGenreText: (value: string) => void;
  setLanguage: (value: AdminJob["language"]) => void;
  setPrompt: (value: string) => void;
  setSceneCount: (value: number) => void;
  setTemplateType: (value: AdminJob["templateType"]) => void;
  setTopic: (value: string) => void;
  setDraftBackgroundAssetId: (id: string | null) => void;
  setDraftCharacterAssetIds: (ids: string[]) => void;
  setDraftCharacterAssetId: (id: string | null) => void;
  setDraftCharacterId: (id: string | null) => void;
  setDraftSceneAssetIds: (ids: string[]) => void;
  setDraftSeriesId: (id: string) => void;
  setDraftEpisodeId: (id: string) => void;
  setDraftStoryWorldId: (id: string) => void;
  setDraftLessonOrTheme: (value: string) => void;
  setDraftGoal: (value: string) => void;
  setDraftConflict: (value: string) => void;
  setDraftTone: (value: string) => void;
  updateCaseDetails: (id: string, patch: Partial<Pick<AdminJob, "backgroundAssetId" | "characterAssetId" | "characterId" | "costLimitRM" | "prompt" | "sceneCount" | "topic">>) => void;
  updateJob: (id: string, updater: (job: AdminJob) => AdminJob) => void;
  updateProcessRecord: (id: string, updater: (record: JobProcessRecord) => JobProcessRecord) => void;
  updateSceneReview: (id: string, updater: (review: SceneReviewItem) => SceneReviewItem) => void;
  openAssetPlanForJob: (jobId: string) => void;
  openCostSettings: () => void;
  uploadPrivateTarget: (job: AdminJob, targetId: string) => void;
}

type CaseTab = "new" | "queue" | "production";
type ProductionWorkbenchTab = "overview" | "pipeline" | "script" | "assets" | "voice" | "music" | "clips" | "final" | "cost" | "publish" | "activity";

const productionTabGroups: Array<{ label: string; tabs: ProductionWorkbenchTab[] }> = [
  { label: "案件", tabs: ["overview", "pipeline", "script"] },
  { label: "媒体", tabs: ["assets", "voice", "music", "clips", "final"] },
  { label: "交付", tabs: ["cost", "publish"] },
  { label: "记录", tabs: ["activity"] }
];

const processStatusOptions: ProcessRecordStatus[] = ["pending", "working", "done", "failed", "skipped"];

export function CasesPage(props: CasesPageProps) {
  const [activeTab, setActiveTab] = useState<CaseTab>(props.selectedJob ? "production" : "new");
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(props.selectedRecords[0]?.id ?? null);
  const [caseDirtyDrafts, setCaseDirtyDrafts] = useState<Record<string, boolean>>({});
  const hasCaseDirtyDrafts = Object.values(caseDirtyDrafts).some(Boolean);
  const reportCaseDirtyState = useCallback((key: string, isDirty: boolean) => {
    setCaseDirtyDrafts((currentDrafts) => updateDirtyDraftMap(currentDrafts, key, isDirty));
    props.reportDirtyState?.(key, isDirty);
  }, [props.reportDirtyState]);

  useEffect(() => {
    if (!props.selectedRecords.some((record) => record.id === selectedRecordId)) {
      setSelectedRecordId(props.selectedRecords[0]?.id ?? null);
    }
  }, [props.selectedRecords, selectedRecordId]);

  useEffect(() => {
    if (!props.selectedJob && activeTab === "production") {
      setActiveTab(props.jobs.length > 0 ? "queue" : "new");
    }
  }, [activeTab, props.jobs.length, props.selectedJob]);

  useEffect(() => {
    if (props.isAutoGeneratingCase && props.selectedJob) {
      setActiveTab("production");
    }
  }, [props.isAutoGeneratingCase, props.selectedJob]);

  const selectedRecord = props.selectedRecords.find((record) => record.id === selectedRecordId) ?? props.selectedRecords[0] ?? null;
  const blockedCases = props.jobs.filter((job) => job.status === "FAILED").length;

  function canLeaveCaseWorkspace(message = "当前 Case 工作台有未保存修改。确定放弃这些修改并切换吗？") {
    return confirmDiscardDirtyDraft(hasCaseDirtyDrafts, message);
  }

  function switchCaseTab(tab: CaseTab) {
    if (tab === activeTab || canLeaveCaseWorkspace()) {
      setActiveTab(tab);
    }
  }

  function openCase(id: string) {
    if (props.selectedJob?.id !== id && !canLeaveCaseWorkspace("当前 Case 工作台有未保存修改。确定放弃这些修改并打开另一个 Case 吗？")) {
      return;
    }

    props.selectCase(id);
    setActiveTab("production");
  }

  function createCase() {
    props.createCase();
    setActiveTab("production");
  }

  function clearCases() {
    if (!canLeaveCaseWorkspace("当前 Case 工作台有未保存修改。确定放弃这些修改并清空 Case 历史吗？")) {
      return;
    }

    if (!window.confirm("确定清空当前浏览器里的 Case 历史、阶段记录、活动记录和相关本地状态？这个动作不能撤销。")) {
      return;
    }

    props.clearCases();
    setActiveTab("new");
  }

  return (
    <section className="cases-workbench">
      <div className="case-tabs" role="tablist" aria-label="Case workspace tabs">
        <CaseTabButton active={activeTab === "new"} label="新建 Case" meta="输入需求" onClick={() => switchCaseTab("new")} />
        <CaseTabButton active={activeTab === "queue"} label="Case 队列" meta={`${props.jobs.length} 个 Case`} onClick={() => switchCaseTab("queue")} />
        <CaseTabButton active={activeTab === "production"} disabled={!props.selectedJob} label="生产工作台" meta={props.selectedJob?.id ?? "选择 Case"} onClick={() => switchCaseTab("production")} />
      </div>

      {activeTab === "new" ? <CreateCaseTab {...props} createCase={createCase} /> : null}

      {activeTab === "queue" ? (
        <CaseQueueTab blockedCases={blockedCases} clearCases={clearCases} jobs={props.jobs} openCase={openCase} selectedJob={props.selectedJob} />
      ) : null}

      {activeTab === "production" ? (
        <ProductionTab
          {...props}
          reportDirtyState={reportCaseDirtyState}
          selectedRecord={selectedRecord}
          setSelectedRecordId={setSelectedRecordId}
        />
      ) : null}
    </section>
  );
}

function CaseTabButton(props: { active: boolean; disabled?: boolean; label: string; meta: string; onClick: () => void }) {
  return (
    <button
      aria-selected={props.active}
      className={`case-tab ${props.active ? "active" : ""}`}
      disabled={props.disabled}
      role="tab"
      title={`${props.label} / ${props.meta}`}
      type="button"
      onClick={props.onClick}
    >
      <strong>{props.label}</strong>
      <span>{props.meta}</span>
    </button>
  );
}

function CreateCaseTab(props: CasesPageProps & { createCase: () => void }) {
  const apiUnavailable = props.apiState !== "online";
  const hasTopic = Boolean(props.topic.trim());
  const canGeneratePreview = hasTopic && !props.isGeneratingDraftPreview && !apiUnavailable;
  const canAutoGenerate = hasTopic && !props.isAutoGeneratingCase && !props.isGeneratingDraftPreview && !apiUnavailable;
  const characterAssets = props.draftReferenceAssets
    .filter((asset) => isSelectableDraftReferenceAsset(asset) && isReusableDraftReferenceAsset(asset) && asset.type === "character_design")
    .sort((left, right) => left.label.localeCompare(right.label));
  const backgroundAssets = props.draftReferenceAssets
    .filter((asset) => isSelectableDraftReferenceAsset(asset) && isReusableDraftReferenceAsset(asset) && (asset.type === "scene_design" || asset.type === "style_reference" || asset.type === "first_frame"))
    .sort((left, right) => left.label.localeCompare(right.label));
  const hiddenDraftAssetCount = props.draftReferenceAssets.filter(shouldHideFromNewCaseReferencePicker).length;
  const effectiveEpisodes = props.draftSeriesId
    ? props.seriesEpisodes.filter((episode) => episode.seriesId === props.draftSeriesId)
    : props.seriesEpisodes;
  const selectedSeries = props.draftSeriesId ? props.series.find((series) => series._id === props.draftSeriesId) ?? null : null;
  const selectedEpisode = props.draftEpisodeId ? props.seriesEpisodes.find((episode) => episode._id === props.draftEpisodeId) ?? null : null;
  const selectedStoryWorld = props.draftStoryWorldId
    ? props.storyWorlds.find((storyWorld) => storyWorld._id === props.draftStoryWorldId) ?? null
    : selectedSeries?.storyWorldId ? props.storyWorlds.find((storyWorld) => storyWorld._id === selectedSeries.storyWorldId) ?? null : null;
  const selectedCharacterIds = props.draftCharacterAssetIds.length > 0 ? props.draftCharacterAssetIds : [props.draftCharacterAssetId].filter((id): id is string => Boolean(id));
  const selectedSceneIds = props.draftSceneAssetIds.length > 0 ? props.draftSceneAssetIds : [props.draftBackgroundAssetId].filter((id): id is string => Boolean(id));
  const advancedBriefSelectedCount = [
    props.draftSeriesId,
    props.draftEpisodeId,
    selectedStoryWorld?._id,
    props.draftLessonOrTheme,
    props.draftGoal,
    props.draftConflict,
    props.draftTone,
    ...selectedCharacterIds,
    ...selectedSceneIds
  ].filter(Boolean).length;
  const [advancedBriefOpen, setAdvancedBriefOpen] = useState(advancedBriefSelectedCount > 0);

  useEffect(() => {
    if (advancedBriefSelectedCount > 0) {
      setAdvancedBriefOpen(true);
    }
  }, [advancedBriefSelectedCount]);

  return (
    <section className="case-create-workspace">
      <div className="case-create-panel panel">
      <form
        className="case-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          props.generateDraftScriptStory();
        }}
      >
        <SectionHeader eyebrow="创建 Case" title="输入一句话，AI 自动产出大纲" />
        <div className="simple-case-form">
          <Field label="你想做什么影片？">
            <textarea
              autoFocus
              placeholder="随便输入：123、雨夜便利店、喜剧、爱情、科幻知识、一个老板被咖啡机误会的故事..."
              rows={5}
              value={props.topic}
              onChange={(event) => props.setTopic(event.target.value)}
            />
          </Field>
          <details className="case-advanced-brief" open={advancedBriefOpen} onToggle={(event) => setAdvancedBriefOpen(event.currentTarget.open)}>
            <summary>
              <span>
                <strong>可选高级 Brief</strong>
                <small>系列、题库、世界观、角色、场景和本集目标；不填也能生成。</small>
              </span>
              <StatusPill tone={advancedBriefSelectedCount > 0 ? "active" : "neutral"}>{advancedBriefSelectedCount > 0 ? `${advancedBriefSelectedCount} 项已选` : "可留空"}</StatusPill>
            </summary>
            <section className="brief-section">
              <div className="brief-section-title">
                <strong>1. 来源 / 可留空</strong>
                <span>单支影片、系列题库、世界观都走同一个结构化 Brief，不写死题材。</span>
              </div>
              <div className="case-brief-grid">
                <Field label="系列 / Series">
                  <select value={props.draftSeriesId} onChange={(event) => {
                    props.setDraftSeriesId(event.target.value);
                    props.setDraftEpisodeId("");
                  }}>
                    <option value="">单支影片，不绑定系列</option>
                    {props.series.map((series) => <option key={series._id} value={series._id}>{series.name}</option>)}
                  </select>
                </Field>
                <Field label="单集题库 / Episode">
                  <select value={props.draftEpisodeId} onChange={(event) => props.setDraftEpisodeId(event.target.value)}>
                    <option value="">不使用题库，手动输入本集方向</option>
                    {effectiveEpisodes.map((episode) => (
                      <option key={episode._id} value={episode._id}>
                        {episode.episodeNo ? `第 ${episode.episodeNo} 集：` : ""}{episode.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="背景故事 / 世界观">
                  <select value={props.draftStoryWorldId} onChange={(event) => props.setDraftStoryWorldId(event.target.value)}>
                    <option value="">不指定，或继承系列绑定</option>
                    {props.storyWorlds.map((storyWorld) => <option key={storyWorld._id} value={storyWorld._id}>{storyWorld.name}</option>)}
                  </select>
                </Field>
              </div>
              {selectedSeries || selectedEpisode || selectedStoryWorld ? (
                <div className="brief-context-strip">
                  {selectedSeries ? <span>系列：{selectedSeries.name}</span> : null}
                  {selectedEpisode ? <span>单集：{selectedEpisode.lessonOrTheme || selectedEpisode.moralLesson}</span> : null}
                  {selectedStoryWorld ? <span>世界观：{selectedStoryWorld.name}</span> : null}
                </div>
              ) : null}
            </section>
            <section className="brief-section">
              <div className="brief-section-title">
                <strong>2. 角色与场景资产 / 可多选</strong>
                <span>脚本、分镜、图片 prompt 会读取这些资产的角色特质和场景定义。</span>
              </div>
              <div className="case-brief-grid two">
                <AssetMultiSelect
                  assets={characterAssets}
                  emptyText="未选择角色，AI 会自动设计"
                  icon={<UserRound size={17} />}
                  label="出场角色"
                  selectedIds={selectedCharacterIds}
                  onChange={(ids) => {
                    props.setDraftCharacterAssetIds(ids);
                  }}
                />
                <AssetMultiSelect
                  assets={backgroundAssets}
                  emptyText="未选择场景，AI 会自动设计"
                  icon={<ImageIcon size={17} />}
                  label="场景设定 / 背景"
                  selectedIds={selectedSceneIds}
                  onChange={(ids) => {
                    props.setDraftSceneAssetIds(ids);
                  }}
                />
              </div>
            </section>
            <section className="brief-section">
              <div className="brief-section-title">
                <strong>3. 本集目标 / 可选</strong>
                <span>例如教育主题、冲突、目标、语气。留空时按系列和输入自动补齐。</span>
              </div>
              <div className="case-brief-grid four">
                <Field label="主题 / Lesson">
                  <input value={props.draftLessonOrTheme} placeholder="例如：诚实、分享、守信用" onChange={(event) => props.setDraftLessonOrTheme(event.target.value)} />
                </Field>
                <Field label="目标 / Goal">
                  <input value={props.draftGoal} placeholder="例如：主角学会承认错误" onChange={(event) => props.setDraftGoal(event.target.value)} />
                </Field>
                <Field label="冲突 / Conflict">
                  <input value={props.draftConflict} placeholder="例如：闯祸后想隐瞒" onChange={(event) => props.setDraftConflict(event.target.value)} />
                </Field>
                <Field label="语气 / Tone">
                  <input value={props.draftTone} placeholder="例如：温柔、轻松、适合全龄" onChange={(event) => props.setDraftTone(event.target.value)} />
                </Field>
              </div>
            </section>
            {characterAssets.length === 0 && backgroundAssets.length === 0 ? (
              <div className="draft-reference-help">
                还没有可用的已批准设计资产。可以先在「设计资产」生成角色三视图或场景设定表；这里不选择也能继续生成。
              </div>
            ) : null}
            {hiddenDraftAssetCount > 0 ? (
              <div className="draft-reference-help subtle">
                已隐藏 {hiddenDraftAssetCount} 个 Case 规划占位或缺少预览的资产。新建 Case 只显示「资产库」中已入库、可预览的角色和场景参考。
              </div>
            ) : null}
          </details>
          <div className="simple-case-actions">
            <button className="primary-button" disabled={!canGeneratePreview || props.isAutoGeneratingCase} type="button" onClick={props.generateDraftScriptStory}>
              {props.isGeneratingDraftPreview ? <Loader2 size={16} className="spin" /> : <FilePenLine size={16} />}
              {props.isGeneratingDraftPreview ? "生成中" : props.draftPreview ? "重新生成标题 / 脚本 / 分镜" : "生成标题 / 脚本 / 分镜"}
            </button>
            <button className="secondary-button" disabled={!canAutoGenerate} type="button" onClick={props.autoGenerateCase}>
              {props.isAutoGeneratingCase ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
              {props.isAutoGeneratingCase ? props.autoGenerateStep ?? "Generating" : "直接生成 MP4"}
            </button>
          </div>
        </div>
      </form>
      </div>

      {apiUnavailable ? <ServiceIssueBanner apiState={props.apiState} action="Autopilot generation" /> : null}
      {props.isAutoGeneratingCase ? (
        <div className="pipeline-gate-note autopilot-progress">
          <Loader2 size={16} className="spin" />
          <span>{props.autoGenerateStep ?? "Autopilot is running the production pipeline."}</span>
        </div>
      ) : null}
      {props.generationError ? <div className="inline-error">{props.generationError}</div> : null}

      <DraftPreviewPanel
        draftPreview={props.draftPreview}
        clearDraftPreview={props.clearDraftPreview}
        confirmDraftCase={props.confirmDraftCase}
        generateDraftScriptStory={props.generateDraftScriptStory}
        isGeneratingDraftPreview={props.isGeneratingDraftPreview}
      />
    </section>
  );
}

/*
function DraftReferenceSelect(props: {
  assets: ProductionAsset[];
  emptyText: string;
  icon: ReactNode;
  label: string;
  onChange: (id: string) => void;
  selectedAsset: ProductionAsset | null;
  value: string;
}) {
  return (
    <div className="draft-reference-card">
      <label>
        <span>{props.icon}{props.label}</span>
        <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
          <option value="">{props.emptyText}</option>
          {props.assets.map((asset) => (
            <option key={asset._id} value={asset._id}>
              {asset.folderName ? `${asset.folderName} / ${asset.label}` : asset.label}
            </option>
          ))}
        </select>
      </label>
      {props.selectedAsset ? (
        <div className="draft-reference-preview">
          <img alt={props.selectedAsset.label} src={props.selectedAsset.url} />
          <div>
            <strong>{props.selectedAsset.label}</strong>
            <span>{props.selectedAsset.type} / {props.selectedAsset.status}</span>
            <small>{props.selectedAsset.prompt || props.selectedAsset.notes || "已选参考图会写入大纲，并绑定到 Case 的资产规划。"}</small>
          </div>
        </div>
      ) : (
        <div className="draft-reference-empty">可留空，让 AI 根据一句话自动生成视觉设定。</div>
      )}
    </div>
  );
}

*/
function AssetMultiSelect(props: {
  assets: ProductionAsset[];
  emptyText: string;
  icon: ReactNode;
  label: string;
  onChange: (ids: string[]) => void;
  selectedIds: string[];
}) {
  const [query, setQuery] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(props.selectedIds.length === 0);
  const selectedAssets = props.selectedIds
    .map((id) => props.assets.find((asset) => asset._id === id) ?? null)
    .filter((asset): asset is ProductionAsset => Boolean(asset));
  const normalizedQuery = query.trim().toLowerCase();
  const filteredAssets = props.assets.filter((asset) => {
    if (!normalizedQuery) return true;

    return [asset.label, asset.folderName, asset.type, asset.prompt, asset.notes, asset.tags.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  function toggleAsset(id: string) {
    props.onChange(props.selectedIds.includes(id) ? props.selectedIds.filter((currentId) => currentId !== id) : [...props.selectedIds, id]);
  }

  function removeAsset(id: string) {
    props.onChange(props.selectedIds.filter((currentId) => currentId !== id));
  }

  function clearSelectedAssets() {
    props.onChange([]);
  }

  return (
    <div className="draft-reference-card asset-multi-select">
      <div className="asset-multi-header">
        <span>{props.icon}{props.label}</span>
        <small>{selectedAssets.length > 0 ? `${selectedAssets.length} 已选` : props.emptyText}</small>
      </div>
      {selectedAssets.length > 0 ? (
        <div className="asset-selected-mini-grid">
          {selectedAssets.map((asset) => (
            <article className="asset-selected-mini-card" key={asset._id}>
              <span className="asset-selected-mini-thumb">
                {assetThumbUrl(asset) ? <MediaImage alt={asset.label} src={assetThumbUrl(asset)} fallbackLabel="预览失效" /> : <MediaFallback label="无预览" />}
              </span>
              <span className="asset-selected-mini-copy">
                <strong title={asset.label}>{asset.label}</strong>
                <small title={asset.folderName || formatAssetType(asset.type)}>{asset.folderName || formatAssetType(asset.type)}</small>
              </span>
              <button aria-label={`移除 ${asset.label}`} type="button" onClick={() => removeAsset(asset._id)}>
                <X size={14} />
              </button>
            </article>
          ))}
        </div>
      ) : null}
      <div className="asset-multi-actions">
        <button className="secondary-button compact-button" type="button" onClick={() => setLibraryOpen((current) => !current)}>
          {libraryOpen ? "收起资产库" : "选择资产"}
        </button>
        {selectedAssets.length > 0 ? (
          <button className="secondary-button compact-button" type="button" onClick={clearSelectedAssets}>
            清空选择
          </button>
        ) : null}
      </div>
      {props.assets.length === 0 ? (
        <div className="draft-reference-empty">{props.emptyText}</div>
      ) : libraryOpen ? (
        <div className="asset-multi-library">
          <label className="asset-multi-search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资产名称、文件夹、标签" />
          </label>
          {filteredAssets.length === 0 ? (
            <div className="draft-reference-empty">没有符合搜索的资产。</div>
          ) : (
            <div className="asset-multi-options">
              {filteredAssets.map((asset) => {
                const selected = props.selectedIds.includes(asset._id);
                const thumbUrl = assetThumbUrl(asset);

                return (
                  <button
                    aria-pressed={selected}
                    className={selected ? "selected" : ""}
                    key={asset._id}
                    title={`${asset.label} / ${asset.folderName || formatAssetType(asset.type)}`}
                    type="button"
                    onClick={() => toggleAsset(asset._id)}
                  >
                    <span className="asset-multi-check">{selected ? <CheckCircle2 size={16} /> : null}</span>
                    <span className="asset-multi-thumb">
                      {thumbUrl ? <MediaImage alt={asset.label} src={thumbUrl} fallbackLabel="预览失效" /> : <MediaFallback label="无预览" />}
                    </span>
                    <span className="asset-multi-copy">
                      <strong>{asset.label}</strong>
                      <small>{asset.folderName || formatAssetType(asset.type)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function DraftPreviewPanel(props: {
  clearDraftPreview: () => void;
  confirmDraftCase: () => void;
  draftPreview: CaseDraftPreview | null;
  generateDraftScriptStory: () => void;
  isGeneratingDraftPreview: boolean;
}) {
  if (!props.draftPreview) {
    return (
      <section className="case-preview-panel panel">
        <EmptyState title="还没有生成内容" body="输入一句话，点击生成。AI 会直接产出标题、脚本、分镜、图片提示词、音效和背景音乐要求。" />
      </section>
    );
  }

  const backgroundMusic = props.draftPreview.result.backgroundMusic ?? {
    enabled: true,
    instrumentation: "minimal cinematic pads, soft pulses, subtle percussion",
    mood: "cinematic, restrained, narration-friendly",
    prompt: `Instrumental background music for "${props.draftPreview.result.script.title}". No vocals, no copyrighted melody, leave space for narration.`,
    style: "cinematic underscore",
    tempo: "slow to medium"
  };

  return (
    <section className="case-preview-panel panel">
      <SectionHeader
        eyebrow={`${props.draftPreview.result.provider} / ${props.draftPreview.result.model}`}
        title="审核 AI 大纲"
        action={
          <>
            <button className="secondary-button" disabled={props.isGeneratingDraftPreview} type="button" onClick={props.generateDraftScriptStory}>
              {props.isGeneratingDraftPreview ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
              重新写大纲
            </button>
            <button className="secondary-button" type="button" onClick={props.clearDraftPreview}>
              <X size={15} />
              放弃
            </button>
            <button className="primary-button" type="button" onClick={props.confirmDraftCase}>
              <CheckCircle2 size={15} />
              确认并创建 Case
            </button>
          </>
        }
      />
      <div className="draft-preview-summary">
        <div>
          <span>成本</span>
          <strong>RM {props.draftPreview.result.costRM.toFixed(4)}</strong>
        </div>
        <div>
          <span>场景数</span>
          <strong>{props.draftPreview.result.storyboard.length}</strong>
        </div>
        <div>
          <span>Draft case ID</span>
          <strong>{props.draftPreview.result.jobId}</strong>
        </div>
      </div>
      <InterpretedIdeaCard draftPreview={props.draftPreview} />
      <OutlineQcCard draftPreview={props.draftPreview} />
      <div className="draft-script-card">
        <span>标题</span>
        <strong>{props.draftPreview.result.script.title}</strong>
        <span>开场 Hook</span>
        <p>{props.draftPreview.result.script.hook}</p>
        <span>完整脚本 / 旁白</span>
        <textarea readOnly rows={7} value={props.draftPreview.result.script.voiceover} />
      </div>
      <VisualBibleCard visualBible={props.draftPreview.result.visualBible} />
      <div className="draft-script-card">
        <span>背景音乐要求</span>
        <strong>{backgroundMusic.enabled ? "需要 BGM" : "不需要 BGM"}</strong>
        <p>{backgroundMusic.style} / {backgroundMusic.tempo} / {backgroundMusic.mood}</p>
        <span>Instrumentation</span>
        <p>{backgroundMusic.instrumentation}</p>
        <span>BGM prompt</span>
        <textarea readOnly rows={4} value={backgroundMusic.prompt} />
      </div>
      <div className="draft-scene-list">
        {props.draftPreview.result.storyboard.map((scene) => (
          <article className="draft-scene-card" key={scene.sceneId}>
            <div>
                <strong>场景 {scene.sceneId}</strong>
              <span>{scene.durationSeconds}s / {scene.camera}</span>
            </div>
            <span>场景内容</span>
            <p>{scene.visual}</p>
            <span>旁白</span>
            <p>{scene.voiceText}</p>
            <span>图片提示词</span>
            <textarea readOnly rows={3} value={scene.imagePrompt} />
            <span>SFX</span>
            <p>{scene.sfx.join(", ") || "none"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function InterpretedIdeaCard(props: { draftPreview: CaseDraftPreview }) {
  const idea = props.draftPreview.result.interpretedIdea;

  return (
    <div className="draft-script-card">
      <span>AI 理解的故事方向</span>
      <strong>{idea.expandedPremise}</strong>
      <p>{idea.logline}</p>
      <span>故事引擎</span>
      <p>{idea.protagonist} / {idea.setting} / {idea.centralObject}</p>
      <span>冲突 / 规则 / 反转</span>
      <p>{idea.conflict} / {idea.ruleOrConstraint} / {idea.twist}</p>
      <span>Ending hook</span>
      <p>{idea.endingHook}</p>
    </div>
  );
}

function OutlineQcCard(props: { draftPreview: CaseDraftPreview }) {
  const qc = props.draftPreview.result.outlineQc;

  return (
    <div className="draft-script-card">
      <span>大纲质检</span>
      <div className="qc-summary-strip">
        <StatusPill tone={qc.status === "pass" ? "success" : "danger"}>{qc.status}</StatusPill>
        <strong>{qc.summary}</strong>
      </div>
      {qc.checks.map((check) => (
        <p key={check.label}>
          <strong>{check.status === "pass" ? "PASS" : "FIX"} / {check.label}</strong>: {check.detail}
        </p>
      ))}
    </div>
  );
}

function VisualBibleCard(props: { visualBible: CaseDraftPreview["result"]["visualBible"] }) {
  return (
    <div className="draft-script-card visual-bible-card">
      <span>视觉设定 / 角色一致性</span>
      <strong>{props.visualBible.character.name} / {props.visualBible.character.role}</strong>
      <p>{props.visualBible.character.ageRange} / {props.visualBible.character.bodyType} / {props.visualBible.character.hair}</p>
      <span>服装锁定</span>
      <p>{props.visualBible.character.wardrobe}</p>
      <span>身份锁定</span>
      <p>{props.visualBible.character.signatureDetails}</p>
      <span>环境设定</span>
      <p>{props.visualBible.environment.location} / {props.visualBible.environment.lighting} / {props.visualBible.environment.palette}</p>
      <span>Negative prompt</span>
      <p>{props.visualBible.negativePrompt}</p>
    </div>
  );
}

function CaseQueueTab(props: {
  blockedCases: number;
  clearCases: () => void;
  jobs: AdminJob[];
  openCase: (id: string) => void;
  selectedJob: AdminJob | null;
}) {
  return (
    <section className="case-queue-page panel">
      <SectionHeader
        eyebrow="Work queue"
        title="Video Cases"
        action={
          <button className="secondary-button" type="button" onClick={props.clearCases}>
            <Square size={15} />
            清空
          </button>
        }
      />
      <div className="queue-stats">
        <span>{props.jobs.length} total</span>
        <span>{props.blockedCases} 个阻塞</span>
      </div>
      {props.jobs.length === 0 ? <EmptyState title="还没有 Case" body="先建立一个影片 Case，系统会从脚本、分镜、图片、配音一路推进到 MP4。" /> : null}
      <div className="case-queue-table">
        {props.jobs.map((job) => (
          <button
            className={`case-table-row case-queue-row ${props.selectedJob?.id === job.id ? "selected" : ""}`}
            key={job.id}
            type="button"
            onClick={() => props.openCase(job.id)}
          >
            <div>
              <strong>{job.topic}</strong>
              <span>{job.id} / {job.source}</span>
            </div>
            <StatusPill tone={getStatusTone(job.status)}>{statusLabels[job.status]}</StatusPill>
            <span>{job.sceneCount} scenes</span>
            <span>RM {job.actualCostRM.toFixed(2)}</span>
            <span className="case-time-cell">
              <Clock3 size={13} />
              {formatTime(job.updatedAt)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProductionTab(
  props: CasesPageProps & {
    selectedRecord: JobProcessRecord | null;
    setSelectedRecordId: (id: string) => void;
  }
) {
  const [activeProductionTab, setActiveProductionTab] = useState<ProductionWorkbenchTab>("overview");
  const [caseCostError, setCaseCostError] = useState<string | null>(null);
  const [caseCostLogs, setCaseCostLogs] = useState<CostLog[]>([]);
  const [caseCostSummary, setCaseCostSummary] = useState<CostSummaryResponse | null>(null);
  const [isLoadingCaseCosts, setIsLoadingCaseCosts] = useState(false);
  const [productionDirtyDrafts, setProductionDirtyDrafts] = useState<Record<string, boolean>>({});
  const hasProductionDirtyDrafts = Object.values(productionDirtyDrafts).some(Boolean);
  const reportProductionDirtyState = useCallback((key: string, isDirty: boolean) => {
    setProductionDirtyDrafts((currentDrafts) => updateDirtyDraftMap(currentDrafts, key, isDirty));
    props.reportDirtyState?.(key, isDirty);
  }, [props.reportDirtyState]);
  const visibleBudgetEditor = useEditableDraft(
    props.selectedJob ? { costLimitRM: props.selectedJob.costLimitRM } : null,
    props.selectedJob ? `visible-budget:${props.selectedJob.id}:${props.selectedJob.updatedAt}:${props.selectedJob.costLimitRM}` : null
  );
  const visibleBudgetDraft = visibleBudgetEditor.draft;

  useEffect(() => {
    const dirtyKey = props.selectedJob ? `case-visible-budget:${props.selectedJob.id}` : "case-visible-budget:none";
    reportProductionDirtyState(dirtyKey, visibleBudgetEditor.isDirty);
    return () => reportProductionDirtyState(dirtyKey, false);
  }, [props.selectedJob?.id, reportProductionDirtyState, visibleBudgetEditor.isDirty]);

  function saveVisibleCaseBudget() {
    if (!props.selectedJob || !visibleBudgetDraft) {
      return;
    }

    const nextLimit = Math.max(0.1, Number(visibleBudgetDraft.costLimitRM) || props.selectedJob.costLimitRM);
    props.updateCaseDetails(props.selectedJob.id, { costLimitRM: nextLimit });
    visibleBudgetEditor.markSaved({ costLimitRM: nextLimit });
  }

  useEffect(() => {
    if (!props.selectedJob || activeProductionTab !== "cost") {
      return;
    }

    let cancelled = false;
    setIsLoadingCaseCosts(true);
    void Promise.all([
      getCostSummary(props.selectedJob.id),
      listCostLogs({ jobId: props.selectedJob.id, limit: 100 })
    ])
      .then(([summary, logs]) => {
        if (cancelled) return;
        setCaseCostSummary(summary);
        setCaseCostLogs(logs.logs);
        setCaseCostError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setCaseCostError(error instanceof Error ? error.message : "成本记录读取失败。");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCaseCosts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeProductionTab, props.selectedJob?.id]);

  if (!props.selectedJob) {
    return (
      <section className="panel">
        <EmptyState title="尚未选择 Case" body="从 Case 队列选择一支影片，查看生产进度、产物、成本和审核状态。" />
      </section>
    );
  }

  const isWriting = props.generatingScriptCaseIds.includes(props.selectedJob.id);
  const isGeneratingImages = props.generatingImageCaseIds.includes(props.selectedJob.id);
  const isGeneratingTts = props.generatingTtsCaseIds.includes(props.selectedJob.id);
  const isGeneratingBgm = props.generatingBgmCaseIds.includes(props.selectedJob.id);
  const isGeneratingVideoClip = props.generatingVideoClipCaseIds.includes(props.selectedJob.id);
  const isRendering = props.generatingCaseIds.includes(props.selectedJob.id);
  const isRunningQc = props.generatingQcCaseIds.includes(props.selectedJob.id);
  const isStored = props.storedVideos.some((video) => video.jobId === props.selectedJob?.id);
  const imageRecord = props.selectedRecords.find((record) => record.stageId === "image");
  const ttsRecord = props.selectedRecords.find((record) => record.stageId === "tts");
  const bgmRecord = props.selectedRecords.find((record) => record.stageId === "bgm");
  const composeRecord = props.selectedRecords.find((record) => record.stageId === "compose");
  const scriptStoryReady = ["script", "storyboard", "prompt"].every((stageId) => props.selectedRecords.some((record) => record.stageId === stageId && record.status === "done"));
  const hasBlockedSceneReview = props.selectedSceneReviews.some((review) => review.status === "needs_review" || review.status === "rejected" || review.qcStatus === "fail");
  const imageReadyForCompose = Boolean(imageRecord?.status === "done" && splitArtifactPaths(imageRecord.artifactPath).some(isRasterImagePath) && !hasBlockedSceneReview);
  const voiceoverReadyForCompose = Boolean(ttsRecord?.status === "done" && splitArtifactPaths(ttsRecord.artifactPath).some(isAudioPath));
  const bgmReadyForCompose = Boolean(bgmRecord?.status === "done" && splitArtifactPaths(bgmRecord.artifactPath).some(isAudioPath));
  const finalMp4Ready = Boolean(composeRecord?.status === "done" && splitArtifactPaths(composeRecord.artifactPath).some(isVideoPath));
  const canApproveMp4 = finalMp4Ready && voiceoverReadyForCompose && ["QC_PASSED", "READY_TO_UPLOAD", "COMPOSED"].includes(props.selectedJob.status);
  const budgetExhausted = props.selectedJob.actualCostRM >= props.selectedJob.costLimitRM;
  const budgetRecoveryAmount = getCaseBudgetRecoveryAmount(props.selectedJob.actualCostRM, props.selectedJob.costLimitRM);
  const schedule = props.productionSchedules.find((candidate) => candidate.id === props.selectedJob?.scheduleId);
  const sourceSeries = props.selectedJob.seriesId ? props.series.find((series) => series._id === props.selectedJob?.seriesId) ?? null : null;
  const sourceEpisode = props.selectedJob.episodeId ? props.seriesEpisodes.find((episode) => episode._id === props.selectedJob?.episodeId) ?? null : null;
  const apiUnavailable = props.apiState !== "online";
  const tabRecord = getRecordForProductionTab(activeProductionTab, props.selectedRecords, props.selectedRecord);
  const nextAction = getNextCaseAction({
    apiUnavailable,
    canApproveMp4,
    finalMp4Ready,
    imageReadyForCompose,
    isGeneratingImages,
    isGeneratingTts,
    isRendering,
    isRunningQc,
    isWriting,
    job: props.selectedJob,
    scriptStoryReady,
    voiceoverReadyForCompose,
    handlers: {
      approve: () => props.approveCaseForPublishing(props.selectedJob!),
      generateImages: () => props.generateImagesForJob(props.selectedJob!),
      generateScript: () => props.generateScriptStoryForJob(props.selectedJob!),
      generateTts: () => props.generateTtsForJob(props.selectedJob!),
      generateVideo: () => props.generateVideoForJob(props.selectedJob!),
      runQc: () => props.runQcForJob(props.selectedJob!)
    }
  });

  function canLeaveProductionDrafts(message = "当前生产工作台有未保存修改。确定放弃这些修改并切换吗？") {
    return confirmDiscardDirtyDraft(hasProductionDirtyDrafts, message);
  }

  function switchProductionTab(tab: ProductionWorkbenchTab) {
    if (tab === activeProductionTab || canLeaveProductionDrafts()) {
      setActiveProductionTab(tab);
    }
  }

  function selectProductionRecord(recordId: string) {
    if (recordId === props.selectedRecord?.id || canLeaveProductionDrafts("当前阶段编辑器有未保存修改。确定放弃这些修改并查看另一个阶段吗？")) {
      props.setSelectedRecordId(recordId);
    }
  }

  function runProductionAction(action: () => void) {
    if (!confirmDiscardDirtyDraft(hasProductionDirtyDrafts, "当前生产工作台有未保存修改。继续会使用已保存资料执行操作，确定继续吗？")) {
      return;
    }

    action();
  }

  return (
    <section className="production-tab">
      <div className="case-production-header panel">
        <div>
          <p className="eyebrow">生产案件</p>
          <h2>{props.selectedJob.topic}</h2>
          <div className="case-meta-strip">
            <span>{props.selectedJob.id}</span>
            <span>{props.selectedJob.source}</span>
            <span>{schedule?.name ?? "手动 Case"}</span>
            <span>{props.selectedJob.reviewStatus}</span>
            <span>{props.selectedCharacter ? `角色：${props.selectedCharacter.name}` : "未锁定角色"}</span>
            <span>{props.selectedJob.sceneCount} 个场景</span>
            <span>RM {props.selectedJob.actualCostRM.toFixed(2)} / {props.selectedJob.costLimitRM.toFixed(2)}</span>
            <span>{formatDateTime(props.selectedJob.updatedAt)}</span>
          </div>
        </div>
        <StatusPill tone={getStatusTone(props.selectedJob.status)}>{statusLabels[props.selectedJob.status]}</StatusPill>
      </div>

      {sourceSeries || sourceEpisode ? (
        <section className="case-source-panel panel">
          <SectionHeader eyebrow="系列来源" title={sourceSeries?.name ?? "系列来源"} action={<StatusPill tone="active">系列</StatusPill>} />
          <div className="case-source-grid">
            <div>
              <span>系列</span>
              <strong>{sourceSeries?.name ?? props.selectedJob.seriesId}</strong>
            </div>
            <div>
              <span>单集</span>
              <strong>{sourceEpisode?.title ?? props.selectedJob.episodeId}</strong>
            </div>
            <div>
              <span>核心看点</span>
              <strong>{sourceEpisode?.moralLesson ?? "已从系列题库转入 Case"}</strong>
            </div>
          </div>
        </section>
      ) : null}

      <section className="case-command-center panel" aria-label="Case production command center">
        <div className="case-command-primary">
          <div>
            <p className="eyebrow">当前下一步</p>
            <h3>{nextAction.label}</h3>
            <span>{nextAction.disabled ? "动作暂不可执行；请查看下方阻塞说明或切换到对应页签处理。" : "会使用已保存的脚本、资产和工具设置执行；未保存草稿不会被静默带入。"}</span>
          </div>
          <button className="primary-button" type="button" disabled={nextAction.disabled} onClick={() => runProductionAction(nextAction.onClick)}>
            {nextAction.loading ? <Loader2 size={16} className="spin" /> : nextAction.icon}
            {nextAction.label}
          </button>
        </div>

        <div className="case-command-secondary" aria-label="Secondary case operations">
          <div className="case-command-group">
            <span>查看</span>
            <button className="secondary-button compact-button" type="button" onClick={() => switchProductionTab("overview")}>
              总览
            </button>
            <button className="secondary-button compact-button" type="button" onClick={() => switchProductionTab("activity")}>
              活动记录
            </button>
          </div>
          <div className="case-command-group">
            <span>维护</span>
            {props.selectedJob.status === "FAILED" ? (
              <button className="secondary-button compact-button" type="button" onClick={() => runProductionAction(() => props.updateJob(props.selectedJob!.id, retryCase))}>
                <RotateCcw size={15} />
                重试
              </button>
            ) : (
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => runProductionAction(() => window.confirm("确定手动推进这个 Case 的生产状态？这会写入活动记录。") && props.updateJob(props.selectedJob!.id, advanceCase))}
              >
                <Play size={15} />
                手动推进
              </button>
            )}
            <button
              className="danger-button compact-button"
              type="button"
              onClick={() => runProductionAction(() => window.confirm("确定把这个 Case 标记为失败？这会影响 Dashboard、队列和后续自动化判断。") && props.updateJob(props.selectedJob!.id, failCase))}
            >
              <AlertTriangle size={15} />
              标记失败
            </button>
          </div>
          {["QC_PASSED", "READY_TO_UPLOAD", "UPLOADED_PRIVATE"].includes(props.selectedJob.status) ? (
            <div className="case-command-group">
              <span>归档</span>
              <button className="secondary-button compact-button" type="button" disabled={isStored} onClick={() => runProductionAction(() => props.selectedJob && props.addVideoForJob(props.selectedJob))}>
                <Save size={15} />
                {isStored ? "已入库" : "存入影片库"}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {!scriptStoryReady ? (
        <div className="pipeline-gate-note">
          <FilePenLine size={16} />
          <span>图片生成必须等脚本、分镜和图片提示词完成；缺少阶段会显示阻塞，不会用 mock 资料硬凑。</span>
        </div>
      ) : null}

      {scriptStoryReady && !imageReadyForCompose ? (
        <div className="pipeline-gate-note">
          <ImageIcon size={16} />
          <span>{hasBlockedSceneReview ? "合成已锁定：有场景图片未通过视觉检查。请先重生成或批准图片。" : "合成必须等图片阶段产出真实 PNG/JPG/WebP。请先生成图片、检查缩略图，再生成影片。"}</span>
        </div>
      ) : null}

      {scriptStoryReady && imageReadyForCompose && !voiceoverReadyForCompose ? (
        <div className="pipeline-gate-note">
          <Music2 size={16} />
          <span>合成必须等配音阶段产出真实音频。请先生成配音、试听确认，再生成影片。</span>
        </div>
      ) : null}

      {scriptStoryReady && imageReadyForCompose && voiceoverReadyForCompose && !bgmReadyForCompose ? (
        <div className="pipeline-gate-note">
          <Music2 size={16} />
          <span>BGM 是可选项。可以先生成背景音乐再合成，也可以直接生成无背景音乐的影片。</span>
        </div>
      ) : null}

      {budgetExhausted ? (
        <div className="pipeline-gate-note">
          <AlertTriangle size={16} />
          <span>Case 预算已用完：RM {props.selectedJob.actualCostRM.toFixed(4)} / RM {props.selectedJob.costLimitRM.toFixed(2)}。付费生成已锁定；请调整预算并保存后再继续。</span>
        </div>
      ) : null}

      {budgetExhausted && visibleBudgetDraft ? (
        <div className="case-budget-alert-editor panel">
          <div>
            <p className="eyebrow">当前 Case 预算</p>
            <strong>这支影片已经超出 RM {props.selectedJob.costLimitRM.toFixed(2)}，请调高后保存。</strong>
            <span>这里只改当前 Case。以后新 Case 的默认预算在左侧「成本」页面调整。</span>
            <div className="case-budget-alert-actions">
              <button className="secondary-button compact-button" type="button" onClick={() => visibleBudgetEditor.setDraftPatch({ costLimitRM: budgetRecoveryAmount })}>
                建议调到 RM {budgetRecoveryAmount.toFixed(2)}
              </button>
              <button className="secondary-button compact-button" type="button" onClick={props.openCostSettings}>
                打开全局预算
              </button>
            </div>
          </div>
          <Field label="新的 Case 预算 RM">
            <input
              min={0.1}
              step={0.1}
              type="number"
              value={visibleBudgetDraft.costLimitRM}
              onChange={(event) => visibleBudgetEditor.setDraftPatch({ costLimitRM: Number(event.target.value) })}
            />
          </Field>
          <EditableActionBar
            isDirty={visibleBudgetEditor.isDirty}
            onCancel={visibleBudgetEditor.resetDraft}
            onSave={saveVisibleCaseBudget}
            saveLabel="保存并解除预算锁"
          />
        </div>
      ) : null}

      {apiUnavailable ? <ServiceIssueBanner apiState={props.apiState} action="Generation" /> : null}
      {props.generationError ? <div className="inline-error">{props.generationError}</div> : null}

      <div className="production-workbench-tabs grouped" role="tablist" aria-label="Production workbench sections">
        {productionTabGroups.map((group) => (
          <div className="production-tab-group" key={group.label}>
            <span>{group.label}</span>
            <div>
              {group.tabs.map((tab) => (
                <button
                  aria-selected={activeProductionTab === tab}
                  className={`production-workbench-tab ${activeProductionTab === tab ? "active" : ""}`}
                  key={tab}
                  role="tab"
                  title={formatProductionTab(tab)}
                  type="button"
                  onClick={() => switchProductionTab(tab)}
                >
                  {formatProductionTab(tab)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {activeProductionTab === "overview" ? (
        <CaseOverviewPanel
          assets={props.selectedProductionAssets}
          finalMp4Ready={finalMp4Ready}
          imageReadyForCompose={imageReadyForCompose}
          job={props.selectedJob}
          nextAction={nextAction}
          reportDirtyState={reportProductionDirtyState}
          records={props.selectedRecords}
          scriptStoryReady={scriptStoryReady}
          toolProviderSettings={props.toolProviderSettings}
          openCostSettings={props.openCostSettings}
          updateCaseDetails={props.updateCaseDetails}
          voiceoverReadyForCompose={voiceoverReadyForCompose}
        />
      ) : null}

      {activeProductionTab === "pipeline" ? (
        <section className="production-tab-grid two">
          <section className="case-step-section panel">
            <SectionHeader eyebrow="生产流程" title="阶段进度" />
            <div className="case-step-rail">
              {props.selectedRecords.map((record) => (
                <button
                  className={`case-step-card ${props.selectedRecord?.id === record.id ? "selected" : ""}`}
                  key={record.id}
                  type="button"
                  onClick={() => selectProductionRecord(record.id)}
                >
                  <span className={`timeline-dot ${record.status}`} />
                  <div>
                    <strong>{record.order}. {record.stageName}</strong>
                    <span>{record.queueName}</span>
                    {record.status === "failed" && record.notes ? <small className="stage-failure-text">{record.notes}</small> : null}
                  </div>
                  <StatusPill tone={getRecordTone(record.status)}>{formatProcessRecordStatus(record.status)}</StatusPill>
                </button>
              ))}
            </div>
          </section>
          <StageEditorPanel
            agents={props.agents}
            characters={props.characters}
            job={props.selectedJob}
            record={props.selectedRecord}
            reportDirtyState={reportProductionDirtyState}
            updateCaseDetails={props.updateCaseDetails}
            updateProcessRecord={props.updateProcessRecord}
          />
        </section>
      ) : null}

      {activeProductionTab === "script" || activeProductionTab === "voice" || activeProductionTab === "music" || activeProductionTab === "clips" || activeProductionTab === "final" ? (
        <StageOutputPanel
          characters={props.characters}
          generateBgmForJob={props.generateBgmForJob}
          generateImagesForJob={props.generateImagesForJob}
          generateSceneImageForJob={props.generateSceneImageForJob}
          generateTtsForJob={props.generateTtsForJob}
          generateVideoClipForJob={props.generateVideoClipForJob}
          runQcForJob={props.runQcForJob}
          isGeneratingBgm={isGeneratingBgm}
          isGeneratingImages={isGeneratingImages}
          generatingSceneImageIds={props.generatingSceneImageIds}
          isGeneratingTts={isGeneratingTts}
          isGeneratingVideoClip={isGeneratingVideoClip}
          isRunningQc={isRunningQc}
          record={tabRecord}
          sceneReviews={props.selectedSceneReviews}
          qcReport={props.selectedQcReport}
          storedVideos={props.storedVideos}
          job={props.selectedJob}
          reportDirtyState={reportProductionDirtyState}
          updateSceneReview={props.updateSceneReview}
        />
      ) : null}

      {activeProductionTab === "assets" ? (
        <section className="case-assets-workbench">
          <AssetPlanSummaryPanel assets={props.selectedProductionAssets} job={props.selectedJob} openAssetPlan={props.openAssetPlanForJob} />
          <SceneImageWorkbench
            assets={props.selectedProductionAssets}
            generatingSceneImageIds={props.generatingSceneImageIds}
            generateImagesForJob={props.generateImagesForJob}
            generateSceneImageForJob={props.generateSceneImageForJob}
            isGeneratingImages={isGeneratingImages}
            job={props.selectedJob}
            records={props.selectedRecords}
            reportDirtyState={reportProductionDirtyState}
            sceneReviews={props.selectedSceneReviews}
            updateSceneReview={props.updateSceneReview}
          />
          <CaseAssetsPanel job={props.selectedJob} qcReport={props.selectedQcReport} records={props.selectedRecords} sceneReviews={props.selectedSceneReviews} storedVideos={props.storedVideos} />
        </section>
      ) : null}

      {activeProductionTab === "publish" ? (
        <PublishTargetMatrix
          caseTargets={props.selectedPublishTargets}
          job={props.selectedJob}
          publishingTargets={props.publishingTargets}
          uploadPrivateTarget={props.uploadPrivateTarget}
        />
      ) : null}

      {activeProductionTab === "cost" ? (
        <CaseCostLedgerPanel
          error={caseCostError}
          isLoading={isLoadingCaseCosts}
          job={props.selectedJob}
          logs={caseCostLogs}
          summary={caseCostSummary}
        />
      ) : null}

      {activeProductionTab === "activity" ? <ActivityLogPanel activities={props.selectedActivities} /> : null}
    </section>
  );
}

interface CaseNextAction {
  disabled: boolean;
  icon: ReactNode;
  label: string;
  loading: boolean;
  onClick: () => void;
}

function getNextCaseAction(input: {
  apiUnavailable: boolean;
  canApproveMp4: boolean;
  finalMp4Ready: boolean;
  imageReadyForCompose: boolean;
  isGeneratingImages: boolean;
  isGeneratingTts: boolean;
  isRendering: boolean;
  isRunningQc: boolean;
  isWriting: boolean;
  job: AdminJob;
  scriptStoryReady: boolean;
  voiceoverReadyForCompose: boolean;
  handlers: {
    approve: () => void;
    generateImages: () => void;
    generateScript: () => void;
    generateTts: () => void;
    generateVideo: () => void;
    runQc: () => void;
  };
}): CaseNextAction {
  if (!input.scriptStoryReady) {
    return {
      disabled: input.apiUnavailable || input.isWriting,
      icon: <FilePenLine size={16} />,
      label: input.isWriting ? "正在生成脚本/分镜" : "生成脚本/分镜",
      loading: input.isWriting,
      onClick: input.handlers.generateScript
    };
  }

  if (!input.imageReadyForCompose) {
    return {
      disabled: input.apiUnavailable || input.isGeneratingImages,
      icon: <ImageIcon size={16} />,
      label: input.isGeneratingImages ? "正在生成图片" : "生成图片",
      loading: input.isGeneratingImages,
      onClick: input.handlers.generateImages
    };
  }

  if (!input.voiceoverReadyForCompose) {
    return {
      disabled: input.apiUnavailable || input.isGeneratingTts,
      icon: <Music2 size={16} />,
      label: input.isGeneratingTts ? "正在生成配音" : "生成配音",
      loading: input.isGeneratingTts,
      onClick: input.handlers.generateTts
    };
  }

  if (!input.finalMp4Ready) {
    return {
      disabled: input.apiUnavailable || input.isRendering,
      icon: <FileVideo size={16} />,
      label: input.isRendering ? "正在生成 MP4" : "生成完整 MP4",
      loading: input.isRendering,
      onClick: input.handlers.generateVideo
    };
  }

  if (input.job.status !== "QC_PASSED" && input.job.status !== "READY_TO_UPLOAD") {
    return {
      disabled: input.apiUnavailable || input.isRunningQc,
      icon: <CheckCircle2 size={16} />,
      label: input.isRunningQc ? "正在检查 QC" : "执行 QC",
      loading: input.isRunningQc,
      onClick: input.handlers.runQc
    };
  }

  return {
    disabled: !input.canApproveMp4 || input.job.reviewStatus === "approved",
    icon: <CheckCircle2 size={16} />,
    label: input.job.reviewStatus === "approved" ? "已批准" : "批准 MP4",
    loading: false,
    onClick: input.handlers.approve
  };
}

function getRecordForProductionTab(tab: ProductionWorkbenchTab, records: JobProcessRecord[], fallback: JobProcessRecord | null): JobProcessRecord | null {
  const stageByTab: Partial<Record<ProductionWorkbenchTab, ProductionStageId[]>> = {
    clips: ["video"],
    final: ["compose", "qc"],
    music: ["bgm"],
    script: ["script", "storyboard", "prompt"],
    voice: ["tts", "subtitle"]
  };
  const stageIds = stageByTab[tab] ?? [];
  return records.find((record) => stageIds.includes(record.stageId)) ?? fallback;
}

function formatProductionTab(tab: ProductionWorkbenchTab): string {
  const labels: Record<ProductionWorkbenchTab, string> = {
    activity: "活动记录",
    assets: "资产",
    clips: "视频片段",
    cost: "成本",
    final: "最终 MP4",
    music: "音乐",
    overview: "总览",
    pipeline: "流程",
    publish: "发布",
    script: "脚本",
    voice: "配音"
  };

  return labels[tab];
}

function CaseOverviewPanel(props: {
  assets: ProductionAsset[];
  finalMp4Ready: boolean;
  imageReadyForCompose: boolean;
  job: AdminJob;
  nextAction: CaseNextAction;
  reportDirtyState?: (key: string, isDirty: boolean) => void;
  records: JobProcessRecord[];
  scriptStoryReady: boolean;
  toolProviderSettings: ToolProviderSettings[];
  openCostSettings: () => void;
  updateCaseDetails: (id: string, patch: Partial<Pick<AdminJob, "costLimitRM">>) => void;
  voiceoverReadyForCompose: boolean;
}) {
  const budgetUsedPct = props.job.costLimitRM > 0 ? Math.min(100, Math.round((props.job.actualCostRM / props.job.costLimitRM) * 100)) : 0;
  const budgetEditor = useEditableDraft({ costLimitRM: props.job.costLimitRM }, `${props.job.id}:${props.job.updatedAt}:${props.job.costLimitRM}`);
  const budgetDraft = budgetEditor.draft ?? { costLimitRM: props.job.costLimitRM };
  const readyAssets = props.assets.filter((asset) => asset.status === "ready" || asset.status === "approved").length;
  const nextCostEstimate = estimateNextCaseCost({
    job: props.job,
    readiness: {
      finalMp4Ready: props.finalMp4Ready,
      imageReadyForCompose: props.imageReadyForCompose,
      scriptStoryReady: props.scriptStoryReady,
      voiceoverReadyForCompose: props.voiceoverReadyForCompose
    },
    records: props.records,
    settings: props.toolProviderSettings
  });
  const budgetNeedsAction = props.job.actualCostRM >= props.job.costLimitRM || nextCostEstimate.exceedsBudget;
  const budgetTargetRM = getCaseBudgetRecoveryAmount(
    props.job.actualCostRM + (nextCostEstimate.estimatedCostRM ?? 0),
    props.job.costLimitRM
  );
  const blockers = [
    props.scriptStoryReady ? "" : "脚本、分镜或图片提示词还没完成。",
    props.imageReadyForCompose ? "" : "场景图片还没准备好，或仍需要审核。",
    props.voiceoverReadyForCompose ? "" : "配音音频还没生成。",
    props.finalMp4Ready ? "" : "最终 MP4 还没合成。"
  ].filter(Boolean);

  useEffect(() => {
    const dirtyKey = `case-budget:${props.job.id}`;
    props.reportDirtyState?.(dirtyKey, budgetEditor.isDirty);
    return () => props.reportDirtyState?.(dirtyKey, false);
  }, [budgetEditor.isDirty, props.job.id, props.reportDirtyState]);

  function saveCaseBudgetDraft() {
    const nextLimit = Math.max(0.1, Number(budgetDraft.costLimitRM) || props.job.costLimitRM);
    props.updateCaseDetails(props.job.id, { costLimitRM: nextLimit });
    budgetEditor.markSaved({ costLimitRM: nextLimit });
  }

  return (
    <section className="case-overview-grid">
      <section className="panel case-overview-main">
        <SectionHeader eyebrow="下一步" title={props.nextAction.label} action={<StatusPill tone={blockers.length > 0 ? "warning" : "success"}>{blockers.length > 0 ? "处理中" : "可执行"}</StatusPill>} />
        <button className="primary-button overview-cta" type="button" disabled={props.nextAction.disabled} onClick={props.nextAction.onClick}>
          {props.nextAction.loading ? <Loader2 size={17} className="spin" /> : props.nextAction.icon}
          {props.nextAction.label}
        </button>
        {blockers.length > 0 ? (
          <div className="overview-blocker-list">
            {blockers.map((blocker) => (
              <span key={blocker}>{blocker}</span>
            ))}
          </div>
        ) : (
          <div className="reference-asset-note success">
            <CheckCircle2 size={15} />
            <span>这个 Case 已准备进入审核或下一个发布闸口。</span>
          </div>
        )}
      </section>
      <section className="panel case-overview-side">
        <SectionHeader
          eyebrow="预算"
          title={`RM ${props.job.actualCostRM.toFixed(2)} / ${props.job.costLimitRM.toFixed(2)}`}
          action={
            <button className="secondary-button compact-button" type="button" onClick={props.openCostSettings}>
              全局预算
            </button>
          }
        />
        <div className="budget-progress"><span style={{ width: `${budgetUsedPct}%` }} /></div>
        <div className="case-budget-editor">
          {budgetNeedsAction ? (
            <div className="case-budget-helper">
              <div>
                <strong>{props.job.actualCostRM >= props.job.costLimitRM ? "当前 Case 已超过预算" : "下一步预计会超过预算"}</strong>
                <span>先调高当前 Case 预算并保存，再继续付费生成。</span>
              </div>
              <button className="secondary-button compact-button" type="button" onClick={() => budgetEditor.setDraftPatch({ costLimitRM: budgetTargetRM })}>
                建议调到 RM {budgetTargetRM.toFixed(2)}
              </button>
            </div>
          ) : null}
          <Field label="当前 Case 预算 RM">
            <input
              min={0.1}
              step={0.1}
              type="number"
              value={budgetDraft.costLimitRM}
              onChange={(event) => budgetEditor.setDraftPatch({ costLimitRM: Number(event.target.value) })}
            />
          </Field>
          <small>这只会调整当前 Case。全局默认预算请到左侧「成本」页面修改。</small>
          <EditableActionBar
            isDirty={budgetEditor.isDirty}
            onCancel={budgetEditor.resetDraft}
            onSave={saveCaseBudgetDraft}
            saveLabel="保存 Case 预算"
          />
        </div>
        <div className="case-next-cost-card">
          <div>
            <span>下一步预计</span>
            <strong>{formatCaseCostEstimateAmount(nextCostEstimate)}</strong>
          </div>
          <StatusPill tone={getCaseCostEstimateTone(nextCostEstimate)}>{formatCaseCostEstimateStatus(nextCostEstimate)}</StatusPill>
          <p>{nextCostEstimate.detail}</p>
          <small>剩余预算 RM {nextCostEstimate.remainingRM.toFixed(4)}</small>
        </div>
        <div className="asset-plan-summary-grid compact">
          <div><span>脚本</span><strong>{props.scriptStoryReady ? "已就绪" : "缺少"}</strong></div>
          <div><span>图片</span><strong>{props.imageReadyForCompose ? "已就绪" : "阻塞"}</strong></div>
          <div><span>配音</span><strong>{props.voiceoverReadyForCompose ? "已就绪" : "缺少"}</strong></div>
          <div><span>资产</span><strong>{readyAssets}/{props.assets.length}</strong></div>
        </div>
      </section>
    </section>
  );
}

function formatCaseCostEstimateAmount(estimate: CaseNextCostEstimate): string {
  if (estimate.estimatedCostRM === null) return "需设置单价";
  return `RM ${estimate.estimatedCostRM.toFixed(4)}`;
}

function formatCaseCostEstimateStatus(estimate: CaseNextCostEstimate): string {
  if (estimate.exceedsBudget) return "超出预算";
  if (estimate.pricingStatus === "missing_tool") return "缺少工具";
  if (estimate.pricingStatus === "disabled") return "工具停用";
  if (estimate.pricingStatus === "missing_price") return "未定价";
  if (estimate.pricingStatus === "free") return "免费";
  if (estimate.pricingStatus === "not_applicable") return "无付费步骤";
  return "可执行";
}

function getCaseCostEstimateTone(estimate: CaseNextCostEstimate): "neutral" | "active" | "success" | "danger" | "warning" {
  if (estimate.exceedsBudget) return "danger";
  if (estimate.pricingStatus === "missing_tool" || estimate.pricingStatus === "disabled" || estimate.pricingStatus === "missing_price") return "warning";
  if (estimate.pricingStatus === "priced" || estimate.pricingStatus === "free") return "success";
  return "neutral";
}

function AssetPlanSummaryPanel(props: { assets: ProductionAsset[]; job: AdminJob; openAssetPlan: (jobId: string) => void }) {
  const referenceAssets = props.assets
    .filter((asset) => assetMediaUrl(asset) && (asset.role === "reference_image" || asset.role === "first_frame" || asset.role === "last_frame" || asset.type === "character_design" || asset.type === "scene_design" || asset.type === "style_reference"))
    .sort((left, right) => left.type.localeCompare(right.type) || left.label.localeCompare(right.label));
  const characterCount = referenceAssets.filter((asset) => asset.type === "character_design").length;
  const sceneCount = referenceAssets.filter((asset) => asset.type === "scene_design" || asset.type === "style_reference" || asset.type === "first_frame" || asset.type === "last_frame").length;
  const readyCount = props.assets.filter((asset) => asset.status === "ready" || asset.status === "approved").length;
  const approvedCount = props.assets.filter((asset) => asset.status === "approved").length;

  return (
    <section className="case-reference-assets-panel panel">
      <SectionHeader
        eyebrow="参考资产"
        title="本 Case 使用的角色 / 场景 / 风格"
        action={
          <button className="secondary-button compact-button" type="button" onClick={() => props.openAssetPlan(props.job.id)}>
            打开资产库
          </button>
        }
      />
      <div className="asset-plan-summary-grid compact">
        <div>
          <span>角色参考</span>
          <strong>{characterCount}</strong>
        </div>
        <div>
          <span>场景 / 风格</span>
          <strong>{sceneCount}</strong>
        </div>
        <div>
          <span>就绪</span>
          <strong>{readyCount}</strong>
        </div>
        <div>
          <span>已批准</span>
          <strong>{approvedCount}</strong>
        </div>
      </div>
      {referenceAssets.length === 0 ? (
        <EmptyState title="还没有绑定参考资产" body="没有参考资产也可以生成，但角色和场景一致性会弱。建议先从设计资产库选择角色三视图、场景设定图或风格参考。" />
      ) : null}
      {referenceAssets.length > 0 ? (
        <div className="case-reference-strip">
          {referenceAssets.map((asset) => (
            <article className="case-reference-tile" key={asset._id}>
              {assetThumbUrl(asset) ? <MediaImage alt={asset.label} src={assetThumbUrl(asset)} fallbackLabel="参考图不可用" /> : <MediaFallback iconSize={18} label="无预览" />}
              <div>
                <strong>{asset.label}</strong>
                <span>{formatAssetType(asset.type)} / {asset.status}</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatAssetType(type: ProductionAsset["type"]): string {
  const labels: Record<ProductionAsset["type"], string> = {
    bgm_reference: "BGM 参考",
    character_design: "角色设计",
    first_frame: "首帧",
    last_frame: "尾帧",
    scene_design: "场景设计",
    style_reference: "风格参考"
  };

  return labels[type];
}

function SceneImageWorkbench(props: {
  assets: ProductionAsset[];
  generateImagesForJob: (job: AdminJob) => void;
  generateSceneImageForJob: (job: AdminJob, scene: SceneReviewItem) => void;
  generatingSceneImageIds: string[];
  isGeneratingImages: boolean;
  job: AdminJob;
  records: JobProcessRecord[];
  reportDirtyState?: CasesPageProps["reportDirtyState"];
  sceneReviews: SceneReviewItem[];
  updateSceneReview: (id: string, updater: (review: SceneReviewItem) => SceneReviewItem) => void;
}) {
  const scriptReady = props.records.some((record) => record.stageId === "script" && record.status === "done");
  const storyboardReady = props.records.some((record) => record.stageId === "storyboard" && record.status === "done");
  const promptReady = props.records.some((record) => record.stageId === "prompt" && record.status === "done");
  const imageRecord = props.records.find((record) => record.stageId === "image");
  const readyReferences = props.assets.filter((asset) => assetMediaUrl(asset) && (asset.status === "approved" || asset.status === "ready")).length;
  const canGenerateImages = scriptReady && storyboardReady && promptReady && !props.isGeneratingImages;

  return (
    <section className="scene-image-workbench panel">
      <SectionHeader
        eyebrow="场景图片审核"
        title="按已确认分镜生成图片"
        action={
          <button className="primary-button compact-button" disabled={!canGenerateImages} type="button" onClick={() => props.generateImagesForJob(props.job)}>
            {props.isGeneratingImages ? <Loader2 size={14} className="spin" /> : <ImageIcon size={14} />}
            {props.isGeneratingImages ? "生成中" : props.sceneReviews.length > 0 ? "重新生成全部图片" : "生成场景图片"}
          </button>
        }
      />
      <div className="scene-workbench-metrics">
        <div>
          <span>分镜</span>
          <strong>{storyboardReady ? `${props.job.sceneCount} 已确认` : "缺少"}</strong>
        </div>
        <div>
          <span>参考资产</span>
          <strong>{readyReferences}</strong>
        </div>
        <div>
          <span>图片阶段</span>
          <strong>{imageRecord?.status ?? "pending"}</strong>
        </div>
      </div>
      {!canGenerateImages && !props.isGeneratingImages ? (
        <div className="reference-asset-note">
          <AlertTriangle size={15} />
          <span>缺少已确认脚本、分镜或图片提示词，不能生成图片。请先确认 AI 大纲，图片阶段不会重新编故事。</span>
        </div>
      ) : null}
      {props.sceneReviews.length === 0 ? (
        <EmptyState
          title="还没有场景图片审核记录"
          body={storyboardReady ? `已确认 ${props.job.sceneCount} 个分镜。点击「生成场景图片」后，每个场景会显示图片、prompt、参考资产和审核状态。` : "先确认大纲；确认后的分镜会成为图片生成的唯一来源。"}
        />
      ) : (
        <SceneReviewPanel
          generatingSceneImageIds={props.generatingSceneImageIds}
          generateSceneImageForJob={props.generateSceneImageForJob}
          job={props.job}
          reportDirtyState={props.reportDirtyState}
          sceneReviews={props.sceneReviews}
          updateSceneReview={props.updateSceneReview}
        />
      )}
    </section>
  );
}

function CaseAssetsPanel(props: { job: AdminJob; qcReport: CaseQcReport | null; records: JobProcessRecord[]; sceneReviews: SceneReviewItem[]; storedVideos: StoredVideo[] }) {
  const imageRecord = props.records.find((record) => record.stageId === "image");
  const composeRecord = props.records.find((record) => record.stageId === "compose");
  const subtitleRecord = props.records.find((record) => record.stageId === "subtitle");
  const ttsRecord = props.records.find((record) => record.stageId === "tts");
  const bgmRecord = props.records.find((record) => record.stageId === "bgm");
  const storedVideo = props.storedVideos.find((video) => video.jobId === props.job.id);
  const videoPath = resolveMediaUrl(firstPath(composeRecord?.artifactPath) ?? storedVideo?.publicUrl ?? storedVideo?.storagePath ?? "");
  const jobAssetsBaseUrl = inferJobAssetsBaseUrl(videoPath);
  const imagePaths = splitArtifactPaths(imageRecord?.artifactPath).map(resolveMediaUrl).filter(isImagePath);
  const resolvedImagePaths = imagePaths.length > 0 ? imagePaths : jobAssetsBaseUrl ? inferSceneImageUrls(jobAssetsBaseUrl, props.job.sceneCount) : [];
  const subtitlePath = resolveMediaUrl(firstPath(subtitleRecord?.artifactPath) ?? (jobAssetsBaseUrl ? `${jobAssetsBaseUrl}/subtitles.srt` : undefined));
  const audioAndSfxPaths = splitArtifactPaths(ttsRecord?.artifactPath).map(resolveMediaUrl);
  const voiceoverPath = audioAndSfxPaths.find(isAudioPath) ?? audioAndSfxPaths.find((artifact) => artifact.includes("voiceover"));
  const bgmPath = splitArtifactPaths(bgmRecord?.artifactPath).map(resolveMediaUrl).find(isAudioPath);
  const sfxPath = audioAndSfxPaths.find((artifact) => artifact.includes("sfx")) ?? (jobAssetsBaseUrl ? `${jobAssetsBaseUrl}/sfx.json` : undefined);
  const audioAssetCount = [voiceoverPath && isAudioPath(voiceoverPath) ? voiceoverPath : "", bgmPath ?? "", sfxPath].filter(Boolean).length;

  return (
    <section className="case-artifact-summary-panel panel">
      <SectionHeader eyebrow="产物摘要" title="媒体文件" action={<StatusPill tone={videoPath ? "success" : "neutral"}>{videoPath ? "MP4 已就绪" : "等待中"}</StatusPill>} />
      {props.job.visualBible ? <VisualBibleCard visualBible={props.job.visualBible} /> : null}
      {videoPath ? (
        <div className="case-video-preview">
          {isVideoPath(videoPath) && isOpenableMediaUrl(videoPath) ? <video controls src={videoPath} /> : null}
          <a href={isOpenableMediaUrl(videoPath) ? videoPath : undefined} target="_blank" rel="noreferrer">
            {videoPath}
          </a>
        </div>
      ) : (
        <EmptyState title="还没有最终影片" body="生成影片后，这里会显示 MP4、图片、字幕、音效和音频产物。" />
      )}

      <div className="asset-library-grid">
        <AssetCount icon={<ImageIcon size={15} />} label="图片" value={String(resolvedImagePaths.length)} />
        <AssetCount icon={<Music2 size={15} />} label="配音 / 音效" value={String(audioAssetCount)} />
        <AssetCount icon={<Captions size={15} />} label="字幕" value={subtitlePath ? "1" : "0"} />
      </div>

      {props.qcReport ? (
        <div className="qc-summary-strip">
          <StatusPill tone={props.qcReport.passed ? "success" : "danger"}>{props.qcReport.status}</StatusPill>
          <strong>{props.qcReport.summary}</strong>
          <span>{props.qcReport.durationSeconds ? `${props.qcReport.durationSeconds.toFixed(1)}s` : "duration unknown"} / {props.qcReport.resolution ?? "resolution unknown"}</span>
        </div>
      ) : null}

      {resolvedImagePaths.length > 0 ? (
        <div className="image-asset-grid">
          {resolvedImagePaths.map((path, index) => (
            <a className="image-asset-tile" href={isOpenableMediaUrl(path) ? path : undefined} target="_blank" rel="noreferrer" key={`${path}-${index}`}>
              <MediaImage src={path} alt={`Scene ${index + 1}`} fallbackLabel="场景图不可用" />
              <span>场景 {index + 1} / {props.sceneReviews.find((review) => review.sceneId === index + 1)?.status ?? "未审核"}</span>
            </a>
          ))}
        </div>
      ) : null}

      <div className="asset-link-list">
        {voiceoverPath && isAudioPath(voiceoverPath) ? (
          <div className="audio-preview-row">
            <div>
              <Music2 size={14} />
              <span>配音音频</span>
            </div>
            <audio controls src={voiceoverPath} />
            <a href={isOpenableMediaUrl(voiceoverPath) ? voiceoverPath : undefined} target="_blank" rel="noreferrer">{voiceoverPath}</a>
          </div>
        ) : voiceoverPath ? (
          <ArtifactLink icon={<Music2 size={14} />} label="配音文本" path={voiceoverPath} />
        ) : null}
        {bgmPath ? (
          <div className="audio-preview-row">
            <div>
              <Music2 size={14} />
              <span>背景音乐</span>
            </div>
            <audio controls src={bgmPath} />
            <a href={isOpenableMediaUrl(bgmPath) ? bgmPath : undefined} target="_blank" rel="noreferrer">{bgmPath}</a>
          </div>
        ) : null}
        {sfxPath ? <ArtifactLink icon={<Music2 size={14} />} label="音效提示" path={sfxPath} /> : null}
        {subtitlePath ? <ArtifactLink icon={<Captions size={14} />} label="字幕" path={subtitlePath} /> : null}
      </div>
    </section>
  );
}

function AssetCount(props: { icon: ReactNode; label: string; value: string }) {
  return (
    <div>
      {props.icon}
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function ArtifactLink(props: { icon: ReactNode; label: string; path: string }) {
  const resolvedPath = resolveMediaUrl(props.path);
  const isLinkable = isOpenableMediaUrl(resolvedPath);

  return (
    <a className="asset-link-row" href={isLinkable ? resolvedPath : undefined} target="_blank" rel="noreferrer">
      {props.icon}
      <span>{props.label}</span>
      <code>{resolvedPath}</code>
    </a>
  );
}

function StageOutputPanel(props: {
  characters: CharacterProfile[];
  generateBgmForJob: (job: AdminJob) => void;
  generateImagesForJob: (job: AdminJob) => void;
  generateSceneImageForJob: (job: AdminJob, scene: SceneReviewItem) => void;
  generateTtsForJob: (job: AdminJob) => void;
  generateVideoClipForJob: (job: AdminJob) => void;
  runQcForJob: (job: AdminJob) => void;
  generatingSceneImageIds: string[];
  isGeneratingBgm: boolean;
  isGeneratingImages: boolean;
  isGeneratingTts: boolean;
  isGeneratingVideoClip: boolean;
  isRunningQc: boolean;
  job: AdminJob;
  qcReport: CaseQcReport | null;
  record: JobProcessRecord | null;
  reportDirtyState?: CasesPageProps["reportDirtyState"];
  sceneReviews: SceneReviewItem[];
  storedVideos: StoredVideo[];
  updateSceneReview: (id: string, updater: (review: SceneReviewItem) => SceneReviewItem) => void;
}) {
  const storedVideo = props.storedVideos.find((video) => video.jobId === props.job.id);
  const isImageStage = props.record?.stageId === "image";
  const isTtsStage = props.record?.stageId === "tts";
  const isBgmStage = props.record?.stageId === "bgm";
  const isVideoStage = props.record?.stageId === "video";
  const isQcStage = props.record?.stageId === "qc";

  return (
    <section className="stage-output-panel panel">
      <SectionHeader
        eyebrow="产物审核"
        title={props.record ? props.record.stageName : "未选择阶段"}
        action={
          props.record ? (
            isImageStage ? (
              <button className="secondary-button compact-button" disabled={props.isGeneratingImages} type="button" onClick={() => props.generateImagesForJob(props.job)}>
                {props.isGeneratingImages ? <Loader2 size={14} className="spin" /> : <ImageIcon size={14} />}
                {props.isGeneratingImages ? "生成中" : "重新生成图片"}
              </button>
            ) : isTtsStage ? (
              <button className="secondary-button compact-button" disabled={props.isGeneratingTts} type="button" onClick={() => props.generateTtsForJob(props.job)}>
                {props.isGeneratingTts ? <Loader2 size={14} className="spin" /> : <Music2 size={14} />}
                {props.isGeneratingTts ? "生成中" : "重新生成配音"}
              </button>
            ) : isBgmStage ? (
              <button className="secondary-button compact-button" disabled={props.isGeneratingBgm} type="button" onClick={() => props.generateBgmForJob(props.job)}>
                {props.isGeneratingBgm ? <Loader2 size={14} className="spin" /> : <Music2 size={14} />}
                {props.isGeneratingBgm ? "生成中" : "重新生成 BGM"}
              </button>
            ) : isVideoStage ? (
              <button className="secondary-button compact-button" disabled={props.isGeneratingVideoClip} type="button" onClick={() => props.generateVideoClipForJob(props.job)}>
                {props.isGeneratingVideoClip ? <Loader2 size={14} className="spin" /> : <FileVideo size={14} />}
                {props.isGeneratingVideoClip ? "Seedance 执行中" : "生成场景片段"}
              </button>
            ) : isQcStage ? (
              <button className="secondary-button compact-button" disabled={props.isRunningQc} type="button" onClick={() => props.runQcForJob(props.job)}>
                {props.isRunningQc ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                {props.isRunningQc ? "检查中" : "执行 QC"}
              </button>
            ) : (
              <StatusPill tone={getRecordTone(props.record.status)}>{formatProcessRecordStatus(props.record.status)}</StatusPill>
            )
          ) : null
        }
      />
      {props.record ? (
        <>
          <div className="artifact-summary-grid">
            <div>
              <span>工具</span>
              <strong>{props.record.provider}</strong>
            </div>
            <div>
              <span>队列</span>
              <strong>{props.record.queueName}</strong>
            </div>
            <div>
              <span>成本</span>
              <strong>RM {props.record.costRM.toFixed(2)}</strong>
            </div>
          </div>
          {props.record.status === "failed" && props.record.notes ? (
            <div className="stage-error-panel">
              <AlertTriangle size={16} />
              <div>
                <strong>失败原因</strong>
                <span>{props.record.notes}</span>
              </div>
            </div>
          ) : null}
          <div className="artifact-output-block">
            <span>输出</span>
            <pre>{getRecordOutputForDisplay(props.record) || "还没有记录输出。"}</pre>
          </div>
          <ArtifactPreview artifactPath={props.record.artifactPath || storedVideo?.publicUrl || storedVideo?.storagePath || ""} />
          {isImageStage ? (
            <SceneReviewPanel
              generatingSceneImageIds={props.generatingSceneImageIds}
              job={props.job}
              sceneReviews={props.sceneReviews}
              generateSceneImageForJob={props.generateSceneImageForJob}
              reportDirtyState={props.reportDirtyState}
              updateSceneReview={props.updateSceneReview}
            />
          ) : null}
          {isQcStage && props.qcReport ? <QcReportPanel report={props.qcReport} /> : null}
        </>
      ) : (
        <EmptyState title="尚未选择阶段" body="选择一个生产步骤后，可以查看产出内容和相关资产。" />
      )}
    </section>
  );
}

function SceneReviewPanel(props: {
  generateSceneImageForJob: (job: AdminJob, scene: SceneReviewItem) => void;
  generatingSceneImageIds: string[];
  job: AdminJob;
  reportDirtyState?: CasesPageProps["reportDirtyState"];
  sceneReviews: SceneReviewItem[];
  updateSceneReview: (id: string, updater: (review: SceneReviewItem) => SceneReviewItem) => void;
}) {
  if (props.sceneReviews.length === 0) {
    return <EmptyState title="还没有场景审核记录" body="请先生成图片。每个场景都会显示 prompt、图片、审核状态和重新生成操作。" />;
  }

  return (
    <div className="scene-review-section">
      <div className="section-heading-row">
        <div>
          <span>场景图片审核</span>
          <strong>逐张检查、锁定或重生成场景图</strong>
        </div>
        <small>{props.sceneReviews.length} 个场景</small>
      </div>
      <div className="scene-review-list">
        {props.sceneReviews.map((scene) => (
          <SceneReviewCard
            generateSceneImageForJob={props.generateSceneImageForJob}
            isGenerating={props.generatingSceneImageIds.includes(`${props.job.id}_${scene.sceneId}`)}
            job={props.job}
            key={scene.id}
            reportDirtyState={props.reportDirtyState}
            scene={scene}
            updateSceneReview={props.updateSceneReview}
          />
        ))}
      </div>
    </div>
  );
}

function SceneReviewCard(props: {
  generateSceneImageForJob: (job: AdminJob, scene: SceneReviewItem) => void;
  isGenerating: boolean;
  job: AdminJob;
  reportDirtyState?: CasesPageProps["reportDirtyState"];
  scene: SceneReviewItem;
  updateSceneReview: (id: string, updater: (review: SceneReviewItem) => SceneReviewItem) => void;
}) {
  const sceneEditor = useEditableDraft(props.scene, `${props.scene.id}:${props.scene.updatedAt}`);
  const draft = sceneEditor.draft ?? props.scene;
  const reportDirtyState = props.reportDirtyState;
  const sceneDirtyKey = props.scene.id;

  useEffect(() => {
    reportDirtyState?.(`cases-scene:${sceneDirtyKey}`, sceneEditor.isDirty);
    return () => reportDirtyState?.(`cases-scene:${sceneDirtyKey}`, false);
  }, [reportDirtyState, sceneDirtyKey, sceneEditor.isDirty]);

  function saveSceneDraft(extraPatch: Partial<SceneReviewItem> = {}) {
    const nextDraft = { ...draft, ...extraPatch };
    const patch = createDraftPatch(props.scene, nextDraft);

    props.updateSceneReview(props.scene.id, (current) => ({
      ...current,
      ...patch
    }));
    sceneEditor.markSaved(nextDraft);
  }

  return (
    <article className={`scene-review-card ${draft.status}`}>
      <div className="scene-review-media">
        {isImagePath(draft.artifactPath) ? <MediaImage src={resolveMediaUrl(draft.artifactPath)} alt={`场景 ${draft.sceneId}`} fallbackLabel="场景图不可用" /> : <div className="scene-placeholder">场景 {draft.sceneId}</div>}
      </div>
      <div className="scene-review-body">
        <div className="scene-review-title">
          <strong>场景 {draft.sceneId}</strong>
          <StatusPill tone={draft.status === "approved" ? "success" : draft.status === "rejected" ? "danger" : "warning"}>{formatSceneReviewStatus(draft.status)}</StatusPill>
        </div>
        <div className={`scene-qc-strip ${draft.qcStatus}`}>
          <strong>QC：{formatSceneQcStatus(draft.qcStatus)}</strong>
          <span>{draft.qcSummary || "还没有视觉 QC 结果。"}</span>
        </div>
        {draft.qcIssues.length > 0 ? (
          <div className="scene-qc-issues">
            {draft.qcIssues.map((issue) => <span key={issue}>{issue}</span>)}
          </div>
        ) : null}
        {draft.referenceImagePath ? <ArtifactLink icon={<UserRound size={14} />} label="角色参考图" path={draft.referenceImagePath} /> : null}
        <Field label="图片提示词">
          <textarea
            rows={4}
            value={draft.prompt}
            onChange={(event) => sceneEditor.setDraftPatch({ prompt: event.target.value, status: draft.status === "approved" ? "generated" : draft.status })}
          />
        </Field>
        <Field label="审核备注">
          <input value={draft.notes} onChange={(event) => sceneEditor.setDraftPatch({ notes: event.target.value })} />
        </Field>
        <div className="scene-review-actions">
          <button
            className="secondary-button compact-button"
            disabled={props.isGenerating}
            type="button"
            onClick={() => {
              if (!confirmDiscardDirtyDraft(sceneEditor.isDirty, "当前 scene 有未保存修改。放弃这些修改并重新生成吗？")) {
                return;
              }

              props.generateSceneImageForJob(props.job, props.scene);
            }}
          >
            {props.isGenerating ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            {props.isGenerating ? "重新生成中" : "重新生成此场景"}
          </button>
          <button className="secondary-button compact-button" type="button" onClick={() => saveSceneDraft({ status: "approved" })}>
            <LockKeyhole size={14} />
            锁定通过
          </button>
          <button className="danger-button compact-button" type="button" onClick={() => saveSceneDraft({ status: "rejected" })}>
            <X size={14} />
            拒绝
          </button>
        </div>
        <EditableActionBar
          isDirty={sceneEditor.isDirty}
          onCancel={sceneEditor.resetDraft}
          onSave={() => saveSceneDraft()}
        />
      </div>
    </article>
  );
}

function QcReportPanel(props: { report: CaseQcReport }) {
  return (
    <div className="qc-report-panel">
      <div className="qc-report-header">
        <StatusPill tone={props.report.passed ? "success" : "danger"}>{props.report.status}</StatusPill>
        <strong>{props.report.summary}</strong>
        <span>{formatDateTime(props.report.timestamp)}</span>
      </div>
      <div className="qc-check-list">
        {props.report.checks.map((check) => (
          <div className={`qc-check-row ${check.status}`} key={`${check.label}-${check.detail}`}>
            <span>{check.status}</span>
            <strong>{check.label}</strong>
            <p>{check.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceIssueBanner(props: { action: string; apiState: CasesPageProps["apiState"] }) {
  return (
    <div className="service-issue-banner">
      <AlertTriangle size={17} />
      <div>
        <strong>{props.action} is paused</strong>
        <span>{props.apiState === "checking" ? "正在检查 API server 状态。请稍等，或点击顶部 API 状态徽章刷新。" : "API server 离线。请启动或重启 API server 后，再重试这个 Case。"}</span>
      </div>
    </div>
  );
}

function PublishTargetMatrix(props: {
  caseTargets: CasePublishTarget[];
  job: AdminJob;
  publishingTargets: PublishingTarget[];
  uploadPrivateTarget: (job: AdminJob, targetId: string) => void;
}) {
  return (
    <section className="publish-target-panel panel">
      <SectionHeader eyebrow="私密上传矩阵" title="YouTube 发布目标" />
      {props.caseTargets.length === 0 ? <EmptyState title="还没有 YouTube 目标" body="这个 Case 会停在 MP4/QC。准备好 private upload 后，再新增 YouTube 发布目标。" /> : null}
      <div className="publish-target-list">
        {props.caseTargets.map((caseTarget) => {
          const target = props.publishingTargets.find((candidate) => candidate.id === caseTarget.targetId);
          const canUpload = props.job.reviewStatus === "approved" && caseTarget.status === "approved";

          return (
            <article className="publish-target-row" key={caseTarget.id}>
              <div>
                <strong>{target?.channelName ?? "Unknown target"}</strong>
                <span>{target?.youtubeChannelId ?? caseTarget.targetId}</span>
              </div>
              <StatusPill tone={caseTarget.status === "uploaded_private" ? "success" : caseTarget.status === "failed" ? "danger" : caseTarget.status === "approved" ? "active" : "warning"}>
                {caseTarget.status}
              </StatusPill>
              <span>{caseTarget.privacyStatus}</span>
              <button className="secondary-button compact-button" disabled={!canUpload} type="button" onClick={() => props.uploadPrivateTarget(props.job, caseTarget.targetId)}>
                私密上传
              </button>
              {caseTarget.youtubeVideoId ? <small>{caseTarget.youtubeVideoId}</small> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StageEditorPanel(props: {
  agents: StaffAgent[];
  characters: CharacterProfile[];
  job: AdminJob | null;
  record: JobProcessRecord | null;
  reportDirtyState?: CasesPageProps["reportDirtyState"];
  updateCaseDetails: CasesPageProps["updateCaseDetails"];
  updateProcessRecord: CasesPageProps["updateProcessRecord"];
}) {
  const caseSource = props.job
    ? {
        characterId: props.job.characterId,
        costLimitRM: props.job.costLimitRM,
        prompt: props.job.prompt,
        sceneCount: props.job.sceneCount,
        topic: props.job.topic
      }
    : null;
  const recordSource = props.record
    ? {
        artifactPath: props.record.artifactPath,
        costRM: props.record.costRM,
        input: props.record.input,
        notes: props.record.notes,
        output: getRecordOutputForDisplay(props.record),
        ownerAgentId: props.record.ownerAgentId,
        provider: props.record.provider,
        queueName: props.record.queueName,
        status: props.record.status
      }
    : null;
  const caseEditor = useEditableDraft(caseSource, props.job ? `${props.job.id}:${props.job.updatedAt}` : null);
  const recordEditor = useEditableDraft(recordSource, props.record ? `${props.record.id}:${props.record.updatedAt}` : null);
  const caseDraft = caseEditor.draft;
  const recordDraft = recordEditor.draft;
  const selectedAgent = recordDraft ? props.agents.find((agent) => agent.id === recordDraft.ownerAgentId) : null;
  const reportDirtyState = props.reportDirtyState;
  const caseDirtyKey = props.job?.id ?? "none";
  const recordDirtyKey = props.record?.id ?? "none";

  useEffect(() => {
    reportDirtyState?.(`cases-case:${caseDirtyKey}`, caseEditor.isDirty);
    return () => reportDirtyState?.(`cases-case:${caseDirtyKey}`, false);
  }, [caseDirtyKey, caseEditor.isDirty, reportDirtyState]);

  useEffect(() => {
    reportDirtyState?.(`cases-record:${recordDirtyKey}`, recordEditor.isDirty);
    return () => reportDirtyState?.(`cases-record:${recordDirtyKey}`, false);
  }, [recordDirtyKey, recordEditor.isDirty, reportDirtyState]);

  function saveCaseDraft() {
    if (!props.job || !caseEditor.baseline || !caseDraft) {
      return;
    }

    props.updateCaseDetails(props.job.id, createDraftPatch(caseEditor.baseline, caseDraft));
    caseEditor.markSaved(caseDraft);
  }

  function saveRecordDraft() {
    if (!props.record || !recordEditor.baseline || !recordDraft) {
      return;
    }

    const patch = createDraftPatch(recordEditor.baseline, recordDraft);
    props.updateProcessRecord(props.record.id, (current) => ({
      ...current,
      ...patch,
      owner: patch.ownerAgentId ? getAgentLabel(String(patch.ownerAgentId), props.agents) : current.owner
    }));
    recordEditor.markSaved(recordDraft);
  }

  if (!props.job) {
    return (
      <section className="stage-editor-panel panel">
        <EmptyState title="还没有 Case 档案" body="这里会显示 Case 元数据和选中阶段的详细资料。" />
      </section>
    );
  }

  return (
    <section className="stage-editor-panel panel">
      <SectionHeader eyebrow="Case 档案" title="阶段编辑器" />
      <div className="inspector-summary">
        <div>
          <span>Case ID</span>
          <strong>{props.job.id}</strong>
        </div>
        <div>
          <span>创建时间</span>
          <strong>{formatDateTime(props.job.createdAt)}</strong>
        </div>
        <div>
          <span>隐私状态</span>
          <strong>{props.job.privacy}</strong>
        </div>
        <div>
          <span>成本</span>
          <strong>RM {props.job.actualCostRM.toFixed(2)}</strong>
        </div>
      </div>

      <div className="stage-editor-grid">
        <Field label="Case 主题">
          <input value={caseDraft?.topic ?? ""} onChange={(event) => caseEditor.setDraftPatch({ topic: event.target.value })} />
        </Field>
        <Field label="角色锁定">
          <select value={caseDraft?.characterId ?? ""} onChange={(event) => caseEditor.setDraftPatch({ characterId: event.target.value || null })}>
            <option value="">No fixed character</option>
            {props.characters.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name} / {character.status}
              </option>
            ))}
          </select>
        </Field>
        <Field label="场景数量">
          <input min={1} max={30} type="number" value={caseDraft?.sceneCount ?? 1} onChange={(event) => caseEditor.setDraftPatch({ sceneCount: Number(event.target.value) })} />
        </Field>
        <Field label="预算上限 RM">
          <input min={0.1} step={0.1} type="number" value={caseDraft?.costLimitRM ?? 0} onChange={(event) => caseEditor.setDraftPatch({ costLimitRM: Number(event.target.value) })} />
        </Field>
        <Field label="主 prompt / 生产 brief">
          <textarea rows={4} value={caseDraft?.prompt ?? ""} onChange={(event) => caseEditor.setDraftPatch({ prompt: event.target.value })} />
        </Field>
      </div>
      <EditableActionBar
        isDirty={caseEditor.isDirty}
        onCancel={caseEditor.resetDraft}
        onSave={saveCaseDraft}
      />

      {props.record && recordDraft ? (
        <div className="stage-editor">
          <SectionHeader
            eyebrow="Selected stage"
            title={props.record.stageName}
            action={<StatusPill tone={getRecordTone(props.record.status)}>{formatProcessRecordStatus(props.record.status)}</StatusPill>}
          />
          <div className="stage-editor-grid">
            <Field label="状态">
              <select
                value={recordDraft.status}
                onChange={(event) => recordEditor.setDraftPatch({ status: event.target.value as ProcessRecordStatus })}
              >
                {processStatusOptions.map((status) => (
                  <option value={status} key={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="成本 RM">
              <input
                min={0}
                step={0.01}
                type="number"
                value={recordDraft.costRM}
                onChange={(event) => recordEditor.setDraftPatch({ costRM: Number(event.target.value) })}
              />
            </Field>
            <Field label="Controller agent">
              <select
                value={recordDraft.ownerAgentId}
                onChange={(event) => recordEditor.setDraftPatch({ ownerAgentId: event.target.value })}
              >
                {props.agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} / {getAgentTypeLabel(agent.type)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="供应商 / 工具">
              <input
                value={recordDraft.provider}
                onChange={(event) => recordEditor.setDraftPatch({ provider: event.target.value })}
              />
            </Field>
            <Field label="队列">
              <input
                value={recordDraft.queueName}
                onChange={(event) => recordEditor.setDraftPatch({ queueName: event.target.value })}
              />
            </Field>
            <Field label="Artifact path / record link">
              <input
                value={recordDraft.artifactPath}
                onChange={(event) => recordEditor.setDraftPatch({ artifactPath: event.target.value })}
              />
            </Field>
          </div>
          {selectedAgent ? (
            <div className="agent-mini-card">
              <strong>{selectedAgent.role}</strong>
              <span>{selectedAgent.responsibilities}</span>
            </div>
          ) : null}
          <Field label="Input / instructions">
            <textarea
              rows={5}
              value={recordDraft.input}
              onChange={(event) => recordEditor.setDraftPatch({ input: event.target.value })}
            />
          </Field>
          <Field label="输出 / 结果">
            <textarea
              rows={8}
              value={recordDraft.output}
              onChange={(event) => recordEditor.setDraftPatch({ output: event.target.value })}
            />
          </Field>
          <ArtifactPreview artifactPath={props.record.artifactPath} />
          <Field label="内部备注">
            <textarea
              rows={4}
              value={recordDraft.notes}
              onChange={(event) => recordEditor.setDraftPatch({ notes: event.target.value })}
            />
          </Field>
          <EditableActionBar
            isDirty={recordEditor.isDirty}
            onCancel={recordEditor.resetDraft}
            onSave={saveRecordDraft}
          />
        </div>
      ) : null}
    </section>
  );
}

function ArtifactPreview(props: { artifactPath: string }) {
  const artifacts = splitArtifactPaths(props.artifactPath).map(resolveMediaUrl).filter(Boolean);
  const firstArtifact = artifacts[0];

  if (!firstArtifact) {
    return null;
  }

  const videoArtifacts = artifacts.filter(isVideoPath);
  const imageArtifacts = artifacts.filter(isImagePath);
  const audioArtifacts = artifacts.filter(isAudioPath);

  return (
    <div className="artifact-preview">
      {videoArtifacts.map((artifact) => (isOpenableMediaUrl(artifact) ? <video controls src={artifact} key={artifact} /> : null))}
      {audioArtifacts.map((artifact) => (isOpenableMediaUrl(artifact) ? <audio controls src={artifact} key={artifact} /> : null))}
      {imageArtifacts.length > 0 ? (
        <div className="artifact-image-strip">
          {imageArtifacts.map((artifact, index) => (
            <a href={isOpenableMediaUrl(artifact) ? artifact : undefined} target="_blank" rel="noreferrer" key={`${artifact}-${index}`}>
              <MediaImage src={artifact} alt={`Artifact ${index + 1}`} fallbackLabel="产物不可用" />
            </a>
          ))}
        </div>
      ) : null}
      {artifacts.map((artifact) =>
        isOpenableMediaUrl(artifact) ? (
          <a href={artifact} target="_blank" rel="noreferrer" key={artifact}>
            打开产物
          </a>
        ) : (
          <code key={artifact}>{artifact}</code>
        )
      )}
    </div>
  );
}

function splitArtifactPaths(value: string | undefined): string[] {
  return (value ?? "")
    .split("\n")
    .map((artifact) => artifact.trim())
    .filter(Boolean);
}

function firstPath(value: string | undefined): string | undefined {
  return splitArtifactPaths(value)[0];
}

function isImagePath(value: string): boolean {
  return isImageMediaUrl(value);
}

function isRasterImagePath(value: string): boolean {
  return isRasterImageMediaUrl(value);
}

function isVideoPath(value: string): boolean {
  return isVideoMediaUrl(value);
}

function isAudioPath(value: string): boolean {
  return isAudioMediaUrl(value);
}

function assetMediaUrl(asset: ProductionAsset): string {
  return resolveProductionAssetMediaUrl(asset);
}

function assetThumbUrl(asset: ProductionAsset): string {
  return resolveProductionAssetPreviewUrl(asset);
}

function isOpenableMediaUrl(value: string | null | undefined): boolean {
  return /^(https?:|blob:|data:)/iu.test(resolveMediaUrl(value));
}

function inferJobAssetsBaseUrl(videoPath: string): string | null {
  const match = videoPath.match(/^(.*\/jobs\/[^/]+)\/final\/video\.mp4$/u);
  return match?.[1] ?? null;
}

function inferSceneImageUrls(baseUrl: string, sceneCount: number): string[] {
  return Array.from({ length: sceneCount }, (_, index) => `${baseUrl}/images/scene_${String(index + 1).padStart(2, "0")}.png`);
}

function getRecordOutputForDisplay(record: JobProcessRecord): string {
  if (record.stageId !== "image" || !record.output.includes("local SVG scene placeholders")) {
    return record.output;
  }

  const artifacts = splitArtifactPaths(record.artifactPath);
  const rasterCount = artifacts.filter(isRasterImagePath).length;

  if (rasterCount > 0) {
    return `${rasterCount} 张场景图片已生成，等待审核。这些 PNG/JPG 会用于影片合成。`;
  }

  return "缺少必要的场景图片。请点击生成图片，产出可审核的 PNG 场景资产。";
}

function CaseCostLedgerPanel(props: {
  error: string | null;
  isLoading: boolean;
  job: AdminJob;
  logs: CostLog[];
  summary: CostSummaryResponse | null;
}) {
  return (
    <section className="production-tab-grid two">
      <section className="panel">
        <SectionHeader eyebrow="成本账本" title="Case 成本账本" action={<StatusPill tone={props.summary?.pricingMissingCount ? "warning" : "success"}>{props.summary?.pricingMissingCount ? "需要补单价" : "已记录"}</StatusPill>} />
        <div className="budget-stack">
          <BudgetLine label="MongoDB 账本合计" value={`RM ${(props.summary?.totalCostRM ?? 0).toFixed(4)}`} />
          <BudgetLine label="Case 本地累计" value={`RM ${props.job.actualCostRM.toFixed(2)}`} />
          <BudgetLine label="预算上限" value={`RM ${props.job.costLimitRM.toFixed(2)}`} />
          <BudgetLine label="记录笔数" value={String(props.summary?.totalLogs ?? 0)} />
          <BudgetLine label="缺少单价" value={String(props.summary?.pricingMissingCount ?? 0)} />
        </div>
        {props.error ? <div className="inline-error">{props.error}</div> : null}
        {props.isLoading ? (
          <div className="pipeline-gate-note">
            <Loader2 size={16} className="spin" />
            <span>正在读取 MongoDB cost_logs...</span>
          </div>
        ) : null}
      </section>

      <section className="panel table-panel">
        <SectionHeader eyebrow="供应商调用" title="本 Case API / 合成记录" />
        <div className="settings-table">
          {props.logs.length === 0 ? (
            <EmptyState title="暂无成本记录" body="生成脚本、图片、配音、BGM、Seedance clips 或最终 MP4 后，这里会显示 MongoDB cost_logs 明细。" />
          ) : props.logs.map((log) => (
            <article className="settings-row" key={log._id}>
              <div>
                <strong>{costServiceLabel(log.service)} / {log.provider}</strong>
                <span>{log.operation} · {log.model}</span>
              </div>
              <span>RM {log.costRM.toFixed(4)}</span>
              <span>{log.quantity} {log.unit}</span>
              <StatusPill tone={log.pricingStatus === "pricing_missing" ? "warning" : log.pricingStatus === "local_zero" ? "neutral" : "success"}>{costPricingStatusLabel(log.pricingStatus)}</StatusPill>
            </article>
          ))}
        </div>
      </section>
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

function ActivityLogPanel(props: { activities: CaseActivity[] }) {
  return (
    <section className="activity-log-panel panel">
      <SectionHeader eyebrow="审计记录" title="Case 活动" />
      {props.activities.length === 0 ? <EmptyState title="No activity yet" body="Generation, approval, status changes, and storage actions will be recorded here." /> : null}
      <div className="activity-log-list">
        {props.activities.map((activity) => (
          <article className="activity-log-row" key={activity.id}>
            <span className="timeline-dot done" />
            <div>
              <strong>{activity.title}</strong>
              <p>{activity.detail}</p>
              <span>{activity.actor} / {formatDateTime(activity.createdAt)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function advanceCase(job: AdminJob): AdminJob {
  return advanceJob(job);
}

function failCase(job: AdminJob): AdminJob {
  return markFailed(job);
}

function retryCase(job: AdminJob): AdminJob {
  return retryJob(job);
}
