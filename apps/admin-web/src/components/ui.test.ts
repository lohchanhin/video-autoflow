import { describe, expect, it } from "vitest";
import {
  canRenderMediaImage,
  canRenderMediaImageFromSources,
  getMediaImageCurrentStatus,
  getMediaImageSourcesStatus,
  hasRenderableImageDimensions,
  normalizeMediaImageSources
} from "./ui.js";

describe("MediaImage render guard", () => {
  it("does not render an img when the loaded state belongs to a previous src", () => {
    const previousLoaded = {
      src: "https://vertex-workflow.com/uploads/assets/old.png",
      status: "loaded" as const
    };

    expect(canRenderMediaImage("https://vertex-workflow.com/uploads/assets/missing.png", previousLoaded)).toBe(false);
    expect(getMediaImageCurrentStatus("https://vertex-workflow.com/uploads/assets/missing.png", previousLoaded)).toBe("loading");
  });

  it("renders an img only after the current src has loaded", () => {
    const currentLoaded = {
      src: "https://vertex-workflow.com/uploads/assets/current.png",
      status: "loaded" as const
    };

    expect(canRenderMediaImage("https://vertex-workflow.com/uploads/assets/current.png", currentLoaded)).toBe(true);
  });

  it("treats empty src as empty instead of loading", () => {
    expect(getMediaImageCurrentStatus("", { src: "https://vertex-workflow.com/uploads/assets/current.png", status: "loaded" })).toBe("empty");
  });

  it("treats zero-size image loads as failed media", () => {
    expect(hasRenderableImageDimensions({ naturalHeight: 0, naturalWidth: 0 })).toBe(false);
    expect(hasRenderableImageDimensions({ naturalHeight: 768, naturalWidth: 1024 })).toBe(true);
  });

  it("supports multiple fallback sources without rendering broken previous images", () => {
    const sources = normalizeMediaImageSources([
      "https://vertex-workflow.com/uploads/assets/missing.png",
      "https://cdn.example.test/uploads/assets/current.png",
      "https://cdn.example.test/uploads/assets/current.png"
    ]);

    expect(sources).toEqual([
      "https://vertex-workflow.com/uploads/assets/missing.png",
      "https://cdn.example.test/uploads/assets/current.png"
    ]);
    expect(getMediaImageSourcesStatus(sources, { src: "https://old.example.test/old.png", status: "loaded" })).toBe("loading");
    expect(canRenderMediaImageFromSources(sources, { src: "https://cdn.example.test/uploads/assets/current.png", status: "loaded" })).toBe(true);
  });
});
