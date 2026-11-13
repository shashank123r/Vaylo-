import "server-only";
import pino from "pino";

// Structured logging. Pretty in dev, JSON in production. Never log secrets or
// full request bodies that may contain resume/profile PII.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: {
    paths: ["password", "passwordHash", "token", "apiKey", "authorization", "*.password"],
    censor: "[redacted]",
  },
  ...(process.env.NODE_ENV !== "production"
    ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } } }
    : {}),
});
