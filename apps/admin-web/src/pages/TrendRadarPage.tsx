import { AlertTriangle, ExternalLink, Search, Sparkles, Trash2 } from "lucide-react";
import type { TrendIdeaSeed, TrendVideoCandidate } from "@ai-content-factory/shared-types";
import { EmptyState, Field, MediaImage, SectionHeader, StatusPill } from "../components/ui.js";
import type { TrendReport } from "../lib/admin-data.js";

interface TrendRadarPageProps {
  applyAiNichePreset: () => void;
  categoryId: string;
  clearReports: () => void;
  currentReport: TrendReport | null;
  excludeKeywords: string;
  includeKeywords: string;
  isScanning: boolean;
  language: "zh-CN" | "en-US";
  languageMode: "loose" | "strict";
  maxResults: number;
  minVelocityScore: number;
  minViews: number;
  publishedWithinDays: number;
  query: string;
  regionCode: string;
  reports: TrendReport[];
  runTrendScan: () => void;
  safeMode: "standard" | "strict";
  scanError: string | null;
  setCategoryId: (value: string) => void;
  setExcludeKeywords: (value: string) => void;
  setIncludeKeywords: (value: string) => void;
  setLanguage: (value: "zh-CN" | "en-US") => void;
  setLanguageMode: (value: "loose" | "strict") => void;
  setMaxResults: (value: number) => void;
  setMinVelocityScore: (value: number) => void;
  setMinViews: (value: number) => void;
  setPublishedWithinDays: (value: number) => void;
  setQuery: (value: string) => void;
  setRegionCode: (value: string) => void;
  setSafeMode: (value: "standard" | "strict") => void;
  useIdeaSeed: (seed: TrendIdeaSeed) => void;
}

