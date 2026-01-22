import test from 'node:test';
import assert from 'node:assert';

function fixTaskListNumbering(html) {
  return html.replace(
    /(<p>)?(<input[^>]*>)(\s*<\/p>)?\s*<ol[^>]*>\s*<li>([\s\S]*?)<\/li>\s*<\/ol>/g,
    '$2 $4'
  );
}

test('fixTaskListNumbering', async (t) => {
  await t.test('チェック済みタスクリストの番号付きテキストを正しく変換する', () => {
    const input = '<input type="checkbox" checked><ol><li>テキスト</li></ol>';
    const expected = '<input type="checkbox" checked> テキスト';
    assert.strictEqual(fixTaskListNumbering(input), expected);
  });

  await t.test('未チェックタスクリストの番号付きテキストを正しく変換する', () => {
    const input = '<input type="checkbox"><ol><li>テキスト</li></ol>';
    const expected = '<input type="checkbox"> テキスト';
    assert.strictEqual(fixTaskListNumbering(input), expected);
  });

  await t.test('通常のタスクリスト(番号なし)には影響を与えない', () => {
    const input = '<input type="checkbox" checked> 通常のタスク';
    const expected = '<input type="checkbox" checked> 通常のタスク';
    assert.strictEqual(fixTaskListNumbering(input), expected);
  });

  await t.test('複数のタスクリストを含むHTMLを正しく処理する', () => {
    const input = `
      <input type="checkbox" checked><ol><li>タスク1</li></ol>
      <input type="checkbox"><ol><li>タスク2</li></ol>
      <input type="checkbox" checked> 通常のタスク
    `;
    const expected = `
      <input type="checkbox" checked> タスク1
      <input type="checkbox"> タスク2
      <input type="checkbox" checked> 通常のタスク
    `;
    assert.strictEqual(fixTaskListNumbering(input), expected);
  });

  await t.test('ol要素の属性を含むHTMLを正しく処理する', () => {
    const input = '<input type="checkbox" checked><ol start="1"><li>テキスト</li></ol>';
    const expected = '<input type="checkbox" checked> テキスト';
    assert.strictEqual(fixTaskListNumbering(input), expected);
  });

  await t.test('空白文字を含むHTMLを正しく処理する', () => {
    const input = '<input type="checkbox" checked>  <ol>  <li>テキスト</li>  </ol>';
    const expected = '<input type="checkbox" checked> テキスト';
    assert.strictEqual(fixTaskListNumbering(input), expected);
  });

  await t.test('ルーズリスト（pタグでラップされたinput）を正しく変換する', () => {
    const input = '<li><p><input disabled="" type="checkbox"> </p>\n<ol>\n<li>SplineBasedCameraParamDataへのパラメータ追加</li>\n</ol>\n</li>';
    const expected = '<li><input disabled="" type="checkbox"> SplineBasedCameraParamDataへのパラメータ追加\n</li>';
    assert.strictEqual(fixTaskListNumbering(input), expected);
  });

  await t.test('複数のルーズリストを含むHTMLを正しく処理する', () => {
    const input = `<li><p><input type="checkbox"> </p><ol><li>タスク1</li></ol></li><li><p><input type="checkbox" checked> </p><ol start="2"><li>タスク2</li></ol></li>`;
    const expected = `<li><input type="checkbox"> タスク1</li><li><input type="checkbox" checked> タスク2</li>`;
    assert.strictEqual(fixTaskListNumbering(input), expected);
  });
});
