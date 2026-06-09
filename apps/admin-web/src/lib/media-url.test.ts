import { afterEach, describe, expect, it, vi } from "vitest";
import { isImageMediaUrl, resolveMediaUrl } from "./media-url.js";

describe("media-url", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rewrites local upload storage paths to the current production domain", () => {
    vi.stubGlobal("window", {
      location: {
        hostname: "vertex-workflow.com",
        origin: "https://vertex-workflow.com",
        protocol: "https:"
      }
    });

    expect(resolveMediaUrl("local://uploads/jobs/job_001/images/scene_01.png")).toBe("https://vertex-workflow.com/uploads/jobs/job_001/images/scene_01.png");
    expect(resolveMediaUrl("http://127.0.0.1:4000/uploads/jobs/job_001/images/scene_01.png")).toBe("https://vertex-workflow.com/uploads/jobs/job_001/images/scene_01.png");
    expect(resolveMediaUrl("http://137.184.100.54:4000/uploads/jobs/job_001/final/video.mp4")).toBe("https://vertex-workflow.com/uploads/jobs/job_001/final/video.mp4");
  });

  it("keeps external CDN URLs unchanged", () => {
    vi.stubGlobal("window", {
      location: {
        hostname: "vertex-workflow.com",
        origin: "https://vertex-workflow.com",
        protocol: "https:"
      }
    });

    expect(resolveMediaUrl("https://storage.googleapis.com/bucket/asset.png")).toBe("https://storage.googleapis.com/bucket/asset.png");
  });

  it("detects images after URL normalization", () => {
    expect(isImageMediaUrl("local://uploads/assets/character.webp")).toBe(true);
  });
});
