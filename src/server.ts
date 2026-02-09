import http from "http";
import { promises as fs } from "fs";
import { execSync, spawn, ChildProcess } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import net from "net";

const __filename = import.meta.url ? fileURLToPath(import.meta.url) : "";
const __dirname = __filename ? path.dirname(__filename) : process.cwd() + "/src";

export interface ServerOptions {
  port: number;
  tmuxPane?: string;
  ttydPort?: number;
  ttydProcess?: ChildProcess;
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

function sanitizeTmuxInput(text: string): string {
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}

function tmuxCapturePaneContent(paneId: string): string {
  try {
    return execSync(
      `tmux capture-pane -t ${JSON.stringify(paneId)} -p -S -100`,
      { encoding: "utf-8", timeout: 5000 }
    );
  } catch {
    return "[Error: Failed to capture tmux pane content]";
  }
}

function tmuxSendKeys(paneId: string, text: string): void {
  const sanitized = sanitizeTmuxInput(text);
  const pane = JSON.stringify(paneId);
  execSync(
    `tmux send-keys -t ${pane} ${JSON.stringify(sanitized)} Enter && sleep 0.1 && tmux send-keys -t ${pane} Enter`,
    { timeout: 5000 }
  );
}

function parseTmuxRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
      if (body.length > 10240) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function isTtydAvailable(): boolean {
  try {
    execSync("which ttyd", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getTmuxSessionName(paneId: string): string {
  return execSync(
    `tmux display-message -p -t ${JSON.stringify(paneId)} "#{session_name}"`,
    { encoding: "utf-8", timeout: 5000 }
  ).trim();
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

async function startTtyd(
  sessionName: string,
  basePort: number,
  maxRetries: number = 10
): Promise<{ process: ChildProcess; port: number } | null> {
  let port = basePort;
  for (let i = 0; i < maxRetries; i++) {
    const available = await isPortAvailable(port);
    if (available) {
      const ttydProcess = spawn("ttyd", [
        "--port", String(port),
        "--writable",
        "tmux", "attach-session", "-t", sessionName,
      ], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      });

      ttydProcess.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          console.error(`ttyd exited with code ${code}`);
        }
      });

      return { process: ttydProcess, port };
    }
    port++;
  }
  console.error(`Failed to start ttyd: ports ${basePort}-${basePort + maxRetries - 1} are all in use`);
  return null;
}

export async function startServer(
  files: string[],
  options: ServerOptions
): Promise<ExtendedServer> {
  if (options.tmuxPane && isTtydAvailable()) {
    try {
      const sessionName = getTmuxSessionName(options.tmuxPane);
      const ttydBasePort = options.port + 1;
      const result = await startTtyd(sessionName, ttydBasePort);
      if (result) {
        options.ttydPort = result.port;
        options.ttydProcess = result.process;
      }
    } catch (e) {
      console.error("Failed to start ttyd:", e);
    }
  } else if (options.tmuxPane) {
    console.warn("Warning: ttyd not found. Falling back to text-based catchup UI.");
  }
  return startServerWithFallback(files, options.port, options);
}

async function startServerWithFallback(
  files: string[],
  port: number,
  options: ServerOptions,
  maxRetries = 100
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

        if (pathname === "/api/tmux/status") {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({
            enabled: !!options.tmuxPane,
            paneId: options.tmuxPane || null,
            ttydUrl: options.ttydPort ? `http://localhost:${options.ttydPort}` : null,
          }));
          return;
        }

        if (pathname === "/api/tmux/pane" && req.method === "GET") {
          if (!options.tmuxPane) {
            res.statusCode = 404;
            res.end("tmux integration not enabled");
            return;
          }
          const content = tmuxCapturePaneContent(options.tmuxPane);
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(content);
          return;
        }

        if (pathname === "/api/tmux/send" && req.method === "POST") {
          if (!options.tmuxPane) {
            res.statusCode = 404;
            res.end("tmux integration not enabled");
            return;
          }
          try {
            const body = await parseTmuxRequestBody(req);
            const { text } = JSON.parse(body);
            if (!text || typeof text !== "string") {
              res.statusCode = 400;
              res.end("Invalid request: text field required");
              return;
            }
            tmuxSendKeys(options.tmuxPane, text);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ success: true }));
          } catch {
            res.statusCode = 500;
            res.end("Failed to send to tmux pane");
          }
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
        if (error.code === "EADDRINUSE") {
          reject(new Error(`ポート ${options.port}〜${port} はすべて使用中です。他のアプリケーションを終了してから再試行してください。`));
        } else {
          reject(error);
        }
      }
    });

    server.listen(port, () => {
      const extendedServer = server as ExtendedServer;
      extendedServer.url = `http://localhost:${port}/`;
      extendedServer.stop = () => {
        if (options.ttydProcess) {
          options.ttydProcess.kill();
        }
        server.close();
      };
      resolve(extendedServer);
    });
  });
}
