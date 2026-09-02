import http from "node:http";
import { pathToFileURL } from "node:url";
import { handleRequest } from "./http.mjs";

export function createReplayServer() {
  return http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      console.error(error);
      if (!response.headersSent) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      }
      response.end(JSON.stringify({
        error: "INTERNAL_ERROR",
        message: "The replay parser could not complete this request.",
      }));
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8080);
  createReplayServer().listen(port, "0.0.0.0", () => {
    console.log(`JWRLCS replay parser listening on port ${port}`);
  });
}
