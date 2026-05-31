import type {
  TrendAppliedFilters,
  TrendFilteredVideo,
  TrendFilterSummary,
  TrendIdeaSeed,
  TrendPattern,
  TrendScanRequest,
  TrendScanResponse,
  TrendVideoCandidate
} from "@ai-content-factory/shared-types";
import { ApiError } from "../../errors.js";

interface TrendScanServiceOptions {
  baseUrl?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
  getApiKey?: (() => string | undefined) | undefined;
  maxShortSeconds?: number | undefined;
  now?: (() => Date) | undefined;
}

export interface TrendScanService {
  scanTrends(input: TrendScanRequest): Promise<TrendScanResponse>;
}

interface YouTubeSearchListResponse {
  items?: Array<{
    id?: {
      videoId?: string | undefined;
    } | undefined;
    snippet?: YouTubeSnippet | undefined;
  }> | undefined;
}

interface YouTubeVideoListResponse {
  items?: YouTubeVideoItem[] | undefined;
}

interface YouTubeVideoItem {
  contentDetails?: {
    duration?: string | undefined;
  } | undefined;
  id?: string | undefined;
  snippet?: YouTubeSnippet | undefined;
  statistics?: {
    commentCount?: string | undefined;
    likeCount?: string | undefined;
    viewCount?: string | undefined;
  } | undefined;
}

interface YouTubeSnippet {
  categoryId?: string | undefined;
  channelTitle?: string | undefined;
  description?: string | undefined;
  publishedAt?: string | undefined;
  thumbnails?: {
    default?: { url?: string | undefined } | undefined;
    medium?: { url?: string | undefined } | undefined;
    high?: { url?: string | undefined } | undefined;
  } | undefined;
  title?: string | undefined;
}

interface SignalDefinition {
  id: string;
  label: string;
  summaryEn: string;
  summaryZh: string;
  test: RegExp;
}

interface InternalPattern extends TrendPattern {
  signalId: string;
}

const defaultBaseUrl = "https://www.googleapis.com/youtube/v3";
const defaultMaxShortSeconds = 180;

const genericQueryTerms = new Set([
  "short",
  "shorts",
  "story",
  "stories",
  "video",
  "videos",
  "viral",
  "trend",
  "trending",
  "youtube",
  "yt",
  "短片",
  "短剧",
  "影片",
  "视频",
  "故事",
  "热门",
  "趋势"
]);

const matureUnsafePattern = /\b(18\+|adult|nsfw|sex|sexy|porn|nude|naked|onlyfans|erotic|strip|bikini|lingerie|rape|molest|suicide|self[-\s]?harm|gore|bloody|blood|murder|kill|killing|knife|gun|drug|cocaine|weed)\b|色情|成人|裸|性感|情色|自慰|强奸|猥亵|自杀|自残|血腥|鲜血|杀人|砍|枪|毒品|大麻/iu;
const minorPattern = /\b(kids?|children|child|baby|toddler|minor|schoolboy|schoolgirl)\b|儿童|小孩|幼儿|宝宝|未成年|小学生|中学生|校园欺凌/iu;
const strictUnsafePattern = /\b(prank gone wrong|kiss prank|hot girl|fight|violent|abuse|harassment|creepy girl)\b|恶搞搭讪|亲吻挑战|擦边|火辣|打架|暴力|霸凌|骚扰/iu;

