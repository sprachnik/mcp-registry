/**
 * MCP Server Registry — search & UI
 *
 * Loads the consolidated server dataset and provides fuzzy search,
 * capability filtering, sorting, and incremental (infinite-scroll)
 * rendering with a clean, observable paging model.
 */

'use strict';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const ALL_SERVERS_FILE = 'data/all-servers.json';
const ITEMS_PER_PAGE = 24;
const SEARCH_DEBOUNCE_MS = 150;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let allServers = [];
let filteredServers = [];
let fuse = null;
let renderedCount = 0;
let observer = null;

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const els = {
  search: document.getElementById('searchInput'),
  searchClear: document.getElementById('searchClear'),
  searchHint: document.getElementById('searchHint'),
  results: document.getElementById('results'),
  stats: document.getElementById('stats'),
  sortBy: document.getElementById('sortBy'),
  serverCount: document.getElementById('serverCount'),
  themeToggle: document.getElementById('themeToggle'),
  backToTop: document.getElementById('backToTop'),
  filters: {
    tool: document.getElementById('filterTool'),
    resource: document.getElementById('filterResource'),
    prompt: document.getElementById('filterPrompt'),
  },
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init() {
  setupChrome();

  try {
    allServers = await loadAllServers();
    initFuse();
    setupSearchListeners();

    // Restore query from URL (?q=…) for shareable searches.
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    if (q) els.search.value = q;

    if (els.serverCount) {
      els.serverCount.textContent = formatNumber(allServers.length);
    }

    performSearch();
  } catch (error) {
    showError('Failed to load server data: ' + error.message);
  }
}

async function loadAllServers() {
  const response = await fetch(ALL_SERVERS_FILE);
  if (!response.ok) {
    throw new Error(`Failed to load servers: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  const servers = data.servers || [];
  console.log(`Loaded ${servers.length} servers (generated ${data.generated})`);
  return servers;
}

function initFuse() {
  fuse = new Fuse(allServers, {
    keys: [
      { name: 'name', weight: 2.0 },
      { name: 'displayName', weight: 1.8 },
      { name: 'tags', weight: 1.5 },
      { name: 'capabilities', weight: 1.3 },
      { name: 'description', weight: 1.0 },
      { name: 'author', weight: 0.8 },
    ],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 2,
    ignoreLocation: true,
  });
}

// ---------------------------------------------------------------------------
// Chrome: theme toggle, back-to-top, keyboard shortcuts
// ---------------------------------------------------------------------------
function setupChrome() {
  // Theme toggle (initial theme already applied by inline bootstrap).
  if (els.themeToggle) {
    els.themeToggle.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('mcp-theme', next); } catch (e) {}
    });
  }

  // Back to top.
  if (els.backToTop) {
    els.backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    window.addEventListener('scroll', () => {
      els.backToTop.classList.toggle('visible', window.scrollY > 600);
    }, { passive: true });
  }

  // Keyboard: "/" focuses search, Esc clears it.
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== els.search) {
      e.preventDefault();
      els.search.focus();
    } else if (e.key === 'Escape' && document.activeElement === els.search) {
      clearSearch();
    }
  });
}

// ---------------------------------------------------------------------------
// Search listeners
// ---------------------------------------------------------------------------
function setupSearchListeners() {
  let timer;
  els.search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(performSearch, SEARCH_DEBOUNCE_MS);
    toggleSearchAffordances();
  });

  els.searchClear.addEventListener('click', clearSearch);

  els.sortBy.addEventListener('change', performSearch);

  // Capability chips (toggle aria-pressed).
  Object.values(els.filters).forEach((chip) => {
    chip.addEventListener('click', () => {
      const pressed = chip.getAttribute('aria-pressed') === 'true';
      chip.setAttribute('aria-pressed', String(!pressed));
      performSearch();
    });
  });

  // Delegated card interactions: tag search, copy buttons, expand/collapse.
  els.results.addEventListener('click', (e) => {
    // 1. Tag → search.
    const tag = e.target.closest('.tag');
    if (tag) {
      els.search.value = tag.dataset.tag || tag.textContent;
      toggleSearchAffordances();
      performSearch();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // 2. Copy-to-clipboard button.
    const copyBtn = e.target.closest('.copy-btn');
    if (copyBtn) {
      handleCopy(copyBtn);
      return;
    }

    // 3. Outbound links navigate normally.
    if (e.target.closest('a')) return;

    // 4. Explicit install toggle, or a click anywhere on the card body.
    const card = e.target.closest('.server-card');
    if (!card || !card.classList.contains('expandable')) return;

    const toggle = e.target.closest('.install-toggle');
    // Clicks inside the open panel (selecting text etc.) shouldn't collapse it.
    if (!toggle && e.target.closest('.install-panel')) return;

    toggleCard(card);
  });
}

function toggleCard(card) {
  const expanded = card.classList.toggle('expanded');
  const toggle = card.querySelector('.install-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', String(expanded));
}

async function handleCopy(btn) {
  const src = btn.parentElement.querySelector('.copy-src');
  if (!src) return;
  const text = src.textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // Fallback for non-secure contexts.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (err) {}
    ta.remove();
  }
  const original = btn.textContent;
  btn.textContent = 'Copied!';
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1500);
}

function toggleSearchAffordances() {
  const hasValue = els.search.value.length > 0;
  els.searchClear.style.display = hasValue ? 'block' : 'none';
  if (els.searchHint) els.searchHint.style.display = hasValue ? 'none' : 'flex';
}

function clearSearch() {
  els.search.value = '';
  toggleSearchAffordances();
  performSearch();
  els.search.focus();
}

// ---------------------------------------------------------------------------
// Search pipeline
// ---------------------------------------------------------------------------
function performSearch() {
  const query = els.search.value.trim();

  let results = query
    ? fuse.search(query).map((r) => r.item)
    : allServers.slice();

  results = applyFilters(results);
  results = applySorting(results, query);

  filteredServers = results;
  renderedCount = 0;

  // Keep the URL shareable without spamming history.
  const params = new URLSearchParams(location.search);
  if (query) params.set('q', query); else params.delete('q');
  const newUrl = location.pathname + (params.toString() ? '?' + params.toString() : '');
  history.replaceState(null, '', newUrl);

  renderResults(query);
}

function applyFilters(servers) {
  const active = Object.entries(els.filters)
    .filter(([, chip]) => chip.getAttribute('aria-pressed') === 'true')
    .map(([key]) => key);

  if (active.length === 0) return servers;

  return servers.filter((server) => {
    const caps = (server.capabilities || []).map((c) => c.toLowerCase());
    return active.some((f) => caps.includes(f));
  });
}

function applySorting(servers, query) {
  const sortBy = els.sortBy.value;
  if (sortBy === 'relevance') return servers; // Fuse order, or dataset order for empty query.

  const sorted = servers.slice();
  const nameOf = (s) => (s.displayName || s.name || '').toLowerCase();
  sorted.sort((a, b) =>
    sortBy === 'name-desc' ? nameOf(b).localeCompare(nameOf(a)) : nameOf(a).localeCompare(nameOf(b))
  );
  return sorted;
}

// ---------------------------------------------------------------------------
// Rendering & paging
// ---------------------------------------------------------------------------
function renderResults(query) {
  teardownObserver();
  els.results.innerHTML = '';

  if (filteredServers.length === 0) {
    els.results.innerHTML = `
      <div class="no-results">
        <div class="big">🔍</div>
        <p>No servers found${query ? ` matching “${escapeHtml(query)}”` : ''}.</p>
        <p>Try a different search or clear your filters.</p>
      </div>`;
    updateStats(query);
    return;
  }

  renderNextPage(query);
  updateStats(query);
  setupObserver(query);
}

function renderNextPage(query) {
  const start = renderedCount;
  const end = Math.min(start + ITEMS_PER_PAGE, filteredServers.length);
  if (start >= end) return;

  const html = filteredServers.slice(start, end)
    .map((server) => renderServerCard(server, query))
    .join('');

  // Insert before the sentinel (if present) so it stays last.
  const sentinel = document.getElementById('loadSentinel');
  if (sentinel) {
    sentinel.insertAdjacentHTML('beforebegin', html);
  } else {
    els.results.insertAdjacentHTML('beforeend', html);
  }

  renderedCount = end;
  updateLoadIndicator();
  updateStats(query);
}

function updateLoadIndicator() {
  // Always rebuild the sentinel so the IntersectionObserver re-evaluates from
  // scratch — observing the same element that stays "intersecting" can fail to
  // re-fire after we insert a page of cards above it.
  document.getElementById('loadSentinel')?.remove();
  document.getElementById('loadingMore')?.remove();

  if (renderedCount >= filteredServers.length) return;

  const sentinel = document.createElement('div');
  sentinel.id = 'loadSentinel';
  els.results.appendChild(sentinel);

  const indicator = document.createElement('div');
  indicator.id = 'loadingMore';
  indicator.className = 'loading-more';
  indicator.innerHTML = `<span class="spinner"></span>Loading more servers…`;
  els.results.appendChild(indicator);

  if (observer) observer.observe(sentinel);
}

function setupObserver(query) {
  observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      renderNextPage(query);
    }
  }, { rootMargin: '400px 0px', threshold: 0 });

  const sentinel = document.getElementById('loadSentinel');
  if (sentinel) observer.observe(sentinel);
}

function teardownObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// ---------------------------------------------------------------------------
// Card rendering
// ---------------------------------------------------------------------------
function renderServerCard(server, query) {
  const name = highlight(server.displayName || server.name || 'Unnamed Server', query);
  const description = highlight(server.description || 'No description available.', query);
  const author = escapeHtml(server.author && server.author !== 'unknown' ? server.author : 'Community');
  const version = escapeHtml(server.version || '');
  const license = escapeHtml(server.license || '');
  const link = resolveServerLink(server);
  const npmPackage = server.npm_package || '';

  const tags = (server.tags || []).slice(0, 6).map((tag) => {
    const safe = escapeHtml(tag);
    return `<button class="tag" type="button" data-tag="${safe}">${safe}</button>`;
  }).join('');

  const capabilities = (server.capabilities || []).map((cap) => {
    const c = String(cap).toLowerCase();
    const cls = c === 'resource' ? 'cap-resource' : c === 'prompt' ? 'cap-prompt' : 'cap-tool';
    return `<span class="capability-badge ${cls}">${escapeHtml(cap)}</span>`;
  }).join('');

  const titleHtml = link
    ? `<a href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer">${name}</a>`
    : name;

  const linkBtn = link
    ? `<a class="card-link" href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>
         ${escapeHtml(link.label)}
       </a>`
    : '';

  const installable = (server.packages || []).length > 0 || (server.remotes || []).length > 0;
  const toggleHtml = installable
    ? `<button class="install-toggle" type="button" aria-expanded="false">
         <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
         <span>Quick install &amp; connect</span>
       </button>${renderInstallPanel(server)}`
    : '';

  return `
    <article class="server-card${installable ? ' expandable' : ''}">
      <h3>${titleHtml}</h3>
      <div class="server-meta">
        <span>👤 ${author}</span>
        ${version ? `<span>🏷️ v${version}</span>` : ''}
        ${license ? `<span>⚖️ ${license}</span>` : ''}
      </div>
      <p class="server-description">${description}</p>
      ${capabilities ? `<div class="capabilities">${capabilities}</div>` : ''}
      ${tags ? `<div class="tags">${tags}</div>` : ''}
      <div class="card-footer">
        ${npmPackage ? `<code class="npm-package" title="${escapeAttr(npmPackage)}">${escapeHtml(npmPackage)}</code>` : '<span></span>'}
        ${linkBtn}
      </div>
      ${toggleHtml}
    </article>`;
}

/**
 * Resolve the best outbound link for a server.
 * Priority: explicit repository -> homepage -> GitHub derived from an
 * io.github.* registry name. Returns { url, label } or null.
 */
function resolveServerLink(server) {
  if (server.repository) {
    return { url: server.repository, label: linkLabel(server.repository) };
  }
  if (server.homepage) {
    return { url: server.homepage, label: linkLabel(server.homepage) };
  }
  const derived = deriveSourceFromName(server.npm_package || server.name);
  if (derived) {
    return { url: derived, label: 'GitHub' };
  }
  return null;
}

function deriveSourceFromName(name) {
  if (!name) return null;
  const m = String(name).match(/^io\.github\.([^/]+)\/(.+)$/i);
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
}

function linkLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.includes('github.com')) return 'GitHub';
    if (host.includes('gitlab.com')) return 'GitLab';
    if (host.includes('bitbucket.org')) return 'Bitbucket';
    return host;
  } catch (e) {
    return 'Source';
  }
}

