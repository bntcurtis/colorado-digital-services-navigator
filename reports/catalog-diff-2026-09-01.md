# Catalog Agent Report
Generated: 2026-09-01
Mode: monthly

## Summary
- Services before: 230
- Services after: 230
- New services: 0
- Link repairs: 0
- Crawl recovery suggestions: 0
- Unresolved issues: 20

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
- ID 51: Find an Inmate
  - URL: https://www.doc.state.co.us/oss/
  - Issue: error
  - Details: fetch failed
- ID 66: Locate Medicaid and Child Health Plan Plus providers
  - URL: https://www.healthfirstcolorado.com/find-doctors/
  - Issue: redirect_suspicious
  - Details: Redirected to different domain
- ID 81: Pay your boiler inspection invoice online
  - URL: https://ops.colorado.gov/Conveyance/PaymentsFees
  - Issue: conflict
  - Details: Candidate URL already used by service ID 79
- ID 82: Pay your petroleum tank invoice online
  - URL: https://ops.colorado.gov/Conveyance/PaymentsFees
  - Issue: conflict
  - Details: Candidate URL already used by service ID 79
- ID 99: Search for business records
  - URL: https://www.sos.state.co.us/biz/BusinessEntityCriteriaExt.do
  - Issue: broken
  - Details: HTTP 403
- ID 115: Verify a Colorado Professional or Business License
  - URL: https://apps2.colorado.gov/dora/licensing/
  - Issue: broken
  - Details: HTTP 405
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
- ID 164: DPO Online Services Portal
  - URL: https://apps2.colorado.gov/dora/licensing/default.aspx
  - Issue: broken
  - Details: HTTP 405
- ID 169: Search the Colorado State Publications Library
  - URL: https://hermes.cde.state.co.us/
  - Issue: error
  - Details: fetch failed
- ID 205: Colorado Crisis Services - 988 Lifeline
  - URL: https://coloradocrisisservices.org/
  - Issue: redirect_suspicious
  - Details: Redirected to different domain

## Discovery Pipeline
- Candidates evaluated: 30
- Added: 0
- Metadata worker errors: 30
- Empty/invalid worker responses: 0
- Rejected by schema sanitization: 0
- Duplicates of existing services: 0

> ⚠️ Discovery produced no additions and the metadata worker errored on every candidate. Check `CATALOG_WORKER_URL`, the token, and the worker/model status.
- Error samples:
  - https://cdle.colorado.gov/unemployment/file-a-claim: Worker error 502: {"error":"Model returned invalid JSON","raw":"{\n  \"name\": {\n    \"en\": \"Start an Unemployment Claim\",\n    \"es\": \"Iniciar un reclamo de desempleo\"\n  },\n  \"description"}
  - https://mydmv.colorado.gov/_/: Worker error 502: {"error":"Model returned invalid JSON","raw":"{\n  \"name\": {\n    \"en\": \"CO myDMV\",\n    \"es\": \"CO myDMV\"\n  },\n  \"description\": {\n"}
  - https://www.colorado.gov/hcpf/how-to-apply: Worker error 502: {"error":"Model returned invalid JSON","raw":"{\n  \"name\": {\n    \"en\": \"Health Coverage Paper Applications and Forms\",\n    \"es\": \"Solicitudes y Formularios en Papel para Cobertura de Salud\""}
  - https://cdphe.colorado.gov/methlabcleanup: Worker error 502: {"error":"Model returned invalid JSON","raw":"{\n  \"name\": {\n    \"en\": \"Methamphetamine-affected properties environmental cleanup\",\n    \"es\": \"Limpieza ambiental de propiedades afectadas por metanfetamina\"\n"}
  - https://cdphe.colorado.gov/health-facilities-licensure-certification-and-registration: Worker error 502: {"error":"Model returned invalid JSON","raw":"{\n  \"name\": {\n    \"en\": \"Health Facilities Licensing, Certification, and Registration\",\n    \"es\": \"Licencias, Certificación y Registro de Instal"}

