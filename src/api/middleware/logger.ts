/**
 * 📝 Request Logger Middleware
 */

import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();
  const requestId = generateRequestId();

  // Add request ID to headers
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Log request
  const requestLog = {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    headers: sanitizeHeaders(req.headers),
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
    timestamp: new Date(),
  };

  // Log response after it's sent
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    const responseLog = {
      ...requestLog,
      statusCode: res.statusCode,
      duration,
      partnerId: (req as any).partnerId,
      apiKeyId: (req as any).apiKey?.id,
    };

    // Async log to Firestore (don't wait)
    logToFirestore(responseLog).catch(console.error);

    // Console log
    console.log(
      `${req.method} ${req.path} ${res.statusCode} ${duration}ms [${requestId}]`
    );
  });

  next();
}

function sanitizeHeaders(headers: any): any {
  const sanitized = { ...headers };
  
  // Remove sensitive data
  delete sanitized.authorization;
  delete sanitized['x-api-key'];
  delete sanitized.cookie;
  
  return sanitized;
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function logToFirestore(log: any): Promise<void> {
  // Only log in production, or sample 10% in development
  if (process.env.NODE_ENV !== 'production' && Math.random() > 0.1) {
    return;
  }

  await db.collection('api_logs').add(log);
}
