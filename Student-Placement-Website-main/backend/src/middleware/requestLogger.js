import { logAction } from "../utils/logger.js";

export default function requestLogger(req, res, next) {
  const startedAt = Date.now();
  res.on("finish", () => {
    logAction("http.request", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      userId: req.user?.id || null,
    });
  });
  next();
}
