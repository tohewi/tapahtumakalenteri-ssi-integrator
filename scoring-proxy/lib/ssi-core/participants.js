// ============================================================
// SSI Core — Participants Domain
// Thin barrel for the Participants domain. Implementations are split
// across focused helper modules to keep each file under the ~500-line
// modularity guideline (see AGENTS.md):
//   - participant-registration.js : form-based search/add/register
//   - participant-edit.js         : edit participant squad/status (delete)
//   - participant-lookup.js       : find participants + CUP status toggles
// All historical named exports are preserved here so that importers
// (client.js barrel, routes, services, tests) keep working unchanged.
// ============================================================

export {
  ssiSearchAndAddParticipant,
  ssiRegisterToTrainerSquad,
} from "./participant-registration.js"

export {
  ssiSetParticipantSquad,
  ssiSetMatchParticipantStatus,
  ssiDeleteMatchParticipant,
} from "./participant-edit.js"

export {
  ssiFindAndDeleteCupParticipant,
  ssiFindAndApproveCupParticipant,
  ssiFindCompetitorInMatch,
  ssiFindParticipantInEvent,
  ssiSetDidNotShow,
  ssiUndoDidNotShow,
  ssiTogglePaid,
  ssiGetCupParticipantStatuses,
} from "./participant-lookup.js"
