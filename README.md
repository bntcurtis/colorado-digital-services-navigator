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

Catalog maintenance is automated separately from the static frontend. A scheduled GitHub Action checks every catalog link weekly (using a browser user agent, since Colorado sites block bot traffic), repairs safe redirects, and auto-merges its own PR when every change re-verifies as low-risk. A monthly run additionally discovers new services from the official colorado.gov service hub pages and agency sitemaps, generates bilingual metadata, and opens a PR for human review.

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

**Task types:** Apply, Calculate, File, Find, Get Assistance, Learn, Make, Manage, Pay, Purchase, Register, Renew, Report, Request, Schedule, Start, Use

**Life events:** Business and Economy, Civic and Community, Education and Career, Financial and Taxes, Healthcare and Wellness, Housing and Relocation, Legal and Justice, Living with Financial Hardship, Military Service, Raising a Family, Starting a Business, Starting a Family, Travel and Recreation

**Audiences:** Businesses and Organizations, Education and Students, Government and Employees, Individuals and Families, Outdoor Enthusiasts, Professionals and Licensees, Veterans, Visitors and Tourists

---

## Files in this repository

| File | Description |
|------|-------------|
| `index.html` | The main application (230 bilingual services) |
| `colorado-service-navigator-v8.html` | Versioned copy of the main application |
| `service-catalog-v8.json` | Bilingual service catalog data (English + Spanish) |
| `service-schema-v3.json` | JSON Schema for validating the bilingual catalog |
| `scripts/catalog-agent.js` | Weekly/monthly catalog agent (link checking and repair, hub + sitemap discovery, metadata generation) |
| `scripts/aggregate-crawl-results.js` | Scores discovery candidates (used by the catalog agent) |
| `scripts/recover-links-from-crawl.js` | Scores recovery candidates for broken catalog URLs (used by the catalog agent) |
| `scripts/sync-catalog.js` | Syncs the embedded catalog in `index.html` from `service-catalog-v8.json` |
| `scripts/validate-catalog.js` | Zero-dependency catalog validator (enum membership, unique ids, bilingual fields, count) — run in the workflow before any PR/auto-merge |
| `workers/navigator-chat-proxy.js` | Source for the Cloudflare Worker behind the chat assistant (deployed manually via the Cloudflare dashboard) |
| `reports/` | Auto-generated catalog change reports (created by GitHub Actions) |
| `archive/` | Retired code, including the Cloudflare crawl experiment and legacy manual checkers |
| `README.md` | This file |

### GitHub Actions

| Workflow | Schedule | Description |
|----------|----------|-------------|
| `catalog-agent.yml` | Weekly (Mon) + Monthly (1st) | Weekly: checks all catalog links, repairs safe redirects, re-verifies every repair, and **auto-merges its own PR** when changes are exclusively low-risk link repairs. Monthly: same repair flow plus discovery of new services from the colorado.gov service hub pages and agency sitemaps, with bilingual metadata generation — these PRs wait for human review. |
| `pages.yml` | On push to `main` | Deploys the site to GitHub Pages. |

In addition to the GitHub Actions, a scheduled Claude Code task runs on the 3rd of each month. It reviews the latest catalog report, checks open user-feedback issues, and searches the web for newly announced Colorado services, posting its findings as a GitHub issue labeled `monthly-review`.

### Catalog Agent setup

The Catalog Agent requires a separate Gemini proxy Worker and a shared token.

1. Create a Cloudflare Worker for catalog metadata generation.
2. Add Worker secrets: `GEMINI_API_KEY` and `CATALOG_AGENT_TOKEN`.
3. Add GitHub Actions secrets/variables:

- Secret: `CATALOG_AGENT_TOKEN`
- Variable: `CATALOG_WORKER_URL` (e.g. `https://navigator-catalog-proxy.bntcurtis.workers.dev/`)

### Chat proxy Worker

The chat assistant is served by a separate public Worker, `navigator-chat-proxy`
(source in [`workers/navigator-chat-proxy.js`](workers/navigator-chat-proxy.js)).
It needs the `GEMINI_API_KEY` secret. Optional env vars: `GEMINI_MODEL`,
`GEMINI_THINKING_LEVEL`, and `ALLOWED_ORIGINS`.

Because it is public and unauthenticated (the static site has to call it),
the recommended abuse protection is a **Cloudflare Rate Limiting Rule** on the
Worker's route — e.g. ~20 requests/minute per IP — added in the Cloudflare
dashboard. The Worker also caps request body size and supports an optional
origin allowlist, but those are defense-in-depth, not a replacement for the
rate-limit rule.

### Run the workflow manually

#### Catalog Agent

1. Open the GitHub repo.
2. Click the **Actions** tab.
3. Select **Catalog Agent** in the left sidebar.
4. Click **Run workflow**.
5. Choose the mode:
   - `weekly` for link repairs only (auto-merges if all repairs verify)
   - `monthly` for link repairs + hub/sitemap discovery + metadata generation (requires review)
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
- **Currency** — The catalog is continuously maintained by scheduled automation that checks links weekly, discovers new services monthly, and proposes changes via pull request. See `service-catalog-v8.json`'s `lastUpdated` field for the most recent change.

### Catalog maintenance

The service catalog is maintained through automation, with human review reserved for the riskiest changes:

- **Weekly link repair (self-merging)** — A GitHub Action checks every catalog URL with a browser user agent, repairs safe same-domain redirects, re-verifies each repair, and merges its own PR when every change is a verified low-risk repair. Anything unusual stays open for review.
- **Monthly discovery (human-reviewed)** — The same agent in monthly mode pulls candidate services from the official colorado.gov service hub pages and agency sitemaps, generates bilingual metadata via the worker, and opens a PR with a report in `reports/`. Adding services is the one step that always gets human eyes.
- **Monthly AI review** — A scheduled Claude Code task cross-checks the catalog against the live web: newly announced services, discontinued programs, and open user feedback. Findings are posted as a `monthly-review` GitHub issue.
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
- **Code contributions** — Improve the catalog agent, discovery logic, or main application

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
