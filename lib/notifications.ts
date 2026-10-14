import type { NotificationKind, Prisma } from "@prisma/client";

export async function createUserNotifications(
  tx: Prisma.TransactionClient,
  input: {
    recipientIds: readonly (string | null | undefined)[];
    actorId?: string | null;
    kind: NotificationKind;
    buildingId?: string | null;
    entityId?: string | null;
    payload?: Prisma.InputJsonObject;
  },
) {
  const recipientIds = [...new Set(input.recipientIds.filter((id): id is string => Boolean(id) && id !== input.actorId))];
  if (recipientIds.length === 0) return 0;
  const preferences = await tx.notificationPreference.findMany({
    where: { userId: { in: recipientIds }, kind: input.kind, enabled: false },
    select: { userId: true },
  });
  const disabled = new Set(preferences.map((preference) => preference.userId));
  const enabledRecipients = recipientIds.filter((id) => !disabled.has(id));
  if (enabledRecipients.length === 0) return 0;
  await tx.notification.createMany({
    data: enabledRecipients.map((recipientId) => ({
      recipientId,
      actorId: input.actorId ?? null,
      kind: input.kind,
      buildingId: input.buildingId ?? null,
      entityId: input.entityId ?? null,
      payload: input.payload,
    })),
  });
  return enabledRecipients.length;
}
