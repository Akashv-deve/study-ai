import winston from 'winston';
import { config } from '../config';

const customFormat = winston.format.printf(({ level, message, timestamp, label }) => {
  const tag = label ? `[${label}] ` : '';
  return `${timestamp} ${level}: ${tag}${message}`;
});

export const logger = winston.createLogger({
  level: config.NODE_ENV === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    config.NODE_ENV === 'development'
      ? winston.format.combine(winston.format.colorize(), customFormat)
      : winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

export function createLogger(label: string) {
  return {
    info: (msg: string, ...meta: unknown[]) => logger.info(msg, { label, ...meta }),
    warn: (msg: string, ...meta: unknown[]) => logger.warn(msg, { label, ...meta }),
    error: (msg: string, ...meta: unknown[]) => logger.error(msg, { label, ...meta }),
    debug: (msg: string, ...meta: unknown[]) => logger.debug(msg, { label, ...meta }),
  };
}
