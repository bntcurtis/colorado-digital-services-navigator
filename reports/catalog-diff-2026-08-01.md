# Catalog Agent Report
Generated: 2026-08-01
Mode: monthly

## Summary
- Services before: 230
- Services after: 230
- New services: 0
- Link repairs: 10
- Crawl recovery suggestions: 0
- Unresolved issues: 16

## High Confidence Changes
### Link Repairs
- ID 75: MyUI Employer
  - Old URL: https://cdle.colorado.gov/employers/myui-employer-plus
  - New URL: https://cdle.colorado.gov/ui/employers/account-management
  - Reason: Safe redirect to same base domain
  - Confidence: 0.90
- ID 76: MyUI+
  - Old URL: https://cdle.colorado.gov/myui-plus
  - New URL: https://cdle.colorado.gov/ui/claimants/myui
  - Reason: Safe redirect to same base domain
  - Confidence: 0.90
- ID 79: Pay a debt owed to the State of Colorado
  - Old URL: https://ops.colorado.gov/Conveyance/PaymentsFees
  - New URL: https://ops.colorado.gov/conveyances/online-payments-fees
  - Reason: Safe redirect to same base domain
  - Confidence: 0.90
- ID 125: Workers' Compensation Benefits Calculator
  - Old URL: https://cdle.colorado.gov/unemployment/ui-claimant-guide/eligibility-for-ui-benefits
  - New URL: https://cdle.colorado.gov/ui/claimants/claimant-guide/eligibility-for-benefits
  - Reason: Safe redirect to same base domain
  - Confidence: 0.90
- ID 135: Report employer fraud
  - Old URL: https://cdle.colorado.gov/unemployment/report-fraud
  - New URL: https://cdle.colorado.gov/ui/report-fraud
  - Reason: Safe redirect to same base domain
  - Confidence: 0.90
- ID 224: File an unemployment insurance claim
  - Old URL: https://cdle.colorado.gov/unemployment/file-a-claim
  - New URL: https://cdle.colorado.gov/ui/claimants/start-a-claim
  - Reason: Safe redirect to same base domain
  - Confidence: 0.90
- ID 226: Request a new unemployment hearing
  - Old URL: https://cdle.colorado.gov/unemployment/appeals/request-a-new-hearing
  - New URL: https://cdle.colorado.gov/ui/appeals/request-a-new-hearing
  - Reason: Safe redirect to same base domain
  - Confidence: 0.90
- ID 227: Verify your identity for unemployment with ID.me
  - Old URL: https://cdle.colorado.gov/unemployment/file-a-claim/verify-your-identity-with-idme
  - New URL: https://cdle.colorado.gov/ui/claimants/start-a-claim/idme
  - Reason: Safe redirect to same base domain
  - Confidence: 0.90
- ID 228: Register a new unemployment insurance employer account
  - Old URL: https://cdle.colorado.gov/employers/myui-employer/resources/user-guide/registering-a-new-ui-employer-account
  - New URL: https://cdle.colorado.gov/ui/employers/resources/myui-employer-user-guide/registering-a-new-ui-employer-account
  - Reason: Safe redirect to same base domain
  - Confidence: 0.90
- ID 229: Apply for the Work-Share Program
  - Old URL: https://cdle.colorado.gov/employers/myui-employer/resources/user-guide/applying-for-the-work-share-program
  - New URL: https://cdle.colorado.gov/ui/employers/resources/myui-employer-user-guide/work-share-plan-application
  - Reason: Safe redirect to same base domain
  - Confidence: 0.90

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
  - https://mydmv.colorado.gov/_/: Worker error 502: {"error":"Model returned invalid JSON","raw":"{\n  \"name\": {\n    \"en\": \"CO myDMV\",\n    \"es\": \"CO myDMV\"\n  },\n  \"description\": {\n    "}
  - https://www.colorado.gov/hcpf/how-to-apply: Worker error 502: {"error":"Model returned invalid JSON","raw":"{\n  \"name\": {\n    \"en\": \"Health Coverage Member Forms\",\n    \"es\": \"Formularios para Miembros de Cobertura de Salud\"\n  },\n"}
  - https://cdphe.colorado.gov/methlabcleanup: Worker error 502: {"error":"Model returned invalid JSON","raw":"{\n  \"name\": {\n    \"en\": \"Methamphetamine-affected properties environmental cleanup\",\n    \"es\": \"Limpieza ambiental de propiedades afectadas por metanfetamina\"\n  "}
  - https://cdphe.colorado.gov/health-facilities-licensure-certification-and-registration: Worker error 502: {"error":"Model returned invalid JSON","raw":"{\n  \"name\": {\n    \"en\": \"Health Facilities Licensing, Certification, and Registration\",\n    \"es\": \"Licencias, Certificación y Registro de Instalaciones de Salud\"\n  },\n  \"description\": {\n    \"en\": \"Manage mandatory licensing for health facilities and optional Medicare/Medicaid certification for reimbursement.\",\n    \"es\": \"Gestione las licencias obligatorias para instalaciones de salud y la certificación opcional de Medicare/Medicaid para reembolsos.\"\n  },\n  \"url\": \"https://cdphe.colorado.gov/health-facilities-licensure-certification-and-registration\",\n  \"department\": {\n    \"en\": \"Department of Public Health & Environment\",\n"}
  - https://osc.colorado.gov/spco/accesscolorado: Worker error 502: {"error":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later."}

