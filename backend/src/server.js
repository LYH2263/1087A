const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config');
const logger = require('./logger');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const { requireAuth } = require('./middleware/auth');
const { requireRole } = require('./middleware/role');

const authRoutes = require('./routes/auth');
const bookRoutes = require('./routes/books');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const addressRoutes = require('./routes/addresses');
const adminRoutes = require('./routes/admin');

const app = express();
const fs = require('fs');
const uploadsDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(helmet());
app.use(cors({
  origin: config.corsOrigin,
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs.html'));
});

app.use('/uploads', express.static(uploadsDir));

app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/cart', requireAuth, cartRoutes);
app.use('/api/orders', requireAuth, orderRoutes);
app.use('/api/addresses', requireAuth, addressRoutes);
app.use('/api/admin', requireAuth, requireRole('ADMIN'), adminRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND' });
});

app.use(errorHandler);

app.listen(config.port, () => {
  logger.info('server.started', { port: config.port });
});
