// ============================================================
// SRA GraphQL Builder (Standalone Match)
//
// Creates an SRA match using the modern GraphQL API.
// Note: Squad creation still requires web scraping as there
// is no GraphQL mutation for it yet.
// ============================================================

import { ssiCreateEvent } from '../../ssi-core/event-creation.js'
import { ssiLogin } from '../../ssi-core/client.js'
import { log } from '../../logger.js'

export async function buildSraStandaloneMatch({ snapshot, overrides, schedule, credentials, discipline, progress, eventName }) {
  progress('auth', 'Authenticating with SSI GraphQL API...')
  
  // Determine group and organizer
  const groupId = discipline?.ssiGroupId || snapshot.settings?.groupId || 'xxx'
  // organizerId is not used in matchData below, but kept for reference
  
  // Convert template data to GraphQL input format
  const matchData = {
    group: groupId,
    name: eventName,
    visibility: snapshot.settings?.visibility || "pub",
    status: "on",
    results: snapshot.settings?.results || "org",
    registration: snapshot.settings?.registration || "op",
    max_competitors: String(snapshot.settings?.maxCompetitors || 50),
    description: (overrides.description || snapshot.description || '').trim(),
    information: (overrides.information || snapshot.information || '').trim(),
    region: snapshot.settings?.region || "FIN",
    level: snapshot.settings?.level || "tr",
    verify_using: snapshot.settings?.verifyUsing || "xxx",
    timezone: "Europe/Helsinki",
    currency: snapshot.settings?.currency || "EUR",
    venue: (overrides.venue || snapshot.venue || '').trim(),
    
    // Dates
    starts_date: schedule.isoDate,
    starts_time: schedule.startTime,
    ends_date: schedule.isoDate,
    ends_time: schedule.endTime,
    reg_start_date: schedule.regStartDate,
    reg_start_time: schedule.regStartTime,
    reg_close_date: schedule.regCloseDate,
    reg_close_time: schedule.regCloseTime,
    sq_start_date: schedule.regStartDate,
    sq_start_time: schedule.regStartTime,
    sq_close_date: schedule.isoDate,
    sq_close_time: schedule.endTime,

    // SRA specific fields (extracted from snapshot or defaults)
    firearms: snapshot.settings?.firearms || ["rf", "sg", "hg"],
    categories: snapshot.settings?.categories || ["L", "S", "SS", "LS"],
    cat_result_limit: snapshot.settings?.catResultLimit || "1",
    has_accepted_event_data_ass_agreement: "on",
    prematch: snapshot.settings?.prematch || "no",
    max_prematch_competitors: snapshot.settings?.maxPrematchCompetitors || "0",
    number_of_team_members: snapshot.settings?.numberOfTeamMembers || "4",
    result_from_team_members: snapshot.settings?.resultFromTeamMembers || "3",

    // Division fields
    handgun_divs: snapshot.settings?.handgunDivs || ["hg1","hg2","hg37","hg33","hg3","hg5","hg12","hg14","hg15","hg16","hg17","hg18","hg19","hg30","hg31","hgc"],
    rifle_divs: snapshot.settings?.rifleDivs || ["rf1","rf2","rf12","rf3","rf4","rf11","rf16","rf17","rf18","rf19","rf20","rfc"],
    shotgun_divs: snapshot.settings?.shotgunDivs || ["sg1","sg2","sg3","sg4","sgc"],
    pcc_divs: snapshot.settings?.pccDivs || ["pc1","pc2","pc3","pcc"],
    air_divs: snapshot.settings?.airDivs || ["ai1","ai2","ai3","ai3a","ai8","ai9","ai10","ai11","ai12","aic"],
    mini_rifle_divs: snapshot.settings?.miniRifleDivs || ["mr1","mr2","mr3","mrc"],
    prec_rifle_divs: snapshot.settings?.precRifleDivs || ["rf1","rf2","rf12","rf3","rf4","rf11","rf16","rf17","rf18","rf19","rf20","rfc"],
    tournament_divisions: snapshot.settings?.tournamentDivisions || ["sop","sst","sml"],

    // Additional settings
    merge_ss_with_s: snapshot.settings?.mergeSsWithS || "true",
    multiple_reg_allowed: snapshot.settings?.multipleRegAllowed || "true",
    include_pcc_in_combined: snapshot.settings?.includePccInCombined || "false",
    transfer_mode: snapshot.settings?.transferMode || "no",
    state: "",
    url: overrides.url || snapshot.url || "",
    url_display: overrides.urlDisplay || snapshot.urlDisplay || ""
  }

  const match = await ssiCreateEvent({
    credentials,
    formInput: matchData,
    rule: snapshot.rule || 'sr',
    subRule: snapshot.subRule || 'to',
    firearms: (snapshot.settings?.firearms || ["rf", "sg", "hg"]).join(',')
  })
  
  const eventIds = { typeId: match.get_content_type_key, eventId: match.id }
  const eventUrl = match.get_full_absolute_url
  
  log.info(`[event-creation] GraphQL Match created: ${eventName} → ${eventUrl}`)
  progress('event_created', `Match created: ${eventUrl}`)
  
  // Need a web session for squad creation anyway
  log.info(`[event-creation] Authenticating with SSI Web for squad creation...`)
  const cookies = await ssiLogin(credentials.email, credentials.password)

  return { eventIds, eventUrl, cookies }
}