const signalDefinitions: SignalDefinition[] = [
  {
    id: "pov",
    label: "POV hook",
    summaryEn: "First-person framing appears in the opening title or description.",
    summaryZh: "标题或描述使用第一人称 / POV 开场，适合做强代入感短片。",
    test: /\b(pov|when you|i thought|i found)\b|当你|如果你|我以为|我发现|第一人称/iu
  },
  {
    id: "storytime",
    label: "Storytime confession",
    summaryEn: "The video uses confession, memory, or personal story framing.",
    summaryZh: "近期候选片常用亲历 / 回忆 / 讲故事口吻，适合转成虚构剧情。",
    test: /\b(storytime|true story|my story)\b|故事|那天|亲身|经历|我遇到/iu
  },
  {
    id: "rules",
    label: "Rules / warnings",
    summaryEn: "Warning and rule-based hooks are visible in titles.",
    summaryZh: "规则、警告、千万不要类型开场有较强点击动机。",
    test: /\b(rule|rules|warning|do not|never)\b|规则|警告|千万不要|不要|禁忌/iu
  },
  {
    id: "twist",
    label: "Twist ending",
    summaryEn: "The candidate set leans on final reveals or reversal language.",
    summaryZh: "标题强调反转、结局、没想到，适合做 45 秒递进式故事。",
    test: /\b(twist|ending|plot twist|reveal)\b|反转|结局|最后|没想到|真相/iu
  },
  {
    id: "countdown",
    label: "Numbered hook",
    summaryEn: "Numbers, countdowns, or list framing are present.",
    summaryZh: "数字化标题容易快速传达结构，例如 3 条规则、5 秒决定。",
    test: /\b\d+\b|[一二三四五六七八九十两]个|第[一二三四五六七八九十]/iu
  },
  {
    id: "surveillance",
    label: "Recorded footage",
    summaryEn: "Camera, CCTV, or recorded evidence framing is present.",
    summaryZh: "监控、录像、手机拍到的证据类包装适合做低成本视觉短片。",
    test: /\b(cctv|camera|footage|recorded|recording)\b|监控|录像|录影|摄像|拍到/iu
  },
  {
    id: "comedy",
    label: "Comedy sketch",
    summaryEn: "Comedy, sketch, or awkward social situation signals appear.",
    summaryZh: "喜剧短剧信号明显，可转成办公室、家庭、约会等轻剧情。",
    test: /\b(comedy|funny|sketch|awkward)\b|喜剧|搞笑|短剧|尴尬|社死/iu
  },
  {
    id: "romance",
    label: "Romance tension",
    summaryEn: "Dating, love, breakup, or relationship hooks appear.",
    summaryZh: "爱情 / 关系张力类题材适合做误会、选择、反转告白。",
    test: /\b(romance|love|dating|breakup|relationship)\b|爱情|恋爱|约会|分手|告白|暗恋/iu
  },
  {
    id: "ai",
    label: "AI curiosity",
    summaryEn: "The video references AI tools, chatbots, or synthetic media.",
    summaryZh: "AI 相关标题仍有好奇心红利，可转成工具实验或剧情设定。",
    test: /\b(ai|chatgpt|artificial intelligence)\b|人工智能|生成式|机器人/iu
  },
  {
    id: "explainer",
    label: "Fast explainer",
    summaryEn: "Tutorial, fact, or explanation framing appears.",
    summaryZh: "快速解释 / 知识型结构适合做信息密度较高的 Shorts。",
    test: /\b(how to|tutorial|explained|facts?)\b|教程|科普|解释|为什么|知识/iu
  }
];

