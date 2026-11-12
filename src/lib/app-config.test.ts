import assert from "node:assert/strict";
import test from "node:test";
import { isNeonPooledConnectionString } from "./app-config";

test("recognizes pooled Neon connection hosts", () => {
  assert.equal(
    isNeonPooledConnectionString(
      "postgresql://user:password@ep-example-pooler.us-east-2.aws.neon.tech/app",
    ),
    true,
  );
  assert.equal(
    isNeonPooledConnectionString(
      "postgresql://user:password@ep-example.us-east-2.aws.neon.tech/app",
    ),
    false,
  );
});
