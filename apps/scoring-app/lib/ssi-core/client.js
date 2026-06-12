// ============================================================
// SSI Core — Compatibility Barrel (MOD-3)
//
// All actual code has been moved to domain-specific modules.
// This file re-exports everything for callers that still
// import directly from client.js (e.g., legacy tests).
//
// New code should import from domain modules directly:
//   import { ssiGraphQL } from './graphql.js'
//   import { ssiFetchPage, parseCookies } from './http-helpers.js'
//   import { ssiGetScoringPage } from './scoring.js'
//   import { ssiSearchAndAddParticipant } from './participants.js'
//   import { ssiGetMatchGroupId } from './management.js'
// ============================================================

export { ssiGraphQL, ssiGraphQLAuth, ssiRefreshJWT, ssiLogin } from './graphql.js'
export { ssiGetScoringPage, ssiSubmitScore } from './scoring.js'
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
} from './participants.js'
export {
  ssiGetMatchGroupId,
  ssiGetMatchOfficials,
  ssiAddToMatchManagement,
  ssiRemoveFromMatchManagement,
  ssiGetEventStaff,
} from './management.js'
export { ssiFetchPage } from './http-helpers.js'