export function createTrendScanService(options: TrendScanServiceOptions = {}): TrendScanService {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/$/u, "");
  const maxShortSeconds = options.maxShortSeconds ?? defaultMaxShortSeconds;

  return {
    async scanTrends(input) {
      const request = normalizeTrendScanRequest(input);
      const apiKey = options.getApiKey?.()?.trim();
      const scanTime = now();
      const publishedAfter = new Date(scanTime.getTime() - request.publishedWithinDays * 24 * 60 * 60 * 1000).toISOString();

      if (!apiKey) {
        return createBlockedResponse(request, publishedAfter, scanTime, maxShortSeconds);
      }

      const searchUrl = buildUrl(baseUrl, "search", {
        key: apiKey,
        maxResults: String(Math.min(50, Math.max(request.maxResults * 2, request.maxResults))),
        order: "viewCount",
        part: "snippet",
        publishedAfter,
        q: buildSearchQuery(request),
        regionCode: request.regionCode,
        relevanceLanguage: request.language === "zh-CN" ? "zh" : "en",
        safeSearch: request.safeMode === "strict" ? "strict" : "moderate",
        type: "video",
        videoDuration: "short",
        ...(request.categoryId ? { videoCategoryId: request.categoryId } : {})
      });

      const searchResponse = await fetchYouTubeJson<YouTubeSearchListResponse>(fetchImpl, searchUrl, "YouTube trend search failed");
      const videoIds = uniqueIds((searchResponse.items ?? []).map((item) => item.id?.videoId).filter(isNonEmptyString));

      if (videoIds.length === 0) {
        return createReadyResponse({
          filteredOut: [],
          filterSummary: [],
          filters: request.filters,
          ideaSeeds: [],
          maxShortSeconds,
          patterns: [],
          publishedAfter,
          query: request.query,
          quotaUnits: 100,
          regionCode: request.regionCode,
          scannedAt: scanTime.toISOString(),
          videos: []
        });
      }

      const videosUrl = buildUrl(baseUrl, "videos", {
        id: videoIds.join(","),
        key: apiKey,
        part: "snippet,statistics,contentDetails"
      });
      const videosResponse = await fetchYouTubeJson<YouTubeVideoListResponse>(fetchImpl, videosUrl, "YouTube video detail lookup failed");
      const filterResult = filterVideoCandidates(buildVideoCandidates(videosResponse.items ?? [], scanTime), request, maxShortSeconds);
      const videos = filterResult.videos.slice(0, request.maxResults);
      const patterns = buildPatterns(videos, request.language);
      const ideaSeeds = buildIdeaSeeds(request, patterns, videos);

      return createReadyResponse({
        filteredOut: filterResult.filteredOut,
        filterSummary: filterResult.filterSummary,
        filters: request.filters,
        ideaSeeds,
        maxShortSeconds,
        patterns,
        publishedAfter,
        query: request.query,
        quotaUnits: 101,
        regionCode: request.regionCode,
        scannedAt: scanTime.toISOString(),
        videos
      });
    }
  };
}

function normalizeTrendScanRequest(input: TrendScanRequest): TrendScanRequest & { filters: TrendAppliedFilters; maxResults: number } {
  const query = input.query.trim();

  if (!query) {
    throw new ApiError("Trend scan query is required.", 400, "BAD_REQUEST");
  }

  const filters: TrendAppliedFilters = {
    excludeKeywords: splitKeywordList(input.excludeKeywords),
    includeKeywords: splitKeywordList(input.includeKeywords),
    languageMode: input.languageMode === "strict" ? "strict" : "loose",
    minVelocityScore: clampNumber(input.minVelocityScore ?? 0, 0, 1_000_000),
    minViews: clampNumber(input.minViews ?? 0, 0, 1_000_000_000),
    safeMode: input.safeMode === "standard" ? "standard" : "strict",
    ...(isValidCategoryId(input.categoryId) ? { categoryId: input.categoryId.trim() } : {})
  };

  return {
    excludeKeywords: filters.excludeKeywords.join(", "),
    includeKeywords: filters.includeKeywords.join(", "),
    filters,
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    language: input.language === "en-US" ? "en-US" : "zh-CN",
    languageMode: filters.languageMode,
    maxResults: clampNumber(input.maxResults ?? 15, 5, 25),
    minVelocityScore: filters.minVelocityScore,
    minViews: filters.minViews,
    publishedWithinDays: clampNumber(input.publishedWithinDays, 1, 30),
    query,
    regionCode: normalizeRegionCode(input.regionCode),
    safeMode: filters.safeMode
  };
}

function normalizeRegionCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/u.test(normalized) ? normalized : "MY";
}

function buildUrl(baseUrl: string, path: string, params: Record<string, string>): string {
  const searchParams = new URLSearchParams(params);
  return `${baseUrl}/${path}?${searchParams.toString()}`;
}

function buildSearchQuery(request: TrendScanRequest & { filters: TrendAppliedFilters }): string {
  const excludes = request.filters.excludeKeywords.map((keyword) => `-${keyword.replace(/\s+/gu, "")}`);
  return [request.query, ...request.filters.includeKeywords, ...excludes].filter(Boolean).join(" ");
}

