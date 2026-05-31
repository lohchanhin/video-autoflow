import { config } from "@ai-content-factory/config";
import { createLogger } from "@ai-content-factory/logger";
import { createApp } from "./app.js";

const logger = createLogger({ service: "api-server" });
const app = createApp();

app.listen(config.port, () => {
  logger.info("API server listening.", {
    port: config.port,
    env: config.env,
    defaultPrivacy: config.publishing.defaultPrivacy
  });
});
