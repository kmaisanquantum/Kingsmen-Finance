const express = require('express');
const router = express.Router();
const multer = require('multer');
const { underwrite } = require('../utils/underwriting');

// Use memory storage — we don't persist documents
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images (JPEG, PNG, WebP) and PDF files are accepted.'));
    }
  }
});

/**
 * POST /api/extract/assess
 * AI-powered document extraction + underwriting
 * Requires ANTHROPIC_API_KEY in environment
 */
router.post('/assess', upload.fields([
  { name: 'id_document', maxCount: 1 },
  { name: 'payslip', maxCount: 1 }
]), async (req, res, next) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        error: 'AI extraction is not configured. Set ANTHROPIC_API_KEY in your .env file.',
        fallback: 'Use /api/loan/assess for manual entry instead.'
      });
    }

    const idFile = req.files?.id_document?.[0];
    const payFile = req.files?.payslip?.[0];

    if (!idFile || !payFile) {
      return res.status(400).json({ error: 'Both id_document and payslip files are required.' });
    }

    const { requested_amount, term, purpose } = req.body;

    if (!requested_amount || !term) {
      return res.status(400).json({ error: 'requested_amount and term are required.' });
    }

    // Convert files to base64
    const idB64 = idFile.buffer.toString('base64');
    const payB64 = payFile.buffer.toString('base64');

    const prompt = `You are the Our Finance AI underwriting assistant in Port Moresby, Papua New Guinea.

Analyze the two documents provided:
- Document 1: PNG National ID or Passport (identity document)
- Document 2: Payslip (income document)

Extract the following and respond ONLY with a valid JSON object. No markdown, no explanation, just JSON:

{
  "name": "Full legal name as shown on ID",
  "doc_type": "PNG NID or Passport",
  "doc_number": "Document identification number",
  "doc_expiry": "Expiry date if visible, else null",
  "doc_expired": false,
  "employer": "Employer/organisation name from payslip",
  "pay_period": "Weekly/Fortnightly/Monthly — as shown on payslip",
  "gross_pay": 0.00,
  "deductions": 0.00,
  "net_pay_as_shown": 0.00,
  "net_fortnightly_pay": 0.00,
  "currency": "PGK or other",
  "extraction_confidence": "HIGH/MEDIUM/LOW",
  "extraction_notes": "Brief notes on document quality or any issues"
}

IMPORTANT:
- net_fortnightly_pay must always be fortnightly take-home pay regardless of pay period shown
- If monthly: divide net pay by 2.167
- If weekly: multiply net pay by 2
- If fortnightly: use as-is
- doc_expired should be true if the expiry date has passed before today (approx 2024-2025)
- Use null for any field you cannot read clearly`;

    // Call Anthropic API
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: idFile.mimetype, data: idB64 }
            },
            {
              type: 'image',
              source: { type: 'base64', media_type: payFile.mimetype, data: payB64 }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error('Anthropic API error:', errBody);
      return res.status(502).json({ error: 'AI service error. Please try manual entry.' });
    }

    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData.content.map(b => b.text || '').join('').trim();
    const cleanJson = rawText.replace(/```json|```/g, '').trim();

    let extracted;
    try {
      extracted = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error('Failed to parse AI response:', rawText);
      return res.status(502).json({ error: 'AI returned invalid data. Please try manual entry.' });
    }

    // Run underwriting with extracted data
    const result = underwrite({
      name: extracted.name,
      doc_type: extracted.doc_type,
      doc_number: extracted.doc_number,
      doc_expired: extracted.doc_expired === true,
      employer: extracted.employer,
      net_fortnightly_pay: parseFloat(extracted.net_fortnightly_pay) || 0,
      requested_amount: parseFloat(requested_amount),
      term: parseInt(term),
      purpose: purpose || 'Not specified'
    });

    // Include extraction metadata in response
    result.extraction = {
      confidence: extracted.extraction_confidence,
      notes: extracted.extraction_notes,
      raw_pay_period: extracted.pay_period,
      raw_net_pay: extracted.net_pay_as_shown,
      currency: extracted.currency
    };

    res.json(result);

  } catch (err) {
    next(err);
  }
});

module.exports = router;
