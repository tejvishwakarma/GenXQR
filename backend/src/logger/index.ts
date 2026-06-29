import winston from "winston"

const { combine, timestamp, errors, json, colorize, printf } = winston.format

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ timestamp: ts, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ""
    const stackStr = stack ? `\n${stack}` : ""
    return `${ts} [${level}]: ${message}${metaStr}${stackStr}`
  }),
)

const prodFormat = combine(timestamp(), errors({ stack: true }), json())

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: process.env.NODE_ENV === "production" ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    ...(process.env.NODE_ENV === "production"
      ? [
          new winston.transports.File({ filename: "logs/error.log", level: "error" }),
          new winston.transports.File({ filename: "logs/combined.log" }),
        ]
      : []),
  ],
  exitOnError: false,
})