async function fetchYouTubeJson<T>(fetchImpl: typeof fetch, url: string, fallbackMessage: string): Promise<T> {
  let response: Response;

  try {
    response = await fetchImpl(url);
  } catch {
    throw new ApiError(`${fallbackMessage}: provider request failed.`, 502, "PROVIDER_ERROR");
  }

  if (!response.ok) {
    throw new ApiError(`${fallbackMessage}: YouTube returned HTTP ${response.status}.`, 502, "PROVIDER_ERROR");
  }

  return (await response.json()) as T;
}

function buildVideoCandidates(items: YouTubeVideoItem[], scanTime: Date): TrendVideoCandidate[] {
  return items
    .map((item) => toTrendVideoCandidate(item, scanTime))
    .filter((candidate): candidate is TrendVideoCandidate => candidate !== null)
    .sort((left, right) => right.velocityScore - left.velocityScore || right.viewCount - left.viewCount);
}

function toTrendVideoCandidate(item: YouTubeVideoItem, scanTime: Date): TrendVideoCandidate | null {
  const id = item.id;
  const title = item.snippet?.title?.trim();
  const publishedAt = item.snippet?.publishedAt;

  if (!id || !title || !publishedAt) {
    return null;
  }

  const durationSeconds = parseIsoDurationSeconds(item.contentDetails?.duration ?? "");

  if (durationSeconds <= 0) {
    return null;
  }

  const viewCount = parseCount(item.statistics?.viewCount);
  const likeCount = parseCount(item.statistics?.likeCount);
  const commentCount = parseCount(item.statistics?.commentCount);
  const publishedDate = new Date(publishedAt);
  const ageHours = Math.max((scanTime.getTime() - publishedDate.getTime()) / (60 * 60 * 1000), 1);
  const rawVelocity = viewCount / ageHours;
  const text = `${title}\n${item.snippet?.description ?? ""}`;

  return {
    channelTitle: item.snippet?.channelTitle?.trim() || "Unknown channel",
    commentCount,
    description: item.snippet?.description ?? "",
    durationSeconds,
    engagementRate: viewCount > 0 ? roundNumber((likeCount + commentCount) / viewCount, 4) : 0,
    id,
    likeCount,
    matchedSignals: signalDefinitions.filter((signal) => signal.test.test(text)).map((signal) => signal.label),
    publishedAt,
    thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? "",
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    velocityScore: roundNumber(rawVelocity, 2),
    viewCount,
    ...(item.snippet?.categoryId ? { categoryId: item.snippet.categoryId } : {})
  };
}

function filterVideoCandidates(
  candidates: TrendVideoCandidate[],
  request: TrendScanRequest & { filters: TrendAppliedFilters },
  maxShortSeconds: number
): { filteredOut: TrendFilteredVideo[]; filterSummary: TrendFilterSummary[]; videos: TrendVideoCandidate[] } {
  const filteredOut: TrendFilteredVideo[] = [];
  const videos: TrendVideoCandidate[] = [];

  for (const candidate of candidates) {
    const reason = getFilterReason(candidate, request, maxShortSeconds);

    if (reason) {
      filteredOut.push({
        id: candidate.id,
        reason,
        title: candidate.title
      });
    } else {
      videos.push(candidate);
    }
  }

  return {
    filteredOut: filteredOut.slice(0, 30),
    filterSummary: summarizeFilterReasons(filteredOut),
    videos
  };
}

function getFilterReason(candidate: TrendVideoCandidate, request: TrendScanRequest & { filters: TrendAppliedFilters }, maxShortSeconds: number): string | null {
  const contentText = `${candidate.title}\n${candidate.description ?? ""}`;
  const text = `${contentText}\n${candidate.channelTitle}`;

  if (candidate.durationSeconds > maxShortSeconds) {
    return "too_long";
  }

  if (matureUnsafePattern.test(text) || (request.filters.safeMode === "strict" && strictUnsafePattern.test(text))) {
    return "mature_or_unsafe";
  }

  if (minorPattern.test(text)) {
    return "minor_or_kids_related";
  }

  const excludedKeyword = request.filters.excludeKeywords.find((keyword) => containsKeyword(text, keyword));

  if (excludedKeyword) {
    return `excluded_keyword:${excludedKeyword}`;
  }

  if (request.filters.includeKeywords.length > 0 && !request.filters.includeKeywords.some((keyword) => containsKeyword(text, keyword))) {
    return "missing_include_keyword";
  }

  if (request.filters.languageMode === "strict" && !matchesTargetLanguage(contentText, request.language)) {
    return "language_mismatch";
  }

  if (candidate.viewCount < request.filters.minViews) {
    return "below_min_views";
  }

  if (candidate.velocityScore < request.filters.minVelocityScore) {
    return "below_min_velocity";
  }

  if (request.filters.safeMode === "strict" && relevanceScore(contentText, request.query) < 1) {
    return "low_relevance";
  }

  return null;
}

