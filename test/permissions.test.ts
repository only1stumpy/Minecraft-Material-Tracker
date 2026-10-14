import assert from "node:assert/strict";
import test from "node:test";
import {
  canManageBuilding,
  canManageUsers,
  canModerateContent,
  canParticipate,
  type UserRole,
} from "../lib/permissions.ts";

const roles: UserRole[] = ["ADMIN", "MODERATOR", "PLAYER"];

test("только ADMIN управляет аккаунтами", () => {
  for (const role of roles) {
    assert.equal(canManageUsers({ role }), role === "ADMIN", role);
  }
});

test("ADMIN и MODERATOR модерируют общий контент", () => {
  for (const role of roles) {
    assert.equal(canModerateContent({ role }), role !== "PLAYER", role);
  }
});

test("владелец, ADMIN и MODERATOR управляют постройкой", () => {
  for (const role of roles) {
    const actor = { id: "actor-1", role };

    assert.equal(canManageBuilding(actor, { ownerId: "actor-1" }), true, `${role}: owner`);
    assert.equal(canManageBuilding(actor, { ownerId: "other-1" }), role !== "PLAYER", `${role}: other`);
    assert.equal(canManageBuilding(actor, { ownerId: null }), role !== "PLAYER", `${role}: unowned`);
  }
});

test("участвовать может любой authenticated пользователь без блокировки и смены пароля", () => {
  for (const role of roles) {
    for (const isBlocked of [false, true]) {
      for (const mustChangePassword of [false, true]) {
        assert.equal(
          canParticipate({ role, isBlocked, mustChangePassword }),
          !isBlocked && !mustChangePassword,
          `${role}: blocked=${isBlocked}, mustChangePassword=${mustChangePassword}`,
        );
      }
    }
  }
});
