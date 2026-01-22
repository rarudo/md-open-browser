document.addEventListener('DOMContentLoaded', init);

async function init() {
  mermaid.initialize({ startOnLoad: false, theme: 'dark' });

  marked.use({
    renderer: {
      code(token) {
        const lang = token.lang || '';
        const code = token.text;

        // mermaidコードブロックはhighlight.jsを適用せず、そのまま返す
        if (lang === 'mermaid') {
          return `<pre><code class="language-mermaid">${code}</code></pre>`;
        }

        let highlighted;
        if (lang && hljs.getLanguage(lang)) {
          highlighted = hljs.highlight(code, { language: lang }).value;
        } else {
          highlighted = hljs.highlightAuto(code).value;
        }

        const langClass = lang ? `hljs language-${lang}` : 'hljs';
        return `<pre><code class="${langClass}">${highlighted}</code></pre>`;
      }
    }
  });

  const files = await fetchFiles();
  renderFileList(files);

  if (files.length > 0) {
    await showFile(files[0].name);
  }
}

async function fetchFiles() {
  const res = await fetch('/api/files');
  return res.json();
}

async function fetchContent(filename) {
  const res = await fetch(`/api/files/${encodeURIComponent(filename)}`);
  return res.text();
}

function renderFileList(files) {
  const ul = document.getElementById('file-list');
  ul.innerHTML = '';

  files.forEach(file => {
    const li = document.createElement('li');
    li.textContent = file.name;
    li.addEventListener('click', () => showFile(file.name));
    ul.appendChild(li);
  });
}

async function showFile(filename) {
  document.querySelectorAll('#file-list li').forEach(li => {
    li.classList.toggle('active', li.textContent === filename);
  });

  const content = await fetchContent(filename);
  await renderMarkdown(content);
}

function fixTaskListNumbering(html) {
  return html.replace(
    /(<p>)?(<input[^>]*>)(\s*<\/p>)?\s*<ol[^>]*>\s*<li>([\s\S]*?)<\/li>\s*<\/ol>/g,
    '$2 $4'
  );
}

async function renderMarkdown(markdown) {
  const preview = document.getElementById('preview');

  let html = marked.parse(markdown);

  html = html.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    '<div class="mermaid">$1</div>'
  );

  html = fixTaskListNumbering(html);

  preview.innerHTML = html;

  await mermaid.run({ querySelector: '.mermaid' });
}
