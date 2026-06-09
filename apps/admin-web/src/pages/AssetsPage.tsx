import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, Folder, Image as ImageIcon, Loader2, Plus, RefreshCw, Save, Search, Sparkles, Trash2, UploadCloud } from "lucide-react";
import {
  productionAssetProviders,
  productionAssetRoles,
  productionAssetStatuses,
  productionAssetTypes,
  type ProductionAsset,
  type ProductionAssetProvider,
  type ProductionAssetRole,
  type ProductionAssetStatus,
  type ProductionAssetType
} from "@ai-content-factory/shared-types";
import { EditableActionBar, EmptyState, Field, MediaImage, SectionHeader, StatusPill } from "../components/ui.js";
import { getProductionAssetDesignSpec } from "../lib/asset-design-specs.js";
import { evaluateProductionAssetReadiness, type ProductionAssetReadiness } from "../lib/asset-readiness.js";
import { buildDesignPromptForType, designHintForType, designPromptPlaceholderForType, examplePromptForType } from "../lib/design-prompts.js";
import { confirmDiscardDirtyDraft, createDraftPatch, useEditableDraft } from "../lib/editable-draft.js";
import type { AdminJob } from "../lib/jobs.js";
import { isImageMediaUrl, resolveFirstMediaUrl } from "../lib/media-url.js";

type AssetStudioTab = "generate" | "library" | "case-plan";

interface DesignAssetInput {
  folderName: string;
  jobId?: string | undefined;
  label: string;
  prompt: string;
  tags: string[];
  type: ProductionAssetType;
}

interface AssetsPageProps {
  assetError: string | null;
  assets: ProductionAsset[];
  bootstrapAssetsForJob: (job: AdminJob) => void;
  cloneAsset: (asset: ProductionAsset) => Promise<ProductionAsset | null | void> | ProductionAsset | null | void;
  createDesignAsset: (input: DesignAssetInput) => Promise<ProductionAsset | null | void> | ProductionAsset | null | void;
  createManualAsset: (job: AdminJob | null) => void;
  deleteAsset: (id: string) => void;
  filterStatus: ProductionAssetStatus | "";
  filterJobId: string;
  generateAsset: (asset: ProductionAsset) => void;
  generatingAssetIds: string[];
  importLegacyAssets: () => void;
  isLoadingAssets: boolean;
  jobs: AdminJob[];
  openCase: (jobId: string) => void;
  refreshAssets: () => void;
  reportDirtyState?: (key: string, isDirty: boolean) => void;
  selectedAssetId: string | null;
  selectAsset: (id: string | null) => void;
  setFilterJobId: (value: string) => void;
  setFilterStatus: (value: ProductionAssetStatus | "") => void;
  updateAsset: (id: string, patch: Partial<Pick<ProductionAsset, "costRM" | "error" | "folderName" | "label" | "notes" | "prompt" | "provider" | "role" | "sceneId" | "scope" | "status" | "storagePath" | "tags" | "type" | "url">>) => Promise<void> | void;
}

