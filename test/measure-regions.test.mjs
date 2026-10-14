import assert from "node:assert/strict";
import test from "node:test";
import { parseFunctionRegion } from "../scripts/measure-regions.mjs";

test("reads the function region from the second x-vercel-id segment", () => {
  assert.equal(parseFunctionRegion("fra1::arn1::request-123"), "arn1");
});

test("normalizes whitespace and region case", () => {
  assert.equal(parseFunctionRegion(" FRA1 :: ARN1 :: request-123 "), "arn1");
});

test("returns null for missing or malformed x-vercel-id values", () => {
  for (const header of [undefined, null, "", "fra1", "fra1::", "edge::arn1::request", "fra1::not-a-region::request"]) {
    assert.equal(parseFunctionRegion(header), null, String(header));
  }
});
