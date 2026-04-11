/**
 * Kingsmen Finance — Frontend Application
 * Communicates with Express backend API
 */

'use strict';

// ── CONFIG ──
const API = {
  health: '/api/health',
  calculate: '/api/loan/calculate',
  assess: '/api/loan/assess',
  extract: '/api/extract/assess'
};

// ── STATE ──
let currentMode = 'ai';
let isLoading = false;
let aiEnabled = false;

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  checkHealth();
  setupDragDrop('zone-id', 'id');
  setupDragDrop('zone-pay', 'pay');
});

// ── HEALTH CHECK ──
async function checkHealth() {
  const dot = document.getElementById('api-status');
  try {
    const res = await fetch(API.health);
    const data = await res.json();
    aiEnabled = data.ai_enabled;

    dot.className = 'status-dot ok';
    dot.title = `API Online · AI Extraction: ${aiEnabled ? 'Enabled' : 'Disabled'}`;

    const badge = document.getElementById('ai-badge');
    const badgeText = document.getElementById('ai-badge-text');
    if (aiEnabled) {
      badge.style.opacity = '1';
      badgeText.textContent = 'AI-Enabled';
    } else {
      badge.style.opacity = '0.5';
      badgeText.textContent = 'No API Key';
      badge.title = 'Set ANTHROPIC_API_KEY in .env to enable AI extraction';
    }
  } catch (e) {
    dot.className = 'status-dot err';
    dot.title = 'Cannot reach API server';
    showToast('Cannot connect to server. Make sure the backend is running.', 'error');
  }
}

// ── MODE SWITCH ──
function switchMode(mode) {
  currentMode = mode;
  document.getElementById('btn-ai').classList.toggle('active', mode === 'ai');
  document.getElementById('btn-manual').classList.toggle('active', mode === 'manual');
  document.getElementById('mode-ai').classList.toggle('active', mode === 'ai');
  document.getElementById('mode-manual').classList.toggle('active', mode === 'manual');
}

// ── FILE UPLOAD ──
function handleUpload(type) {
  const input = document.getElementById(`file-${type}`);
  const file = input.files[0];
  if (!file) return;

  const zone = document.getElementById(`zone-${type}`);
  const content = document.getElementById(`upload-${type}-content`);
  const done = document.getElementById(`upload-${type}-done`);
  const fname = document.getElementById(`fname-${type}`);

  zone.classList.add('has-file');
  content.style.display = 'none';
  done.style.display = 'flex';
  fname.textContent = file.name;
}

function setupDragDrop(zoneId, type) {
  const zone = document.getElementById(zoneId);
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--gold)'; });
  zone.addEventListener('dragleave', () => { if (!zone.classList.contains('has-file')) zone.style.borderColor = ''; });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    const input = document.getElementById(`file-${type}`);
    const dt = e.dataTransfer;
    if (dt.files.length) {
      input.files = dt.files;
      handleUpload(type);
    }
  });
}

// ── LIVE CALCULATOR ──
async function liveCalc() {
  const P = parseFloat(document.getElementById('loan-amount').value);
  const n = parseInt(document.getElementById('loan-term').value);

  const iEl = document.getElementById('est-install');
  const intEl = document.getElementById('est-interest');
  const totEl = document.getElementById('est-total');

  if (!P || P < 100) {
    [iEl, intEl, totEl].forEach(el => { el.textContent = 'K—'; });
    return;
  }

  try {
    const res = await fetch(API.calculate, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ principal: Math.min(P, 2500), term: n })
    });
    const data = await res.json();
    iEl.textContent = fmt(data.fortnightly_installment);
    intEl.textContent = fmt(data.total_interest);
    totEl.textContent = fmt(data.total_repayable);
  } catch (e) {
    // Fallback: local calculation
    const r = 0.00769;
    const rn = Math.pow(1 + r, n);
    const cap = Math.min(P, 2500);
    const emi = (cap * r * rn) / (rn - 1);
    iEl.textContent = fmt(emi);
    intEl.textContent = fmt(emi * n - cap);
    totEl.textContent = fmt(emi * n);
  }
}

