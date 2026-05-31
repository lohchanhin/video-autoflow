import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";

describe("GET /providers/openai/models", () => {
  it("requires an OpenAI API key before syncing models", async () => {
    const response = await request(
      createApp({
        readProviderSecret: () => undefined
      })
    )
      .get("/providers/openai/models?toolType=llm")
      .expect(409);

    expect(response.body.error).toMatchObject({
      code: "SETUP_REQUIRED",
      message: "OpenAI API key is required before syncing models."
    });
  });

  it("proxies the OpenAI models list without exposing the secret", async () => {
    const providerModelsFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { created: 1, id: "gpt-4.1-mini", owned_by: "openai" },
            { created: 2, id: "gpt-image-1.5", owned_by: "openai" },
            { created: 3, id: "chatgpt-image-latest", owned_by: "openai" },
            { created: 3, id: "gpt-5.5", owned_by: "openai" }
          ]
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200
        }
      )
    );

    const response = await request(
      createApp({
        providerModelsFetch,
        readProviderSecret: (keyName) => (keyName === "OPENAI_API_KEY" ? "sk-test-openai-secret" : undefined)
      })
    )
      .get("/providers/openai/models?toolType=llm")
      .expect(200);

    expect(providerModelsFetch).toHaveBeenCalledWith("https://api.openai.com/v1/models", {
      headers: {
        Authorization: "Bearer sk-test-openai-secret"
      }
    });
    expect(response.body.models.map((model: { id: string }) => model.id)).toEqual(["gpt-5.5", "gpt-4.1-mini"]);
    expect(JSON.stringify(response.body)).not.toContain("sk-test-openai-secret");
  });

  it("keeps image models in image tool lists instead of LLM lists", async () => {
    const providerModelsFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: "gpt-5.5", owned_by: "openai" },
            { id: "chatgpt-image-latest", owned_by: "openai" },
            { id: "gpt-image-1.5", owned_by: "openai" }
          ]
        }),
        { status: 200 }
      )
    );
    const app = createApp({
      providerModelsFetch,
      readProviderSecret: () => "sk-test-openai-secret"
    });

    const llmResponse = await request(app).get("/providers/openai/models?toolType=llm").expect(200);
    const imageResponse = await request(app).get("/providers/openai/models?toolType=image").expect(200);

    expect(llmResponse.body.models.map((model: { id: string }) => model.id)).toEqual(["gpt-5.5"]);
    expect(imageResponse.body.models.map((model: { id: string }) => model.id)).toEqual(["gpt-image-1.5", "chatgpt-image-latest"]);
  });
});
