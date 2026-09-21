const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "jaseo-api",
      cwd: appRoot,
      script: "artifacts/api-server/dist/index.mjs",
      interpreter: "node",
      node_args: "--enable-source-maps",
      env: {
        NODE_ENV: "production",
        PORT: 8080,
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      time: true,
    },
  ],
};