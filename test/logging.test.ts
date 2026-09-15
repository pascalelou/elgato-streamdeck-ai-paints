import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeForLog } from "../src/utils/logging";

test("sensitive logging fields are recursively redacted", () => {
  assert.deepEqual(sanitizeForLog({
    apiToken: "secret",
    Authorization: "Bearer secret",
    nested: { credentials: { accountId: "id", apiToken: "secret" }, safe: "yes" }
  }), {
    apiToken: "[REDACTED]",
    Authorization: "[REDACTED]",
    nested: { credentials: "[REDACTED]", safe: "yes" }
  });
});