// ---------------------------------------------------------------------------
// Quick install / connect
// ---------------------------------------------------------------------------
const REGISTRY_LABELS = { npm: 'npm', pypi: 'PyPI', oci: 'Docker', nuget: 'NuGet', mcpb: 'Bundle' };

// Map a package to a runner command + args for the user's MCP client.
function pkgRunner(pkg) {
  switch (pkg.registry) {
    case 'npm':   return { command: 'npx',    args: ['-y', pkg.version ? `${pkg.id}@${pkg.version}` : pkg.id] };
    case 'pypi':  return { command: 'uvx',    args: [pkg.id] };
    case 'oci':   return { command: 'docker', args: ['run', '-i', '--rm', pkg.id] };
    case 'nuget': return { command: 'dnx',    args: [pkg.id] };
    default:      return null; // mcpb (bundle download) and friends have no CLI runner
  }
}

function installCommand(pkg) {
  const r = pkgRunner(pkg);
  return r ? [r.command, ...r.args].join(' ') : null;
}

// A short, stable key for the mcpServers config block.
function configKey(server) {
  const base = String(server.npm_package || server.name || 'server').split('/').pop();
  return base.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'server';
}

// Build a paste-ready client config entry, preferring a stdio package, then a remote.
function buildConfigEntry(server) {
  const pkgs = server.packages || [];
  const remotes = server.remotes || [];

  const stdioPkg = pkgs.find((p) => (!p.transport || p.transport === 'stdio') && pkgRunner(p));
  if (stdioPkg) {
    const r = pkgRunner(stdioPkg);
    const entry = { command: r.command, args: r.args };
    if (stdioPkg.env && stdioPkg.env.length) {
      entry.env = {};
      stdioPkg.env.forEach((e) => { entry.env[e.name] = e.secret ? '<YOUR_SECRET>' : '<value>'; });
    }
    return entry;
  }
  if (remotes.length) {
    return { type: remotes[0].type === 'sse' ? 'sse' : 'http', url: remotes[0].url };
  }
  const remotePkg = pkgs.find((p) => p.url);
  if (remotePkg) return { type: 'http', url: remotePkg.url };
  return null;
}

