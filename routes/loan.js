const express = require('express');
const router = express.Router();
const { underwrite, calcEMI, RATE_FORTNIGHT } = require('../utils/underwriting');

/**
 * POST /api/loan/assess
 * Full underwriting assessment (manual mode — no documents)
 */
router.post('/assess', (req, res, next) => {
  try {
    const {
      name,
      doc_type,
      doc_number,
      doc_expired = false,
      employer,
      net_fortnightly_pay,
      requested_amount,
      term,
      purpose
    } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Applicant name is required.' });
    }
    if (!net_fortnightly_pay || isNaN(net_fortnightly_pay) || net_fortnightly_pay <= 0) {
      return res.status(400).json({ error: 'Valid net fortnightly pay is required.' });
    }
    if (!requested_amount || isNaN(requested_amount) || requested_amount <= 0) {
      return res.status(400).json({ error: 'Valid loan amount is required.' });
    }
    if (!term || isNaN(term) || term < 1) {
      return res.status(400).json({ error: 'Valid repayment term is required.' });
    }

    const result = underwrite({
      name: name.trim(),
      doc_type: doc_type || 'PNG NID',
      doc_number: doc_number || 'N/A',
      doc_expired: Boolean(doc_expired),
      employer: employer || 'Not specified',
      net_fortnightly_pay: parseFloat(net_fortnightly_pay),
      requested_amount: parseFloat(requested_amount),
      term: parseInt(term),
      purpose
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/loan/calculate
 * Quick EMI calculator (no underwriting)
 */
router.post('/calculate', (req, res, next) => {
  try {
    const { principal, term } = req.body;

    if (!principal || !term) {
      return res.status(400).json({ error: 'Principal and term are required.' });
    }

    const P = Math.min(Math.max(parseFloat(principal), 0), 2500);
    const n = parseInt(term);
    const r = RATE_FORTNIGHT;

    if (n < 1 || P < 1) {
      return res.status(400).json({ error: 'Invalid principal or term.' });
    }

    const rn = Math.pow(1 + r, n);
    const emi = (P * r * rn) / (rn - 1);
    const totalRepayable = emi * n;
    const totalInterest = totalRepayable - P;

    res.json({
      principal: Math.round(P * 100) / 100,
      fortnightly_installment: Math.round(emi * 100) / 100,
      total_interest: Math.round(totalInterest * 100) / 100,
      total_repayable: Math.round(totalRepayable * 100) / 100,
      term_fortnights: n,
      rate: '20% p.a. reducing balance'
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
