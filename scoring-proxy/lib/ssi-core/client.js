// ============================================================
// SSI Core — Compatibility Barrel
// Domain implementations live in their respective modules.
// ============================================================

export { ssiFetchPage } from "./http-helpers.js"
export { ssiGraphQL, ssiRefreshJWT, ssiLogin } from "./graphql.js"
export { ssiGetScoringPage, ssiSubmitScore } from "./scoring.js"
export {
  ssiGetMatchGroupId,
  ssiGetMatchOfficials,
  ssiAddToMatchManagement,
  ssiRemoveFromMatchManagement,
  ssiGetEventStaff,
  ssiGetGroupMembers,
} from "./management.js"
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
} from "./participants.js"
