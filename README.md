# Colorado Digital Services Navigator

A modern, accessible web application that helps Coloradans discover and access over 200 state government digital services. Built to demonstrate what effective government service navigation could look like.

**[Live Demo](https://colorado-gov.org)** | **[View on GitHub](https://github.com/bntcurtis/colorado-digital-services-navigator)**

---

## About this project

Colorado celebrates its 150th birthday as a state in 2026. To mark the occasion, this project catalogs 200+ digital government services and presents them through a modern, user-friendly interface.

This is an independent demonstration project. It is **not affiliated with Colorado.gov** or any official state government entity.

### Why this exists

Accessing government services shouldn't be hard. Unfortunately, many state government websites make it difficult to find what you need. This project demonstrates an alternative approach, inspired by design systems from:

- **[GOV.UK](https://design-system.service.gov.uk/)** — The UK's pioneering government design system
- **[U.S. Web Design System](https://designsystem.digital.gov/)** — Federal accessibility and design standards
- **[NSW Digital](https://www.digital.nsw.gov.au/)** — New South Wales, Australia's service design approach
- **[Ontario Digital Service Standard](https://www.ontario.ca/page/digital-service-standard)** — Ontario, Canada's digital principles

### Key features

- **Bilingual support** — Full English and Spanish translations for all 230 services, with easy language switching
- **AI-powered chatbot** — Natural language service finder that helps users describe what they need in their own words
- **Multi-dimensional navigation** — Browse services by task ("I need to renew..."), life event ("I'm having a baby..."), audience ("For veterans..."), or category
- **Fast search** — Full-text search across service names, descriptions, and tags
- **Mobile-friendly** — Responsive design that works on any device
- **Accessible** — Keyboard navigation, screen reader support, and WCAG-aligned design
- **No backend required** — Self-contained HTML file that works anywhere, including Google Sites
- **Colorado spirit** — True explorers know that clicking the state's initials three times quickly reveals a hidden path through the Rockies

---

## Technical details

### Architecture

The entire application is a single HTML file with embedded CSS and JavaScript. The service catalog is embedded as a JSON object and synced from `service-catalog-v8.json`. This design choice means:

- No server infrastructure required
- Works offline once loaded
- Easy to deploy anywhere (Cloudflare Pages, GitHub Pages, Google Sites, etc.)
- Fast load times (single HTTP request)

Catalog maintenance is automated separately from the static frontend. Scheduled GitHub Actions handle link repair, crawl-assisted recovery, monthly discovery, and pull request generation. A daily Cloudflare Browser Rendering crawl workflow gathers normalized artifacts that the weekly Catalog Agent can use to recover broken URLs.

### Service catalog structure

The catalog uses a bilingual format with English and Spanish translations for key fields:

```json
{
  "id": 1,
  "name": {
    "en": "Apply for Health First Colorado (Medicaid)",
    "es": "Solicitar Health First Colorado (Medicaid)"
  },
  "description": {
    "en": "Apply for the state's Medicaid program...",
    "es": "Solicite el programa de Medicaid del estado..."
  },
  "url": "https://...",
  "department": {
    "en": "Department of Health Care Policy and Financing",
    "es": "Departamento de Políticas de Salud y Finanzas"
  },
  "departmentUrl": "https://...",
  "category": {
    "en": "Health and Wellbeing",
    "es": "Salud y Bienestar"
  },
  "subcategory": "Healthcare and Insurance",
  "lifeEvent": "Healthcare and Wellness",
  "taskType": "Apply",
  "audience": "Individuals and Families",
  "tags": ["medicaid", "health insurance", "healthcare"],
  "icon": "🏥",
  "featured": true
}
```

### Taxonomy

Services are organized across multiple dimensions:

**Categories:**
- Business and Economy
- Education and Learning
- Elections and Government
- Environment and Natural Resources
- Family and Social Services
- Health and Wellbeing
- Jobs and Employment
- Public Safety and Justice
- Recreation and Outdoors
- Taxes and Finance
- Transportation and Vehicles

**Task types:** Apply, Find, Learn, Pay, Register, Renew, Report, Start

**Life events:** Education and Career, Financial and Taxes, Healthcare and Wellness, Housing and Relocation, Legal and Justice, Raising a Family, Retirement and Aging, Starting a Family

**Audiences:** Businesses and Organizations, Education and Students, Government and Employees, Individuals and Families, Outdoor Enthusiasts and Travelers, Professionals and Licensees, Vulnerable Populations

---

## Files in this repository

| File | Description |
|------|-------------|
| `index.html` | The main application (230 bilingual services) |
| `colorado-service-navigator-v8.html` | Versioned copy of the main application |
| `service-catalog-v8.json` | Bilingual service catalog data (English + Spanish) |
| `service-schema-v3.json` | JSON Schema for validating the bilingual catalog |
| `scripts/catalog-agent.js` | Weekly/monthly catalog agent (repairs links, uses crawl-assisted recovery, performs monthly sitemap discovery, generates metadata) |
| `scripts/build-crawl-queue.js` | Selects the daily Cloudflare crawl queue within the free-tier budget |
| `scripts/crawl-client.js` | Submits, polls, and downloads Cloudflare Browser Rendering `/crawl` jobs |
| `scripts/normalize-crawl-results.js` | Converts raw crawl output into a stable normalized schema |
| `scripts/recover-links-from-crawl.js` | Scores normalized crawl results as recovery candidates for broken catalog URLs |
| `scripts/check-links.js` | Automated link health checker |
| `scripts/discover-services.js` | Legacy sitemap crawler for manual discovery runs |
| `scripts/sync-catalog.js` | Syncs the embedded catalog in `index.html` from `service-catalog-v8.json` |
| `config/` | Crawl seeds, crawl profiles, and per-domain crawl policy overrides |
| `docs/` | Crawl design notes and implementation handoff documents |
| `reports/` | Auto-generated catalog change reports (created by GitHub Actions) |
| `README.md` | This file |

### GitHub Actions

| Workflow | Schedule | Description |
|----------|----------|-------------|
| `crawl-discovery.yml` | Daily | Runs a rotating Cloudflare Browser Rendering crawl queue, normalizes raw crawl output, and uploads raw/normalized artifacts used for later recovery and analysis. |
| `catalog-agent.yml` | Weekly + Monthly | Weekly: repairs links and uses recent normalized crawl artifacts to recover broken URLs. Monthly: performs the same repair flow plus sitemap-based discovery and metadata generation, then opens a PR with a review report. |
| `link-audit.yml` | Manual only | Legacy link checker (issue-based). |
| `discover-services.yml` | Manual only | Legacy sitemap discovery report (issue-based). |

### Crawl Discovery setup

The daily crawl workflow uses Cloudflare Browser Rendering's `/crawl` endpoint.

1. Add GitHub Actions configuration:

- Variable: `CF_ACCOUNT_ID`
- Secret: `CF_API_TOKEN`

2. Ensure the Cloudflare API token has **Account > Browser Rendering > Edit** permission.
3. Review or tune the crawl configuration files:

- `config/crawl-seeds.json`
- `config/crawl-profiles.json`
- `config/crawl-domain-policy.json`

4. Review `docs/cloudflare-crawl-plan.md` for the overall architecture and rollout notes.

### Catalog Agent setup

The Catalog Agent requires a separate Gemini proxy Worker and a shared token.

1. Create a Cloudflare Worker for catalog metadata generation.
2. Add Worker secrets: `GEMINI_API_KEY` and `CATALOG_AGENT_TOKEN`.
3. Add GitHub Actions secrets/variables:

- Secret: `CATALOG_AGENT_TOKEN`
- Variable: `CATALOG_WORKER_URL` (e.g. `https://navigator-catalog-proxy.bntcurtis.workers.dev/`)

The weekly Catalog Agent workflow will automatically enable crawl-assisted recovery when recent normalized crawl artifacts are available from `crawl-discovery.yml`.

### Run the workflows manually

#### Crawl Discovery

1. Open the GitHub repo.
2. Click the **Actions** tab.
3. Select **Crawl Discovery** in the left sidebar.
4. Click **Run workflow**.
5. Optionally set the crawl budget (default: `5`, matching the free-tier daily job budget).
6. Click **Run workflow** to start the job.

#### Catalog Agent

1. Open the GitHub repo.
2. Click the **Actions** tab.
3. Select **Catalog Agent** in the left sidebar.
4. Click **Run workflow**.
5. Choose the mode:
   - `weekly` for link repairs only
   - `monthly` for link repairs + sitemap discovery + metadata generation
6. Optionally set the limit for new services to evaluate.
7. Click **Run workflow** to start the job.

---

## Methodology

### Data sources

Service information was compiled from:

1. **Colorado.gov/services** — The official state services directory
2. **Agency websites** — Individual department portals (DMV, CDPHE, CDHS, etc.)
3. **Public documentation** — Press releases, FAQs, and help pages

### Limitations

- **URLs may change** — Government websites frequently reorganize. Some links may become outdated.
- **Completeness** — This catalog focuses on digital services (online applications, portals, databases). In-person-only services are generally not included.
- **Accuracy** — While care was taken to describe services correctly, always verify details on official government websites before taking action.
- **Currency** — The catalog snapshot in `service-catalog-v8.json` was last updated on February 8, 2026. Ongoing scheduled automation continues to check links, collect crawl artifacts, and propose changes via pull request.

### Catalog maintenance

The service catalog is maintained through a combination of automated checks and community feedback:

- **Crawl Discovery (artifact-based)** — A daily GitHub Action runs a Cloudflare Browser Rendering crawl against rotating hub and agency seeds, normalizes the results, and uploads raw/normalized artifacts for reuse.
- **Catalog Agent (PR-based)** — A weekly/monthly GitHub Action repairs links, uses recent crawl artifacts to recover broken URLs, performs monthly sitemap-based discovery, and generates bilingual metadata. It opens a PR with a human-readable report in `reports/` for review before merging.
- **Legacy workflows (manual)** — The prior issue-based link audit and discovery workflows remain available for manual runs.
- **Community feedback** — Users can [report broken links or suggest new services](https://github.com/bntcurtis/colorado-digital-services-navigator/issues/new?template=feedback.yml) directly from the app footer.

---

## Running locally

No build process required. Simply:

1. Download `index.html` (or `colorado-service-navigator-v8.html`)
2. Open it in a web browser

Or clone the repository:

```bash
git clone https://github.com/bntcurtis/colorado-digital-services-navigator.git
cd colorado-digital-services-navigator
open index.html
```

---

## Contributing

Contributions are welcome! Here are some ways to help:

- **[Report broken links or suggest new services](https://github.com/bntcurtis/colorado-digital-services-navigator/issues/new?template=feedback.yml)** — Use the feedback form to let us know about problems or missing services
- **Improve descriptions** — Help make service descriptions clearer and more helpful
- **Accessibility feedback** — Report any accessibility issues you encounter
- **Code contributions** — Improve the link checker, discovery scripts, or main application

---

## License

This project is open source under the **MIT License**. See the license header in the HTML file for full terms.

The service catalog data (names, URLs, descriptions) is compiled from public government sources and is provided for informational purposes.

---

## Acknowledgments

This project was created by [Brian Curtis](https://github.com/bntcurtis), a former Colorado Digital Service product manager, as a demonstration of what modern government service navigation could look like.

Special thanks to the digital service teams around the world whose work inspired this project, and to the Colorado state employees who work to make government services accessible to all.

---

*Not affiliated with Colorado.gov or any official state government entity.*