// ── SUBMIT ──
async function submitApplication() {
  if (isLoading) return;

  const loanAmt = parseFloat(document.getElementById('loan-amount').value);
  const term = parseInt(document.getElementById('loan-term').value);
  const purpose = document.getElementById('loan-purpose').value;

  if (!loanAmt || loanAmt < 100) {
    showToast('Please enter a valid loan amount (minimum K100)', 'error');
    return;
  }

  setLoading(true);

  try {
    let result;

    if (currentMode === 'ai') {
      result = await submitAIMode(loanAmt, term, purpose);
    } else {
      result = await submitManualMode(loanAmt, term, purpose);
    }

    renderResult(result);
    document.getElementById('result-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    console.error(err);
    showToast(err.message || 'Assessment failed. Please try again.', 'error');
  } finally {
    setLoading(false);
  }
}

// ── AI MODE SUBMISSION ──
async function submitAIMode(loanAmt, term, purpose) {
  const idFile = document.getElementById('file-id').files[0];
  const payFile = document.getElementById('file-pay').files[0];

  if (!idFile || !payFile) {
    showToast('Running demo — no documents uploaded', 'warn');
    // Demo assessment via manual endpoint
    return submitDemoMode(loanAmt, term, purpose);
  }

  if (!aiEnabled) {
    showToast('AI extraction disabled — add ANTHROPIC_API_KEY to .env', 'warn');
    return submitDemoMode(loanAmt, term, purpose);
  }

  const formData = new FormData();
  formData.append('id_document', idFile);
  formData.append('payslip', payFile);
  formData.append('requested_amount', loanAmt);
  formData.append('term', term);
  formData.append('purpose', purpose);

  const res = await fetch(API.extract, { method: 'POST', body: formData });
  const data = await res.json();

  if (!res.ok) throw new Error(data.error || 'AI extraction failed');
  return data;
}

// ── MANUAL MODE SUBMISSION ──
async function submitManualMode(loanAmt, term, purpose) {
  const name = document.getElementById('m-name').value.trim();
  const netPay = parseFloat(document.getElementById('m-netpay').value);
  const docType = document.getElementById('m-doctype').value;
  const docNum = document.getElementById('m-docnum').value.trim();
  const docExpired = document.getElementById('m-expired').value === 'true';
  const employer = document.getElementById('m-employer').value.trim();

  if (!name) { showToast('Full name is required', 'error'); throw new Error('Missing name'); }
  if (!netPay || netPay <= 0) { showToast('Net fortnightly pay is required', 'error'); throw new Error('Missing pay'); }

  const res = await fetch(API.assess, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name, net_fortnightly_pay: netPay,
      doc_type: docType, doc_number: docNum || 'N/A',
      doc_expired: docExpired, employer: employer || 'Not specified',
      requested_amount: loanAmt, term, purpose
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Assessment failed');
  return data;
}

// ── DEMO MODE ──
async function submitDemoMode(loanAmt, term, purpose) {
  const res = await fetch(API.assess, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Peter Kila Namaliu',
      net_fortnightly_pay: 2800,
      doc_type: 'PNG NID',
      doc_number: 'NID-892341',
      doc_expired: false,
      employer: 'PNG Power Ltd',
      requested_amount: loanAmt,
      term, purpose
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  data._demo = true;
  return data;
}

// ── RENDER RESULT ──
function renderResult(result) {
  const panel = document.getElementById('result-panel');
  panel.style.display = 'block';

  // ── Decision Badge ──
  const badge = document.getElementById('decision-badge');
  badge.textContent = result.decision;
  badge.className = 'decision-badge ' + result.decision.toLowerCase();

  document.getElementById('decision-name').textContent = result.client_profile.name;
  document.getElementById('decision-msg').textContent = result.customer_message;

  // Adjustments
  const adjEl = document.getElementById('decision-adjustments');
  adjEl.innerHTML = '';
  if (result.adjustments && result.adjustments.length > 0) {
    result.adjustments.forEach(a => {
      const tag = document.createElement('div');
      tag.className = 'adj-tag';
      tag.textContent = '⚠ ' + a;
      adjEl.appendChild(tag);
    });
  }
  if (result._demo) {
    const tag = document.createElement('div');
    tag.className = 'adj-tag';
    tag.textContent = '⚡ Demo mode — upload documents for real assessment';
    adjEl.appendChild(tag);
  }

  // ── Stats Row ──
  const statsRow = document.getElementById('stats-row');
  if (result.decision === 'APPROVED' && result.loan_summary) {
    const ls = result.loan_summary;
    const dr = result.debt_ratio;
    const drColor = dr <= 30 ? 'green' : 'red';
    statsRow.innerHTML = `
      <div class="stat-cell">
        <div class="stat-label">Approved Principal</div>
        <div class="stat-value">${fmt(ls.principal)}</div>
        <div class="stat-sub">PGK</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Fortnightly Payment</div>
        <div class="stat-value">${fmt(ls.fortnightly_installment)}</div>
        <div class="stat-sub">${ls.term_fortnights} payments</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Total Repayable</div>
        <div class="stat-value">${fmt(ls.total_repayable)}</div>
        <div class="stat-sub">incl. K${ls.total_interest.toFixed(2)} interest</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Debt-to-Income</div>
        <div class="stat-value ${drColor}">${dr}%</div>
        <div class="stat-sub">Max 30% policy</div>
      </div>
    `;
  } else {
    statsRow.innerHTML = `
      <div class="stat-cell">
        <div class="stat-label">Decision</div>
        <div class="stat-value red">Declined</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Net Fortnightly Pay</div>
        <div class="stat-value">${fmt(result.client_profile.net_pay || 0)}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Approved Amount</div>
        <div class="stat-value col-dim">K0.00</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Decline Reasons</div>
        <div class="stat-value" style="font-size:14px;color:var(--red)">${(result.decline_reasons||[]).length}</div>
      </div>
    `;
  }

  // ── Info Panels ──
  const ip = document.getElementById('info-panels');
  const cp = result.client_profile;
  const ex = result.extraction || {};

  let profileHTML = `
    <div class="kv-grid">
      <div class="kv-item"><div class="kv-key">Full Name</div><div class="kv-val">${cp.name || '—'}</div></div>
      <div class="kv-item"><div class="kv-key">Document Type</div><div class="kv-val">${cp.doc_type || '—'}</div></div>
      <div class="kv-item"><div class="kv-key">Document No.</div><div class="kv-val">${cp.doc_number || '—'}</div></div>
      <div class="kv-item"><div class="kv-key">Employer</div><div class="kv-val">${cp.employer || '—'}</div></div>
      <div class="kv-item"><div class="kv-key">Net Fortnightly Pay</div><div class="kv-val">${fmt(cp.net_pay || 0)}</div></div>
      <div class="kv-item"><div class="kv-key">Loan Purpose</div><div class="kv-val">${result.loan_summary?.purpose || '—'}</div></div>
    </div>
  `;

  let extractHTML = '';
  if (result.extraction) {
    extractHTML = `
      <div class="kv-grid">
        <div class="kv-item"><div class="kv-key">AI Confidence</div><div class="kv-val">${ex.confidence || '—'}</div></div>
        <div class="kv-item"><div class="kv-key">Pay Period (raw)</div><div class="kv-val">${ex.raw_pay_period || '—'}</div></div>
        <div class="kv-item"><div class="kv-key">Net Pay (as shown)</div><div class="kv-val">${ex.raw_net_pay ? fmt(ex.raw_net_pay) : '—'}</div></div>
        <div class="kv-item"><div class="kv-key">Currency</div><div class="kv-val">${ex.currency || '—'}</div></div>
        <div class="kv-item" style="grid-column:1/-1"><div class="kv-key">Extraction Notes</div><div class="kv-val">${ex.notes || '—'}</div></div>
      </div>
    `;
  } else {
    extractHTML = `
      <div class="kv-grid">
        <div class="kv-item" style="grid-column:1/-1">
          <div class="kv-key">Entry Method</div>
          <div class="kv-val">Manual — no AI extraction performed</div>
        </div>
      </div>
    `;
  }

  ip.innerHTML = `
    <div class="info-pane">
      <div class="info-pane-title">Client Profile</div>
      ${profileHTML}
    </div>
    <div class="info-pane">
      <div class="info-pane-title">Document Extraction</div>
      ${extractHTML}
    </div>
  `;

  // ── Amortization Table ──
  const tableSection = document.getElementById('table-section');
  if (result.decision === 'APPROVED' && result.amortization_table && result.amortization_table.length > 0) {
    tableSection.style.display = 'block';
    const body = document.getElementById('amort-body');
    const foot = document.getElementById('amort-foot');
    const sched = result.amortization_table;
    const initialBal = sched[0].remaining_balance + sched[0].principal_paydown;
    let totPayment = 0, totInterest = 0, totPrincipal = 0;

    body.innerHTML = sched.map(row => {
      const pct = ((1 - row.remaining_balance / initialBal) * 100).toFixed(1);
      totPayment += row.payment;
      totInterest += row.interest;
      totPrincipal += row.principal_paydown;
      return `<tr>
        <td><div class="period-badge">${row.period}</div></td>
        <td class="col-green">${fmt(row.payment)}</td>
        <td class="col-red">${fmt(row.interest)}</td>
        <td>${fmt(row.principal_paydown)}</td>
        <td class="col-dim">${fmt(row.remaining_balance)}</td>
        <td>
          <div class="progress-wrap">
            <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
            <span class="progress-pct">${pct}%</span>
          </div>
        </td>
      </tr>`;
    }).join('');

    foot.innerHTML = `<tr>
      <td><strong>Total</strong></td>
      <td class="col-green"><strong>${fmt(totPayment)}</strong></td>
      <td class="col-red"><strong>${fmt(totInterest)}</strong></td>
      <td><strong>${fmt(totPrincipal)}</strong></td>
      <td>—</td>
      <td>—</td>
    </tr>`;
  } else {
    tableSection.style.display = 'none';
  }

  showToast(`Demo assessment complete — ${result.decision}`, result.decision === 'APPROVED' ? 'success' : 'error');
}

// ── RESET ──
function resetForm() {
  document.getElementById('result-panel').style.display = 'none';
  document.getElementById('loan-amount').value = '';
  document.getElementById('loan-term').value = '4';
  document.getElementById('m-name').value = '';
  document.getElementById('m-netpay').value = '';
  document.getElementById('m-docnum').value = '';
  document.getElementById('m-employer').value = '';
  document.getElementById('m-expired').value = 'false';

  // Reset upload zones
  ['id','pay'].forEach(type => {
    document.getElementById(`zone-${type}`).classList.remove('has-file');
    document.getElementById(`upload-${type}-content`).style.display = '';
    document.getElementById(`upload-${type}-done`).style.display = 'none';
    document.getElementById(`file-${type}`).value = '';
  });

  liveCalc();
  document.getElementById('application').scrollIntoView({ behavior: 'smooth' });
}

// ── UTILS ──
function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return 'K—';
  return 'K' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function setLoading(state) {
  isLoading = state;
  const btn = document.getElementById('submit-btn');
  const loader = document.getElementById('btn-loader');
  btn.disabled = state;
  if (state) {
    btn.classList.add('loading');
    loader.style.display = 'flex';
  } else {
    btn.classList.remove('loading');
    loader.style.display = 'none';
  }
}

let toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = type ? `show ${type}` : 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); }, 4000);
}
