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

  await initTmuxCatchup();
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
  await renderMarkdown(content, filename);
}

function fixTaskListNumbering(html) {
  return html.replace(
    /(<p>)?(<input[^>]*>)(\s*<\/p>)?\s*<ol[^>]*>\s*<li>([\s\S]*?)<\/li>\s*<\/ol>/g,
    '$2 $4'
  );
}

function rewriteAssetUrls(container, filename) {
  container.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src');
    if (!src) return;
    if (/^(https?:\/\/|\/\/|data:|\/)/. test(src)) return;
    const cleanSrc = src.startsWith('./') ? src.slice(2) : src;
    img.setAttribute('src', `/assets/${encodeURIComponent(filename)}/${cleanSrc}`);
  });
}

async function renderMarkdown(markdown, filename) {
  const preview = document.getElementById('preview');

  let html = marked.parse(markdown);

  html = html.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    '<div class="mermaid">$1</div>'
  );

  html = fixTaskListNumbering(html);

  preview.innerHTML = html;

  if (filename) {
    rewriteAssetUrls(preview, filename);
  }

  await mermaid.run({ querySelector: '.mermaid' });
}

let tmuxPollingInterval = null;
let tmuxEnabled = false;
let ttydInitialized = false;
let ttydInitializing = false;

async function initTmuxCatchup() {
  try {
    const res = await fetch('/api/tmux/status');
    const status = await res.json();
    tmuxEnabled = status.enabled;
    if (!tmuxEnabled) return;

    document.getElementById('tmux-panel').style.display = 'flex';
    document.querySelector('.resize-handle').style.display = 'block';
    setupResizeHandle();

    if (status.ttydAvailable) {
      const panelBody = document.querySelector('.tmux-panel-body');
      const toggleBtn = document.getElementById('tmux-panel-toggle');
      panelBody.classList.add('collapsed');
      toggleBtn.innerHTML = '&#9654;';
      setupPanelToggle(true);
      return;
    }

    setupTmuxEventListeners();
    setupPanelToggle(false);
    startTmuxPolling();
  } catch (e) {
    console.error('Failed to initialize tmux catchup:', e);
  }
}

function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  const lineHeight = parseInt(getComputedStyle(textarea).lineHeight);
  const maxHeight = lineHeight * 4;
  textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function setupTmuxEventListeners() {
  document.getElementById('tmux-send').addEventListener('click', () => sendTmuxMessage());

  document.getElementById('tmux-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendTmuxMessage();
    }
  });

  document.getElementById('tmux-input').addEventListener('input', (e) => {
    autoResizeTextarea(e.target);
  });
}

async function sendTmuxMessage() {
  const input = document.getElementById('tmux-input');
  const sendBtn = document.getElementById('tmux-send');
  const text = input.value.trim();
  if (!text) return;

  sendBtn.disabled = true;
  input.disabled = true;

  try {
    await fetch('/api/tmux/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    input.value = '';
    input.style.height = 'auto';
    input.style.overflowY = 'hidden';
    await fetchTmuxPaneContent();
  } catch (e) {
    console.error('Failed to send message:', e);
  } finally {
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

async function fetchTmuxPaneContent() {
  try {
    const res = await fetch('/api/tmux/pane');
    const content = await res.text();
    const output = document.getElementById('tmux-output');
    const wasAtBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 30;
    output.textContent = content.replace(/\s+$/, '');
    if (wasAtBottom) {
      output.scrollTop = output.scrollHeight;
    }
  } catch (e) {
    console.error('Failed to fetch tmux pane content:', e);
  }
}

function startTmuxPolling() {
  if (tmuxPollingInterval) return;
  fetchTmuxPaneContent();
  tmuxPollingInterval = setInterval(fetchTmuxPaneContent, 2000);
}

function stopTmuxPolling() {
  if (tmuxPollingInterval) {
    clearInterval(tmuxPollingInterval);
    tmuxPollingInterval = null;
  }
}

function setupPanelToggle(ttydAvailable) {
  const header = document.querySelector('.tmux-panel-header');
  const body = document.querySelector('.tmux-panel-body');
  const toggleBtn = document.getElementById('tmux-panel-toggle');

  header.addEventListener('click', () => {
    const isCollapsed = body.classList.toggle('collapsed');
    toggleBtn.innerHTML = isCollapsed ? '&#9654;' : '&#9660;';

    if (!isCollapsed) {
      if (ttydAvailable && !ttydInitialized) {
        initTtydOnFirstExpand();
      } else if (!ttydAvailable) {
        startTmuxPolling();
      }
    } else {
      if (!ttydAvailable) {
        stopTmuxPolling();
      }
    }
  });
}

async function initTtydOnFirstExpand() {
  if (ttydInitializing) return;
  ttydInitializing = true;

  const panelBody = document.querySelector('.tmux-panel-body');

  const loading = document.createElement('div');
  loading.className = 'ttyd-loading';
  loading.textContent = 'Starting terminal...';
  panelBody.insertBefore(loading, panelBody.firstChild);

  try {
    const res = await fetch('/api/tmux/init-ttyd', { method: 'POST' });
    if (!res.ok) throw new Error('init-ttyd failed');
    const data = await res.json();

    loading.remove();

    const output = document.getElementById('tmux-output');
    const inputArea = document.querySelector('.tmux-input-area');
    if (output) output.style.display = 'none';
    if (inputArea) inputArea.style.display = 'none';

    const iframe = document.createElement('iframe');
    iframe.src = data.ttydUrl;
    iframe.className = 'ttyd-frame';
    panelBody.insertBefore(iframe, panelBody.firstChild);

    document.getElementById('tmux-panel').style.width = '40vw';

    ttydInitialized = true;
  } catch (e) {
    console.error('Failed to initialize ttyd:', e);
    loading.remove();

    setupTmuxEventListeners();
    startTmuxPolling();
  } finally {
    ttydInitializing = false;
  }
}

function triggerIframeResize(panel) {
  var iframe = panel.querySelector('iframe');
  if (!iframe) return;
  iframe.style.width = 'calc(100% - 1px)';
  requestAnimationFrame(function() {
    iframe.style.width = '100%';
  });
}

function setupResizeHandle() {
  const handle = document.querySelector('.resize-handle');
  const panel = document.getElementById('tmux-panel');
  let isDragging = false;
  let startX = 0;
  let startWidth = 0;
  let resizeTimer = null;

  handle.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';

    const iframe = panel.querySelector('iframe');
    if (iframe) {
      iframe.style.pointerEvents = 'none';
    }

    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const delta = startX - e.clientX;
    const maxWidth = window.innerWidth * 0.6;
    const newWidth = Math.min(Math.max(startWidth + delta, 200), maxWidth);
    panel.style.width = newWidth + 'px';

    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      triggerIframeResize(panel);
    }, 150);
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;

    isDragging = false;
    handle.classList.remove('active');
    document.body.style.cursor = '';

    const iframe = panel.querySelector('iframe');
    if (iframe) {
      iframe.style.pointerEvents = '';
    }

    clearTimeout(resizeTimer);
    triggerIframeResize(panel);
  });
}
