// Statutory compliance master.
//
// kind:  Q = quarterly, H = half-yearly, A = annual, M = monthly, E = event-based
// applies(c): which entities (company profile flags) the item applies to
// due(x): due date for one period; x carries quarter/FY dates, event dates and working-day helper
// bse: rule used to auto-detect the filing on BSE (see lib/bse.js)
// verify: true where the timeline has been recently amended / should be re-checked against the latest circular

import { addDays, ymd } from './dates.js';

const EQ = c => !!c.listedEquity;
const DEBT = c => !!c.listedDebt;
const DEBT_ONLY = c => !!c.listedDebt && !c.listedEquity;
const LISTED = c => !!(c.listedEquity || c.listedDebt);
const COMPANY = c => c.entityType !== 'llp';
const LLP = c => c.entityType === 'llp';
const UNLISTED_CO = c => COMPANY(c) && !LISTED(c);
const TAX = c => !!c.includeTaxLabour;

// Results-cycle dates: board meeting date if entered/detected, else statutory latest date.
const results = x => x.bm || x.resultsLatest;
const est = x => !x.bm;
const callDate = x => x.call || x.wd(results(x), 1);
const callEst = x => !x.call;

const PORTAL = {
  bse: 'https://listing.bseindia.com/',
  nse: 'https://www.connect2nse.com/',
  mca: 'https://www.mca.gov.in/',
  tax: 'https://www.incometax.gov.in/',
  gst: 'https://www.gst.gov.in/',
  epfo: 'https://unifiedportal-emp.epfindia.gov.in/'
};

export const CATEGORIES = [
  'SEBI LODR', 'SEBI LODR – Debt', 'SEBI PIT', 'SEBI SAST', 'SEBI DP Regulations', 'SEBI ICDR',
  'Exchange / Depository', 'Companies Act / MCA', 'LLP Act / MCA', 'Tax & Labour'
];

