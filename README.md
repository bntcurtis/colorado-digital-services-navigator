# Colorado Digital Services Navigator

A modern, accessible web application that helps Coloradans discover and access 213 state government digital services. Built to demonstrate what effective government service navigation could look like.

**[Live Demo](https://colorado-gov.org)** | **[View on GitHub](https://bntcurtis.github.io/colorado-digital-services-navigator/)**

---

## About this project

Colorado celebrates its 150th birthday as a state in 2026. To mark the occasion, this project catalogs 213 digital government services and presents them through a modern, user-friendly interface.

This is an independent demonstration project. It is **not affiliated with Colorado.gov** or any official state government entity.

### Why this exists

Accessing government services shouldn't be hard. Unfortunately, many state government websites make it difficult to find what you need. This project demonstrates an alternative approach, inspired by design systems from:

- **[GOV.UK](https://design-system.service.gov.uk/)** — The UK's pioneering government design system
- **[U.S. Web Design System](https://designsystem.digital.gov/)** — Federal accessibility and design standards
- **[NSW Digital](https://www.digital.nsw.gov.au/)** — New South Wales, Australia's service design approach
- **[Ontario Digital Service Standard](https://www.ontario.ca/page/digital-service-standard)** — Ontario, Canada's digital principles

### Key features

- **Multi-dimensional navigation** — Browse services by task ("I need to renew..."), life event ("I'm having a baby..."), audience ("For veterans..."), or category
- **Fast search** — Full-text search across service names, descriptions, and tags
- **Mobile-friendly** — Responsive design that works on any device
- **Accessible** — Keyboard navigation, screen reader support, and WCAG-aligned design
- **No backend required** — Self-contained HTML file that works anywhere, including Google Sites
- **Colorado spirit** — True explorers know that clicking the state's two-letter abbreviation three times quickly reveals a hidden path through the Rockies

---

## Technical details

### Architecture

The entire application is a single HTML file with embedded CSS and JavaScript. The service catalog is embedded as a JSON object. This design choice means:

- No server infrastructure required
- Works offline once loaded
- Easy to deploy anywhere (Cloudflare Pages, GitHub Pages, Google Sites, etc.)
- Fast load times (single HTTP request)

### Service catalog structure

Each service in the catalog includes:

```json
{
  "id": 1,
  "name": "Service name",
  "description": "What this service does",
  "url": "https://...",
  "department": "Department name",
  "departmentUrl": "https://...",
  "category": "Health and Wellbeing",
  "subcategory": "Healthcare and Insurance",
  "lifeEvent": "Healthcare and Wellness",
  "lifeEventDetail": "Insurance and Benefits",
  "taskType": "Apply",
  "taskDetail": "for Benefits",
  "audience": "Individuals and Families",
  "audienceDetail": "Low-Income Households",
  "tags": ["benefits", "insurance", "healthcare"],
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
| `index.html` | The main application (213 services) |
| `colorado-service-navigator-v6.html` | Versioned copy of the main application |
| `service-catalog-v6.json` | Service catalog data in JSON format |
| `service-schema-v2.json` | JSON Schema for validating the catalog |
| `README.md` | This file |

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
- **Currency** — The catalog reflects services available as of January 2026. URLs were validated and updated on January 25, 2026.

### Updates

This is a point-in-time demonstration. The service catalog is not automatically updated. If you find outdated information, please open an issue or submit a pull request.

---

## Running locally

No build process required. Simply:

1. Download `index.html` (or `colorado-service-navigator-v6.html`)
2. Open it in a web browser

Or clone the repository:

```bash
git clone https://github.com/bntcurtis/colorado-digital-services.git
cd colorado-digital-services
open index.html
```

---

## Contributing

Contributions are welcome! Here are some ways to help:

- **Report broken links** — Open an issue if you find a service URL that no longer works
- **Suggest new services** — Know of a Colorado digital service that's missing? Let us know
- **Improve descriptions** — Help make service descriptions clearer and more helpful
- **Accessibility feedback** — Report any accessibility issues you encounter

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
