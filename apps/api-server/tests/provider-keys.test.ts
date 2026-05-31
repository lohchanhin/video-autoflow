import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";

describe("GET /provider-keys/status", () => {
  it("reports configured provider keys without returning full secrets", async () => {
    const response = await request(
      createApp({
        readProviderSecret: (keyName) => (keyName === "OPENAI_API_KEY" ? "sk-test-secret-1234" : undefined)
      })
    )
      .get("/provider-keys/status")
      .expect(200);

    expect(response.body.keys).toContainEqual({
      configured: true,
      keyName: "OPENAI_API_KEY",
      lastFour: "1234"
    });
    expect(JSON.stringify(response.body)).not.toContain("sk-test-secret");
  });
});

describe("POST /provider-keys", () => {
  it("saves allowed provider keys without returning the full secret", async () => {
    const writeProviderSecret = vi.fn();
    const previousBytePlusKey = process.env.BYTEPLUS_ARK_API_KEY;

    const response = await request(
      createApp({
        writeProviderSecret
      })
    )
      .post("/provider-keys")
      .send({
        keyName: "BYTEPLUS_ARK_API_KEY",
        value: "ark-test-secret-9876"
      })
      .expect(200);

    expect(writeProviderSecret).toHaveBeenCalledWith("BYTEPLUS_ARK_API_KEY", "ark-test-secret-9876");
    expect(response.body).toEqual({
      configured: true,
      keyName: "BYTEPLUS_ARK_API_KEY",
      lastFour: "9876"
    });
    expect(JSON.stringify(response.body)).not.toContain("ark-test-secret");
    if (previousBytePlusKey === undefined) {
      delete process.env.BYTEPLUS_ARK_API_KEY;
    } else {
      process.env.BYTEPLUS_ARK_API_KEY = previousBytePlusKey;
    }
  });
});