export function AssetsPage(props: AssetsPageProps) {
  const [activeTab, setActiveTab] = useState<AssetStudioTab>("generate");
  const [searchText, setSearchText] = useState("");
  const [activeFolder, setActiveFolder] = useState("全部");
  const [draftType, setDraftType] = useState<ProductionAssetType>("character_design");
  const [draftFolderName, setDraftFolderName] = useState("角色设计");
  const [draftJobId, setDraftJobId] = useState("");
  const [draftLabel, setDraftLabel] = useState(defaultDraftLabelForType("character_design"));
  const [draftTags, setDraftTags] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [isSubmittingDraft, setIsSubmittingDraft] = useState(false);
  const [activeDraftAssetId, setActiveDraftAssetId] = useState<string | null>(null);
  const selectedFilterJob = props.jobs.find((job) => job.id === props.filterJobId) ?? null;
  const libraryAssets = useMemo(() => props.assets.filter(isGeneratedDesignAsset), [props.assets]);
  const folders = useMemo(() => buildFolderStats(libraryAssets), [libraryAssets]);
  const libraryVisibleAssets = filterAssets(libraryAssets, {
    activeFolder,
    filterJobId: "",
    filterStatus: props.filterStatus,
    searchText,
    useFolder: true
  });
  const casePlanVisibleAssets = filterAssets(props.assets, {
    activeFolder,
    filterJobId: props.filterJobId,
    filterStatus: props.filterStatus,
    searchText,
    useFolder: false
  });
  const casePlanDisplayAssets = props.filterJobId ? casePlanVisibleAssets : [];
  const selectedAssetPool = activeTab === "case-plan" ? casePlanDisplayAssets : libraryVisibleAssets;
  const explicitlySelectedAsset = props.selectedAssetId ? props.assets.find((asset) => asset._id === props.selectedAssetId) ?? null : null;
  const activeDraftAsset = activeDraftAssetId ? props.assets.find((asset) => asset._id === activeDraftAssetId) ?? null : null;
  const selectedAsset = activeTab === "generate" ? activeDraftAsset : explicitlySelectedAsset && selectedAssetPool.some((asset) => asset._id === explicitlySelectedAsset._id) ? explicitlySelectedAsset : selectedAssetPool[0] ?? null;
  const editableAsset = useEditableDraft(selectedAsset, selectedAsset ? `${selectedAsset._id}:${selectedAsset.updatedAt}` : null);
  const assetDraft = editableAsset.draft;
  const [assetSaveMessage, setAssetSaveMessage] = useState<string | null>(null);
  const selectedJob = selectedAsset ? props.jobs.find((job) => job.id === selectedAsset.jobId) ?? null : null;
  const reportDirtyState = props.reportDirtyState;
  const selectedAssetDirtyKey = selectedAsset?._id ?? "none";
  const readyReferences = libraryVisibleAssets.filter((asset) => (asset.status === "approved" || asset.status === "ready") && asset.role === "reference_image" && isGeneratedDesignAsset(asset)).length;
  const readyFrames = libraryVisibleAssets.filter((asset) => (asset.status === "approved" || asset.status === "ready") && (asset.role === "first_frame" || asset.role === "last_frame") && isGeneratedDesignAsset(asset)).length;
  const blockedAssets = libraryVisibleAssets.filter((asset) => asset.status === "failed" || asset.status === "rejected").length;
  const generatingDraft = selectedAsset ? props.generatingAssetIds.includes(selectedAsset._id) : false;

  useEffect(() => {
    setAssetSaveMessage(null);
  }, [selectedAsset?._id]);

  useEffect(() => {
    if (!editableAsset.isDirty) {
      return;
    }

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editableAsset.isDirty]);

  useEffect(() => {
    reportDirtyState?.(`assets:${selectedAssetDirtyKey}`, editableAsset.isDirty);
    return () => reportDirtyState?.(`assets:${selectedAssetDirtyKey}`, false);
  }, [editableAsset.isDirty, reportDirtyState, selectedAssetDirtyKey]);

  function openStudioTab(tab: AssetStudioTab) {
    if (!confirmDiscardDirtyDraft(editableAsset.isDirty)) {
      return;
    }

    if (tab === "generate") {
      props.selectAsset(null);
      setActiveDraftAssetId(null);
    }

    setActiveTab(tab);
  }

  function selectAssetSafely(id: string | null) {
    if (!confirmDiscardDirtyDraft(editableAsset.isDirty)) {
      return;
    }

    props.selectAsset(id);
  }

  async function saveSelectedAsset(extraPatch: Partial<ProductionAsset> = {}) {
    if (!selectedAsset || !assetDraft) {
      return;
    }

    const nextDraft = { ...assetDraft, ...extraPatch };
    const patch = createDraftPatch(selectedAsset, nextDraft);

    if (Object.keys(patch).length > 0) {
      await props.updateAsset(selectedAsset._id, patch);
    }

    editableAsset.markSaved(nextDraft);
    setAssetSaveMessage("刚刚保存");
  }

  function filterAssets(assets: ProductionAsset[], options: {
    activeFolder: string;
    filterJobId: string;
    filterStatus: ProductionAssetStatus | "";
    searchText: string;
    useFolder: boolean;
  }): ProductionAsset[] {
    return assets.filter((asset) => {
      const normalizedSearch = options.searchText.trim().toLowerCase();
      const matchesFolder = !options.useFolder || options.activeFolder === "全部" || asset.folderName === options.activeFolder;
      const matchesSearch = !normalizedSearch || [asset.label, asset.prompt, asset.notes, asset.folderName, asset.type, asset.tags.join(" ")].join(" ").toLowerCase().includes(normalizedSearch);
      const matchesJob = !options.filterJobId || asset.jobId === options.filterJobId;
      const matchesStatus = !options.filterStatus || asset.status === options.filterStatus;

      return matchesFolder && matchesSearch && matchesJob && matchesStatus;
    });
  }

  async function submitDraft() {
    const label = draftLabel.trim() || assetTypeLabel(draftType);
    const prompt = draftPrompt.trim();

    if (!prompt) {
      return;
    }

    props.selectAsset(null);
    setActiveDraftAssetId(null);
    setActiveTab("generate");
    setIsSubmittingDraft(true);

    try {
      const createdAsset = await props.createDesignAsset({
        folderName: draftFolderName.trim() || defaultFolderForType(draftType),
        jobId: draftJobId || undefined,
        label,
        prompt: buildDesignPromptForType(draftType, prompt),
        tags: splitTags(draftTags),
        type: draftType
      });

      if (createdAsset && typeof createdAsset === "object" && "_id" in createdAsset) {
        setActiveDraftAssetId(createdAsset._id);
      }
    } finally {
      setIsSubmittingDraft(false);
    }
  }

  async function cloneAssetAsDraft(asset: ProductionAsset) {
    if (!confirmDiscardDirtyDraft(editableAsset.isDirty)) {
      return;
    }

    const clonedAsset = await props.cloneAsset(asset);

    if (clonedAsset && typeof clonedAsset === "object" && "_id" in clonedAsset) {
      props.selectAsset(null);
      setActiveDraftAssetId(clonedAsset._id);
      setActiveTab("generate");
      setAssetSaveMessage(null);
    }
  }

  function updateDraftType(type: ProductionAssetType) {
    setDraftType(type);
    setDraftFolderName(defaultFolderForType(type));
    setDraftLabel(defaultDraftLabelForType(type));
    setActiveDraftAssetId(null);
    props.selectAsset(null);
  }

  function resetDraftForm(type = draftType) {
    setDraftType(type);
    setDraftFolderName(defaultFolderForType(type));
    setDraftJobId("");
    setDraftLabel(defaultDraftLabelForType(type));
    setDraftTags("");
    setDraftPrompt("");
    setActiveDraftAssetId(null);
    props.selectAsset(null);
  }

  return (
    <section className="assets-page">
      <section className="asset-board-toolbar panel">
        <div>
          <p className="eyebrow">设计管理</p>
          <h2>设计资产中心</h2>
          <span>用 prompt 生成角色三视图、场景设定表、风格参考和首帧；满意后保存入库，并通过文件夹快速查找。</span>
        </div>
        <div className="asset-board-actions">
          <button className="secondary-button" type="button" onClick={props.refreshAssets}>
            {props.isLoadingAssets ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            刷新
          </button>
          <button className="secondary-button" type="button" disabled={!selectedFilterJob} onClick={() => selectedFilterJob && props.bootstrapAssetsForJob(selectedFilterJob)}>
            <Database size={16} />
            建立 Case 规划
          </button>
          <button className="secondary-button" type="button" onClick={props.importLegacyAssets}>
            <UploadCloud size={16} />
            导入旧草稿
          </button>
          <button className="primary-button" type="button" onClick={() => props.createManualAsset(selectedFilterJob)}>
            <Plus size={16} />
            手动新增
          </button>
        </div>
      </section>

      {props.assetError ? <div className="inline-error"><AlertTriangle size={16} />{props.assetError}</div> : null}

      <div className="asset-studio-tabs">
        <StudioTab active={activeTab === "generate"} label="生成设计" onClick={() => openStudioTab("generate")} />
        <StudioTab active={activeTab === "library"} label="资产库" onClick={() => openStudioTab("library")} />
        <StudioTab active={activeTab === "case-plan"} label="Case 规划" onClick={() => openStudioTab("case-plan")} />
      </div>

      {activeTab === "generate" ? (
        <section className="design-generator-grid">
          <section className="design-generator-panel panel">
            <SectionHeader eyebrow="OpenAI 设计草稿" title="输入需求，生成可保存的设计图" />
            <div className="asset-two-col">
              <Field label="设计类型">
                <select value={draftType} onChange={(event) => updateDraftType(event.target.value as ProductionAssetType)}>
                  {productionAssetTypes.filter((type) => type !== "bgm_reference").map((type) => <option key={type} value={type}>{assetTypeLabel(type)}</option>)}
                </select>
              </Field>
              <Field label="文件夹">
                <input list="asset-folder-list" value={draftFolderName} onChange={(event) => setDraftFolderName(event.target.value)} />
                <datalist id="asset-folder-list">
                  {folders.map((folder) => <option key={folder.name} value={folder.name} />)}
                </datalist>
              </Field>
            </div>
            <div className="asset-two-col">
              <Field label="资产名称">
                <input value={draftLabel} onChange={(event) => setDraftLabel(event.target.value)} />
              </Field>
              <Field label="绑定 Case（可选）">
                <select value={draftJobId} onChange={(event) => setDraftJobId(event.target.value)}>
                  <option value="">通用设计资产</option>
                  {props.jobs.map((job) => <option key={job.id} value={job.id}>{job.topic || job.id}</option>)}
                </select>
              </Field>
            </div>
            <Field label="设计 Prompt">
              <textarea
                rows={9}
                value={draftPrompt}
                placeholder={designPromptPlaceholderForType(draftType)}
                onChange={(event) => setDraftPrompt(event.target.value)}
              />
            </Field>
            <div className="asset-generation-hint">
              {designHintForType(draftType)}
            </div>
            <AssetDesignSpecPanel type={draftType} />
            <Field label="标签（逗号分隔）">
              <input value={draftTags} placeholder="便利店, 夜班, 主角" onChange={(event) => setDraftTags(event.target.value)} />
            </Field>
            <div className="asset-board-actions left">
              <button className="primary-button" type="button" disabled={!draftPrompt.trim()} onClick={() => void submitDraft()}>
                <Sparkles size={16} />
                生成设计草稿
              </button>
              <button className="secondary-button" type="button" onClick={() => resetDraftForm()}>
                新建空白设计
              </button>
              <button className="secondary-button" type="button" onClick={() => setDraftPrompt(examplePromptForType(draftType))}>
                套用示例 Prompt
              </button>
            </div>
          </section>
          <AssetInspector
            asset={assetDraft}
            isDirty={editableAsset.isDirty}
            deleteAsset={props.deleteAsset}
            generateAsset={props.generateAsset}
            cloneAsset={cloneAssetAsDraft}
            generating={generatingDraft}
            isWaitingForNewAsset={isSubmittingDraft && !selectedAsset}
            job={selectedJob}
            openCase={props.openCase}
            emptyBody="输入设计 prompt 后点击生成。这里只会显示本次新建的设计草稿，不会自动拿旧资产占位。"
            emptyTitle="等待新设计草稿"
            resetDraft={editableAsset.resetDraft}
            saveAsset={saveSelectedAsset}
            savedMessage={assetSaveMessage}
            sourceAsset={selectedAsset}
            updateAssetDraft={editableAsset.setDraftPatch}
            protectRegenerate={false}
          />
        </section>
      ) : null}

      {activeTab === "library" ? (
        <>
          <section className="asset-board-metrics">
            <MetricCard label="资产数量" value={libraryVisibleAssets.length.toString()} />
            <MetricCard label="Seedance 参考图" value={readyReferences.toString()} />
            <MetricCard label="可用首尾帧" value={readyFrames.toString()} />
            <MetricCard label="待处理" value={blockedAssets.toString()} danger={blockedAssets > 0} />
          </section>
          <section className="asset-library-layout">
            <FolderRail activeFolder={activeFolder} folders={folders} setActiveFolder={setActiveFolder} totalCount={libraryAssets.length} />
            <section className="asset-table-panel panel">
              <div className="asset-library-toolbar">
                <div className="asset-folder-context" title={`当前文件夹：${activeFolder}`}>
                  <Folder size={15} />
                  <span>当前文件夹</span>
                  <strong>{activeFolder}</strong>
                </div>
                <Field label="搜索">
                  <div className="asset-search-input">
                    <Search size={15} />
                    <input value={searchText} placeholder="搜索名称、prompt、标签、文件夹" onChange={(event) => setSearchText(event.target.value)} />
                  </div>
                </Field>
                <Field label="状态">
                  <select value={props.filterStatus} onChange={(event) => props.setFilterStatus(event.target.value as ProductionAssetStatus | "")}>
                    <option value="">全部状态</option>
                    {productionAssetStatuses.map((status) => <option key={status} value={status}>{assetStatusLabel(status)}</option>)}
                  </select>
                </Field>
              </div>
              {libraryVisibleAssets.length === 0 ? (
                <EmptyState title="暂无设计资产" body="先到「生成设计」输入 prompt 生成角色三视图或场景设定表；满意后保存入库，之后就能按文件夹查找。" />
              ) : (
                <div className="asset-gallery-grid">
                  {libraryVisibleAssets.map((asset) => (
                    <button className={`asset-gallery-card ${selectedAsset?._id === asset._id ? "selected" : ""}`} key={asset._id} type="button" onClick={() => selectAssetSafely(asset._id)}>
                      <div className="asset-gallery-thumb">
                        {assetPreviewUrl(asset) ? <MediaImage src={assetPreviewUrl(asset)} alt={asset.label} fallbackLabel="预览不可用" /> : <ImageIcon size={26} />}
                      </div>
                      <strong>{asset.label}</strong>
                      <span>{formatAssetCardMeta(asset)}</span>
                      <StatusPill tone={assetStatusTone(asset.status)}>{assetStatusLabel(asset.status)}</StatusPill>
                    </button>
                  ))}
                </div>
              )}
            </section>
            <AssetInspector
              asset={assetDraft}
              isDirty={editableAsset.isDirty}
              deleteAsset={props.deleteAsset}
              generateAsset={props.generateAsset}
              cloneAsset={cloneAssetAsDraft}
              generating={generatingDraft}
              job={selectedJob}
              openCase={props.openCase}
              resetDraft={editableAsset.resetDraft}
              saveAsset={saveSelectedAsset}
              savedMessage={assetSaveMessage}
              sourceAsset={selectedAsset}
              updateAssetDraft={editableAsset.setDraftPatch}
              protectRegenerate
            />
          </section>
        </>
      ) : null}

      {activeTab === "case-plan" ? (
        <section className="asset-board-grid">
          <section className="asset-table-panel panel">
            <SectionHeader eyebrow="Case 资产规划" title="为影片建立角色、场景、风格、首帧规划" />
            <div className="asset-filter-row">
              <Field label="Case">
                <select value={props.filterJobId} onChange={(event) => props.setFilterJobId(event.target.value)}>
                  <option value="">选择 Case</option>
                  {props.jobs.map((job) => <option key={job.id} value={job.id}>{job.topic || job.id}</option>)}
                </select>
              </Field>
              <Field label="状态">
                <select value={props.filterStatus} onChange={(event) => props.setFilterStatus(event.target.value as ProductionAssetStatus | "")}>
                  <option value="">全部状态</option>
                  {productionAssetStatuses.map((status) => <option key={status} value={status}>{assetStatusLabel(status)}</option>)}
                </select>
              </Field>
            </div>
            <button className="primary-button" type="button" disabled={!selectedFilterJob} onClick={() => selectedFilterJob && props.bootstrapAssetsForJob(selectedFilterJob)}>
              <Database size={16} />
              为选中 Case 建立资产规划表
            </button>
            {!props.filterJobId ? (
              <EmptyState title="先选择一个 Case" body="Case 规划只显示该影片需要的角色设计、场景设定表、风格参考、首帧和尾帧占位，不会混入资产库。" />
            ) : casePlanDisplayAssets.length === 0 ? (
              <EmptyState title="这个 Case 还没有资产规划" body="点击「为选中 Case 建立资产规划表」，系统会建立规划占位；生成并保存后才会进入资产库。" />
            ) : (
              <div className="asset-gallery-grid">
                {casePlanDisplayAssets.map((asset) => (
                  <button className={`asset-gallery-card ${selectedAsset?._id === asset._id ? "selected" : ""}`} key={asset._id} type="button" onClick={() => selectAssetSafely(asset._id)}>
                    <div className="asset-gallery-thumb">
                      {assetPreviewUrl(asset) ? <MediaImage src={assetPreviewUrl(asset)} alt={asset.label} fallbackLabel="预览不可用" /> : <ImageIcon size={26} />}
                    </div>
                    <strong>{asset.label}</strong>
                    <span>{formatAssetCardMeta(asset)}</span>
                    <StatusPill tone={assetStatusTone(asset.status)}>{assetStatusLabel(asset.status)}</StatusPill>
                  </button>
                ))}
              </div>
            )}
          </section>
          <AssetInspector
            asset={assetDraft}
            isDirty={editableAsset.isDirty}
            deleteAsset={props.deleteAsset}
            generateAsset={props.generateAsset}
            cloneAsset={cloneAssetAsDraft}
            generating={generatingDraft}
            job={selectedJob}
            openCase={props.openCase}
            resetDraft={editableAsset.resetDraft}
            saveAsset={saveSelectedAsset}
            savedMessage={assetSaveMessage}
            sourceAsset={selectedAsset}
            updateAssetDraft={editableAsset.setDraftPatch}
            protectRegenerate
          />
        </section>
      ) : null}
    </section>
  );
}

function AssetInspector(props: {
  asset: ProductionAsset | null;
  cloneAsset: (asset: ProductionAsset) => void;
  deleteAsset: (id: string) => void;
  emptyBody?: string | undefined;
  emptyTitle?: string | undefined;
  generateAsset: (asset: ProductionAsset) => void;
  generating: boolean;
  isWaitingForNewAsset?: boolean | undefined;
  isDirty: boolean;
  job: AdminJob | null;
  openCase: (jobId: string) => void;
  protectRegenerate?: boolean | undefined;
  resetDraft: () => void;
  saveAsset: (extraPatch?: Partial<ProductionAsset>) => void;
  savedMessage?: string | null | undefined;
  sourceAsset: ProductionAsset | null;
  updateAssetDraft: (patch: Partial<ProductionAsset>) => void;
}) {
  if (!props.asset) {
    return (
      <section className="asset-inspector panel">
        {props.isWaitingForNewAsset ? (
          <div className="empty-state asset-inspector-loading">
            <Loader2 size={22} className="spin" />
            <strong>正在建立新设计草稿</strong>
            <span>创建 MongoDB 资产列后会自动开始生成，右侧会显示本次结果。</span>
          </div>
        ) : (
          <EmptyState
            title={props.emptyTitle ?? "选择一个设计资产"}
            body={props.emptyBody ?? "右侧会显示预览、prompt、文件夹、状态和保存操作。"}
          />
        )}
      </section>
    );
  }

  const asset = props.asset;
  const previewUrl = assetPreviewUrl(asset);
  const approvedLibraryAsset = Boolean(props.protectRegenerate && asset.status === "approved");
  const readiness = evaluateProductionAssetReadiness(asset);

  return (
    <section className="asset-inspector panel">
      <SectionHeader eyebrow="设计检查" title={asset.label} action={<StatusPill tone={assetStatusTone(asset.status)}>{assetStatusLabel(asset.status)}</StatusPill>} />
      <div className="asset-preview-frame">
        {previewUrl ? <MediaImage src={previewUrl} alt={asset.label} fallbackLabel="预览不可用" /> : <div><ImageIcon size={30} /><span>尚未生成预览图</span></div>}
      </div>
      <AssetReadinessPanel readiness={readiness} />
      <AssetDesignSpecPanel type={asset.type} compact />
      <div className="asset-inspector-actions">
        <button
          className="primary-button"
          type="button"
          disabled={props.generating || asset.type === "bgm_reference" || approvedLibraryAsset}
          title={approvedLibraryAsset ? "已保存入库的资产不会直接覆盖；请复制为新版本草稿后再生成。" : undefined}
          onClick={() => {
            if (props.protectRegenerate && !window.confirm(`重新生成会覆盖「${asset.label}」目前的图片结果。确定要继续吗？`)) {
              return;
            }

            if (!confirmDiscardDirtyDraft(props.isDirty, "当前设计资料有未保存修改。放弃这些修改并继续生成吗？")) {
              return;
            }

            if (props.sourceAsset) {
              props.generateAsset(props.sourceAsset);
            }
          }}
        >
          {props.generating ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
          {props.generating ? "生成中" : props.protectRegenerate ? "重新生成并覆盖" : "生成草稿"}
        </button>
        {approvedLibraryAsset ? <span className="asset-version-lock">已入库资产不会直接覆盖，请复制为新版本继续改。</span> : null}
        {props.protectRegenerate && props.sourceAsset ? (
          <button className="secondary-button" type="button" onClick={() => props.cloneAsset(props.sourceAsset!)}>
            <Plus size={15} />
            复制为新版本草稿
          </button>
        ) : null}
        <button className="secondary-button" type="button" onClick={() => props.saveAsset({ status: "approved" })}>
          <Save size={15} />
          满意，保存入库
        </button>
        <button className="danger-button" type="button" onClick={() => props.saveAsset({ status: "rejected" })}>
          不采用
        </button>
        <button
          className="danger-button"
          type="button"
          onClick={() => {
            if (window.confirm(`确定删除「${asset.label}」？这个动作会删除 MongoDB 中的资产记录。`)) {
              props.deleteAsset(asset._id);
            }
          }}
        >
          <Trash2 size={15} />
          删除
        </button>
      </div>
      <div className="asset-inspector-form">
        <Field label="资产名称">
          <input value={asset.label} onChange={(event) => props.updateAssetDraft({ label: event.target.value })} />
        </Field>
        <div className="asset-two-col">
          <Field label="文件夹">
            <input value={asset.folderName} onChange={(event) => props.updateAssetDraft({ folderName: event.target.value })} />
          </Field>
          <Field label="标签">
            <input value={asset.tags.join(", ")} onChange={(event) => props.updateAssetDraft({ tags: splitTags(event.target.value) })} />
          </Field>
        </div>
        <div className="asset-two-col">
          <Field label="资产类型（保存后生效）">
            <select value={asset.type} onChange={(event) => props.updateAssetDraft({ type: event.target.value as ProductionAssetType })}>
              {productionAssetTypes.map((type) => <option key={type} value={type}>{assetTypeLabel(type)}</option>)}
            </select>
          </Field>
          <Field label="状态">
            <select value={asset.status} onChange={(event) => props.updateAssetDraft({ status: event.target.value as ProductionAssetStatus })}>
              {productionAssetStatuses.map((status) => <option key={status} value={status}>{assetStatusLabel(status)}</option>)}
            </select>
          </Field>
        </div>
        <div className="asset-two-col">
          <Field label="供应商">
            <select value={asset.provider} onChange={(event) => props.updateAssetDraft({ provider: event.target.value as ProductionAssetProvider })}>
              {productionAssetProviders.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
            </select>
          </Field>
          <Field label="Seedance 用途">
            <select value={asset.role} onChange={(event) => props.updateAssetDraft({ role: event.target.value as ProductionAssetRole })}>
              {productionAssetRoles.map((role) => <option key={role} value={role}>{assetRoleLabel(role)}</option>)}
            </select>
          </Field>
        </div>
        <Field label="设计 Prompt">
          <textarea rows={6} value={asset.prompt} onChange={(event) => props.updateAssetDraft({ prompt: event.target.value })} />
        </Field>
        <Field label="图片 URL / artifact">
          <input value={asset.url} onChange={(event) => props.updateAssetDraft({ url: event.target.value })} />
        </Field>
        <Field label="备注">
          <textarea rows={3} value={asset.notes} onChange={(event) => props.updateAssetDraft({ notes: event.target.value })} />
        </Field>
        {asset.error ? <div className="stage-error-panel"><AlertTriangle size={15} /><span>{asset.error}</span></div> : null}
      </div>
      <EditableActionBar
        isDirty={props.isDirty}
        onCancel={props.resetDraft}
        onSave={() => props.saveAsset()}
        savedMessage={props.savedMessage}
      />
      <div className="asset-inspector-footer">
        {props.job ? <button className="secondary-button compact-button" type="button" onClick={() => props.openCase(props.job!.id)}>打开 Case</button> : null}
      </div>
    </section>
  );
}

function FolderRail(props: { activeFolder: string; folders: Array<{ count: number; name: string }>; setActiveFolder: (folder: string) => void; totalCount: number }) {
  return (
    <section className="asset-folder-rail panel">
      <SectionHeader eyebrow="资产库" title="资产文件夹" />
      <button className={props.activeFolder === "全部" ? "active" : ""} type="button" onClick={() => props.setActiveFolder("全部")}>
        <Folder size={15} />
        <span>全部</span>
        <strong>{props.totalCount}</strong>
      </button>
      {props.folders.map((folder) => (
        <button className={props.activeFolder === folder.name ? "active" : ""} key={folder.name} type="button" onClick={() => props.setActiveFolder(folder.name)}>
          <Folder size={15} />
          <span>{folder.name}</span>
          <strong>{folder.count}</strong>
        </button>
      ))}
    </section>
  );
}

function StudioTab(props: { active: boolean; label: string; onClick: () => void }) {
  return <button className={props.active ? "active" : ""} type="button" onClick={props.onClick}>{props.label}</button>;
}

function AssetReadinessPanel(props: { readiness: ProductionAssetReadiness }) {
  const messages = [...props.readiness.blockers, ...props.readiness.warnings];

  return (
    <section className={`asset-readiness-panel ${props.readiness.state}`}>
      <div>
        <p className="eyebrow">下游可用性</p>
        <h3>{props.readiness.label}</h3>
        <StatusPill tone={props.readiness.tone}>{props.readiness.canUseAsReference ? "可传给模型" : "不可自动使用"}</StatusPill>
      </div>
      <span>{props.readiness.nextAction}</span>
      {messages.length > 0 ? (
        <ul>
          {messages.map((message) => <li key={message}>{message}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

function AssetDesignSpecPanel(props: { compact?: boolean | undefined; type: ProductionAssetType }) {
  const spec = getProductionAssetDesignSpec(props.type);
  const deliverables = props.compact ? spec.deliverables.slice(0, 4) : spec.deliverables;
  const checks = props.compact ? spec.checks.slice(0, 3) : spec.checks;

  return (
    <section className={`asset-design-spec ${props.compact ? "compact" : ""}`.trim()}>
      <div>
        <p className="eyebrow">设计规格</p>
        <h3>{spec.title}</h3>
        <span>{spec.purpose}</span>
      </div>
      <div className="asset-spec-columns">
        <div>
          <strong>必须交付</strong>
          <ul>
            {deliverables.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <strong>检查标准</strong>
          <ul>
            {checks.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>
      {!props.compact ? <p>{spec.usage}</p> : null}
    </section>
  );
}

function MetricCard(props: { danger?: boolean | undefined; label: string; value: string }) {
  return (
    <div className={`asset-metric panel ${props.danger ? "danger" : ""}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function buildFolderStats(assets: ProductionAsset[]): Array<{ count: number; name: string }> {
  const counts = new Map<string, number>();

  assets.forEach((asset) => counts.set(asset.folderName || "未分类", (counts.get(asset.folderName || "未分类") ?? 0) + 1));
  return [...counts.entries()].map(([name, count]) => ({ count, name })).sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
}

function formatAssetCardMeta(asset: ProductionAsset): string {
  const folderName = asset.folderName.trim();
  const typeLabel = assetTypeLabel(asset.type);

  if (!folderName || folderName === typeLabel) {
    return typeLabel;
  }

  return `${folderName} / ${typeLabel}`;
}

function splitTags(value: string): string[] {
  return value.split(/[,，]/u).map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

function defaultFolderForType(type: ProductionAssetType): string {
  if (type === "character_design") return "角色设计";
  if (type === "scene_design") return "场景设定表";
  if (type === "style_reference") return "风格参考";
  if (type === "first_frame") return "首帧设计";
  if (type === "last_frame") return "尾帧设计";
  return "音乐参考";
}

function defaultDraftLabelForType(type: ProductionAssetType): string {
  if (type === "character_design") return "新角色三视图";
  if (type === "scene_design") return "新场景多角度设定表";
  return `新${assetTypeLabel(type)}`;
}

function assetTypeLabel(type: ProductionAssetType): string {
  const labels: Record<ProductionAssetType, string> = {
    bgm_reference: "背景音乐参考",
    character_design: "角色设计",
    first_frame: "首帧",
    last_frame: "尾帧",
    scene_design: "场景设定表",
    style_reference: "风格参考"
  };
  return labels[type];
}

function assetStatusLabel(status: ProductionAssetStatus): string {
  const labels: Record<ProductionAssetStatus, string> = {
    approved: "已保存",
    failed: "失败",
    generating: "生成中",
    planned: "规划中",
    ready: "待确认",
    rejected: "不采用"
  };
  return labels[status];
}

function assetRoleLabel(role: ProductionAssetRole): string {
  const labels: Record<ProductionAssetRole, string> = {
    bgm_reference: "BGM参考",
    first_frame: "首帧",
    last_frame: "尾帧",
    none: "不传给模型",
    reference_image: "参考图"
  };
  return labels[role];
}

function assetStatusTone(status: ProductionAssetStatus): "active" | "danger" | "neutral" | "success" | "warning" {
  if (status === "approved") return "success";
  if (status === "ready") return "warning";
  if (status === "generating") return "active";
  if (status === "failed" || status === "rejected") return "danger";
  return "neutral";
}

function assetPreviewUrl(asset: ProductionAsset): string {
  const resolved = resolveFirstMediaUrl([asset.url, asset.storagePath]);
  return isImageMediaUrl(resolved) ? resolved : "";
}

function isGeneratedDesignAsset(asset: ProductionAsset): boolean {
  return Boolean(assetPreviewUrl(asset));
}