function clientConfigJSON(server) {
  const entry = buildConfigEntry(server);
  if (!entry) return null;
  return JSON.stringify({ mcpServers: { [configKey(server)]: entry } }, null, 2);
}

// A copyable row: a <code>/<pre> source plus a Copy button.
function copyRow(text, kind) {
  const tag = kind === 'pre' ? 'pre' : 'code';
  return `<div class="copy-row">
    <${tag} class="copy-src">${escapeHtml(text)}</${tag}>
    <button class="copy-btn" type="button" aria-label="Copy to clipboard">Copy</button>
  </div>`;
}

function renderInstallPanel(server) {
  const pkgs = server.packages || [];
  const remotes = server.remotes || [];
  let html = '<div class="install-panel">';

  // 1. CLI install commands (one per package).
  const cmdRows = pkgs.map((p) => {
    const label = escapeHtml(REGISTRY_LABELS[p.registry] || p.registry);
    if (p.registry === 'mcpb') {
      return `<div class="install-row"><span class="reg-badge">${label}</span>
        <a class="card-link" href="${escapeAttr(p.id)}" target="_blank" rel="noopener noreferrer">Download .mcpb bundle</a></div>`;
    }
    const cmd = installCommand(p);
    if (!cmd) return '';
    return `<div class="install-row"><span class="reg-badge">${label}</span>${copyRow(cmd, 'code')}</div>`;
  }).filter(Boolean).join('');
  if (cmdRows) html += `<div class="install-section"><h4>Install</h4>${cmdRows}</div>`;

  // 2. Client config JSON.
  const cfg = clientConfigJSON(server);
  if (cfg) {
    html += `<div class="install-section"><h4>Client config <span class="hint">(Claude Desktop / MCP clients)</span></h4>${copyRow(cfg, 'pre')}</div>`;
  }

  // 3. Hosted remote endpoint(s).
  if (remotes.length) {
    const rows = remotes.map((r) =>
      `<div class="install-row"><span class="reg-badge">${escapeHtml(r.type)}</span>${copyRow(r.url, 'code')}</div>`
    ).join('');
    html += `<div class="install-section"><h4>Remote endpoint</h4>${rows}</div>`;
  }

  // 4. Required environment variables hint.
  const reqEnv = [...new Set(
    pkgs.flatMap((p) => (p.env || []).filter((e) => e.required).map((e) => e.name))
  )];
  if (reqEnv.length) {
    html += `<div class="install-section"><h4>Required environment</h4>
      <div class="env-list">${reqEnv.map((n) => `<code class="env-var">${escapeHtml(n)}</code>`).join('')}</div></div>`;
  }

  html += '</div>';
  return html;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
function updateStats(query) {
  const shown = filteredServers.length;
  const total = allServers.length;

  if (shown === 0) {
    els.stats.innerHTML = query ? `No matches for <strong>“${escapeHtml(query)}”</strong>` : 'No servers';
    return;
  }

  const visible = Math.min(renderedCount || ITEMS_PER_PAGE, shown);
  let text = `Showing <strong>${formatNumber(visible)}</strong> of <strong>${formatNumber(shown)}</strong> server${shown !== 1 ? 's' : ''}`;
  if (shown !== total) text += ` <span style="opacity:.7">(${formatNumber(total)} total)</span>`;
  if (query) text += ` for <strong>“${escapeHtml(query)}”</strong>`;
  els.stats.innerHTML = text;
}

function showError(message) {
  els.results.innerHTML = `
    <div class="no-results">
      <div class="big">⚠️</div>
      <p><strong>Something went wrong.</strong></p>
      <p>${escapeHtml(message)}</p>
    </div>`;
  els.stats.textContent = 'Failed to load servers';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatNumber(n) {
  return Number(n).toLocaleString('en-US');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

// Escape for use inside a double-quoted HTML attribute.
function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

// Safely highlight query terms: escape first, then wrap matches in <mark>.
function highlight(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;

  const terms = query.trim().split(/\s+/).filter((t) => t.length >= 2);
  if (terms.length === 0) return safe;

  const pattern = terms.map(escapeRegExp).join('|');
  try {
    return safe.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
  } catch (e) {
    return safe;
  }
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
