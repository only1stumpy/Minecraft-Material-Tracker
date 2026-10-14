import assert from "node:assert/strict";
import test from "node:test";

import { getNotificationRecipientIds, isTaskCompletionTransition } from "../lib/notifications.ts";

test("уведомление о завершении создаётся только при переходе в DONE", () => {
  assert.equal(isTaskCompletionTransition("OPEN", "DONE"), true);
  assert.equal(isTaskCompletionTransition("IN_PROGRESS", "DONE"), true);
  assert.equal(isTaskCompletionTransition("DONE", "DONE"), false);
  assert.equal(isTaskCompletionTransition("DONE", "CANCELLED"), false);
});

test("получатель-исполнитель и повторяющиеся ID исключаются, как в центре уведомлений", () => {
  assert.deepEqual(
    getNotificationRecipientIds(["owner", "assignee", "owner", null, ""], "assignee"),
    ["owner"],
  );
});
