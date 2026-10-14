/** Roles understood by the 2.0 authorization rules. */
export type UserRole = "ADMIN" | "MODERATOR" | "PLAYER";

/** The smallest actor shape needed by role-only permission checks. */
export type RoleActor = Readonly<{ role: UserRole }>;

/** The actor shape needed to check ownership of a building. */
export type BuildingActor = RoleActor & Readonly<{ id: string }>;

/** The resource shape needed by the building ownership check. */
export type BuildingResource = Readonly<{ ownerId: string | null }>;

/** An authenticated actor shape used by the participation check. */
export type ParticipationActor = RoleActor &
  Readonly<{ isBlocked: boolean; mustChangePassword: boolean }>;

/** Return true only when the actor may create, block, reset, or change users. */
export function canManageUsers(actor: RoleActor): boolean {
  return actor.role === "ADMIN";
}

/** Return true when the actor may moderate shared content. */
export function canModerateContent(actor: RoleActor): boolean {
  return actor.role === "ADMIN" || actor.role === "MODERATOR";
}

/** Return true for administrators, moderators, or the building owner. */
export function canManageBuilding(actor: BuildingActor, building: BuildingResource): boolean {
  return canModerateContent(actor) || building.ownerId === actor.id;
}

/**
 * Return true for an authenticated actor who is not blocked and has completed
 * the required temporary-password change.
 */
export function canParticipate(actor: ParticipationActor): boolean {
  return !actor.isBlocked && !actor.mustChangePassword;
}
