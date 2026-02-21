// ============================================================
// SSI Core — Participants Domain
// Re-exports from client.js for domain-specific imports.
// ============================================================

export {
  ssiSearchAndAddParticipant,
  ssiFindAndDeleteCupParticipant,
  ssiFindAndApproveCupParticipant,
  ssiSetParticipantSquad,
  ssiSetMatchParticipantStatus,
  ssiDeleteMatchParticipant,
  ssiFindCompetitorInMatch,
  ssiFindParticipantInEvent,
  ssiSetDidNotShow,
  ssiUndoDidNotShow,
  ssiTogglePaid,
  ssiGetCupParticipantStatuses,
  ssiRegisterToTrainerSquad,
} from './client.js'
