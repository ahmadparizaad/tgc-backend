import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import env from './src/config/env.js';
import routes from './src/routes/index.js';
import errorMiddleware from './src/middlewares/error-middleware.js';
import logger from './src/utils/logger.js';
import {
  globalLimiter,
  hppProtection,
  mongoSanitization,
  xssSanitizer,
  helmetConfig,
} from './src/middlewares/security-middleware.js';

const app = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware - Helmet with custom config
app.use(helmet(helmetConfig));

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    const allowedOrigins = [
      env.adminCorsOrigin,
      'http://localhost:3000',
      'http://localhost:5000',
    ];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`Blocked CORS request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400, // 24 hours
};
app.use(cors(corsOptions));

// Global rate limiter
app.use(globalLimiter);

// Body parsers with size limits
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Security: HTTP Parameter Pollution protection
app.use(hppProtection);

// Security: MongoDB query injection prevention
app.use(mongoSanitization);

// Security: XSS sanitization
app.use(xssSanitizer);

// Request logging in development
if (env.nodeEnv === 'development') {
  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.originalUrl}`);
    next();
  });
}

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to The Green Candle API',
  });
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'fail',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler
app.use(errorMiddleware);

export default app;
