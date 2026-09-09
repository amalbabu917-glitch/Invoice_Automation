require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

const pool = require('./db/pool');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const invoiceRoutes = require('./routes/invoices');
const dashboardRoutes = require('./routes/dashboard');
const reportRoutes = require('./routes/report');
const { closeBrowser } = require('./utils/pdf');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set. Copy .env.example to .env and fill in real values.');
}

app.use(
  session({
    store: new pgSession({ pool, tableName: 'session', createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

app.get('/', (req, res) => res.redirect(req.session.userId ? '/dashboard' : '/login'));

app.use(authRoutes);
app.use(profileRoutes);
app.use(invoiceRoutes);
app.use(dashboardRoutes);
app.use(reportRoutes);

// 404
app.use((req, res) => res.status(404).send('Not found.'));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Something went wrong. Please try again.');
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Invoice app listening on http://localhost:${PORT}`);
});

async function shutdown() {
  console.log('Shutting down...');
  server.close();
  await closeBrowser();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = app;
