import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("returns the API server health payload", async () => {
    const response = await request(createApp()).get("/health").expect(200);

    expect(response.body).toMatchObject({
      status: "ok",
      service: "api-server",
      env: "test",
      version: expect.any(String)
    });
    expect(Date.parse(response.body.timestamp)).not.toBeNaN();
  });
});