export const TEMPLATES = [
  // ───────────────────────── QUARTERLY · LISTED EQUITY ─────────────────────────
  {
    id: 'trading_window', kind: 'Q', cat: 'SEBI PIT', applies: EQ, order: 1,
    title: 'Closure of Trading Window',
    reg: 'SEBI (PIT) Regulations, 2015 – Sch. B',
    timeline: 'On or before 6 days before quarter-end (window closes from end of quarter till 48 hrs after results)',
    due: x => addDays(x.qEnd, -6),
    bse: { src: 'ann', sub: /closure of trading window/i, from: x => addDays(x.qEnd, -40), to: x => addDays(x.qEnd, 5) },
    portal: PORTAL.bse
  },
  {
    id: 'shp', kind: 'Q', cat: 'SEBI LODR', applies: EQ, order: 2,
    title: 'Regulation 31 (1) (b) – Shareholding Pattern',
    reg: 'SEBI LODR Reg. 31(1)(b)',
    timeline: 'Within 21 days from the end of the quarter',
    due: x => addDays(x.qEnd, 21),
    bse: { src: 'shp' }, portal: PORTAL.bse
  },
  {
    id: 'igov', kind: 'Q', cat: 'SEBI LODR', applies: EQ, order: 3,
    title: 'Integrated Filing – Governance (Reg 27(2) Corporate Governance Report & Reg 13(3) Investor Grievances)',
    reg: 'SEBI LODR Reg. 27(2), 13(3) – SEBI circular dt. 31-Dec-2024',
    timeline: 'Within 30 days from the end of the quarter',
    due: x => addDays(x.qEnd, 30),
    bse: { src: 'igov' }, portal: PORTAL.bse
  },
  {
    id: 'rsca', kind: 'Q', cat: 'SEBI DP Regulations', applies: EQ, order: 4,
    title: 'Reconciliation of Share Capital Audit Report',
    reg: 'SEBI (Depositories & Participants) Regs, 2018 – Reg. 76',
    timeline: 'Within 30 days from the end of the quarter',
    due: x => addDays(x.qEnd, 30),
    bse: { src: 'ann', text: /reconciliation of share capital|reg(ulation)?\.?\s*76\b/i, from: x => addDays(x.qEnd, 1), to: x => addDays(x.qEnd, 60) },
    portal: PORTAL.bse
  },
  {
    id: 'reg74_5', kind: 'Q', cat: 'SEBI DP Regulations', applies: EQ, order: 5,
    title: 'Certificate under Reg 74(5) of SEBI (DP) Regulations, 2018',
    reg: 'SEBI (DP) Regs, 2018 – Reg. 74(5)',
    timeline: 'Within 15 days from the end of the quarter (RTA certificate on demat requests)',
    due: x => addDays(x.qEnd, 15),
    bse: { src: 'ann', text: /74\s*\(\s*5\s*\)/, from: x => addDays(x.qEnd, 1), to: x => addDays(x.qEnd, 45) },
    portal: PORTAL.bse
  },
  {
    id: 'reg29', kind: 'Q', cat: 'SEBI LODR', applies: EQ, order: 6, eventField: 'bm',
    title: 'Regulation 29 – Prior Intimation of Board Meeting (Financial Results)',
    reg: 'SEBI LODR Reg. 29(1)(a), 29(2)',
    timeline: 'At least 2 working days before the Board Meeting (excluding date of intimation and date of meeting)',
    due: x => x.wd(results(x), -3), est,
    bse: { src: 'ann', cat: /board meeting/i, sub: /^board meeting$/i, text: /intimation/i, pick: 'last', from: x => x.bm ? addDays(x.bm, -20) : addDays(x.qEnd, 1), to: x => x.bm || addDays(x.qEnd, x.q === 4 ? 70 : 55) },
    portal: PORTAL.bse
  },
  {
    id: 'ifin', kind: 'Q', cat: 'SEBI LODR', applies: EQ, order: 7,
    title: x => 'Integrated Filing – Financials (Reg 33(3)(a) Financial Results with Limited Review/Auditor’s Report' +
      (x.q === 2 || x.q === 4 ? ', Reg 23(9) Related Party Transactions' : '') +
      ', Reg 32 Statement of Deviation)' + (x.q === 4 ? ' – Audited Annual Results' : ''),
    reg: 'SEBI LODR Reg. 33, 23(9), 32 – SEBI circular dt. 31-Dec-2024',
    timeline: x => x.q === 4 ? 'Within 60 days from the end of the financial year' : 'Within 45 days from the end of the quarter',
    due: results, est,
    bse: { src: 'ifin' }, portal: PORTAL.bse
  },
  {
    id: 'bm_outcome', kind: 'Q', cat: 'SEBI LODR', applies: EQ, order: 8,
    title: 'Regulation 30 / 33 – Outcome of Board Meeting & Financial Results',
    reg: 'SEBI LODR Reg. 30 r/w Sch. III Part A, Reg. 33(3)',
    timeline: 'Within 30 minutes of conclusion of the Board Meeting',
    due: results, est,
    bse: { src: 'ann', sub: /outcome of board meeting|financial results/i, from: x => x.bm || addDays(x.qEnd, 1), to: x => x.bm ? addDays(x.bm, 1) : addDays(x.qEnd, x.q === 4 ? 70 : 55) },
    portal: PORTAL.bse
  },
  {
    id: 'ma_report', kind: 'Q', cat: 'SEBI ICDR', applies: c => EQ(c) && c.monitoringAgency, order: 9,
    title: 'Regulation 32(6) / Regulation 30 – Monitoring Agency Report',
    reg: 'SEBI ICDR Reg. 41(4); SEBI LODR Reg. 32(6)',
    timeline: 'Within 45 days from the end of the quarter (filed on the same day as financials)',
    due: x => [results(x), addDays(x.qEnd, 45)].sort()[0], est,
    bse: { src: 'ann', sub: /monitoring agency/i, from: x => x.bm ? addDays(x.bm, -10) : addDays(x.qEnd, 1), to: x => addDays(x.bm || x.qEnd, x.bm ? 30 : 75) },
    portal: PORTAL.bse
  },
  {
    id: 'inv_pres', kind: 'Q', cat: 'SEBI LODR', applies: c => EQ(c) && c.earningsCall, order: 10,
    title: 'Regulation 30 (LODR) – Investor Presentation',
    reg: 'SEBI LODR Reg. 30 r/w Sch. III Part A Para 15; Reg. 46(2)(o)',
    timeline: 'On same day when financials are filed (before the call)',
    due: results, est,
    bse: { src: 'ann', sub: /investor presentation/i, from: x => x.bm || addDays(x.qEnd, 1), to: x => addDays(x.bm || x.qEnd, x.bm ? 10 : 80) },
    portal: PORTAL.bse
  },
  {
    id: 'newspaper', kind: 'Q', cat: 'SEBI LODR', applies: EQ, order: 11,
    title: 'Regulation 47 / Regulation 30 – Newspaper Publication of Financial Results',
    reg: 'SEBI LODR Reg. 47(1)(b), 47(3)',
    timeline: 'Next day when financials are filed (statutory: within 48 hours of the Board Meeting)',
    due: x => addDays(results(x), 1), est,
    bse: { src: 'ann', sub: /newspaper publication/i, from: x => x.bm || addDays(x.qEnd, 1), to: x => addDays(x.bm || x.qEnd, x.bm ? 7 : 80) },
    portal: PORTAL.bse
  },
  {
    id: 'ec_intimation', kind: 'Q', cat: 'SEBI LODR', applies: c => EQ(c) && c.earningsCall, order: 12, eventField: 'call',
    title: 'Regulation 30 – Earnings Call (Schedule of Analyst / Investor Meet – Intimation)',
    reg: 'SEBI LODR Reg. 30 r/w Sch. III Part A Para 15(a)',
    timeline: 'At least 2 working days in advance (excluding date of intimation and date of the call)',
    due: x => x.wd(callDate(x), -3), est: callEst,
    bse: { src: 'ann', sub: /analyst.*investor meet/i, text: /intimation/i, from: x => x.bm ? addDays(x.bm, -20) : addDays(x.qEnd, 1), to: x => x.call || addDays(x.qEnd, 80) },
    portal: PORTAL.bse
  },
  {
    id: 'ec_audio', kind: 'Q', cat: 'SEBI LODR', applies: c => EQ(c) && c.earningsCall, order: 13,
    title: 'Regulation 30 – Outcome of Earnings Call (Audio Recording)',
    reg: 'SEBI LODR Reg. 30 r/w Sch. III Part A Para 15(b); Reg. 46(2)(oa)',
    timeline: 'Same day of Earnings Call (before next trading day or within 24 hours, whichever is earlier)',
    due: callDate, est: callEst,
    bse: { src: 'ann', sub: /analyst.*investor meet/i, text: /outcome|audio|recording/i, from: x => x.call || x.bm || addDays(x.qEnd, 1), to: x => addDays(x.call || x.bm || x.qEnd, x.bm ? 10 : 85) },
    portal: PORTAL.bse
  },
  {
    id: 'ec_transcript', kind: 'Q', cat: 'SEBI LODR', applies: c => EQ(c) && c.earningsCall, order: 14,
    title: 'Regulation 30 / Regulation 46 – Earnings Call Transcript',
    reg: 'SEBI LODR Reg. 30 r/w Sch. III Part A Para 15(c); Reg. 46(2)(oa)',
    timeline: 'Within five working days of the conclusion of the call',
    due: x => x.wd(callDate(x), 5), est: callEst,
    bse: { src: 'ann', sub: /earnings call transcript/i, from: x => x.bm || addDays(x.qEnd, 1), to: x => addDays(x.bm || x.qEnd, x.bm ? 30 : 100) },
    portal: PORTAL.bse
  },

  // ───────────────────────── QUARTERLY · LISTED DEBT (NCDs) ─────────────────────────
  {
    id: 'd_bm', kind: 'Q', cat: 'SEBI LODR – Debt', applies: DEBT_ONLY, order: 20, eventField: 'bm',
    title: 'Regulation 50(1) – Prior Intimation of Board Meeting (Debt)',
    reg: 'SEBI LODR Reg. 50(1)',
    timeline: 'At least 2 working days in advance (excluding date of intimation and date of meeting)',
    due: x => x.wd(results(x), -3), est, portal: PORTAL.bse
  },
  {
    id: 'd_results', kind: 'Q', cat: 'SEBI LODR – Debt', applies: DEBT_ONLY, order: 21,
    title: x => 'Regulation 52 – Financial Results of Debt-Listed Entity' + (x.q === 4 ? ' (Audited Annual)' : ''),
    reg: 'SEBI LODR Reg. 52(1), 52(2)',
    timeline: x => x.q === 4 ? 'Within 60 days from the end of the financial year' : 'Within 45 days from the end of the quarter',
    due: results, est, portal: PORTAL.bse
  },
  {
    id: 'd_52_4', kind: 'Q', cat: 'SEBI LODR – Debt', applies: DEBT, order: 22,
    title: 'Regulation 52(4) Ratios & Regulation 52(7)/(7A) – Statement of Utilisation / Deviation of Issue Proceeds (NCDs)',
    reg: 'SEBI LODR Reg. 52(4), 52(7), 52(7A)',
    timeline: x => x.q === 4 ? 'Along with annual results – within 60 days' : 'Along with quarterly results – within 45 days',
    due: results, est, portal: PORTAL.bse
  },
  {
    id: 'd_54', kind: 'Q', cat: 'SEBI LODR – Debt', applies: DEBT, order: 23,
    title: 'Regulation 54 – Security Cover Certificate (Secured NCDs)',
    reg: 'SEBI LODR Reg. 54(2), 54(3); SEBI Master Circular for Debenture Trustees',
    timeline: 'Quarterly, along with the financial results',
    due: results, est, verify: true, portal: PORTAL.bse
  },
  {
    id: 'd_57_5', kind: 'Q', cat: 'SEBI LODR – Debt', applies: DEBT, order: 24,
    title: 'Regulation 57(5) – Certificate on Status of Interest / Principal Payment for the Quarter',
    reg: 'SEBI LODR Reg. 57(5)',
    timeline: 'Within 7 working days from the end of the quarter',
    due: x => x.wd(x.qEnd, 7), portal: PORTAL.bse
  },
  {
    id: 'd_57_4', kind: 'Q', cat: 'SEBI LODR – Debt', applies: DEBT, order: 25,
    title: 'Regulation 57(4) – Details of Interest / Principal Obligations Payable in the Next Quarter',
    reg: 'SEBI LODR Reg. 57(4)',
    timeline: 'Within 5 working days prior to the beginning of the next quarter',
    due: x => x.wd(addDays(x.qEnd, 1), -5), portal: PORTAL.bse
  },
  {
    id: 'd_news', kind: 'Q', cat: 'SEBI LODR – Debt', applies: DEBT_ONLY, order: 26,
    title: 'Regulation 52(8) – Newspaper Publication of Financial Results (Debt)',
    reg: 'SEBI LODR Reg. 52(8)',
    timeline: 'Within 2 working days of conclusion of the Board Meeting',
    due: x => x.wd(results(x), 2), est, portal: PORTAL.bse
  },

  // ───────────────────────── QUARTERLY · UNLISTED COMPANIES ─────────────────────────
  {
    id: 'bm_173', kind: 'Q', cat: 'Companies Act / MCA', applies: UNLISTED_CO, order: 30,
    title: 'Board Meeting – Section 173 (minimum 4 in a year, gap ≤ 120 days)',
    reg: 'Companies Act, 2013 – s.173; SS-1',
    timeline: 'At least one Board Meeting every quarter; gap between two meetings not more than 120 days',
    due: x => x.qEnd, portal: PORTAL.mca
  },

  // ───────────────────────── HALF-YEARLY ─────────────────────────
  {
    id: 'msme1', kind: 'H', cat: 'Companies Act / MCA', applies: COMPANY, order: 40,
    title: h => `MSME-1 – Half-yearly return of dues to Micro & Small Enterprises (${h === 1 ? 'Oct–Mar' : 'Apr–Sep'})`,
    reg: 'Companies Act s.405; Specified Companies (Furnishing of information about payment to MSE suppliers) Order',
    timeline: '30 April (for Oct–Mar) and 31 October (for Apr–Sep) — if dues to MSE suppliers exceed 45 days',
    halves: fy => [ymd(fy, 4, 30), ymd(fy, 10, 31)], portal: PORTAL.mca
  },
  {
    id: 'pas6', kind: 'H', cat: 'Companies Act / MCA', applies: c => c.entityType === 'unlisted_public', order: 41,
    title: h => `PAS-6 – Reconciliation of Share Capital Audit Report (${h === 1 ? 'half-year ended March' : 'half-year ended September'})`,
    reg: 'Companies (Prospectus & Allotment of Securities) Rules – Rule 9A(8)',
    timeline: 'Within 60 days from the end of each half-year',
    halves: fy => [ymd(fy, 5, 30), ymd(fy, 11, 29)], portal: PORTAL.mca
  },

  // ───────────────────────── ANNUAL · LISTED ─────────────────────────
  {
    id: 'sast31_4', kind: 'A', cat: 'SEBI SAST', applies: EQ, order: 50, forPrevFY: true,
    title: 'SAST Reg 31(4) – Annual Declaration by Promoters on Encumbrance',
    reg: 'SEBI (SAST) Regulations, 2011 – Reg. 31(4)',
    timeline: 'Within 7 working days from the end of the financial year',
    due: x => x.wd(ymd(x.fy, 3, 31), 7),
    bse: { src: 'ann', text: /31\s*\(\s*4\s*\)/, from: x => ymd(x.fy, 4, 1), to: x => ymd(x.fy, 5, 31) },
    portal: PORTAL.bse
  },
  {
    id: 'listing_fee', kind: 'A', cat: 'Exchange / Depository', applies: LISTED, order: 51,
    title: 'Annual Listing Fee – BSE & NSE',
    reg: 'SEBI LODR Reg. 14',
    timeline: 'By 30 April of every financial year',
    due: x => ymd(x.fy, 4, 30), portal: PORTAL.bse
  },
  {
    id: 'custody_fee', kind: 'A', cat: 'Exchange / Depository', applies: LISTED, order: 52,
    title: 'Annual Issuer / Custody Fee – NSDL & CDSL',
    reg: 'SEBI circulars on depository fees',
    timeline: 'By 30 April of every financial year',
    due: x => ymd(x.fy, 4, 30)
  },
  {
    id: 'reg7_3', kind: 'A', cat: 'SEBI LODR', applies: LISTED, order: 53, forPrevFY: true,
    title: 'Regulation 7(3) – Compliance Certificate on Share Transfer Facility (RTA & Compliance Officer)',
    reg: 'SEBI LODR Reg. 7(3)',
    timeline: 'Within 30 days from the end of the financial year',
    due: x => ymd(x.fy, 4, 30),
    bse: { src: 'ann', text: /\b7\s*\(\s*3\s*\)/, from: x => ymd(x.fy, 4, 1), to: x => ymd(x.fy, 6, 30) },
    portal: PORTAL.bse
  },
  {
    id: 'reg40_9', kind: 'A', cat: 'SEBI LODR', applies: EQ, order: 54, forPrevFY: true,
    title: 'Regulation 40(9) – Certificate from Practising Company Secretary (Transfer / Transmission)',
    reg: 'SEBI LODR Reg. 40(9), 40(10)',
    timeline: 'Within 30 days from the end of the financial year',
    due: x => ymd(x.fy, 4, 30),
    bse: { src: 'ann', text: /40\s*\(\s*9\s*\)/, from: x => ymd(x.fy, 4, 1), to: x => ymd(x.fy, 6, 30) },
    portal: PORTAL.bse
  },
  {
    id: 'lc_initial', kind: 'A', cat: 'SEBI LODR – Debt', applies: c => !!c.largeCorporate, order: 55, verify: true,
    title: 'Large Corporate – Initial Disclosure',
    reg: 'SEBI Master Circular for issue & listing of Non-Convertible Securities – Large Corporate framework',
    timeline: 'Within 30 days from the beginning of the financial year',
    due: x => ymd(x.fy, 4, 30),
    bse: { src: 'ann', text: /large corporate/i, from: x => ymd(x.fy, 4, 1), to: x => ymd(x.fy, 6, 30) },
    portal: PORTAL.bse
  },
  {
    id: 'lc_annual', kind: 'A', cat: 'SEBI LODR – Debt', applies: c => !!c.largeCorporate, order: 56, verify: true, forPrevFY: true,
    title: 'Large Corporate – Annual Disclosure (incremental borrowings)',
    reg: 'SEBI Master Circular for issue & listing of Non-Convertible Securities – Large Corporate framework',
    timeline: 'Within 45 days from the end of the financial year',
    due: x => ymd(x.fy, 5, 15),
    bse: { src: 'ann', text: /large corporate.*annual|annual disclosure.*large corporate/i, from: x => ymd(x.fy, 4, 1), to: x => ymd(x.fy, 7, 31) },
    portal: PORTAL.bse
  },
  {
    id: 'reg24a', kind: 'A', cat: 'SEBI LODR', applies: LISTED, order: 57, forPrevFY: true,
    title: 'Regulation 24A – Annual Secretarial Compliance Report',
    reg: 'SEBI LODR Reg. 24A(2)',
    timeline: 'Within 60 days from the end of the financial year',
    due: x => ymd(x.fy, 5, 30),
    bse: { src: 'ann', text: /24\s*\(?\s*A\s*\)?.*secretarial|annual secretarial compliance/i, from: x => ymd(x.fy, 4, 1), to: x => ymd(x.fy, 7, 31) },
    portal: PORTAL.bse
  },
  {
    id: 'reg34', kind: 'A', cat: 'SEBI LODR', applies: EQ, order: 58, forPrevFY: true,
    title: 'Regulation 34(1) – Annual Report & AGM Notice to Stock Exchanges',
    reg: 'SEBI LODR Reg. 34(1); Companies Act s.101 (21 clear days’ notice)',
    timeline: 'Not later than the day of dispatch to shareholders (at least 21 clear days before AGM)',
    due: x => addDays(x.agm, -22),
    bse: { src: 'ann', sub: /annual report/i, from: x => ymd(x.fy, 6, 1), to: x => x.agm },
    portal: PORTAL.bse
  },
  {
    id: 'brsr', kind: 'A', cat: 'SEBI LODR', applies: c => EQ(c) && c.brsr, order: 59, forPrevFY: true,
    title: 'Regulation 34(2)(f) – Business Responsibility & Sustainability Report (BRSR)',
    reg: 'SEBI LODR Reg. 34(2)(f)',
    timeline: 'As part of the Annual Report (top 1,000 listed entities by market cap)',
    due: x => addDays(x.agm, -22), portal: PORTAL.bse
  },
  {
    id: 'reg53', kind: 'A', cat: 'SEBI LODR – Debt', applies: DEBT_ONLY, order: 60, forPrevFY: true,
    title: 'Regulation 53 – Annual Report to Stock Exchange & Debenture Trustee',
    reg: 'SEBI LODR Reg. 53(2)',
    timeline: 'Not later than the day of dispatch to shareholders',
    due: x => addDays(x.agm, -22), portal: PORTAL.bse
  },
  {
    id: 'reg44_3', kind: 'A', cat: 'SEBI LODR', applies: EQ, order: 61, forPrevFY: true,
    title: 'Regulation 44(3) – Voting Results of AGM with Scrutinizer’s Report',
    reg: 'SEBI LODR Reg. 44(3)',
    timeline: 'Within 2 working days of conclusion of the AGM',
    due: x => x.wd(x.agm, 2),
    bse: { src: 'ann', text: /voting result|scrutini[sz]er/i, from: x => x.agm, to: x => addDays(x.agm, 10) },
    portal: PORTAL.bse
  },
  {
    id: 'agm_proc', kind: 'A', cat: 'SEBI LODR', applies: EQ, order: 62, forPrevFY: true,
    title: 'Regulation 30 – Proceedings / Outcome of AGM',
    reg: 'SEBI LODR Reg. 30 r/w Sch. III Part A Para 13',
    timeline: 'Within 24 hours of conclusion of the AGM',
    due: x => addDays(x.agm, 1),
    bse: { src: 'ann', text: /outcome of agm|proceedings/i, from: x => x.agm, to: x => addDays(x.agm, 7) },
    portal: PORTAL.bse
  },
  {
    id: 'mgt15', kind: 'A', cat: 'Companies Act / MCA', applies: EQ, order: 63, forPrevFY: true,
    title: 'MGT-15 – Report on Annual General Meeting',
    reg: 'Companies Act s.121; Rule 31',
    timeline: 'Within 30 days of conclusion of the AGM',
    due: x => addDays(x.agm, 30), portal: PORTAL.mca
  },
  {
    id: 'id_meeting', kind: 'A', cat: 'SEBI LODR', applies: c => EQ(c) || c.entityType === 'unlisted_public', order: 64,
    title: 'Separate Meeting of Independent Directors',
    reg: 'SEBI LODR Reg. 25(3); Companies Act Sch. IV Para VII',
    timeline: 'At least once in every financial year',
    due: x => ymd(x.fy + 1, 3, 31)
  },
  {
    id: 'mr3', kind: 'A', cat: 'Companies Act / MCA', applies: c => LISTED(c) || c.secretarialAudit, order: 65, forPrevFY: true,
    title: 'Secretarial Audit Report (MR-3) – annexed to Board’s Report',
    reg: 'Companies Act s.204; SEBI LODR Reg. 24A(1)',
    timeline: 'Along with the Board’s Report / Annual Report',
    due: x => addDays(x.agm, -22),
    bse: { src: 'ann', sub: /annual report/i, from: x => ymd(x.fy, 6, 1), to: x => x.agm }
  },

  // ───────────────────────── ANNUAL · COMPANIES ACT / MCA ─────────────────────────
  {
    id: 'mbp1', kind: 'A', cat: 'Companies Act / MCA', applies: COMPANY, order: 70,
    title: 'MBP-1 & DIR-8 – Disclosure of Interest and Non-disqualification by Directors',
    reg: 'Companies Act s.184(1), s.164(2); Rule 9 & Rule 14',
    timeline: 'At the first Board Meeting of the financial year (and on any change)',
    due: x => ymd(x.fy, 5, 31)
  },
  {
    id: 'dpt3', kind: 'A', cat: 'Companies Act / MCA', applies: COMPANY, order: 71, forPrevFY: true,
    title: 'DPT-3 – Return of Deposits / Outstanding Receipts not considered Deposits',
    reg: 'Companies (Acceptance of Deposits) Rules – Rule 16 & 16A',
    timeline: 'By 30 June every year (position as on 31 March)',
    due: x => ymd(x.fy, 6, 30), portal: PORTAL.mca
  },
  {
    id: 'dir3kyc', kind: 'A', cat: 'Companies Act / MCA', applies: c => true, order: 72, verify: true,
    title: 'DIR-3 KYC – KYC of Directors / Designated Partners (holding DIN)',
    reg: 'Companies (Appointment & Qualification of Directors) Rules – Rule 12A',
    timeline: 'By 30 September (check latest MCA notification on periodicity)',
    due: x => ymd(x.fy, 9, 30), portal: PORTAL.mca
  },
  {
    id: 'cra2', kind: 'A', cat: 'Companies Act / MCA', applies: c => COMPANY(c) && c.costAudit, order: 73,
    title: 'CRA-2 – Intimation of Appointment of Cost Auditor',
    reg: 'Companies Act s.148; Companies (Cost Records & Audit) Rules – Rule 6(3)',
    timeline: 'Within 30 days of Board Meeting or 180 days from commencement of FY, whichever is earlier',
    due: x => ymd(x.fy, 9, 27), portal: PORTAL.mca
  },
  {
    id: 'agm', kind: 'A', cat: 'Companies Act / MCA', applies: COMPANY, order: 74, forPrevFY: true, eventField: 'agm',
    title: 'Annual General Meeting (adoption of accounts)',
    reg: 'Companies Act s.96',
    timeline: 'Within 6 months from the end of the financial year (by 30 September)',
    due: x => x.agm, est: x => !x.agmSet,
    bse: { src: 'ann', sub: /agm/i, text: /outcome of agm|proceedings of.*agm/i, from: x => ymd(x.fy, 5, 1), to: x => ymd(x.fy, 12, 31) }
  },
  {
    id: 'adt1', kind: 'A', cat: 'Companies Act / MCA', applies: COMPANY, order: 75, forPrevFY: true,
    title: 'ADT-1 – Appointment / Re-appointment of Statutory Auditor',
    reg: 'Companies Act s.139; Rule 4(2)',
    timeline: 'Within 15 days of the AGM (in the year of appointment / re-appointment)',
    due: x => addDays(x.agm, 15), portal: PORTAL.mca
  },
  {
    id: 'aoc4', kind: 'A', cat: 'Companies Act / MCA', applies: COMPANY, order: 76, forPrevFY: true,
    title: x => 'AOC-4' + (x.c.listedEquity || x.c.listedDebt ? ' XBRL / AOC-4 CFS' : ' / AOC-4 CFS') + ' – Filing of Financial Statements',
    reg: 'Companies Act s.137',
    timeline: 'Within 30 days of the AGM',
    due: x => addDays(x.agm, 30), portal: PORTAL.mca
  },
  {
    id: 'csr2', kind: 'A', cat: 'Companies Act / MCA', applies: c => COMPANY(c) && c.csr, order: 77, forPrevFY: true, verify: true,
    title: 'CSR-2 – Report on Corporate Social Responsibility',
    reg: 'Companies (CSR Policy) Rules – Rule 12(1A)',
    timeline: 'Separately, after filing AOC-4 (as per MCA notified due date)',
    due: x => addDays(x.agm, 30), portal: PORTAL.mca
  },
  {
    id: 'cra4', kind: 'A', cat: 'Companies Act / MCA', applies: c => COMPANY(c) && c.costAudit, order: 78, forPrevFY: true,
    title: 'CRA-4 – Filing of Cost Audit Report',
    reg: 'Companies (Cost Records & Audit) Rules – Rule 6(6)',
    timeline: 'Within 30 days of receipt of the cost audit report (report due within 180 days of FY end)',
    due: x => ymd(x.fy, 10, 27), portal: PORTAL.mca
  },
  {
    id: 'mgt7', kind: 'A', cat: 'Companies Act / MCA', applies: COMPANY, order: 79, forPrevFY: true,
    title: 'MGT-7 / MGT-7A – Annual Return',
    reg: 'Companies Act s.92(4)',
    timeline: 'Within 60 days of the AGM',
    due: x => addDays(x.agm, 60), portal: PORTAL.mca
  },

  // ───────────────────────── ANNUAL · LLP ─────────────────────────
  {
    id: 'llp11', kind: 'A', cat: 'LLP Act / MCA', applies: LLP, order: 80, forPrevFY: true,
    title: 'Form 11 – Annual Return of LLP',
    reg: 'LLP Act, 2008 s.35; LLP Rules – Rule 25',
    timeline: 'Within 60 days from the end of the financial year (by 30 May)',
    due: x => ymd(x.fy, 5, 30), portal: PORTAL.mca
  },
  {
    id: 'llp8', kind: 'A', cat: 'LLP Act / MCA', applies: LLP, order: 81, forPrevFY: true,
    title: 'Form 8 – Statement of Account & Solvency',
    reg: 'LLP Act, 2008 s.34; LLP Rules – Rule 24',
    timeline: 'Within 30 days from the end of six months of the financial year (by 30 October)',
    due: x => ymd(x.fy, 10, 30), portal: PORTAL.mca
  },

  // ───────────────────────── TAX & LABOUR (optional) ─────────────────────────
  {
    id: 'tds_pay', kind: 'M', cat: 'Tax & Labour', applies: TAX, order: 90,
    title: m => `TDS / TCS deposit – deductions of ${m}`,
    timeline: '7th of the following month (March deductions: 30 April)',
    dueFor: (y, m) => m === 3 ? ymd(y, 4, 30) : (m === 12 ? ymd(y + 1, 1, 7) : ymd(y, m + 1, 7)), portal: PORTAL.tax
  },
  {
    id: 'gstr1', kind: 'M', cat: 'Tax & Labour', applies: TAX, order: 91,
    title: m => `GSTR-1 – Outward supplies for ${m}`,
    timeline: '11th of the following month',
    dueFor: (y, m) => m === 12 ? ymd(y + 1, 1, 11) : ymd(y, m + 1, 11), portal: PORTAL.gst
  },
  {
    id: 'pf_esi', kind: 'M', cat: 'Tax & Labour', applies: TAX, order: 92,
    title: m => `PF & ESI contribution / ECR – wages of ${m}`,
    timeline: '15th of the following month',
    dueFor: (y, m) => m === 12 ? ymd(y + 1, 1, 15) : ymd(y, m + 1, 15), portal: PORTAL.epfo
  },
  {
    id: 'gstr3b', kind: 'M', cat: 'Tax & Labour', applies: TAX, order: 93,
    title: m => `GSTR-3B – Summary return & tax payment for ${m}`,
    timeline: '20th of the following month',
    dueFor: (y, m) => m === 12 ? ymd(y + 1, 1, 20) : ymd(y, m + 1, 20), portal: PORTAL.gst
  },
  {
    id: 'adv_tax', kind: 'Q', cat: 'Tax & Labour', applies: TAX, order: 94,
    title: x => `Advance Tax – ${['1st (15%)', '2nd (45%)', '3rd (75%)', '4th (100%)'][x.q - 1]} instalment`,
    timeline: '15 June / 15 September / 15 December / 15 March',
    due: x => [ymd(x.fy, 6, 15), ymd(x.fy, 9, 15), ymd(x.fy, 12, 15), ymd(x.fy + 1, 3, 15)][x.q - 1], portal: PORTAL.tax
  },
  {
    id: 'tds_return', kind: 'Q', cat: 'Tax & Labour', applies: TAX, order: 95,
    title: 'Quarterly TDS / TCS Statements (salary & non-salary)',
    timeline: '31 July / 31 October / 31 January / 31 May',
    due: x => [ymd(x.fy, 7, 31), ymd(x.fy, 10, 31), ymd(x.fy + 1, 1, 31), ymd(x.fy + 1, 5, 31)][x.q - 1], portal: PORTAL.tax
  },
  {
    id: 'tax_audit', kind: 'A', cat: 'Tax & Labour', applies: TAX, order: 96, forPrevFY: true,
    title: 'Tax Audit Report', timeline: 'By 30 September', due: x => ymd(x.fy, 9, 30), portal: PORTAL.tax
  },
  {
    id: 'itr', kind: 'A', cat: 'Tax & Labour', applies: TAX, order: 97, forPrevFY: true,
    title: 'Income Tax Return (audit cases)', timeline: 'By 31 October', due: x => ymd(x.fy, 10, 31), portal: PORTAL.tax
  },
  {
    id: 'gstr9', kind: 'A', cat: 'Tax & Labour', applies: TAX, order: 98, forPrevFY: true,
    title: 'GSTR-9 / 9C – GST Annual Return & Reconciliation', timeline: 'By 31 December', due: x => ymd(x.fy, 12, 31), portal: PORTAL.gst
  }
];

