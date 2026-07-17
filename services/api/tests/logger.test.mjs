import assert from "node:assert/strict";
import test from "node:test";
import { createLogger, serializeError } from "../logger.mjs";

test("writes one-line structured JSON with common service fields", () => {
  const lines = [];
  const logger = createLogger({ level: "info", write: (line) => lines.push(line) });

  logger.info("request_completed", { requestId: "req-1", statusCode: 200 });

  assert.equal(lines.length, 1);
  assert.ok(lines[0].endsWith("\n"));
  const record = JSON.parse(lines[0]);
  assert.equal(record.level, "info");
  assert.equal(record.service, "fuel-ops-api");
  assert.equal(record.event, "request_completed");
  assert.equal(record.requestId, "req-1");
  assert.match(record.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test("filters records below the configured log level", () => {
  const lines = [];
  const logger = createLogger({ level: "warn", write: (line) => lines.push(line) });

  logger.info("hidden");
  logger.warn("visible");

  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).event, "visible");
});

test("serializes errors without exposing stack traces", () => {
  const error = Object.assign(new Error("database unavailable"), { code: "ECONNREFUSED" });
  assert.deepEqual(serializeError(error), {
    name: "Error",
    message: "database unavailable",
    code: "ECONNREFUSED",
  });
});