function summarizeFilterReasons(filteredOut: TrendFilteredVideo[]): TrendFilterSummary[] {
  const counts = new Map<string, number>();

  for (const item of filteredOut) {
    const reason = item.reason.startsWith("excluded_keyword:") ? "excluded_keyword" : item.reason;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([reason, count]) => ({ count, reason }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}

function buildPatterns(videos: TrendVideoCandidate[], language: TrendScanRequest["language"]): TrendPattern[] {
  const patterns = signalDefinitions
    .map((signal): InternalPattern | null => {
      const matchedVideos = videos.filter((video) => video.matchedSignals.includes(signal.label));

      if (matchedVideos.length === 0) {
        return null;
      }

      return {
        count: matchedVideos.length,
        evidenceVideoIds: matchedVideos.slice(0, 5).map((video) => video.id),
        label: signal.label,
        score: roundNumber(matchedVideos.reduce((total, video) => total + Math.log10(video.viewCount + 10) * (1 + video.engagementRate), 0), 2),
        signalId: signal.id,
        summary: language === "zh-CN" ? signal.summaryZh : signal.summaryEn
      };
    })
    .filter((pattern): pattern is InternalPattern => pattern !== null)
    .sort((left, right) => right.score - left.score || right.count - left.count);

  if (patterns.length === 0 && videos.length > 0) {
    return [
      {
        count: videos.length,
        evidenceVideoIds: videos.slice(0, 5).map((video) => video.id),
        label: "High-velocity short candidates",
        score: roundNumber(videos.reduce((total, video) => total + Math.log10(video.viewCount + 10), 0), 2),
        summary: language === "zh-CN" ? "候选视频暂时没有明显共同标签，但观看速度较高，可作为选题素材池。" : "The candidate set has high view velocity but no dominant shared hook yet."
      }
    ];
  }

  return patterns.slice(0, 6).map(({ signalId: _signalId, ...pattern }) => pattern);
}

function buildIdeaSeeds(request: TrendScanRequest, patterns: TrendPattern[], videos: TrendVideoCandidate[]): TrendIdeaSeed[] {
  const evidenceById = new Map(videos.map((video) => [video.id, video]));

  return patterns.slice(0, 5).map((pattern) => {
    const seedVideos = pattern.evidenceVideoIds.map((id) => evidenceById.get(id)).filter((video): video is TrendVideoCandidate => Boolean(video));
    const genre = inferGenre(request.query, pattern.label, request.language);
    const topic = buildOriginalTopic(request, pattern, genre);
    const hook = request.language === "zh-CN"
      ? `前 3 秒用「${pattern.label}」包装异常结果，再倒回讲清楚原因。`
      : `Open with a ${pattern.label} result in the first 3 seconds, then rewind into the story.`;
    const angle = request.language === "zh-CN"
      ? `参考近期高速度影片的结构信号，但人物、事件、标题全部原创；不要复刻任何视频标题。`
      : "Use the structure signal from recent high-velocity videos while keeping the characters, events, and title original.";
    const whyNow = request.language === "zh-CN"
      ? `${pattern.count} 个近期候选视频出现这个信号，最高观看速度约 ${formatNumber(seedVideos[0]?.velocityScore ?? 0)} views/hour。`
      : `${pattern.count} recent candidates show this signal; top velocity is about ${formatNumber(seedVideos[0]?.velocityScore ?? 0)} views/hour.`;

    return {
      angle,
      confidence: roundNumber(Math.min(0.95, 0.45 + pattern.score / 40), 2),
      evidenceVideoIds: pattern.evidenceVideoIds,
      genre,
      hook,
      topic,
      whyNow
    };
  });
}

function buildOriginalTopic(request: TrendScanRequest, pattern: TrendPattern, genre: string): string {
  if (request.language === "en-US") {
    return `${genre}: an original ${request.query} short using a ${pattern.label} structure`;
  }

  return `${genre}：用「${pattern.label}」结构重写一个关于「${request.query}」的原创 Shorts`;
}

function inferGenre(query: string, patternLabel: string, language: TrendScanRequest["language"]): string {
  const source = `${query} ${patternLabel}`.toLocaleLowerCase();

  if (/(comedy|funny|sketch|喜剧|搞笑|社死)/iu.test(source)) {
    return language === "zh-CN" ? "喜剧短剧" : "Comedy sketch";
  }

  if (/(romance|love|dating|爱情|恋爱|告白)/iu.test(source)) {
    return language === "zh-CN" ? "爱情故事" : "Romance story";
  }

  if (/(fairy|童话|寓言|魔法)/iu.test(source)) {
    return language === "zh-CN" ? "童话故事" : "Fairy tale";
  }

  if (/(horror|rules|cctv|surveillance|恐怖|规则|监控|诡异)/iu.test(source)) {
    return language === "zh-CN" ? "悬疑故事" : "Suspense story";
  }

  return language === "zh-CN" ? "剧情短片" : "Short story";
}

function splitKeywordList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return Array.from(new Set(value.split(/[,，\n]/u).map((keyword) => keyword.trim()).filter(Boolean))).slice(0, 20);
}

function isValidCategoryId(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{1,3}$/u.test(value.trim()) && value.trim() !== "0";
}

function containsKeyword(text: string, keyword: string): boolean {
  return text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase());
}

