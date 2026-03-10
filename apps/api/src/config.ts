import "dotenv/config";

export const config = {
  apiHost: process.env.API_HOST ?? "0.0.0.0",
  apiPort: Number(process.env.API_PORT ?? 4000),
  dockerHost: process.env.DOCKER_HOST,
  dockerSocketPath: process.env.DOCKER_SOCKET_PATH,
};
