import { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, FileVideo, Image as ImageIcon, Loader2, Plus, RefreshCw, Search, Sparkles, Trash2, X, XCircle } from "lucide-react";
import type { ContentSeries, ContentSeriesStatus, ProductionAsset, SeriesEpisodeIdea, SeriesEpisodeIdeaStatus, StoryWorld } from "@ai-content-factory/shared-types";
import { EditableActionBar, EmptyState, Field, SectionHeader, StatusPill } from "../components/ui.js";
import { confirmDiscardDirtyDraft, createDraftPatch, useEditableDraft } from "../lib/editable-draft.js";
import type { AdminJob } from "../lib/jobs.js";
import { isImageMediaUrl, resolveFirstMediaUrl } from "../lib/media-url.js";
import { formatDateTime } from "../lib/view-helpers.js";

interface SeriesPageProps {
  assets: ProductionAsset[];
  convertEpisodeToCase: (series: ContentSeries, episode: SeriesEpisodeIdea) => void;
  createSeries: () => void;
  createStoryWorld: (input: Omit<StoryWorld, "_id" | "createdAt" | "updatedAt">) => Promise<StoryWorld | null>;
  deleteSeries: (id: string) => void;
  episodes: SeriesEpisodeIdea[];
  error: string | null;
  generateIdeas: (seriesId: string, count: number) => void;
  generatingSeriesIds: string[];
  isLoading: boolean;
  jobs: AdminJob[];
  refresh: () => void;
  reportDirtyState?: (key: string, isDirty: boolean) => void;
  selectSeries: (id: string | null) => void;
  selectedSeriesId: string | null;
  series: ContentSeries[];
  storyWorlds: StoryWorld[];
  updateEpisode: (seriesId: string, episodeId: string, patch: Partial<Omit<SeriesEpisodeIdea, "_id" | "createdAt" | "seriesId" | "updatedAt">>) => Promise<void> | void;
  updateSeries: (id: string, patch: Partial<Omit<ContentSeries, "_id" | "createdAt" | "updatedAt">>) => Promise<void> | void;
  openCase: (id: string) => void;
}

const seriesStatusOptions: ContentSeriesStatus[] = ["draft", "active", "paused", "archived"];
const episodeStatusOptions: SeriesEpisodeIdeaStatus[] = ["draft", "approved", "converted_to_case", "rejected"];

