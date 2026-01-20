import test from "node:test";
import assert from "node:assert";
import { parseArgs } from "util";

function parseOptions(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
      port: { type: "string", short: "p", default: "3000" },
      "no-open": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  return {
    files: positionals,
    port: parseInt(values.port as string, 10),
    noOpen: values["no-open"] as boolean,
    help: values.help as boolean,
    version: values.version as boolean,
  };
}

test("parseOptions", async (t) => {
  await t.test("デフォルト値を使用", () => {
    const result = parseOptions(["test.md"]);
    assert.deepStrictEqual(result.files, ["test.md"]);
    assert.strictEqual(result.port, 3000);
    assert.strictEqual(result.noOpen, false);
    assert.strictEqual(result.help, false);
    assert.strictEqual(result.version, false);
  });

  await t.test("--helpオプション", () => {
    const result = parseOptions(["--help"]);
    assert.strictEqual(result.help, true);
  });

  await t.test("-hオプション", () => {
    const result = parseOptions(["-h"]);
    assert.strictEqual(result.help, true);
  });

  await t.test("--versionオプション", () => {
    const result = parseOptions(["--version"]);
    assert.strictEqual(result.version, true);
  });

  await t.test("-vオプション", () => {
    const result = parseOptions(["-v"]);
    assert.strictEqual(result.version, true);
  });

  await t.test("--portオプション", () => {
    const result = parseOptions(["--port", "8080", "test.md"]);
    assert.strictEqual(result.port, 8080);
    assert.deepStrictEqual(result.files, ["test.md"]);
  });

  await t.test("-pオプション", () => {
    const result = parseOptions(["-p", "9000", "test.md"]);
    assert.strictEqual(result.port, 9000);
  });

  await t.test("--no-openオプション", () => {
    const result = parseOptions(["--no-open", "test.md"]);
    assert.strictEqual(result.noOpen, true);
  });

  await t.test("複数ファイル", () => {
    const result = parseOptions(["file1.md", "file2.md", "file3.md"]);
    assert.deepStrictEqual(result.files, ["file1.md", "file2.md", "file3.md"]);
  });

  await t.test("複数オプション組み合わせ", () => {
    const result = parseOptions(["-p", "4000", "--no-open", "test.md"]);
    assert.strictEqual(result.port, 4000);
    assert.strictEqual(result.noOpen, true);
    assert.deepStrictEqual(result.files, ["test.md"]);
  });
});