// Event-based compliances: no fixed calendar date. The user logs an occurrence (event date) and the due date is derived.
// offset: calendar days; offsetWD: working days (negative = before the event).
export const EVENT_TEMPLATES = [
  { id: 'ev_reg30', cat: 'SEBI LODR', applies: LISTED, title: 'Reg 30 – Disclosure of Material Event / Information (Sch. III)', eventLabel: 'Event / decision date', timeline: 'Within 30 min of Board decision; 12 hrs if event emanates from within; 24 hrs otherwise', offset: 1 },
  { id: 'ev_pit7', cat: 'SEBI PIT', applies: EQ, title: 'PIT Reg 7(2)(b) – Continual Disclosure of Insider Trades to Exchanges', eventLabel: 'Date disclosure received', timeline: 'Within 2 trading days of receipt of disclosure / becoming aware', offsetWD: 2 },
  { id: 'ev_reg39', cat: 'SEBI LODR', applies: EQ, title: 'Reg 39(3) – Loss of Share Certificates / Issue of Duplicates', eventLabel: 'Date information received', timeline: 'Within 2 days of getting the information', offset: 2 },
  { id: 'ev_reg42', cat: 'SEBI LODR', applies: EQ, title: 'Reg 42 – Prior Intimation of Record Date (dividend / corporate action)', eventLabel: 'Record date', timeline: 'At least 3 working days in advance (excluding date of intimation and record date)', offsetWD: -4, verify: true },
  { id: 'ev_reg31a', cat: 'SEBI LODR', applies: EQ, title: 'Reg 31A – Re-classification of Promoter: intimation of request / board decision', eventLabel: 'Date of request / board decision', timeline: 'Within 24 hours', offset: 1 },
  { id: 'ev_reg57_1', cat: 'SEBI LODR – Debt', applies: DEBT, title: 'Reg 57(1) – Certificate of Payment of Interest / Principal on NCDs', eventLabel: 'Payment due date', timeline: 'Within 1 working day of the interest / principal becoming due', offsetWD: 1 },
  { id: 'ev_reg60', cat: 'SEBI LODR – Debt', applies: DEBT, title: 'Reg 60(2) – Intimation of Record Date (Debt)', eventLabel: 'Record date', timeline: 'At least 7 working days in advance (excluding date of intimation and record date)', offsetWD: -8, verify: true },
  { id: 'ev_reg55', cat: 'SEBI LODR – Debt', applies: DEBT, title: 'Reg 55 / Reg 30 – Credit Rating Revision', eventLabel: 'Date of rating action', timeline: 'Within 24 hours of receipt of rating communication', offset: 1 },
  { id: 'ev_mgt14', cat: 'Companies Act / MCA', applies: COMPANY, title: 'MGT-14 – Filing of Board / Special Resolutions', eventLabel: 'Date of resolution', timeline: 'Within 30 days of passing the resolution', offset: 30 },
  { id: 'ev_dir12', cat: 'Companies Act / MCA', applies: COMPANY, title: 'DIR-12 – Appointment / Cessation of Director or KMP', eventLabel: 'Date of appointment / cessation', timeline: 'Within 30 days of the change', offset: 30 },
  { id: 'ev_pas3', cat: 'Companies Act / MCA', applies: COMPANY, title: 'PAS-3 – Return of Allotment', eventLabel: 'Date of allotment', timeline: 'Within 15 days (private placement, s.42(9)); 30 days for other allotments (s.39(4))', offset: 15 },
  { id: 'ev_chg1', cat: 'Companies Act / MCA', applies: COMPANY, title: 'CHG-1 / CHG-4 – Creation, Modification or Satisfaction of Charge', eventLabel: 'Date of creation / satisfaction', timeline: 'Within 30 days', offset: 30 },
  { id: 'ev_sh7', cat: 'Companies Act / MCA', applies: COMPANY, title: 'SH-7 – Alteration of Share Capital', eventLabel: 'Date of resolution', timeline: 'Within 30 days of alteration', offset: 30 },
  { id: 'ev_inc22', cat: 'Companies Act / MCA', applies: COMPANY, title: 'INC-22 – Change in Registered Office', eventLabel: 'Date of change', timeline: 'Within 30 days', offset: 30 },
  { id: 'ev_adt3', cat: 'Companies Act / MCA', applies: COMPANY, title: 'ADT-3 – Resignation of Statutory Auditor (filed by auditor)', eventLabel: 'Date of resignation', timeline: 'Within 30 days of resignation', offset: 30 },
  { id: 'ev_ben2', cat: 'Companies Act / MCA', applies: COMPANY, title: 'BEN-2 – Return of Significant Beneficial Owners', eventLabel: 'Date of receipt of BEN-1', timeline: 'Within 30 days of receipt of declaration', offset: 30 },
  { id: 'ev_iepf', cat: 'Companies Act / MCA', applies: COMPANY, title: 'IEPF-1 / IEPF-4 – Transfer of Unclaimed Dividend / Shares to IEPF', eventLabel: 'Date amount / shares became due for transfer', timeline: 'Within 30 days of becoming due for transfer', offset: 30 },
  { id: 'ev_llp3', cat: 'LLP Act / MCA', applies: LLP, title: 'LLP Form 3 – LLP Agreement and changes', eventLabel: 'Date of agreement / change', timeline: 'Within 30 days', offset: 30 },
  { id: 'ev_llp4', cat: 'LLP Act / MCA', applies: LLP, title: 'LLP Form 4 – Appointment / Cessation of Partner / Designated Partner', eventLabel: 'Date of change', timeline: 'Within 30 days', offset: 30 }
];

export const ENTITY_TYPES = {
  listed: 'Listed Company (NSE / BSE)',
  unlisted_public: 'Unlisted Public Company',
  private: 'Private Limited Company',
  llp: 'Limited Liability Partnership (LLP)'
};
