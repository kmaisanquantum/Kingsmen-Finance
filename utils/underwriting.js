/**
 * Kingsmen Finance — Underwriting & Math Engine
 * 20% p.a. reducing balance, fortnightly repayments
 */

const RATE_ANNUAL = 0.20;
const FORTNIGHTS_PER_YEAR = 26;
const RATE_FORTNIGHT = RATE_ANNUAL / FORTNIGHTS_PER_YEAR; // 0.007692...
const MAX_DEBT_RATIO = 0.30;
const MIN_LOAN = 100;
const MAX_LOAN = 2500;
const DEFAULT_TERM = 4;

/**
 * Calculate fortnightly EMI using amortization formula
 * EMI = [P × r × (1+r)^n] / [(1+r)^n − 1]
 */
function calcEMI(principal, rate, periods) {
  if (periods === 0 || principal === 0) return 0;
  const rn = Math.pow(1 + rate, periods);
  return (principal * rate * rn) / (rn - 1);
}

/**
 * Build full amortization schedule
 */
function buildAmortizationSchedule(principal, rate, periods) {
  const emi = calcEMI(principal, rate, periods);
  const schedule = [];
  let balance = principal;

  for (let i = 1; i <= periods; i++) {
    const interest = balance * rate;
    const principalPaid = emi - interest;
    balance = Math.max(0, balance - principalPaid);

    schedule.push({
      period: i,
      payment: round2(emi),
      interest: round2(interest),
      principal_paydown: round2(principalPaid),
      remaining_balance: round2(balance)
    });
  }

  return { emi: round2(emi), schedule };
}

/**
 * Find maximum affordable loan given max EMI
 * Derived from EMI formula: P = EMI × [(1+r)^n − 1] / [r × (1+r)^n]
 */
function maxAffordableLoan(maxEMI, rate, periods) {
  const rn = Math.pow(1 + rate, periods);
  return maxEMI * (rn - 1) / (rate * rn);
}

/**
 * Core underwriting decision engine
 */
function underwrite(params) {
  const {
    name,
    doc_type,
    doc_number,
    doc_expired,
    employer,
    net_fortnightly_pay,
    requested_amount,
    term = DEFAULT_TERM,
    purpose
  } = params;

  const r = RATE_FORTNIGHT;
  const results = {
    decision: 'APPROVED',
    decline_reasons: [],
    adjustments: [],
    client_profile: {
      name: name || 'Applicant',
      net_pay: net_fortnightly_pay,
      doc_type,
      doc_number,
      employer,
      limit_applied: null
    },
    loan_summary: null,
    amortization_table: [],
    debt_ratio: null,
    customer_message: ''
  };

  // ── STEP 1: Identity Check ──
  if (doc_expired === true) {
    results.decision = 'DECLINED';
    results.decline_reasons.push('Identity document is expired. Please renew and reapply.');
  }

  // ── STEP 2: Income Check ──
  if (!net_fortnightly_pay || net_fortnightly_pay <= 0) {
    results.decision = 'DECLINED';
    results.decline_reasons.push('Net fortnightly pay could not be verified from the payslip provided.');
  }

  if (results.decision === 'DECLINED') {
    results.customer_message = buildMessage('DECLINED', results.client_profile.name, results.decline_reasons.join(' '), null, null);
    return results;
  }

  // ── STEP 3: Loan Cap ──
  let P = Math.min(requested_amount, MAX_LOAN);
  if (P < MIN_LOAN) P = MIN_LOAN;

  if (requested_amount > MAX_LOAN) {
    results.adjustments.push(`Requested amount capped at K${MAX_LOAN.toFixed(2)} per product policy.`);
  }

  // ── STEP 4: Debt Ratio Check ──
  const emi = calcEMI(P, r, term);
  const debtRatio = emi / net_fortnightly_pay;

  if (debtRatio > MAX_DEBT_RATIO) {
    const maxEMI = net_fortnightly_pay * MAX_DEBT_RATIO;
    const reducedP = maxAffordableLoan(maxEMI, r, term);

    if (reducedP < MIN_LOAN) {
      results.decision = 'DECLINED';
      results.decline_reasons.push(
        `Debt-to-income ratio of ${(debtRatio * 100).toFixed(1)}% exceeds the maximum 30% policy. ` +
        `Net fortnightly pay of K${net_fortnightly_pay.toFixed(2)} is insufficient to support a loan above the minimum K${MIN_LOAN}.`
      );
      results.customer_message = buildMessage('DECLINED', results.client_profile.name, results.decline_reasons[0], null, null);
      return results;
    }

    const originalP = P;
    P = round2(Math.floor(reducedP * 100) / 100);
    results.adjustments.push(
      `Loan amount reduced from K${originalP.toFixed(2)} to K${P.toFixed(2)} to comply with 30% debt ratio policy.`
    );
  }

  // ── STEP 5: Build Schedule ──
  const { emi: finalEMI, schedule } = buildAmortizationSchedule(P, r, term);
  const totalRepayable = round2(finalEMI * term);
  const totalInterest = round2(totalRepayable - P);
  const finalDebtRatio = finalEMI / net_fortnightly_pay;

  results.client_profile.limit_applied = P;
  results.debt_ratio = round2(finalDebtRatio * 100);
  results.loan_summary = {
    principal: P,
    interest_rate: '20% p.a. (Reducing Balance)',
    term_fortnights: term,
    total_interest: totalInterest,
    total_repayable: totalRepayable,
    fortnightly_installment: finalEMI,
    purpose: purpose || 'Not specified'
  };
  results.amortization_table = schedule;
  results.customer_message = buildMessage(
    'APPROVED',
    results.client_profile.name,
    results.adjustments.join(' '),
    finalEMI,
    P
  );

  return results;
}

function buildMessage(decision, name, note, emi, principal) {
  if (decision === 'APPROVED') {
    let msg = `Dear ${name}, congratulations! Your personal loan application has been approved by Kingsmen Finance. `;
    if (note) msg += note + ' ';
    msg += `Your approved amount of K${principal?.toFixed(2)} will be disbursed promptly, with fortnightly repayments of K${emi?.toFixed(2)}. `;
    msg += `We appreciate your trust in Kingsmen Finance and look forward to serving you. Welcome to the family.`;
    return msg;
  } else {
    return `Dear ${name}, we regret to inform you that your loan application has been declined at this time. ${note} ` +
      `We encourage you to contact our team for further guidance. Thank you for choosing Kingsmen Finance.`;
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { underwrite, calcEMI, buildAmortizationSchedule, RATE_FORTNIGHT, MIN_LOAN, MAX_LOAN };
