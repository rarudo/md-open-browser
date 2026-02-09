#!/usr/bin/env node
import { parseArgs } from "util";
import { existsSync } from "fs";
import open from "open";
import { startServer } from "./server.js";

interface Options {
  files: string[];
  port: number;
  noOpen: boolean;
  help: boolean;
  version: boolean;
  tmuxPane: string | undefined;
  useClaudeCode: boolean;
}

function parseOptions(args: string[]): Options {
  const { values, positionals } = parseArgs({
    args,
    options: {
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
      port: { type: "string", short: "p", default: "3000" },
      "no-open": { type: "boolean", default: false },
      "tmux-pane": { type: "string" },
      "use-claude-code": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  return {
    files: positionals,
    port: parseInt(values.port as string, 10),
    noOpen: values["no-open"] as boolean,
    help: values.help as boolean,
    version: values.version as boolean,
    tmuxPane: values["tmux-pane"] as string | undefined,
    useClaudeCode: values["use-claude-code"] as boolean,
  };
}

function validateFiles(files: string[]): string[] {
  const validFiles: string[] = [];
  for (const file of files) {
    if (existsSync(file)) {
      validFiles.push(file);
    } else {
      console.warn(`Warning: File not found: ${file}`);
    }
  }
  return validFiles;
}

function showHelp(): void {
  console.log(`
md-open - Preview markdown files in browser

Usage:
  md-open [options] <files...>

Options:
  -h, --help           Show help
  -v, --version        Show version
  -p, --port <number>  Port number (default: 3000)
  --no-open            Don't open browser automatically
  --tmux-pane <id>     Enable tmux catchup UI with specified pane
  --use-claude-code    Auto-detect tmux pane from TMUX_PANE env var

Examples:
  md-open file1.md file2.md
  md-open --port 8080 README.md
  md-open --no-open docs/*.md
  `);
}

function showVersion(): void {
  console.log("md-open version 1.0.0");
}

async function main() {
  const options = parseOptions(process.argv.slice(2));

  if (options.help) {
    showHelp();
    return;
  }

  if (options.version) {
    showVersion();
    return;
  }

  if (options.files.length === 0) {
    showHelp();
    process.exit(1);
  }

  const validFiles = validateFiles(options.files);
  if (validFiles.length === 0) {
    console.error("Error: No valid files found");
    process.exit(1);
  }

  let tmuxPane = options.tmuxPane;
  if (!tmuxPane && options.useClaudeCode) {
    const envPane = process.env.TMUX_PANE;
    if (envPane) {
      tmuxPane = envPane;
    } else {
      console.warn("Warning: TMUX_PANE environment variable is not set. Catchup UI disabled.");
    }
  }

  const server = await startServer(validFiles, {
    port: options.port,
    tmuxPane,
  });

  console.log(`Server running at ${server.url}`);

  if (!options.noOpen) {
    await open(server.url.toString());
  }

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    server.stop();
    process.exit(0);
  });
}

main().catch(console.error);
