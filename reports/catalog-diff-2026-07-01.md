# Catalog Agent Report
Generated: 2026-07-01
Mode: monthly

## Summary
- Services before: 230
- Services after: 230
- New services: 0
- Link repairs: 1
- Crawl recovery suggestions: 0
- Unresolved issues: 22

## High Confidence Changes
### Link Repairs
- ID 62: Learn about industrial hemp (not marijuana)
  - Old URL: https://ag.colorado.gov/plants/hemp
  - New URL: https://ag.colorado.gov/plants/hemp/inspection-and-testing-information
  - Reason: Sitemap match (score 0.67)
  - Confidence: 0.82

## Unresolved Issues (Needs Review)
- ID 5: Apply for Health First Colorado (Medicaid)
  - URL: https://www.healthfirstcolorado.com/apply-now/
  - Issue: redirect_suspicious
  - Details: Redirected to different domain
- ID 16: Child Support Services
  - URL: https://childsupport.state.co.us/
  - Issue: redirect_suspicious
  - Details: Redirected to different domain
- ID 24: Colorado PEAK - Apply for Benefits
  - URL: https://coloradopeak.secure.force.com
  - Issue: broken
  - Details: HTTP 404
- ID 36: Business Entity Registration
  - URL: https://www.sos.state.co.us/biz/Welcome.do
  - Issue: broken
  - Details: HTTP 403
- ID 38: Fishing Atlas
  - URL: https://cpw.state.co.us/fishing/pages/fishingatlas.aspx
  - Issue: broken
  - Details: HTTP 404
- ID 39: Hunting Atlas
  - URL: https://cpw.state.co.us/hunting/pages/huntingatlas.aspx
  - Issue: broken
  - Details: HTTP 404
- ID 66: Locate Medicaid and Child Health Plan Plus providers
  - URL: https://www.healthfirstcolorado.com/find-doctors/
  - Issue: redirect_suspicious
  - Details: Redirected to different domain
- ID 79: Pay a debt owed to the State of Colorado
  - URL: https://ops.colorado.gov/Conveyance/PaymentsFees
  - Issue: soft_404
  - Details: Content contains: "404"
- ID 81: Pay your boiler inspection invoice online
  - URL: https://ops.colorado.gov/Conveyance/PaymentsFees
  - Issue: soft_404
  - Details: Content contains: "404"
- ID 82: Pay your petroleum tank invoice online
  - URL: https://ops.colorado.gov/Conveyance/PaymentsFees
  - Issue: soft_404
  - Details: Content contains: "404"
- ID 92: Renew an ag-related license with AgLicense
  - URL: https://ag.colorado.gov/
  - Issue: soft_404
  - Details: Content contains: "404"
- ID 97: Search agriculture & livestock statistics
  - URL: https://ag.colorado.gov/
  - Issue: soft_404
  - Details: Content contains: "404"
- ID 99: Search for business records
  - URL: https://www.sos.state.co.us/biz/BusinessEntityCriteriaExt.do
  - Issue: broken
  - Details: HTTP 403
- ID 115: Verify a Colorado Professional or Business License
  - URL: https://apps2.colorado.gov/dora/licensing/
  - Issue: soft_404
  - Details: Content contains: "oOps"
- ID 117: View information for truckers
  - URL: https://www.codot.gov/topcontent/trafficfooter
  - Issue: broken
  - Details: HTTP 404
- ID 130: Revenue Online
  - URL: https://www.colorado.gov/revenueonline/_/
  - Issue: broken
  - Details: HTTP 404
- ID 131: SchoolView
  - URL: https://www.cde.state.co.us/schoolview
  - Issue: broken
  - Details: HTTP 404
- ID 133: Safe2Tell
  - URL: https://safe2tell.org
  - Issue: conflict
  - Details: Candidate URL already used by service ID 111
- ID 144: Get free help for mental health or substance use right now
  - URL: https://coloradocrisisservices.org/
  - Issue: redirect_suspicious
  - Details: Redirected to different domain
- ID 159: Hunger Free Colorado Hotline
  - URL: https://hungerfreecolorado.org/
  - Issue: broken
  - Details: HTTP 403
- ID 205: Colorado Crisis Services - 988 Lifeline
  - URL: https://coloradocrisisservices.org/
  - Issue: redirect_suspicious
  - Details: Redirected to different domain
- ID 209: Hunger Free Colorado - Food Assistance Help
  - URL: https://hungerfreecolorado.org/
  - Issue: broken
  - Details: HTTP 403

## Discovery Pipeline
- Candidates evaluated: 30
- Added: 0
- Metadata worker errors: 30
- Empty/invalid worker responses: 0
- Rejected by schema sanitization: 0
- Duplicates of existing services: 0

> ⚠️ Discovery produced no additions and the metadata worker errored on every candidate. Check `CATALOG_WORKER_URL`, the token, and the worker/model status.
- Error samples:
  - https://mydmv.colorado.gov/_/: Worker error 502: {"error":"Model returned invalid JSON","raw":"{\n  \"name\": {\n    \"en\": \"CO myDMV\",\n    \"es\": \"CO myDMV\"\n  },\n  \"description\": {\n    "}
  - https://www.colorado.gov/hcpf/how-to-apply: Worker error 502: {"error":"Model returned invalid JSON","raw":"{\n  \"name\": {\n    \"en\": \"Health Coverage Paper Applications and Forms\",\n    \"es\": \"Formularios y Solicitudes en Papel para Cobertura de Salud\"\n  },\n  \"description\": {\n    \"en\": \"Access and print paper applications for health coverage, disability status, and identity verification to submit by mail or in person.\",\n    \"es\": \"Acceda e imprima solicitudes en papel para cobertura de salud, estado de discapacidad y verificación de identidad para enviar por correo o en persona.\"\n  },\n  \"url\": \"https://www.colorado.gov/hcpf/how-to-apply\",\n  \"department\": {\n    \"en\": \"Department of Health Care Policy and Financing\",\n    \"es\": \"Departamento de Políticas de Salud y Financ"}
  - https://cdphe.colorado.gov/methlabcleanup: Worker error 502: {"error":"Model returned invalid JSON","raw":"{\n  \"name\": {\n    \"en\": \"Methamphetamine-affected properties environmental cleanup\",\n    \"es\": \"Limpieza ambiental de propiedades afectadas por metanfetaminas"}
  - https://cdphe.colorado.gov/health-facilities-licensure-certification-and-registration: Worker error 502: {"error":"Model returned invalid JSON","raw":"{\n  \"name\": {\n    \"en\": \"Health Facilities Licensing, Certification, and Registration\",\n    \"es\": \"Licencias, Certificación y Registro de Instalaciones"}
  - https://osc.colorado.gov/spco/accesscolorado: Worker error 502: {"error":"Model returned invalid JSON","raw":"{\n  \"name\": {\n    \"en\": \"Doing Business with the State of Colorado\",\n    \"es\": \"Hacer negocios con el estado de Colorado\"\n  },\n  \"description\": {\n    \"en\": \"Resources and guidance for suppliers to research, register, and access procurement opportunities with Colorado state agencies.\",\n    \"es\": \"Recursos y guías para ayudar a los proveedores a investigar, registrarse y acceder a oportunidades de contratación con las agencias estatales de Colorado.\"\n  },\n  \"url\": \"https://osc.colorado.gov/spco/accesscolorado\",\n  \"department\": {\n    \"en\": \"Office of the State Controller\",\n    \"es\": \""}

