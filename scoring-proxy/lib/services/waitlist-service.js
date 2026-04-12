import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError.js'
import {
  createEntry,
  createInductionGroup,
  deleteEntry,
  findActiveEntryByEmail,
  getEntry,
  getInductionGroup,
  listEntries,
  listInductionGroups,
  updateEntry,
  updateInductionGroup,
} from '../waitlist/store.js'

const EQUIPMENT_CHOICES = new Set(['need-club-22', 'own-pistol'])

function validateInput({ firstName, lastName, email, association, equipmentChoice, preferredLanguage }) {
  if (!firstName?.trim()) throw new ValidationError('First name is required', 'firstName')
  if (!lastName?.trim()) throw new ValidationError('Last name is required', 'lastName')
  if (!association?.trim()) throw new ValidationError('Association is required', 'association')
  if (!email?.trim()) throw new ValidationError('Email is required', 'email')
  if (!EQUIPMENT_CHOICES.has(equipmentChoice)) {
    throw new ValidationError('Invalid equipment choice', 'equipmentChoice')
  }
  if (preferredLanguage && !['fi', 'en'].includes(preferredLanguage)) {
    throw new ValidationError('Invalid preferred language', 'preferredLanguage')
  }
}

export async function registerWaitlistEntry(
  input,
  {
    emailExistsInSSI,
    sendConfirmationEmail,
  }
) {
  validateInput(input)

  const activeEntry = await findActiveEntryByEmail(input.email)
  if (activeEntry) {
    throw new ConflictError('Active wait list entry already exists for this email')
  }

  const exists = await emailExistsInSSI(input.email)
  if (!exists) {
    throw new NotFoundError('SSI user')
  }

  const entry = await createEntry(input)
  const emailResult = await sendConfirmationEmail(entry)

  if (!emailResult?.success) {
    await deleteEntry(entry.id)
    throw new ValidationError('Confirmation email could not be sent', 'email')
  }

  return entry
}

export async function listWaitlistAdminData() {
  const [entries, groups] = await Promise.all([
    listEntries(),
    listInductionGroups(),
  ])

  return { entries, groups }
}

export async function createInductionGroupSelection({ participantIds, label, plannedDate, actorEmail }) {
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    throw new ValidationError('participantIds is required', 'participantIds')
  }
  if (!label?.trim()) {
    throw new ValidationError('label is required', 'label')
  }

  const entries = await Promise.all(participantIds.map(id => getEntry(id)))
  if (entries.some(entry => !entry)) {
    throw new NotFoundError('Wait list entry')
  }
  if (entries.some(entry => entry.status !== 'waiting')) {
    throw new ConflictError('Only waiting entries can be selected into an induction group')
  }

  const group = await createInductionGroup({
    label,
    plannedDate,
    participantIds,
    actorEmail,
  })

  await Promise.all(entries.map(entry => updateEntry(entry.id, {
    status: 'selected',
    groupId: group.id,
  }, {
    actorEmail,
    action: 'select-for-induction',
    groupId: group.id,
  })))

  return group
}

export async function completeInductionGroup({ groupId, actorEmail, sendStatusChangeEmail = null }) {
  const group = await getInductionGroup(groupId)
  if (!group) {
    throw new NotFoundError('Induction group')
  }
  if (group.status === 'completed') {
    return group
  }

  const updatedEntries = await Promise.all(group.participantIds.map(async participantId => {
    const entry = await getEntry(participantId)
    if (!entry) return null
    return updateEntry(participantId, {
      status: 'completed',
    }, {
      actorEmail,
      action: 'complete-induction',
      groupId,
    })
  }))

  if (sendStatusChangeEmail) {
    await Promise.all(updatedEntries.filter(Boolean).map(entry => sendStatusChangeEmail(entry, {
      status: 'completed',
      groupLabel: group.label,
      plannedDate: group.plannedDate,
    })))
  }

  return updateInductionGroup(groupId, {
    status: 'completed',
  }, {
    actorEmail,
    action: 'complete-group',
  })
}

export async function cancelWaitlistEntry({ entryId, actorEmail, sendStatusChangeEmail = null }) {
  const entry = await getEntry(entryId)
  if (!entry) {
    throw new NotFoundError('Wait list entry')
  }
  if (entry.status === 'completed' || entry.status === 'withdrawn') {
    return entry
  }

  const updated = await updateEntry(entryId, {
    status: 'withdrawn',
  }, {
    actorEmail,
    action: 'cancel-entry',
  })

  if (sendStatusChangeEmail) {
    await sendStatusChangeEmail(updated, { status: 'withdrawn' })
  }

  return updated
}

export { EQUIPMENT_CHOICES }
