import { buildApp } from "./app.js";
import { config } from "./config.js";

const start = async () => {
  const app = buildApp();

  try {
    await app.listen({ port: config.apiPort, host: config.apiHost });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
