import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createTrendScanService } from "../src/modules/trends/trend-service.js";

describe("Trend Radar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a setup blocker instead of fake trend data when YouTube API key is missing", async () => {
    const fetchMock = vi.fn();
    const service = createTrendScanService({
      fetchImpl: fetchMock as unknown as typeof fetch,
      getApiKey: () => undefined,
      now: () => new Date("2026-05-30T08:00:00.000Z")
    });

    const response = await service.scanTrends({
      language: "zh-CN",
      publishedWithinDays: 7,
      query: "shorts story",
      regionCode: "MY"
    });

    expect(response).toMatchObject({
      blocker: expect.stringContaining("YOUTUBE_API_KEY"),
      ideaSeeds: [],
      patterns: [],
      status: "blocked",
      videos: []
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("scans YouTube candidates and returns ranked patterns and original idea seeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              { id: { videoId: "video_a" }, snippet: { title: "POV: I found 3 rules in the elevator" } },
              { id: { videoId: "video_b" }, snippet: { title: "Elevator ending twist nobody expected" } }
            ]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                contentDetails: { duration: "PT45S" },
                id: "video_a",
                snippet: {
                  channelTitle: "Shorts Lab",
                  description: "A rules warning story with CCTV footage.",
                  publishedAt: "2026-05-29T08:00:00.000Z",
                  thumbnails: { medium: { url: "https://img.example/video_a.jpg" } },
                  title: "POV: I found 3 rules in the elevator"
                },
                statistics: { commentCount: "200", likeCount: "5000", viewCount: "100000" }
              },
              {
                contentDetails: { duration: "PT58S" },
                id: "video_b",
                snippet: {
                  channelTitle: "Story Desk",
                  description: "Elevator storytime with a final reveal.",
                  publishedAt: "2026-05-30T02:00:00.000Z",
                  thumbnails: { high: { url: "https://img.example/video_b.jpg" } },
                  title: "Elevator ending twist nobody expected"
                },
                statistics: { commentCount: "60", likeCount: "1200", viewCount: "40000" }
              },
              {
                contentDetails: { duration: "PT6M5S" },
                id: "video_long",
                snippet: {
                  channelTitle: "Long Channel",
                  description: "Not a short.",
                  publishedAt: "2026-05-30T02:00:00.000Z",
                  title: "Long video"
                },
                statistics: { viewCount: "900000" }
              }
            ]
          }),
          { status: 200 }
        )
      );
    const service = createTrendScanService({
      fetchImpl: fetchMock as unknown as typeof fetch,
      getApiKey: () => "test-youtube-key",
      now: () => new Date("2026-05-30T08:00:00.000Z")
    });

    const response = await service.scanTrends({
      language: "en-US",
      maxResults: 10,
      publishedWithinDays: 7,
      query: "elevator shorts",
      regionCode: "MY"
    });

    expect(response.status).toBe("ready");
    expect(response.filters).toMatchObject({
      safeMode: "strict"
    });
    expect(response.quotaUnits).toBe(101);
    expect(response.videos).toHaveLength(2);
    expect(response.videos[0]).toMatchObject({
      durationSeconds: expect.any(Number),
      id: expect.any(String),
      matchedSignals: expect.arrayContaining([expect.any(String)]),
      title: expect.any(String),
      url: expect.stringContaining("youtube.com/watch")
    });
    expect(response.patterns.length).toBeGreaterThan(0);
    expect(response.ideaSeeds[0]).toMatchObject({
      angle: expect.stringContaining("original"),
      evidenceVideoIds: expect.arrayContaining([expect.any(String)]),
      hook: expect.any(String),
      topic: expect.stringContaining("elevator shorts")
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("search?");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("videos?");
  });

  it("filters unsafe, language-mismatched, and excluded trend candidates before creating idea seeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              { id: { videoId: "safe_video" } },
              { id: { videoId: "unsafe_video" } },
              { id: { videoId: "language_video" } },
              { id: { videoId: "excluded_video" } }
            ]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                contentDetails: { duration: "PT40S" },
                id: "safe_video",
                snippet: {
                  channelTitle: "Comedy Desk",
                  description: "comedy story twist",
                  publishedAt: "2026-05-30T02:00:00.000Z",
                  title: "Comedy story with a twist ending"
                },
                statistics: { commentCount: "40", likeCount: "900", viewCount: "20000" }
              },
              {
                contentDetails: { duration: "PT35S" },
                id: "unsafe_video",
                snippet: {
                  channelTitle: "Unsafe Desk",
                  description: "nsfw prank",
                  publishedAt: "2026-05-30T02:00:00.000Z",
                  title: "Sexy prank story"
                },
                statistics: { commentCount: "20", likeCount: "400", viewCount: "30000" }
              },
              {
                contentDetails: { duration: "PT35S" },
                id: "language_video",
                snippet: {
                  channelTitle: "Other Language",
                  description: "कॉमेडी कहानी",
                  publishedAt: "2026-05-30T02:00:00.000Z",
                  title: "मेरी कहानी"
                },
                statistics: { commentCount: "20", likeCount: "400", viewCount: "30000" }
              },
              {
                contentDetails: { duration: "PT35S" },
                id: "excluded_video",
                snippet: {
                  channelTitle: "Prank Desk",
                  description: "comedy story",
                  publishedAt: "2026-05-30T02:00:00.000Z",
                  title: "Comedy prank story"
                },
                statistics: { commentCount: "20", likeCount: "400", viewCount: "30000" }
              }
            ]
          }),
          { status: 200 }
        )
      );
    const service = createTrendScanService({
      fetchImpl: fetchMock as unknown as typeof fetch,
      getApiKey: () => "test-youtube-key",
      now: () => new Date("2026-05-30T08:00:00.000Z")
    });

    const response = await service.scanTrends({
      excludeKeywords: "prank",
      language: "en-US",
      languageMode: "strict",
      maxResults: 10,
      publishedWithinDays: 7,
      query: "comedy story",
      regionCode: "MY",
      safeMode: "strict"
    });

    expect(response.videos.map((video) => video.id)).toEqual(["safe_video"]);
    expect(response.filterSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "excluded_keyword" }),
      expect.objectContaining({ reason: "language_mismatch" }),
      expect.objectContaining({ reason: "mature_or_unsafe" })
    ]));
    expect(response.ideaSeeds.every((seed) => seed.evidenceVideoIds.includes("safe_video"))).toBe(true);
  });

  it("exposes POST /trends/scan through the API server", async () => {
    const trendScanService = {
      scanTrends: vi.fn(async () => ({
        filteredOut: [],
        filterSummary: [],
        filters: {
          excludeKeywords: [],
          includeKeywords: [],
          languageMode: "loose" as const,
          minVelocityScore: 0,
          minViews: 0,
          safeMode: "strict" as const
        },
        ideaSeeds: [],
        maxShortSeconds: 180,
        patterns: [],
        provider: "youtube" as const,
        publishedAfter: "2026-05-23T00:00:00.000Z",
        query: "shorts",
        quotaUnits: 0,
        regionCode: "MY",
        scannedAt: "2026-05-30T00:00:00.000Z",
        status: "blocked" as const,
        videos: []
      }))
    };

    const response = await request(createApp({ trendScanService }))
      .post("/trends/scan")
      .send({
        language: "zh-CN",
        publishedWithinDays: 7,
        query: "shorts",
        regionCode: "MY"
      })
      .expect(200);

    expect(response.body).toMatchObject({
      provider: "youtube",
      query: "shorts",
      status: "blocked"
    });
    expect(trendScanService.scanTrends).toHaveBeenCalledWith({
      language: "zh-CN",
      languageMode: "loose",
      publishedWithinDays: 7,
      query: "shorts",
      regionCode: "MY",
      safeMode: "strict"
    });
  });
});
