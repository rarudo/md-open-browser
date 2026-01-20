import http from "http";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = import.meta.url ? fileURLToPath(import.meta.url) : "";
const __dirname = __filename ? path.dirname(__filename) : process.cwd() + "/src";

export interface ServerOptions {
  port: number;
}

interface FileInfo {
  name: string;
  path: string;
}

export interface ExtendedServer extends http.Server {
  url: string;
  stop: () => void;
}

function getContentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".md")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

export async function startServer(
  files: string[],
  options: ServerOptions
): Promise<ExtendedServer> {
  return startServerWithFallback(files, options.port, options);
}

async function startServerWithFallback(
  files: string[],
  port: number,
  options: ServerOptions,
  maxRetries = 10
): Promise<ExtendedServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      const pathname = url.pathname;

      try {
        if (pathname === "/api/files") {
          const fileInfos: FileInfo[] = files.map((f) => ({
            name: path.basename(f),
            path: f,
          }));
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(fileInfos));
          return;
        }

        if (pathname.startsWith("/api/files/")) {
          const filename = decodeURIComponent(pathname.slice("/api/files/".length));
          const file = files.find((f) => path.basename(f) === filename);
          if (!file) {
            res.statusCode = 404;
            res.end("Not Found");
            return;
          }
          const content = await fs.readFile(file, "utf-8");
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(content);
          return;
        }

        if (pathname === "/" || pathname === "/index.html") {
          const htmlPath = path.resolve(__dirname, "../public/index.html");
          const content = await fs.readFile(htmlPath, "utf-8");
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(content);
          return;
        }

        const staticPath = path.resolve(__dirname, "../public", pathname.slice(1));
        try {
          const content = await fs.readFile(staticPath);
          res.statusCode = 200;
          res.setHeader("Content-Type", getContentType(staticPath));
          res.end(content);
        } catch {
          res.statusCode = 404;
          res.end("Not Found");
        }
      } catch (error) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" && maxRetries > 0) {
        console.log(`Port ${port} is busy, trying ${port + 1}...`);
        startServerWithFallback(files, port + 1, options, maxRetries - 1)
          .then(resolve)
          .catch(reject);
      } else {
        reject(error);
      }
    });

    server.listen(port, () => {
      const extendedServer = server as ExtendedServer;
      extendedServer.url = `http://localhost:${port}/`;
      extendedServer.stop = () => server.close();
      resolve(extendedServer);
    });
  });
}
