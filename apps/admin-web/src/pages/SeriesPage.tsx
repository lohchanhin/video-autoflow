import { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, FileVideo, Loader2, Plus, RefreshCw, Sparkles, Trash2, XCircle } from "lucide-react";
import type { ContentSeries, ContentSeriesStatus, ProductionAsset, SeriesEpisodeIdea, SeriesEpisodeIdeaStatus } from "@ai-content-factory/shared-types";
import { EditableActionBar, EmptyState, Field, SectionHeader, StatusPill } from "../components/ui.js";
import { confirmDiscardDirtyDraft, createDraftPatch, useEditableDraft } from "../lib/editable-draft.js";
import type { AdminJob } from "../lib/jobs.js";
import { formatDateTime } from "../lib/view-helpers.js";

interface SeriesPageProps {
  assets: ProductionAsset[];
  convertEpisodeToCase: (series: ContentSeries, episode: SeriesEpisodeIdea) => void;
  createSeries: () => void;
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
  updateEpisode: (seriesId: string, episodeId: string, patch: Partial<Omit<SeriesEpisodeIdea, "_id" | "createdAt" | "seriesId" | "updatedAt">>) => Promise<void> | void;
  updateSeries: (id: string, patch: Partial<Omit<ContentSeries, "_id" | "createdAt" | "updatedAt">>) => Promise<void> | void;
  openCase: (id: string) => void;
}

const seriesStatusOptions: ContentSeriesStatus[] = ["draft", "active", "paused", "archived"];
const episodeStatusOptions: SeriesEpisodeIdeaStatus[] = ["draft", "approved", "converted_to_case", "rejected"];

export function SeriesPage(props: SeriesPageProps) {
  const [ideaCount, setIdeaCount] = useState(10);
  const selectedSeries = props.series.find((series) => series._id === props.selectedSeriesId) ?? props.series[0] ?? null;
  const seriesEditor = useEditableDraft(selectedSeries, selectedSeries ? `${selectedSeries._id}:${selectedSeries.updatedAt}` : null);
  const seriesDraft = seriesEditor.draft;
  const selectedSeriesJobs = selectedSeries ? props.jobs.filter((job) => job.seriesId === selectedSeries._id) : [];
  const generatedAssets = props.assets.filter((asset) => Boolean(asset.url.trim()) && (asset.status === "ready" || asset.status === "approved"));
  const selectedReferenceIds = new Set(seriesDraft?.referenceAssetIds ?? []);
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
                <SectionHeader eyebrow="资产绑定" title="固定角色 / 场景 / 风格参考" />
                {generatedAssets.length === 0 ? (
                  <EmptyState title="还没有可绑定资产" body="先到设计资产中心生成并保存角色三视图、场景设定表或风格参考，再回到这里绑定。" />
                ) : (
                  <div className="series-asset-grid">
                    {generatedAssets.map((asset) => (
                      <label key={asset._id} className={`series-asset-option ${selectedReferenceIds.has(asset._id) ? "selected" : ""}`}>
                        <input
                          checked={selectedReferenceIds.has(asset._id)}
                          type="checkbox"
                          onChange={(event) => patchSeriesDraft({
                            referenceAssetIds: event.target.checked
                              ? [...selectedReferenceIds, asset._id]
                              : seriesDraft.referenceAssetIds.filter((id) => id !== asset._id)
                          })}
                        />
                        <span>{asset.url ? <img src={asset.url} alt={asset.label} /> : null}</span>
                        <strong>{asset.label}</strong>
                        <small>{assetTypeLabel(asset.type)} / {asset.folderName}</small>
                      </label>
                    ))}
                  </div>
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
