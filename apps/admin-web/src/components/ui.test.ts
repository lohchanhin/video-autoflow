import { describe, expect, it } from "vitest";
import { canRenderMediaImage, getMediaImageCurrentStatus } from "./ui.js";

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
});
