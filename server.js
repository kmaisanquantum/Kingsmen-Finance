require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const loanRoutes = require('./routes/loan');
const extractRoutes = require('./routes/extract');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security & Middleware ──
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "fonts.gstatic.com"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Rate Limiting ──
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// ── Static Files ──
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ──
app.use('/api/loan', loanRoutes);
app.use('/api/extract', extractRoutes);

// ── Health Check ──
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Our Finance API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    ai_enabled: !!process.env.ANTHROPIC_API_KEY
  });
});

// ── SPA Fallback ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Error Handler ──
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   OUR FINANCE — LMS Server      ║`);
  console.log(`║   Running on http://localhost:${PORT}   ║`);
  console.log(`║   AI Extraction: ${process.env.ANTHROPIC_API_KEY ? '✓ Enabled' : '✗ Disabled (no key)'}      ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});

module.exports = app;
