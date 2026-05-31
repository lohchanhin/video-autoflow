import { describe, expect, it } from "vitest";
import { inferTemplateTypeFromGenre } from "./genres.js";

describe("genre routing", () => {
  it("keeps genre entry free-form while routing to a broad production template", () => {
    expect(inferTemplateTypeFromGenre("喜剧短剧")).toBe("comedy_sketch");
    expect(inferTemplateTypeFromGenre("爱情故事")).toBe("romance_story");
    expect(inferTemplateTypeFromGenre("童话故事")).toBe("fairy_tale");
    expect(inferTemplateTypeFromGenre("科幻故事")).toBe("urban_legend");
    expect(inferTemplateTypeFromGenre("商业案例")).toBe("urban_legend");
  });
});

