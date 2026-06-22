# MCP Server Registry

> ☕ **Enjoying this project?** [Buy me a coffee](https://buymeacoffee.com/Jamesstalleymoores) — it keeps the lights on and the commits flowing.

**Every MCP server, one searchable index, zero build step.** A pure-HTML, vanilla-JS front door to the entire Model Context Protocol ecosystem — fuzzy search, capability filters, theme-aware, infinite scroll, and a single consolidated JSON file that auto-refreshes daily from the official registry. Drop it on any static host and let your users discover thousands of MCP servers in milliseconds.

🔗 **Live site:** https://mcp-registry.netlify.app/

## Features

- 🔍 **Fuzzy search** across names, descriptions, tags, and capabilities (Fuse.js)
- 🎛️ **Capability filters** — Tool / Resource / Prompt, as toggle chips
- 🔢 **Flexible sorting** — relevance, name (A–Z), name (Z–A)
- ♾️ **Incremental rendering** — infinite scroll loads results in pages of 24
- 🏷️ **Click-to-search tags** and shareable `?q=` URLs
- 🌗 **Light / dark theme** with system-preference detection and persistence
- ⌨️ **Keyboard shortcuts** — `/` to focus search, `Esc` to clear
- 🤖 **Auto-updates** — GitHub Actions scrapes the official registry daily
- ⚡ **Zero build step** — works on any static host

## Project structure

```
mcp-registry/
├── index.html                 # Search interface + embedded styles
├── js/
│   └── search.js              # Search, filtering, sorting, paging, theming
├── data/
│   └── all-servers.json       # Single consolidated dataset (auto-generated)
├── scripts/
│   ├── scrape-registry.js     # Fetch + transform servers from the official API
│   ├── validate-servers.js    # Validate the consolidated data file
│   ├── inject-build-id.js     # Inject git hash + server count into index.html
│   └── update-sitemap.js      # Refresh sitemap.xml with the current date
├── tests/
│   ├── scraper.test.js
│   └── validation.test.js
└── .github/workflows/
    ├── update-registry.yml    # Daily scrape → validate → commit pipeline
    └── test.yml               # CI tests on push / PR
```

## Quick start

It's a static site — serve the repo root with any web server:

```bash
python -m http.server 8000
# or
npx serve .
```

Then open http://localhost:8000.

## Automation

The registry stays in sync with the official MCP registry via
`.github/workflows/update-registry.yml`, which runs:

1. **On push to `main`**
2. **Daily at 02:00 UTC** (scheduled)
3. **Manually** (workflow dispatch)

Pipeline: run tests → scrape `registry.modelcontextprotocol.io` → validate →
inject build metadata → update sitemap → commit & push any changes.

### Run the pipeline locally

```bash
npm run scrape      # fetch + transform into data/all-servers.json
npm run validate    # validate the consolidated file
node scripts/inject-build-id.js   # inject git hash + server count into index.html
node scripts/update-sitemap.js    # refresh sitemap.xml
```

### Scraper configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SCRAPER_BATCH_SIZE` | `50` | Servers per API request |
| `SCRAPER_DELAY_MS` | `20` | Delay between requests (ms) |
| `SCRAPER_MAX_SERVERS` | `0` | Max servers to fetch (`0` = unlimited) |

```bash
# Quick dev run (100 servers)
npm run scrape:dev

# Full unlimited scrape with gentler rate limiting
SCRAPER_MAX_SERVERS=0 SCRAPER_DELAY_MS=200 npm run scrape
```

In CI, scheduled runs fetch **all** servers; push-triggered runs cap at 100,000.

## Data format

`data/all-servers.json` is a single consolidated document:

```json
{
  "version": "1.0",
  "generated": "2026-06-13T03:19:57.755Z",
  "count": 12165,
  "servers": [
    {
      "name": "modelcontextprotocol-server-brave-search",
      "displayName": "Brave Search",
      "description": "Search the web with the Brave Search API.",
      "author": "modelcontextprotocol",
      "capabilities": ["tool"],
      "tags": ["search", "web"],
      "npm_package": "@modelcontextprotocol/server-brave-search",
      "version": "1.0.0",
      "license": "MIT",
      "repository": "https://github.com/..."
    }
  ]
}
```

### Server fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Slug identifier (lowercase, hyphenated) |
| `description` | ✅ | What the server does |
| `npm_package` | ✅ | Package name — also the dedup key |
| `displayName` | | Human-friendly name |
| `author` | | Author / vendor |
| `capabilities` | | Any of `tool`, `resource`, `prompt` |
| `tags` | | Search keywords |
| `version` | | Semantic version |
| `license` | | License identifier |
| `repository` / `homepage` | | Source / project URL |

Servers are deduplicated by `npm_package` (first occurrence wins).

## Scripts

| Command | Description |
|---------|-------------|
| `npm test` | Run the test suite |
| `npm run scrape` | Fetch the full registry into `data/all-servers.json` |
| `npm run scrape:dev` | Fetch a small sample (100 servers) for local dev |
| `npm run validate` | Validate the consolidated data file |

## Deployment

Pure static site — deploy the repo root anywhere (Netlify, Vercel, Cloudflare
Pages, GitHub Pages, S3, nginx). No build command required; the site
auto-deploys whenever the workflow commits fresh data.

## Tech

- [Model Context Protocol](https://modelcontextprotocol.io/) — the standard this catalogs
- [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/) — data source
- [Fuse.js](https://fusejs.io/) — fuzzy search
- [Inter](https://rsms.me/inter/) — typeface

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — free for personal, research, and noncommercial use. For commercial licensing, get in touch.

Built by [James Stalley-Moores](https://www.linkedin.com/in/jamesmoores).
