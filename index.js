const { SocketServer, HttpServer } = require("redweb");
const { DefaultRoute } = require("./DefaultRoute");

const websocketPort = Number(
  process.env.PORT ||
  process.env.WS_PORT ||
  3000
);

new SocketServer({
  port: websocketPort,
  routes: [DefaultRoute],
});

new HttpServer({
  port: process.env.HTTP_PORT ? Number(process.env.HTTP_PORT) : 3001,
  publicPaths: ["./public"],
});
