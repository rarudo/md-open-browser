import test from "node:test";
import assert from "node:assert";
import { startServer, type ServerOptions, type ExtendedServer } from "./server";
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from "fs";
import http from "http";
import path from "path";

let server: ExtendedServer;
const testFile = "test-server.md";

test("Server", async (t) => {
  t.before(async () => {
    writeFileSync(testFile, "# Test\n\nThis is a test.");
    server = await startServer([testFile], { port: 3100 });
  });

  t.after(() => {
    server.stop();
    unlinkSync(testFile);
  });

  await t.test("サーバーが起動する", () => {
    assert.notStrictEqual(server.url, undefined);
  });

  await t.test("GET /api/files がファイルリストを返す", async () => {
    const res = await fetch(`${server.url}api/files`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(Array.isArray(data), true);
    assert.strictEqual(data.length, 1);
    assert.strictEqual(data[0].name, "test-server.md");
  });

  await t.test("GET /api/files/:filename がファイル内容を返す", async () => {
    const res = await fetch(`${server.url}api/files/test-server.md`);
    assert.strictEqual(res.status, 200);
    const content = await res.text();
    assert.ok(content.includes("# Test"));
  });

  await t.test("存在しないファイルは404を返す", async () => {
    const res = await fetch(`${server.url}api/files/nonexistent.md`);
    assert.strictEqual(res.status, 404);
  });

  await t.test("GET / がHTMLを返す", async () => {
    const res = await fetch(`${server.url}`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("<!DOCTYPE html>"));
  });
});

test("ポートフォールバック", async (t) => {
  await t.test("ポート競合時に次のポートで起動", async () => {
    const testFile2 = "test-fallback.md";
    writeFileSync(testFile2, "# Fallback Test");

    const server1 = await startServer([testFile2], { port: 4200 });
    const server2 = await startServer([testFile2], { port: 4200 });

    assert.ok(server1.url.includes("4200"));
    assert.ok(!server2.url.includes("4200"));

    server1.stop();
    server2.stop();
    unlinkSync(testFile2);
  });
});

test("tmux API", async (t) => {
  const testFileTmux = "test-tmux.md";
  let serverWithTmux: ExtendedServer;
  let serverWithoutTmux: ExtendedServer;

  t.before(async () => {
    writeFileSync(testFileTmux, "# Tmux Test");
    serverWithTmux = await startServer([testFileTmux], {
      port: 3300,
      tmuxPane: "%0",
    });
    serverWithoutTmux = await startServer([testFileTmux], {
      port: 3400,
    });
  });

  t.after(() => {
    serverWithTmux.stop();
    serverWithoutTmux.stop();
    unlinkSync(testFileTmux);
  });

  await t.test("GET /api/tmux/status - tmux有効時", async () => {
    const res = await fetch(`${serverWithTmux.url}api/tmux/status`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.enabled, true);
    assert.strictEqual(data.paneId, "%0");
  });

  await t.test("GET /api/tmux/status - tmux無効時", async () => {
    const res = await fetch(`${serverWithoutTmux.url}api/tmux/status`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.enabled, false);
    assert.strictEqual(data.paneId, null);
  });

  await t.test("GET /api/tmux/pane - tmux無効時は404", async () => {
    const res = await fetch(`${serverWithoutTmux.url}api/tmux/pane`);
    assert.strictEqual(res.status, 404);
  });

  await t.test("POST /api/tmux/send - tmux無効時は404", async () => {
    const res = await fetch(`${serverWithoutTmux.url}api/tmux/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    assert.strictEqual(res.status, 404);
  });
});

test("アセット配信", async (t) => {
  const testDir = "test-assets-dir";
  const testMd = path.join(testDir, "test-assets.md");
  const testImg = path.join(testDir, "image.png");
  let assetServer: ExtendedServer;

  t.before(async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testMd, "# Test\n![image](./image.png)");
    writeFileSync(testImg, "PNG_DUMMY_DATA");
    assetServer = await startServer([testMd], { port: 3500 });
  });

  t.after(() => {
    assetServer.stop();
    rmSync(testDir, { recursive: true });
  });

  await t.test("画像ファイルを取得できる", async () => {
    const res = await fetch(`${assetServer.url}assets/test-assets.md/image.png`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("image/png"));
  });

  await t.test("パストラバーサルは403を返す", async () => {
    const url = new URL(assetServer.url);
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.get({
        hostname: url.hostname,
        port: url.port,
        path: "/assets/test-assets.md/..%2f..%2fetc/passwd",
      }, (res) => {
        res.resume();
        resolve(res.statusCode!);
      });
      req.on("error", reject);
    });
    assert.strictEqual(status, 403);
  });

  await t.test("不明なファイル名は404を返す", async () => {
    const res = await fetch(`${assetServer.url}assets/unknown.md/image.png`);
    assert.strictEqual(res.status, 404);
  });

  await t.test("存在しないファイルは404を返す", async () => {
    const res = await fetch(
      `${assetServer.url}assets/test-assets.md/nonexistent.png`
    );
    assert.strictEqual(res.status, 404);
  });
});
