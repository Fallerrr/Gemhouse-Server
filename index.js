const { SocketServer } = require("redweb");
const { DefaultRoute } = require("./DefaultRoute");

function getListenerPort(environment = process.env) {
  return Number(environment.PORT || environment.WS_PORT || 3000);
}

function startServer({
  port = getListenerPort(),
} = {}) {
  return new SocketServer({
    port,
    routes: [DefaultRoute],
  });
}

function runIfMain(entryModule, start = startServer) {
  if (require.main === entryModule) {
    return start();
  }
}

runIfMain(module);

module.exports = { getListenerPort, runIfMain, startServer };
