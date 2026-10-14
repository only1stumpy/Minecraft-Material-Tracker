import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PROFILE_ACTIVITY_PAGE,
  PROFILE_ACTIVITY_ORDER,
  PROFILE_ACTIVITY_PAGE_SIZE,
  parseProfileActivityPage,
  splitProfileActivityPage,
} from "../lib/profile-history.ts";

test("история профиля принимает только положительную bounded страницу", () => {
  assert.equal(parseProfileActivityPage(undefined), 1);
  assert.equal(parseProfileActivityPage("0"), 1);
  assert.equal(parseProfileActivityPage("-2"), 1);
  assert.equal(parseProfileActivityPage("4"), 4);
  assert.equal(parseProfileActivityPage(String(MAX_PROFILE_ACTIVITY_PAGE + 1)), MAX_PROFILE_ACTIVITY_PAGE);
});

test("история профиля возвращает страницу и признак продолжения", () => {
  const rows = Array.from({ length: PROFILE_ACTIVITY_PAGE_SIZE + 1 }, (_, index) => index);
  const page = splitProfileActivityPage(rows);
  assert.equal(page.rows.length, PROFILE_ACTIVITY_PAGE_SIZE);
  assert.equal(page.hasNextPage, true);
  assert.deepEqual(splitProfileActivityPage([1, 2]).rows, [1, 2]);
  assert.equal(splitProfileActivityPage([1, 2]).hasNextPage, false);
});

test("порядок истории стабилизирован временем и ID", () => {
  assert.deepEqual(PROFILE_ACTIVITY_ORDER, [
    { createdAt: "desc" },
    { id: "desc" },
  ]);
});