export function TrendRadarPage(props: TrendRadarPageProps) {
  return (
    <section className="trend-radar-shell">
      <section className="panel trend-command-panel">
        <SectionHeader
          eyebrow="Market research"
          title="Trend Radar"
          action={
            <>
              <button className="secondary-button" type="button" onClick={props.applyAiNichePreset}>
                <Sparkles size={15} />
                AI niche preset
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => window.confirm("确定清空趋势扫描历史？") && props.clearReports()}
                disabled={props.reports.length === 0}
              >
                <Trash2 size={15} />
                Clear history
              </button>
            </>
          }
        />
        <form
          className="trend-scan-form"
          onSubmit={(event) => {
            event.preventDefault();
            props.runTrendScan();
          }}
        >
          <Field className="trend-query-field" label="Search topic / market angle">
            <input value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="shorts story, comedy sketch, romance shorts..." />
          </Field>
          <Field label="Region">
            <input value={props.regionCode} maxLength={2} onChange={(event) => props.setRegionCode(event.target.value.toUpperCase())} />
          </Field>
          <Field label="Window">
            <select value={props.publishedWithinDays} onChange={(event) => props.setPublishedWithinDays(Number(event.target.value))}>
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </Field>
          <Field label="Language">
            <select value={props.language} onChange={(event) => props.setLanguage(event.target.value === "en-US" ? "en-US" : "zh-CN")}>
              <option value="zh-CN">zh-CN</option>
              <option value="en-US">en-US</option>
            </select>
          </Field>
          <Field label="Results">
            <select value={props.maxResults} onChange={(event) => props.setMaxResults(Number(event.target.value))}>
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
            </select>
          </Field>
          <Field label="Safety">
            <select value={props.safeMode} onChange={(event) => props.setSafeMode(event.target.value === "standard" ? "standard" : "strict")}>
              <option value="strict">Strict safe</option>
              <option value="standard">Standard</option>
            </select>
          </Field>
          <button className="primary-button trend-scan-button" type="submit" disabled={props.isScanning || !props.query.trim()}>
            <Search size={16} />
            {props.isScanning ? "Scanning..." : "Scan YouTube"}
          </button>
        </form>
        <div className="trend-filter-grid">
          <Field label="Category">
            <select value={props.categoryId} onChange={(event) => props.setCategoryId(event.target.value)}>
              <option value="">Any video category</option>
              <option value="1">Film & Animation</option>
              <option value="22">People & Blogs</option>
              <option value="23">Comedy</option>
              <option value="24">Entertainment</option>
              <option value="26">Howto & Style</option>
              <option value="27">Education</option>
              <option value="28">Science & Technology</option>
            </select>
          </Field>
          <Field label="Language match">
            <select value={props.languageMode} onChange={(event) => props.setLanguageMode(event.target.value === "strict" ? "strict" : "loose")}>
              <option value="loose">Loose</option>
              <option value="strict">Strict target language</option>
            </select>
          </Field>
          <Field label="Must include">
            <input value={props.includeKeywords} onChange={(event) => props.setIncludeKeywords(event.target.value)} placeholder="comma separated" />
          </Field>
          <Field label="Exclude">
            <input value={props.excludeKeywords} onChange={(event) => props.setExcludeKeywords(event.target.value)} placeholder="kids, prank, gore..." />
          </Field>
          <Field label="Min views">
            <input min={0} type="number" value={props.minViews} onChange={(event) => props.setMinViews(Number(event.target.value))} />
          </Field>
          <Field label="Min views/hour">
            <input min={0} type="number" value={props.minVelocityScore} onChange={(event) => props.setMinVelocityScore(Number(event.target.value))} />
          </Field>
        </div>
        <div className="trend-policy-note">
          <StatusPill tone="active">Real API only</StatusPill>
          <span>Strict safe mode filters mature, violent, minor-related, low relevance, and excluded-keyword videos after the YouTube API scan.</span>
        </div>
        {props.scanError ? (
          <div className="trend-error">
            <AlertTriangle size={17} />
            <span>{props.scanError}</span>
          </div>
        ) : null}
      </section>

      <section className="trend-radar-grid">
        <section className="panel trend-main-panel">
          <SectionHeader
            eyebrow="Detected patterns"
            title={props.currentReport ? `${props.currentReport.query} / ${props.currentReport.regionCode}` : "No scan yet"}
            action={props.currentReport ? <StatusPill tone={props.currentReport.status === "ready" ? "success" : "warning"}>{props.currentReport.status}</StatusPill> : null}
          />
          {!props.currentReport ? <EmptyState title="No trend scan" body="Enter a topic, then scan YouTube to find current Shorts patterns and reusable idea seeds." /> : null}
          {props.currentReport?.status === "blocked" ? (
            <div className="trend-blocker">
              <AlertTriangle size={18} />
              <div>
                <strong>Trend Radar needs setup</strong>
                <span>{props.currentReport.blocker ?? "Configure YOUTUBE_API_KEY before scanning."}</span>
              </div>
            </div>
          ) : null}
          {props.currentReport?.status === "ready" ? (
            <>
              <div className="trend-summary-strip">
                <TrendMetric label="Videos" value={String(props.currentReport.videos.length)} />
                <TrendMetric label="Patterns" value={String(props.currentReport.patterns.length)} />
                <TrendMetric label="Filtered" value={String(props.currentReport.filteredOut.length)} />
                <TrendMetric label="Quota units" value={String(props.currentReport.quotaUnits)} />
              </div>
              {props.currentReport.filterSummary.length > 0 ? (
                <div className="trend-filter-summary">
                  {props.currentReport.filterSummary.map((item) => (
                    <StatusPill key={item.reason} tone="warning">{formatFilterReason(item.reason)} {item.count}</StatusPill>
                  ))}
                </div>
              ) : null}
              {props.currentReport.patterns.length === 0 ? (
                <EmptyState title="No strong pattern found" body="The scan completed, but the candidate set did not show enough shared signals. Try a more specific topic or wider time window." />
              ) : (
                <div className="trend-pattern-grid">
                  {props.currentReport.patterns.map((pattern) => (
                    <article className="trend-pattern-card" key={pattern.label}>
                      <div>
                        <strong>{pattern.label}</strong>
                        <span>{pattern.summary}</span>
                      </div>
                      <div className="trend-pattern-metrics">
                        <StatusPill tone="active">{pattern.count} videos</StatusPill>
                        <StatusPill tone="neutral">score {pattern.score}</StatusPill>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </section>

        <aside className="panel trend-side-panel">
          <SectionHeader eyebrow="Idea seeds" title="Use in New Case" />
          {!props.currentReport || props.currentReport.ideaSeeds.length === 0 ? (
            <EmptyState title="No idea seeds" body="Run a successful scan to generate original case prompts from current market signals." />
          ) : (
            <div className="trend-seed-list">
              {props.currentReport.ideaSeeds.map((seed) => {
                const referenceVideos = getReferenceVideos(seed, props.currentReport?.videos ?? []);

                return (
                  <article className="trend-seed-card" key={`${seed.topic}-${seed.hook}`}>
                    <div>
                      <strong>{seed.topic}</strong>
                      <span>{seed.hook}</span>
                    </div>
                    <p>{seed.angle}</p>
                    <div className="trend-seed-meta">
                      <StatusPill tone="success">{seed.genre}</StatusPill>
                      <StatusPill tone="neutral">{Math.round(seed.confidence * 100)}% confidence</StatusPill>
                    </div>
                    <small>{seed.whyNow}</small>
                    {referenceVideos.length > 0 ? <ReferenceVideoStrip videos={referenceVideos} /> : null}
                    <button className="primary-button compact-button" type="button" onClick={() => props.useIdeaSeed(seed)}>
                      <Sparkles size={14} />
                      Use as case
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </aside>
      </section>

      <section className="panel trend-video-panel">
        <SectionHeader eyebrow="Source videos" title="Candidate Shorts" />
        {!props.currentReport || props.currentReport.videos.length === 0 ? (
          <EmptyState title="No source videos" body="Trend Radar will list real YouTube candidates here after a successful scan." />
        ) : (
          <div className="trend-video-table">
            <div className="trend-video-header">
              <span>Video</span>
              <span>Signals</span>
              <span>Views</span>
              <span>Velocity</span>
              <span>Engagement</span>
              <span>Link</span>
            </div>
            {props.currentReport.videos.map((video) => (
              <article className="trend-video-row" key={video.id}>
                <div className="trend-video-title-cell">
                  {video.thumbnailUrl ? <MediaImage alt={video.title} src={video.thumbnailUrl} fallbackLabel="缩略图不可用" /> : <span className="trend-thumb-placeholder" />}
                  <div>
                    <strong>{video.title}</strong>
                    <span>{video.channelTitle} / {formatDuration(video.durationSeconds)} / {formatDate(video.publishedAt)}</span>
                  </div>
                </div>
                <span className="trend-signal-list">{video.matchedSignals.length ? video.matchedSignals.join(", ") : "No shared signal"}</span>
                <span>{formatNumber(video.viewCount)}</span>
                <span>{formatNumber(video.velocityScore)}/h</span>
                <span>{formatPercent(video.engagementRate)}</span>
                <a className="icon-button" href={video.url} target="_blank" rel="noreferrer" aria-label="Open YouTube video">
                  <ExternalLink size={15} />
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function TrendMetric(props: { label: string; value: string }) {
  return (
    <div className="trend-metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function ReferenceVideoStrip(props: { videos: TrendVideoCandidate[] }) {
  return (
    <div className="trend-reference-strip">
      <span className="trend-reference-label">Reference examples</span>
      {props.videos.map((video) => (
        <a className="trend-reference-video" href={video.url} key={video.id} target="_blank" rel="noreferrer">
          {video.thumbnailUrl ? <MediaImage alt={video.title} src={video.thumbnailUrl} fallbackLabel="缩略图不可用" /> : <span className="trend-thumb-placeholder" />}
          <div>
            <strong>{video.title}</strong>
            <span>{formatNumber(video.viewCount)} views / {formatNumber(video.velocityScore)}/h</span>
          </div>
          <ExternalLink size={14} />
        </a>
      ))}
    </div>
  );
}

function getReferenceVideos(seed: TrendIdeaSeed, videos: TrendVideoCandidate[]): TrendVideoCandidate[] {
  const videosById = new Map(videos.map((video) => [video.id, video]));
  return seed.evidenceVideoIds.map((id) => videosById.get(id)).filter((video): video is TrendVideoCandidate => Boolean(video)).slice(0, 3);
}

function formatFilterReason(reason: string): string {
  const labels: Record<string, string> = {
    below_min_velocity: "Low velocity",
    below_min_views: "Low views",
    excluded_keyword: "Excluded keyword",
    language_mismatch: "Language mismatch",
    low_relevance: "Low relevance",
    mature_or_unsafe: "Unsafe",
    minor_or_kids_related: "Minor/kids",
    missing_include_keyword: "Missing include",
    too_long: "Too long"
  };

  return labels[reason] ?? reason;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}