function matchesTargetLanguage(text: string, language: TrendScanRequest["language"]): boolean {
  if (language === "zh-CN") {
    return /[\u3400-\u9fff]/u.test(text);
  }

  const latinLetters = (text.match(/[a-z]/giu) ?? []).length;
  const nonLatinLetters = (text.match(/[^\W\d_\s]/giu) ?? []).filter((letter) => !/[a-z]/iu.test(letter)).length;
  return latinLetters >= 8 && nonLatinLetters <= latinLetters;
}

function relevanceScore(text: string, query: string): number {
  const normalizedText = text.toLocaleLowerCase();
  return queryTokens(query).filter((token) => normalizedText.includes(token.toLocaleLowerCase())).length;
}

function queryTokens(query: string): string[] {
  return query
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !genericQueryTerms.has(token.toLocaleLowerCase()));
}

function parseIsoDurationSeconds(value: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/u.exec(value);

  if (!match) {
    return 0;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);

  return hours * 3600 + minutes * 60 + seconds;
}

function parseCount(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.round(value), min), max);
}

function roundNumber(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function uniqueIds(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function createBlockedResponse(request: TrendScanRequest & { filters?: TrendAppliedFilters | undefined }, publishedAfter: string, scanTime: Date, maxShortSeconds: number): TrendScanResponse {
  return {
    blocker: "Missing YOUTUBE_API_KEY. Add a YouTube Data API key in Keys before running Trend Radar.",
    filteredOut: [],
    filterSummary: [],
    filters: request.filters ?? {
      excludeKeywords: [],
      includeKeywords: [],
      languageMode: "loose",
      minVelocityScore: 0,
      minViews: 0,
      safeMode: "strict"
    },
    ideaSeeds: [],
    maxShortSeconds,
    patterns: [],
    provider: "youtube",
    publishedAfter,
    query: request.query,
    quotaUnits: 0,
    regionCode: request.regionCode,
    scannedAt: scanTime.toISOString(),
    status: "blocked",
    videos: []
  };
}

function createReadyResponse(input: Omit<TrendScanResponse, "provider" | "status">): TrendScanResponse {
  return {
    ...input,
    provider: "youtube",
    status: "ready"
  };
}
