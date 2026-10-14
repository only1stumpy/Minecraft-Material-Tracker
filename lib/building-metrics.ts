type ContributionParticipant = { userId: string; gatheredQty: number };
type ReservationParticipant = { userId: string; releasedAt: Date | null };

export type ParticipantMaterial = {
  contributions: readonly ContributionParticipant[];
  reservations: readonly ReservationParticipant[];
};

/** Count unique users who either gathered something or still hold a reserve. */
export function collectParticipantIds(materials: readonly ParticipantMaterial[]): Set<string> {
  const participantIds = new Set<string>();
  for (const material of materials) {
    for (const contribution of material.contributions) {
      if (contribution.gatheredQty > 0) participantIds.add(contribution.userId);
    }
    for (const reservation of material.reservations) {
      if (!reservation.releasedAt) participantIds.add(reservation.userId);
    }
  }
  return participantIds;
}
