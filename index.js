const { defineApp, METHODS } = require("redweb");
const { DefaultRoute } = require("./DefaultRoute");

let activeServer = null;

function getListenerPort(environment = process.env) {
  return Number(environment.PORT || environment.WS_PORT || 3000);
}

function createHttpServices(getSocketServer) {
  return [
    {
      serviceName: "/health",
      method: METHODS.GET,
      function: (_request, response) => response.status(200).json({ status: "ok" }),
    },
    {
      serviceName: "/ready",
      method: METHODS.GET,
      function: (_request, response) => {
        const ready = Boolean(getSocketServer()?.isReady());
        return response.status(ready ? 200 : 503).json({ status: ready ? "ready" : "starting" });
      },
    },
  ];
}

async function startServer({
  port = getListenerPort(),
  bind = process.env.HOST || "0.0.0.0",
  signals = true,
} = {}) {
  if (activeServer) {
    throw new Error("Gemhouse Server supports one server instance per Node.js process.");
  }

  const app = defineApp({
    sockets: [DefaultRoute],
    httpServices: createHttpServices(() => app.sockets),
    port,
    bind,
    signals,
    logger: null,
  });
  activeServer = app;
  try {
    const context = await app.run();
    return {
      server: context.server,
      socketServer: context.sockets,
      shutdown: async () => {
        try {
          await app.shutdown();
        } finally {
          if (activeServer === app) activeServer = null;
        }
      },
    };
  } catch (error) {
    if (activeServer === app) activeServer = null;
    throw error;
  }
}

function runIfMain(entryModule, start = startServer) {
  if (require.main === entryModule) {
    return start();
  }
}

function startWithErrorHandling(start) {
  return Promise.resolve().then(start).catch((error) => {
    console.error("Gemhouse server failed to start:", error);
    process.exitCode = 1;
  });
}

runIfMain(module, () => startWithErrorHandling(startServer));

module.exports = { createHttpServices, getListenerPort, runIfMain, startServer, startWithErrorHandling };
