import { runCypher } from './client';

export async function recordReservation(
  inventoryId: string,
  memberId: string,
  negotiatedTermId: string,
): Promise<void> {
  await runCypher(
    `MERGE (m:Member {member_id: $memberId})
     WITH m
     MATCH (i:Inventory {rental_id: $inventoryId})
     CREATE (m)-[:RESERVED {negotiated_term_id: $negotiatedTermId}]->(i)
     RETURN true`,
    { memberId, inventoryId, negotiatedTermId },
    ['ok'],
  );
}
