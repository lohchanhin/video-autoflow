import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { MongoDatabaseConnection } from "@ai-content-factory/database";
import { createApp } from "../src/app.js";

describe("GET /database/status", () => {
  it("returns MongoDB ping status through an injectable connector", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const connection = {
      close,
      ping: vi.fn().mockResolvedValue({
        databaseName: "ai_content_factory",
        ok: true
      })
    } as unknown as MongoDatabaseConnection;

    const response = await request(
      createApp({
        connectDatabase: async () => connection
      })
    )
      .get("/database/status")
      .expect(200);

    expect(response.body).toMatchObject({
      databaseName: "ai_content_factory",
      ok: true,
      service: "mongodb"
    });
    expect(Date.parse(response.body.timestamp)).not.toBeNaN();
    expect(close).toHaveBeenCalledOnce();
  });
});
