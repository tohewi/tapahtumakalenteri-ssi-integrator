// ============================================================
// SSI Core — Participants Domain
// Re-exports from client.js for backward compatibility.
// TODO: Extract to @ssi-tools/core in future loop
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
