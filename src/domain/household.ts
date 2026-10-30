/**
 * Who usually eats (0.3.0).
 *
 * The household is a list of names in an order, kept on this phone and
 * nowhere else. It exists so the review can ask "Who ate it?" one row per
 * person without the cook typing the same names every evening.
 *
 * A person is never deleted. Someone who no longer eats here is *retired*:
 * they leave the review's rows and stay attached to every rating they gave,
 * so a cook from last spring still says what they thought of it. A retired
 * person can be brought back.
 *
 * Pure functions, as in `./evidence.ts`: each returns a decision, and the
 * caller writes only what it was handed.
 */

import type { HouseholdMember, HouseholdMemberId, IsoTimestamp } from './entities';
import type { EvidenceDecision } from './evidence';
import { MAX_PERSON_NAME_LENGTH } from './invariants';

function refuse(message: string): EvidenceDecision<never> {
  return { allowed: false, code: 'name_not_valid', message };
}

/** The members who eat here now, in order. */
export function activeMembers(members: readonly HouseholdMember[]): readonly HouseholdMember[] {
  return [...members]
    .filter((member) => member.retiredAt === null)
    .sort((left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt));
}

/** The members who used to, in the order they were in. */
export function retiredMembers(members: readonly HouseholdMember[]): readonly HouseholdMember[] {
  return [...members]
    .filter((member) => member.retiredAt !== null)
    .sort((left, right) => left.position - right.position);
}

function sameName(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Add someone. The name is trimmed of the spaces around it and must be new
 * among the people who eat here now; they go at the end of the list.
 */
export function addMember(
  name: string,
  members: readonly HouseholdMember[],
  identity: { readonly id: HouseholdMemberId },
  at: IsoTimestamp,
): EvidenceDecision<HouseholdMember> {
  const trimmed = name.trim();
  if (trimmed === '') {
    return refuse('Write a name first.');
  }
  if (trimmed.length > MAX_PERSON_NAME_LENGTH) {
    return refuse(`Keep a name under ${MAX_PERSON_NAME_LENGTH} characters.`);
  }
  if (activeMembers(members).some((member) => sameName(member.name, trimmed))) {
    return refuse(`${trimmed} is already on the list.`);
  }
  const position = members.reduce((highest, member) => Math.max(highest, member.position + 1), 0);
  return {
    allowed: true,
    record: { id: identity.id, name: trimmed, position, retiredAt: null, createdAt: at },
  };
}

/** Retire someone: off the review's rows, every rating they gave kept. */
export function retireMember(
  member: HouseholdMember,
  at: IsoTimestamp,
): EvidenceDecision<HouseholdMember> {
  if (member.retiredAt !== null) {
    return { allowed: true, record: member };
  }
  return { allowed: true, record: { ...member, retiredAt: at } };
}

/** Bring someone back, at the end of the list, unless the name is now taken. */
export function restoreMember(
  member: HouseholdMember,
  members: readonly HouseholdMember[],
): EvidenceDecision<HouseholdMember> {
  if (member.retiredAt === null) {
    return { allowed: true, record: member };
  }
  if (activeMembers(members).some((other) => other.id !== member.id && sameName(other.name, member.name))) {
    return refuse(`Someone called ${member.name} is already on the list.`);
  }
  const position = members.reduce((highest, other) => Math.max(highest, other.position + 1), 0);
  return { allowed: true, record: { ...member, retiredAt: null, position } };
}

/**
 * The active members' ids in their new order after moving one up or down.
 * Moving the first up, or the last down, changes nothing.
 */
export function moveMember(
  members: readonly HouseholdMember[],
  id: HouseholdMemberId,
  direction: 'up' | 'down',
): readonly HouseholdMemberId[] {
  const order = activeMembers(members).map((member) => member.id);
  const index = order.indexOf(id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= order.length) {
    return order;
  }
  const next = [...order];
  next[index] = order[target] as HouseholdMemberId;
  next[target] = id;
  return next;
}
