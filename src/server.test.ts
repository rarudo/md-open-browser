import test from "node:test";
import assert from "node:assert";
import { startServer, type ServerOptions, type ExtendedServer } from "./server";
import { writeFileSync, unlinkSync } from "fs";

let server: ExtendedServer;
const testFile = "test-server.md";

test("Server", async (t) => {
  t.before(async () => {
    writeFileSync(testFile, "# Test\n\nThis is a test.");
    server = await startServer([testFile], { port: 3100 });
  });

  t.after(() => {
    server.close();
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

    const server1 = await startServer([testFile2], { port: 3200 });
    const server2 = await startServer([testFile2], { port: 3200 });

    assert.ok(server1.url.includes("3200"));
    assert.ok(!server2.url.includes("3200"));

    server1.close();
    server2.close();
    unlinkSync(testFile2);
  });
});