export function SeriesPage(props: SeriesPageProps) {
  const [ideaCount, setIdeaCount] = useState(10);
  const [storyWorldDraft, setStoryWorldDraft] = useState({
    description: "",
    name: "",
    relationshipMap: "",
    safetyRules: "",
    visualStyle: ""
  });
  const [isSavingStoryWorld, setIsSavingStoryWorld] = useState(false);
  const selectedSeries = props.series.find((series) => series._id === props.selectedSeriesId) ?? props.series[0] ?? null;
  const seriesEditor = useEditableDraft(selectedSeries, selectedSeries ? `${selectedSeries._id}:${selectedSeries.updatedAt}` : null);
  const seriesDraft = seriesEditor.draft;
  const selectedSeriesJobs = selectedSeries ? props.jobs.filter((job) => job.seriesId === selectedSeries._id) : [];
  const generatedAssets = props.assets.filter((asset) => Boolean(assetBindingUrl(asset)) && (asset.status === "ready" || asset.status === "approved"));
  const approvedEpisodes = props.episodes.filter((episode) => episode.status === "approved").length;
  const convertedEpisodes = props.episodes.filter((episode) => episode.status === "converted_to_case").length;
  const generating = selectedSeries ? props.generatingSeriesIds.includes(selectedSeries._id) : false;
  const reportDirtyState = props.reportDirtyState;
  const selectedSeriesId = selectedSeries?._id ?? "none";

  useEffect(() => {
    reportDirtyState?.(`series:${selectedSeriesId}`, seriesEditor.isDirty);
    return () => reportDirtyState?.(`series:${selectedSeriesId}`, false);
  }, [reportDirtyState, selectedSeriesId, seriesEditor.isDirty]);

  function patchSeriesDraft(patch: Partial<ContentSeries>) {
    seriesEditor.setDraftPatch(patch);
  }

  function patchStoryWorldDraft(patch: Partial<typeof storyWorldDraft>) {
    setStoryWorldDraft((currentDraft) => ({ ...currentDraft, ...patch }));
  }

  async function saveStoryWorldDraft() {
    const name = storyWorldDraft.name.trim();

    if (!name) {
      return;
    }

    setIsSavingStoryWorld(true);
    try {
      const created = await props.createStoryWorld({
        defaultSceneAssetIds: [],
        description: storyWorldDraft.description.trim(),
        name,
        recurringCharacterAssetIds: [],
        relationshipMap: storyWorldDraft.relationshipMap.trim(),
        safetyRules: storyWorldDraft.safetyRules.trim(),
        seriesIds: selectedSeries ? [selectedSeries._id] : [],
        status: "draft",
        visualStyle: storyWorldDraft.visualStyle.trim()
      });

      if (created) {
        setStoryWorldDraft({
          description: "",
          name: "",
          relationshipMap: "",
          safetyRules: "",
          visualStyle: ""
        });
      }
    } finally {
      setIsSavingStoryWorld(false);
    }
  }

  async function saveSeriesDraft() {
    if (!selectedSeries || !seriesDraft) {
      return;
    }

    await props.updateSeries(selectedSeries._id, createDraftPatch(selectedSeries, seriesDraft));
    seriesEditor.markSaved(seriesDraft);
  }

  function safeSelectSeries(id: string | null) {
    if (id === selectedSeries?._id) {
      return;
    }

    if (!confirmDiscardDirtyDraft(seriesEditor.isDirty)) {
      return;
    }

    props.selectSeries(id);
  }

  function safeRefresh() {
    if (!confirmDiscardDirtyDraft(seriesEditor.isDirty)) {
      return;
    }

    props.refresh();
  }

  function safeCreateSeries() {
    if (!confirmDiscardDirtyDraft(seriesEditor.isDirty)) {
      return;
    }

    props.createSeries();
  }

  return (
    <section className="series-page">
      <section className="series-toolbar panel">
        <div>
          <p className="eyebrow">系列内容库</p>
          <h2>Series Library / 内容产品线</h2>
          <span>先定义一个可持续生产的内容系列，再批量生成选题；人工批准后才转成影片 Case。</span>
        </div>
        <div className="asset-board-actions">
          <button className="secondary-button" type="button" onClick={safeRefresh}>
            {props.isLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            刷新
          </button>
          <button className="primary-button" type="button" onClick={safeCreateSeries}>
            <Plus size={16} />
            新建系列
          </button>
        </div>
      </section>

      {props.error ? <div className="inline-error"><AlertTriangle size={16} />{props.error}</div> : null}

      <section className="panel story-world-composer">
        <SectionHeader eyebrow="背景故事" title="Story World 草稿" />
        <div className="series-form-grid">
          <Field label="世界观名称">
            <input value={storyWorldDraft.name} onChange={(event) => patchStoryWorldDraft({ name: event.target.value })} placeholder="例如：彩虹森林、森林小学、未来便利店" />
          </Field>
          <Field label="视觉风格">
            <input value={storyWorldDraft.visualStyle} onChange={(event) => patchStoryWorldDraft({ visualStyle: event.target.value })} placeholder="例如：柔和童话、低饱和写实、赛博夜景" />
          </Field>
          <Field className="wide" label="世界设定">
            <textarea rows={3} value={storyWorldDraft.description} onChange={(event) => patchStoryWorldDraft({ description: event.target.value })} placeholder="这个世界发生在哪里、常驻地点是什么、观众应该一眼记住什么。" />
          </Field>
          <Field label="角色关系">
            <textarea rows={3} value={storyWorldDraft.relationshipMap} onChange={(event) => patchStoryWorldDraft({ relationshipMap: event.target.value })} placeholder="常驻角色之间的关系、班级/家庭/团队结构。" />
          </Field>
          <Field label="禁忌规则">
            <textarea rows={3} value={storyWorldDraft.safetyRules} onChange={(event) => patchStoryWorldDraft({ safetyRules: event.target.value })} placeholder="这个系列中不允许出现的内容、语气或视觉限制。" />
          </Field>
        </div>
        <div className="editable-action-bar">
          <span>{storyWorldDraft.name.trim() ? "待保存背景故事" : "输入名称后可保存为可复用世界观"}</span>
          <button className="secondary-button" type="button" onClick={() => setStoryWorldDraft({ description: "", name: "", relationshipMap: "", safetyRules: "", visualStyle: "" })}>
            取消修改
          </button>
          <button className="primary-button" type="button" disabled={!storyWorldDraft.name.trim() || isSavingStoryWorld} onClick={() => void saveStoryWorldDraft()}>
            {isSavingStoryWorld ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
            保存背景故事
          </button>
        </div>
      </section>

      <section className="series-layout">
        <aside className="panel series-list-panel">
          <SectionHeader eyebrow="内容库" title="系列列表" />
          {props.series.length === 0 ? (
            <EmptyState title="还没有系列" body="点击新建系列，建立任意长期内容产品线。系统不会预设题材，全部按你填写的系列设定执行。" />
          ) : (
            <div className="series-list">
              {props.series.map((series) => {
                const episodeCount = selectedSeries?._id === series._id ? props.episodes.length : 0;
                const caseCount = props.jobs.filter((job) => job.seriesId === series._id).length;

                return (
                  <button key={series._id} className={`series-list-item ${selectedSeries?._id === series._id ? "active" : ""}`} type="button" onClick={() => safeSelectSeries(series._id)}>
                    <BookOpen size={18} />
                    <span>
                      <strong>{series.name}</strong>
                      <small>{series.contentType} / {series.language}</small>
                    </span>
                    <StatusPill tone={series.status === "active" ? "success" : series.status === "paused" ? "warning" : "neutral"}>{seriesStatusLabel(series.status)}</StatusPill>
                    <em>{episodeCount} 题 / {caseCount} Case</em>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="panel series-editor-panel">
          {selectedSeries && seriesDraft ? (
            <>
              <SectionHeader
                eyebrow="系列设定"
                title={seriesDraft.name}
                action={
                  <button className="danger-button" type="button" onClick={() => window.confirm(`确定删除系列「${selectedSeries.name}」？`) && props.deleteSeries(selectedSeries._id)}>
                    <Trash2 size={16} />
                    删除
                  </button>
                }
              />
              <div className="series-form-grid">
                <Field label="系列名称">
                  <input value={seriesDraft.name} onChange={(event) => patchSeriesDraft({ name: event.target.value })} />
                </Field>
                <Field label="状态">
                  <select value={seriesDraft.status} onChange={(event) => patchSeriesDraft({ status: event.target.value as ContentSeriesStatus })}>
                    {seriesStatusOptions.map((status) => <option key={status} value={status}>{seriesStatusLabel(status)}</option>)}
                  </select>
                </Field>
                <Field label="语言">
                  <select value={seriesDraft.language} onChange={(event) => patchSeriesDraft({ language: event.target.value as ContentSeries["language"] })}>
                    <option value="zh-CN">中文</option>
                    <option value="en-US">English</option>
                  </select>
                </Field>
                <Field label="目标观众 / 市场">
                  <input value={seriesDraft.audience} onChange={(event) => patchSeriesDraft({ audience: event.target.value })} />
                </Field>
                <Field label="内容类型 / 影片类型">
                  <input value={seriesDraft.contentType} onChange={(event) => patchSeriesDraft({ contentType: event.target.value })} />
                </Field>
                <Field label="背景故事 / Story World">
                  <select value={seriesDraft.storyWorldId ?? ""} onChange={(event) => patchSeriesDraft({ storyWorldId: event.target.value || null })}>
                    <option value="">不绑定世界观</option>
                    {props.storyWorlds.map((storyWorld) => <option key={storyWorld._id} value={storyWorld._id}>{storyWorld.name}</option>)}
                  </select>
                </Field>
                <Field label="片长秒数">
                  <input min={15} max={180} type="number" value={seriesDraft.durationSeconds} onChange={(event) => patchSeriesDraft({ durationSeconds: Number(event.target.value) })} />
                </Field>
                <Field label="场景数">
                  <input min={3} max={12} type="number" value={seriesDraft.sceneCount} onChange={(event) => patchSeriesDraft({ sceneCount: Number(event.target.value) })} />
                </Field>
                <Field label="系列目标 / 核心价值">
                  <input value={seriesDraft.values} onChange={(event) => patchSeriesDraft({ values: event.target.value })} />
                </Field>
                <Field className="wide" label="系列定位">
                  <textarea rows={3} value={seriesDraft.description} onChange={(event) => patchSeriesDraft({ description: event.target.value })} />
                </Field>
                <Field label="叙事语气">
                  <textarea rows={3} value={seriesDraft.tone} onChange={(event) => patchSeriesDraft({ tone: event.target.value })} />
                </Field>
                <Field label="视觉风格">
                  <textarea rows={3} value={seriesDraft.visualStyle} onChange={(event) => patchSeriesDraft({ visualStyle: event.target.value })} />
                </Field>
                <Field label="BGM 风格">
                  <textarea rows={3} value={seriesDraft.musicStyle} onChange={(event) => patchSeriesDraft({ musicStyle: event.target.value })} />
                </Field>
                <Field label="禁忌 / 合规规则">
                  <textarea rows={3} value={seriesDraft.safetyRules} onChange={(event) => patchSeriesDraft({ safetyRules: event.target.value })} />
                </Field>
              </div>
              <EditableActionBar
                isDirty={seriesEditor.isDirty}
                onCancel={seriesEditor.resetDraft}
                onSave={saveSeriesDraft}
              />

              <section className="series-asset-binding">
                {generatedAssets.length === 0 ? (
                  <EmptyState title="还没有可绑定资产" body="先到设计资产中心生成并保存角色三视图、场景设定表或风格参考，再回到这里绑定。" />
                ) : (
                  <AssetBindingPicker
                    assets={generatedAssets}
                    description="绑定到系列后，AI 生成选题和 Case 会继承这些固定角色、场景与风格参考。这里是选择器，不是审图页。"
                    label="固定角色 / 场景 / 风格参考"
                    selectedIds={seriesDraft.referenceAssetIds}
                    onChange={(ids) => patchSeriesDraft({ referenceAssetIds: ids })}
                  />
                )}
              </section>
            </>
          ) : (
            <EmptyState title="选择或创建一个系列" body="系列会保存定位、题材、资产、风格和选题库，后续再批量转成 Case。" />
          )}
        </section>

        <aside className="panel series-insight-panel">
          <SectionHeader eyebrow="生产统计" title="选题状态" />
          <div className="inspector-summary">
            <div><span>选题数量</span><strong>{props.episodes.length}</strong></div>
            <div><span>已批准</span><strong>{approvedEpisodes}</strong></div>
            <div><span>已转 Case</span><strong>{convertedEpisodes}</strong></div>
            <div><span>绑定资产</span><strong>{selectedSeries?.referenceAssetIds.length ?? 0}</strong></div>
          </div>
          {selectedSeriesJobs.length > 0 ? (
            <div className="series-linked-cases">
              <h3>已生成 Case</h3>
              {selectedSeriesJobs.slice(0, 6).map((job) => (
                <button key={job.id} type="button" onClick={() => props.openCase(job.id)}>
                  <FileVideo size={15} />
                  <span>{job.topic}</span>
                  <small>{job.status}</small>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="还没有 Case" body="批准选题后，点击转 Case 会进入现有影片生产流程。" />
          )}
        </aside>
      </section>

      <section className="panel episode-board">
        <SectionHeader
          eyebrow="Episode Ideas"
          title="AI 选题库"
          action={
            <div className="episode-actions">
              <input min={1} max={30} type="number" value={ideaCount} onChange={(event) => setIdeaCount(Number(event.target.value))} />
              <button className="primary-button" disabled={!selectedSeries || generating} type="button" onClick={() => selectedSeries && props.generateIdeas(selectedSeries._id, ideaCount)}>
                {generating ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                AI 生成选题
              </button>
            </div>
          }
        />
        {!selectedSeries ? (
          <EmptyState title="先选择系列" body="选题会根据系列定位、内容类型、目标观众、合规规则和绑定资产生成。" />
        ) : props.episodes.length === 0 ? (
          <EmptyState title="还没有选题" body="点击 AI 生成选题，一次生成 10-30 条单集方向，然后人工批准。" />
        ) : (
          <div className="episode-table">
            <div className="episode-table-head">
              <span>题目 / 核心看点</span>
              <span>来源 / 灵感</span>
              <span>风险</span>
              <span>状态</span>
              <span>操作</span>
            </div>
            {props.episodes.map((episode) => (
              <EpisodeRow
                assets={generatedAssets}
                key={episode._id}
                episode={episode}
                linkedJob={props.jobs.find((job) => job.id === episode.caseId) ?? null}
                openCase={props.openCase}
                selectedSeries={selectedSeries}
                reportDirtyState={props.reportDirtyState}
                updateEpisode={props.updateEpisode}
                convertEpisodeToCase={props.convertEpisodeToCase}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function EpisodeRow(props: {
  assets: ProductionAsset[];
  convertEpisodeToCase: (series: ContentSeries, episode: SeriesEpisodeIdea) => void;
  episode: SeriesEpisodeIdea;
  linkedJob: AdminJob | null;
  openCase: (id: string) => void;
  reportDirtyState?: SeriesPageProps["reportDirtyState"];
  selectedSeries: ContentSeries;
  updateEpisode: SeriesPageProps["updateEpisode"];
}) {
  const [expanded, setExpanded] = useState(false);
  const episodeEditor = useEditableDraft(props.episode, `${props.episode._id}:${props.episode.updatedAt}`);
  const episodeDraft = episodeEditor.draft ?? props.episode;
  const characterAssets = props.assets.filter((asset) => asset.type === "character_design");
  const sceneAssets = props.assets.filter((asset) => asset.type === "scene_design" || asset.type === "style_reference" || asset.type === "first_frame");
  const canConvert = props.episode.status === "approved";
  const reportDirtyState = props.reportDirtyState;
  const episodeId = props.episode._id;

  useEffect(() => {
    reportDirtyState?.(`series-episode:${episodeId}`, episodeEditor.isDirty);
    return () => reportDirtyState?.(`series-episode:${episodeId}`, false);
  }, [episodeEditor.isDirty, episodeId, reportDirtyState]);

  function patchEpisodeDraft(patch: Partial<SeriesEpisodeIdea>) {
    episodeEditor.setDraftPatch(patch);
  }

  async function saveEpisodeDraft(extraPatch: Partial<SeriesEpisodeIdea> = {}) {
    const nextDraft = { ...episodeDraft, ...extraPatch };
    const patch = createDraftPatch(props.episode, nextDraft);

    if (Object.keys(patch).length > 0) {
      await props.updateEpisode(props.selectedSeries._id, props.episode._id, patch);
    }

    episodeEditor.markSaved(nextDraft);
  }

  return (
    <div className={`episode-row ${expanded ? "expanded" : ""}`}>
      <button className="episode-title-cell" type="button" onClick={() => setExpanded(!expanded)}>
        <strong>{episodeDraft.title}</strong>
        <span>{episodeDraft.moralLesson}</span>
        <small>{formatDateTime(props.episode.createdAt)}</small>
      </button>
      <span>{episodeDraft.sourceStory}</span>
      <span>{episodeDraft.riskNotes}</span>
      <select value={episodeDraft.status} onChange={(event) => patchEpisodeDraft({ status: event.target.value as SeriesEpisodeIdeaStatus })}>
        {episodeStatusOptions.map((status) => <option key={status} value={status}>{episodeStatusLabel(status)}</option>)}
      </select>
      <div className="episode-row-actions">
        <button className="secondary-button" type="button" onClick={() => saveEpisodeDraft({ status: "approved" })}>
          <CheckCircle2 size={15} />
          批准
        </button>
        <button className="secondary-button" type="button" onClick={() => saveEpisodeDraft({ status: "rejected" })}>
          <XCircle size={15} />
          拒绝
        </button>
        {props.linkedJob ? (
          <button className="primary-button" type="button" onClick={() => props.openCase(props.linkedJob!.id)}>
            打开 Case
          </button>
        ) : (
          <button className="primary-button" disabled={!canConvert} type="button" onClick={() => props.convertEpisodeToCase(props.selectedSeries, props.episode)}>
            转 Case
          </button>
        )}
      </div>
      {expanded ? (
        <div className="episode-detail">
          <Field label="题目">
            <input value={episodeDraft.title} onChange={(event) => patchEpisodeDraft({ title: event.target.value })} />
          </Field>
          <Field label="集数">
            <input min={1} type="number" value={episodeDraft.episodeNo ?? ""} onChange={(event) => patchEpisodeDraft({ episodeNo: event.target.value ? Number(event.target.value) : null })} />
          </Field>
          <Field label="本集主题">
            <input value={episodeDraft.lessonOrTheme} onChange={(event) => patchEpisodeDraft({ lessonOrTheme: event.target.value })} />
          </Field>
          <Field label="核心看点 / 道理">
            <input value={episodeDraft.moralLesson} onChange={(event) => patchEpisodeDraft({ moralLesson: event.target.value })} />
          </Field>
          <Field label="来源 / 灵感">
            <input value={episodeDraft.sourceStory} onChange={(event) => patchEpisodeDraft({ sourceStory: event.target.value })} />
          </Field>
          <Field label="剧情梗概">
            <textarea rows={3} value={episodeDraft.synopsis} onChange={(event) => patchEpisodeDraft({ synopsis: event.target.value })} />
          </Field>
          <Field label="Prompt seed">
            <textarea rows={3} value={episodeDraft.promptSeed} onChange={(event) => patchEpisodeDraft({ promptSeed: event.target.value })} />
          </Field>
          <Field label="目标受众 / 年龄层">
            <input value={episodeDraft.ageRange} onChange={(event) => patchEpisodeDraft({ ageRange: event.target.value })} />
          </Field>
          <Field label="风险提示">
            <input value={episodeDraft.riskNotes} onChange={(event) => patchEpisodeDraft({ riskNotes: event.target.value })} />
          </Field>
          <Field label="互动结尾">
            <textarea rows={2} value={episodeDraft.interactiveEnding} onChange={(event) => patchEpisodeDraft({ interactiveEnding: event.target.value })} />
          </Field>
          <AssetCheckboxGroup
            assets={characterAssets}
            label="本集出场角色"
            selectedIds={episodeDraft.selectedCharacterAssetIds}
            onChange={(ids) => patchEpisodeDraft({ selectedCharacterAssetIds: ids })}
          />
          <AssetCheckboxGroup
            assets={sceneAssets}
            label="本集使用场景"
            selectedIds={episodeDraft.selectedSceneAssetIds}
            onChange={(ids) => patchEpisodeDraft({ selectedSceneAssetIds: ids })}
          />
          <EditableActionBar
            isDirty={episodeEditor.isDirty}
            onCancel={episodeEditor.resetDraft}
            onSave={() => saveEpisodeDraft()}
          />
        </div>
      ) : null}
    </div>
  );
}

function AssetCheckboxGroup(props: { assets: ProductionAsset[]; label: string; onChange: (ids: string[]) => void; selectedIds: string[] }) {
  return (
    <div className="series-asset-binding episode-asset-binding">
      {props.assets.length === 0 ? (
        <span className="muted">还没有可用资产。先到设计资产中心生成并保存。</span>
      ) : (
        <AssetBindingPicker
          assets={props.assets}
          compact
          description="只影响这一集；保存后转 Case 会带入所选资产。"
          label={props.label}
          selectedIds={props.selectedIds}
          onChange={props.onChange}
        />
      )}
    </div>
  );
}

function AssetBindingPicker(props: {
  assets: ProductionAsset[];
  compact?: boolean;
  description: string;
  label: string;
  onChange: (ids: string[]) => void;
  selectedIds: string[];
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ProductionAsset["type"] | "all">("all");
  const selectedAssets = props.selectedIds
    .map((id) => props.assets.find((asset) => asset._id === id) ?? null)
    .filter((asset): asset is ProductionAsset => Boolean(asset));
  const availableTypes = assetPickerTypeOrder.filter((type) => props.assets.some((asset) => asset.type === type));
  const normalizedQuery = query.trim().toLowerCase();
  const filteredAssets = props.assets.filter((asset) => {
    const matchesType = typeFilter === "all" || asset.type === typeFilter;
    const searchable = [asset.label, asset.folderName, asset.prompt, asset.notes, assetTypeLabel(asset.type)].join(" ").toLowerCase();

    return matchesType && (!normalizedQuery || searchable.includes(normalizedQuery));
  });

  function toggle(id: string) {
    props.onChange(props.selectedIds.includes(id) ? props.selectedIds.filter((currentId) => currentId !== id) : [...props.selectedIds, id]);
  }

  function remove(id: string) {
    props.onChange(props.selectedIds.filter((currentId) => currentId !== id));
  }

  return (
    <div className={`asset-binding-picker ${props.compact ? "compact" : ""}`}>
      <div className="asset-binding-header">
        <div>
          <strong>{props.label}</strong>
          <span>{props.description}</span>
        </div>
        <em>{selectedAssets.length} 已选</em>
      </div>

      {selectedAssets.length > 0 ? (
        <div className="asset-selected-strip" aria-label="已选资产">
          {selectedAssets.map((asset) => (
            <button key={asset._id} type="button" onClick={() => remove(asset._id)} title={`移除 ${asset.label}`}>
              {assetBindingThumbUrl(asset) ? <img alt={asset.label} src={assetBindingThumbUrl(asset)} /> : <ImageIcon size={16} />}
              <span>{asset.label}</span>
              <X size={14} />
            </button>
          ))}
        </div>
      ) : null}

      <div className="asset-picker-controls">
        <label className="asset-picker-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、文件夹、prompt" />
        </label>
        <div className="asset-type-filter">
          <button className={typeFilter === "all" ? "active" : ""} type="button" onClick={() => setTypeFilter("all")}>
            全部
          </button>
          {availableTypes.map((type) => (
            <button key={type} className={typeFilter === type ? "active" : ""} type="button" onClick={() => setTypeFilter(type)}>
              {assetTypeLabel(type)}
            </button>
          ))}
        </div>
      </div>

      {filteredAssets.length === 0 ? (
        <EmptyState title="没有符合筛选的资产" body="换一个类型或搜索关键词。" />
      ) : (
        <div className="asset-picker-grid">
          {filteredAssets.map((asset) => {
            const selected = props.selectedIds.includes(asset._id);

            return (
              <button key={asset._id} className={`asset-picker-tile ${selected ? "selected" : ""}`} type="button" onClick={() => toggle(asset._id)} title={`${asset.label} / ${assetTypeLabel(asset.type)} / ${asset.folderName}`}>
                <span className="asset-picker-thumb">
                  {assetBindingThumbUrl(asset) ? <img src={assetBindingThumbUrl(asset)} alt={asset.label} /> : <ImageIcon size={22} />}
                  <span className="asset-picker-check">{selected ? <CheckCircle2 size={17} /> : null}</span>
                </span>
                <strong>{asset.label}</strong>
                <small>{assetTypeLabel(asset.type)} · {asset.folderName || "未分类"}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function seriesStatusLabel(status: ContentSeriesStatus): string {
  const labels: Record<ContentSeriesStatus, string> = {
    active: "启用",
    archived: "归档",
    draft: "草稿",
    paused: "暂停"
  };
  return labels[status];
}

function episodeStatusLabel(status: SeriesEpisodeIdeaStatus): string {
  const labels: Record<SeriesEpisodeIdeaStatus, string> = {
    approved: "已批准",
    converted_to_case: "已转 Case",
    draft: "草稿",
    rejected: "已拒绝"
  };
  return labels[status];
}

function assetBindingUrl(asset: ProductionAsset): string {
  return resolveFirstMediaUrl([asset.url, asset.storagePath]);
}

function assetBindingThumbUrl(asset: ProductionAsset): string {
  const mediaUrl = assetBindingUrl(asset);
  return isImageMediaUrl(mediaUrl) ? mediaUrl : "";
}

function assetTypeLabel(type: ProductionAsset["type"]): string {
  const labels: Record<ProductionAsset["type"], string> = {
    bgm_reference: "BGM 参考",
    character_design: "角色设计",
    first_frame: "首帧",
    last_frame: "尾帧",
    scene_design: "场景设定表",
    style_reference: "风格参考"
  };
  return labels[type];
}

const assetPickerTypeOrder: ProductionAsset["type"][] = [
  "character_design",
  "scene_design",
  "style_reference",
  "first_frame",
  "last_frame",
  "bgm_reference"
];
