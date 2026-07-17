const levels = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

function normalizeLevel(value) {
  const level = String(value ?? "info").toLowerCase();
  return Object.hasOwn(levels, level) ? level : "info";
}

export function serializeError(error) {
  if (!(error instanceof Error)) return { message: String(error) };
  return {
    name: error.name,
    message: error.message,
    ...(error.code ? { code: error.code } : {}),
  };
}

export function createLogger({ level = process.env.LOG_LEVEL, write = (line) => process.stdout.write(line) } = {}) {
  const minimum = levels[normalizeLevel(level)];

  function emit(logLevel, event, fields = {}) {
    if (levels[logLevel] < minimum) return;
    write(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: logLevel,
      service: "fuel-ops-api",
      event,
      ...fields,
    })}\n`);
  }

  return {
    debug: (event, fields) => emit("debug", event, fields),
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
  };
}
