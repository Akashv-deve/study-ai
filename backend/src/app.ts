import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { config } from './config';
import { getAuth } from './auth';
import { toNodeHandler } from 'better-auth/node';
import { requireAuth } from './middleware/auth';
import { generalLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import healthRoutes from './routes/health.routes';
import projectRoutes from './routes/project.routes';
import fileRoutes from './routes/file.routes';
import aiRoutes from './routes/ai.routes';

const app = express();

app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
const allowedOrigins = new Set([config.FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000']);
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(compression());
app.use(requestLogger);
app.use('/api', generalLimiter);

// Auth must be registered before the JSON body parser; Better Auth owns these endpoints.
app.all('/api/auth/*', (req, res, next) => {
  try {
    void toNodeHandler(getAuth())(req, res).catch(next);
  } catch (error) {
    next(error);
  }
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Mount Health Check & Routes
app.use('/', healthRoutes);
app.use('/api/projects', requireAuth, projectRoutes);
app.use('/api', requireAuth, fileRoutes);
app.use('/api/ai', requireAuth, aiRoutes);

// Global Error Handler
app.use(errorHandler);

export default app;
