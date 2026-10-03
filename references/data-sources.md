# Exchange & regulator data sources

Everything here was verified against the live sites. The exchanges change their front-ends often — if a source
breaks, run `scripts/check_sources.mjs` first, then re-discover the endpoint (see "Re-discovering an endpoint").

## Contents
1. Fetching rules (why curl, which headers)
2. BSE endpoints
3. NSE endpoints
4. SEBI endpoints
5. Matching filings to compliances
6. Re-discovering an endpoint

## 1. Fetching rules

- **BSE (`api.bseindia.com`) sits behind Akamai bot protection.** A plain request returns `Access Denied`.
  It is accepted when the request carries browser-like headers, *including the `sec-fetch-*` trio*:
  `User-Agent` (Chrome), `Accept: application/json, text/plain, */*`, `Accept-Language`, `Referer: https://www.bseindia.com/`,
  `Origin: https://www.bseindia.com`, `sec-fetch-site: same-site`, `sec-fetch-mode: cors`, `sec-fetch-dest: empty`.
- **Use the system `curl`, not Node's `fetch`/`https`.** BSE responses contain a header with leading whitespace that
  Node's strict HTTP parser (undici) rejects with `HPE_INVALID_HEADER_TOKEN`; Node's `https` with `insecureHTTPParser`
  is in turn fingerprinted and blocked by Akamai. curl (Windows ships `curl.exe`) with `--compressed` works reliably.
  The app's `lib/http.js` wraps this and retries non-JSON answers.
- **NSE needs a session cookie.** First GET an HTML page (writes cookies to a jar), then call the API with that jar.
  Use `--http1.1`; HTTP/2 to nseindia.com sometimes hangs until timeout.
- Corporate/office networks and some ISPs block `*.trycloudflare.com` — relevant only for sharing the app, not for fetching.

## 2. BSE endpoints (base `https://api.bseindia.com/BseIndiaAPI/api/`)

| Purpose | Path | Notes |
|---|---|---|
| Corporate announcements | `AnnSubCategoryGetData/w?pageno=1&strCat=-1&strPrevDate=YYYYMMDD&strScrip=<code>&strSearch=P&strToDate=YYYYMMDD&strType=C&subcategory=-1` | 50 rows/page, `Table1[0].ROWCNT` = total. **Date range max 12 months.** Fields: `NEWSSUB`, `HEADLINE`, `CATEGORYNAME`, `SUBCATNAME`, `News_submission_dt` (exact submission time), `DissemDT`, `ATTACHMENTNAME` |
| Shareholding pattern | `SHPQNewFormat/w?scripcode=<code>&qtrid=&type=` | `qtrid`, `qtr`, `filing_date_time`, `navigateurl`. Ignore fractional qtrids (e.g. 129.01 = event-based SHP) |
| Integrated Filing – Governance | `Integratedfiledata/w?scripcode=<code>` | `qtrid`, `filing_date_time`, `xbrlurl` |
| Integrated Filing – Finance | `Integratedfinancedata/w?scripcode=<code>` | `Qtrid` (capital Q), `Quarter_Name` (Standalone/Consolidated), `filing_date_time` |
| Circulars to listed companies | `getDataAdvance_New/w?strTxtNoticeNo=&strTxtDate=YYYY-MM-DD&strTxtTodate=YYYY-MM-DD&strScripcode=&strDep=&strSegment=&subject=&category=Circulars%20Listed%20Companies&containgtext=` | Current data incl. `Segment_Name` (Equity/Debt) and `FileName` (PDF). The older `GetDataCirToListComp/w` is stale — don't use it |
| All listed scrips (company lookup) | `ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active` | ~4–5k rows: `SCRIP_CD`, `scrip_id` (≈ NSE symbol), `ISIN_NUMBER`, `Issuer_Name`, `Mktcap` (₹ cr). Cache daily; rank by Mktcap for the BRSR top-1,000 hint |

**BSE quarter id:** `qtrid = 130 + (FYstartYear − 2026) × 4 + (quarterIndex − 1)` → Jun-2026 = 130, Sep-2026 = 131, Mar-2026 = 129.

**Attachment PDFs:** `https://www.bseindia.com/xml-data/corpfiling/AttachLive/<file>.pdf` for recent filings; older
ones move to `.../AttachHis/<file>.pdf` and the Live URL returns 404. Resolve at click time (the app's `/api/bse-pdf/:file`
tries Live, then His).

**Useful announcement sub-categories (SUBCATNAME):** `Closure of Trading Window`, `Board Meeting` (intimation),
`Outcome of Board Meeting`, `Financial Results`, `Monitoring Agency Report`, `Investor Presentation`, `Newspaper Publication`,
`Earnings Call Transcript`, `Analyst / Investor Meet` (text contains *Intimation* or *Outcome*), `Certificate under Reg. 74 (5) …`,
`Reg.24(A)-Annual Secretarial Compliance`, `Reg. 34 (1) Annual Report`, `AGM` (text: *Outcome of AGM*, *Scrutinizer's Report*).
Results announcements name the quarter ("…Quarter Ended June 30, 2026") — use that to detect the results board-meeting
date even when results are filed late.

## 3. NSE endpoints

| Purpose | URL | Notes |
|---|---|---|
| Circulars issued to listed companies – Equity | `https://www.nseindia.com/companies-listing/circular-for-listed-companies-equity-market` | **Server-rendered HTML table** (Particulars / NSE circular date+PDF / SEBI circular date+PDF). This is the page compliance teams use |
| – Debt | `https://www.nseindia.com/companies-listing/circular-for-listed-companies-debt-market` | Same layout |
| All exchange circulars (not used by default) | `https://www.nseindia.com/api/circulars?fromDate=DD-MM-YYYY&toDate=DD-MM-YYYY` | Cookie required; mostly trading/surveillance noise |
| RSS fallback | `https://nsearchives.nseindia.com/content/RSS/Circulars.xml` | Only the latest few items |

## 4. SEBI

- Listing pages (HTML table: date, title link): `https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=<n>&smid=0`
  with `ssid=7` circulars, `6` master circulars, `3` regulations.
- RSS `https://www.sebi.gov.in/sebirss.xml` — mostly enforcement orders; can contain blank items → drop entries without title/date.
- MCA has no machine-readable notifications feed; MCA changes are tracked through the compliance master.

## 5. Matching filings to compliances

- Each compliance template in `lib/master.js` carries a `bse` rule: source (`ann` / `shp` / `igov` / `ifin`) plus, for
  announcements, regexes on sub-category / category / text and a date window built from quarter-end, board-meeting
  date or AGM date. `pick: 'last'` takes the latest match (used for Reg 29: the intimation just before the meeting).
- Detect event dates first (results board meeting per quarter, AGM), then rebuild the calendar and match — windows
  anchored on the board-meeting date avoid catching unrelated announcements (e.g. newspaper ads for the AGM).
- Never overwrite a submission the user entered manually; store the BSE submission timestamp and a link as evidence.
- Filings with no BSE footprint (MCA forms, listing/custody fees, MBP-1, DPT-3, often RSCA / Reg 7(3) / 40(9)) stay manual.

## 6. Re-discovering an endpoint

BSE's site is an Angular app. Download `https://www.bseindia.com/assets/includenew/js/main-*.js` (name from the page's
`<script src>`), then every `chunk-XXXXXXXX.js` it references (two levels deep). Search the chunks for the API key
names (e.g. `integratedfinancedata:"/Integratedfinancedata/w"`) and for the component that calls them to see the query
parameters. For NSE, check whether the page is server-rendered (search the HTML for a known circular title) before
looking for an API.
