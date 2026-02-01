# Agentic Automation Design

**Document Version:** 1.0 (Draft)  
**Date:** 2026-02-01  
**Status:** Awaiting Approval

---

## Executive Summary

This document presents a comprehensive design for implementing agentic automation for the Kupittaa Cup event management system. The solution leverages Azure and Microsoft AI Foundry to create an autonomous, intelligent system that manages event creation, monitoring, and reporting with minimal human intervention.

### Key Objectives

1. **Automation**: Automate event creation and management workflows
2. **Monitoring**: Continuously monitor event status and data integrity
3. **Reporting**: Provide automated reporting after events complete
4. **Intelligence**: Use AI agents to handle complex decision-making and error recovery
5. **Maintainability**: Create a scalable architecture that's easy to maintain

### Expected Benefits

- **Reduced Manual Work**: 80%+ reduction in manual event creation and management tasks
- **Improved Reliability**: Automated data integrity checks and error detection
- **Better Insights**: Automated reporting and statistics tracking
- **Faster Response**: Real-time monitoring and issue detection
- **Scalability**: Handle multiple event types beyond Kupittaa Cup

---

## Current State Analysis

### Existing System

The current system is a **semi-automated PowerShell-based solution** with:

**Strengths:**
- ✅ Robust SSI Cup creation (web scraping + GraphQL API)
- ✅ WordPress integration with 2FA support
- ✅ Batch processing capabilities
- ✅ Data integrity validation
- ✅ YAML-based configuration

**Limitations:**
- ⚠️ Manual trigger required for all operations
- ⚠️ No continuous monitoring
- ⚠️ No automated reporting post-event
- ⚠️ Manual OTP entry for WordPress 2FA
- ⚠️ Limited error recovery
- ⚠️ Single event type (Kupittaa Cup)

### Technology Stack (Current)
- PowerShell 7.x
- Web scraping (Invoke-WebRequest)
- SSI GraphQL API (limited use)
- WordPress REST API (limited use)
- YAML configuration files

### Key Constraints (Per Requirement #48)
1. **Web Scraping Continues**: Tapahtumakalenteri and full SSI API access not available short-term
2. **Email OTP Access**: Programmatic mailbox access will be possible
3. **Technology Preference**: Azure and Microsoft AI Foundry
4. **Agentic Workflows**: Use AI agents for complex tasks

---

## Proposed Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Azure AI Foundry Hub                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  Orchestration Agent                      │  │
│  │          (Central coordination & workflow)                │  │
│  └─────────────┬─────────────────────────────┬───────────────┘  │
│                │                             │                   │
│  ┌─────────────▼──────────┐   ┌─────────────▼──────────────┐   │
│  │   Event Creation       │   │   Monitoring & Integrity   │   │
│  │   Agent                │   │   Agent                    │   │
│  └────────────────────────┘   └────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Reporting Agent                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
   ┌────▼─────┐         ┌──────▼──────┐      ┌───────▼──────┐
   │  Azure   │         │   Azure     │      │    Azure     │
   │ Functions│         │  Logic Apps │      │   Storage    │
   └──────────┘         └─────────────┘      │   (State)    │
        │                      │              └──────────────┘
        │                      │
   ┌────▼─────┐         ┌──────▼──────┐
   │   SSI    │         │ WordPress   │
   │(GraphQL/ │         │  (REST +    │
   │  Web)    │         │  Scraping)  │
   └──────────┘         └─────────────┘
```

### Architecture Principles

1. **Agent-Based**: Use specialized AI agents for different responsibilities
2. **Event-Driven**: Trigger workflows based on events (schedules, webhooks, changes)
3. **State Management**: Maintain workflow state in Azure Storage
4. **Resilient**: Built-in retry logic and error handling
5. **Observable**: Comprehensive logging and monitoring

---

## Agent Design

### 1. Orchestration Agent

**Role**: Central coordinator managing all workflows and agent interactions

**Responsibilities:**
- Receive and validate incoming requests (batch creation, monitoring, reporting)
- Coordinate other specialized agents
- Manage workflow state transitions
- Handle error escalation
- Provide status updates

**Technology**: Azure AI Foundry Agent + Logic Apps

**Key Workflows:**
- Batch event creation workflow
- Scheduled monitoring workflow
- Post-event reporting workflow
- Emergency intervention workflow

### 2. Event Creation Agent

**Role**: Create events in SSI and WordPress with intelligence and error recovery

**Responsibilities:**
- Parse date lists and event requirements
- Authenticate with SSI and WordPress (handle OTP)
- Create Cup, Matches, Squads in SSI
- Create corresponding calendar events in WordPress
- Validate created resources
- Retry on transient failures
- Report creation status

**Technology**: Azure AI Foundry Agent + Azure Functions

**Intelligence Features:**
- **Smart Retry**: Distinguish between transient and permanent errors
- **Conflict Resolution**: Detect and handle duplicate events intelligently
- **Validation**: Verify all created resources are correct
- **Self-Healing**: Automatically fix common issues (e.g., missing squads)

### 3. Monitoring & Integrity Agent

**Role**: Continuously monitor event status and data integrity

**Responsibilities:**
- Monitor upcoming events (registration status, participant counts)
- Verify data consistency between SSI and WordPress
- Detect anomalies (e.g., events missing in one system)
- Check cross-references (permalinks, IDs, URLs)
- Alert on issues requiring attention
- Perform scheduled integrity checks

**Technology**: Azure AI Foundry Agent + Logic Apps (scheduled)

**Intelligence Features:**
- **Anomaly Detection**: Identify unusual patterns (e.g., zero registrations close to event date)
- **Proactive Alerts**: Notify before issues become critical
- **Auto-Remediation**: Fix minor issues automatically (e.g., broken links)
- **Trend Analysis**: Track registration patterns over time

### 4. Reporting Agent

**Role**: Generate reports and update statistics after events complete

**Responsibilities:**
- Detect completed events
- Retrieve participant counts and results from SSI
- Update WordPress with statistics (shots fired, participants)
- Generate summary reports
- Archive event data
- Identify improvement opportunities

**Technology**: Azure AI Foundry Agent + Azure Functions

**Intelligence Features:**
- **Natural Language Reports**: Generate human-readable summaries
- **Insights**: Identify trends and patterns across events
- **Recommendations**: Suggest optimizations (e.g., squad sizes, timing)

---

## Technical Components

### Azure AI Foundry

**Components Used:**
- **AI Agents**: Core intelligent agents with reasoning capabilities
- **Prompt Flow**: Visual workflow design for agent interactions
- **Model Deployment**: Deploy and manage GPT-4 or similar models
- **Agent Memory**: Maintain context across interactions
- **Tool Calling**: Enable agents to call external functions and APIs

**Agent Configuration:**
```yaml
agents:
  orchestration:
    model: gpt-4-turbo
    temperature: 0.2  # Low for consistent decision-making
    tools:
      - event_creation_agent
      - monitoring_agent
      - reporting_agent
      - send_notification
  
  event_creation:
    model: gpt-4-turbo
    temperature: 0.1  # Very low for accurate data entry
    tools:
      - create_ssi_cup
      - create_wordpress_event
      - validate_event
      - handle_otp
  
  monitoring:
    model: gpt-4-turbo
    temperature: 0.3  # Moderate for anomaly detection
    tools:
      - check_data_integrity
      - query_ssi_api
      - query_wordpress_api
      - send_alert
  
  reporting:
    model: gpt-4-turbo
    temperature: 0.5  # Higher for creative report generation
    tools:
      - get_event_stats
      - update_wordpress_stats
      - generate_report
      - send_report
```

### Azure Functions

**Purpose**: Host PowerShell scripts as serverless functions

**Functions:**
1. **CreateSSICup**: Wrapper around existing New-KupittaaCup.ps1
2. **CreateWordPressEvent**: Wrapper around New-TapahtumakalenteriEvent.ps1
3. **CheckIntegrity**: Wrapper around Test-EventIntegrity.ps1
4. **UpdateStatistics**: Wrapper around Update-TapahtumakalenteriEvent.ps1
5. **AuthenticateSSI**: Handle SSI authentication
6. **AuthenticateWordPress**: Handle WordPress authentication with OTP
7. **ReadOTP**: Fetch OTP from mailbox programmatically

**Configuration:**
- Runtime: PowerShell 7.4
- Hosting: Consumption plan (cost-effective)
- Region: North Europe (closest to Finland)

### Azure Logic Apps

**Purpose**: Orchestrate workflows and scheduled tasks

**Logic Apps:**

1. **Batch Event Creation Workflow**
   - Trigger: HTTP request with date list
   - Steps:
     1. Parse date list
     2. Authenticate with SSI and WordPress
     3. For each date:
        - Call Orchestration Agent
        - Wait for completion
        - Log result
     4. Send summary report

2. **Daily Monitoring Workflow**
   - Trigger: Daily schedule (e.g., 8:00 AM)
   - Steps:
     1. Get upcoming events (next 30 days)
     2. Call Monitoring Agent for each event
     3. Aggregate findings
     4. Send daily status report

3. **Post-Event Reporting Workflow**
   - Trigger: Daily schedule (e.g., 6:00 PM)
   - Steps:
     1. Identify events completed in last 24 hours
     2. For each completed event:
        - Call Reporting Agent
        - Update WordPress statistics
        - Generate report
     3. Send consolidated report

4. **Weekly Integrity Check Workflow**
   - Trigger: Weekly schedule (e.g., Sunday 9:00 AM)
   - Steps:
     1. Call Monitoring Agent for full integrity check
     2. Generate detailed integrity report
     3. Highlight any discrepancies
     4. Send report

### Azure Storage

**Purpose**: Persist state, logs, and configuration

**Storage Components:**

1. **Blob Storage**:
   - Configuration files (YAML)
   - Agent prompts and instructions
   - Generated reports (archived)
   - Event data snapshots

2. **Table Storage**:
   - Workflow execution history
   - Agent decision logs
   - Event tracking (SSI ID ↔ WordPress ID mappings)
   - Error logs and retries

3. **Queue Storage**:
   - Event creation queue (for batch processing)
   - Monitoring task queue
   - Reporting task queue

**State Schema (Table Storage):**
```
EventState:
  - PartitionKey: EventDate (YYYY-MM-DD)
  - RowKey: EventType-GUID
  - SSIEventId: 123
  - WordPressEventId: 456
  - CreatedDate: ISO8601
  - Status: created|published|completed|archived
  - ParticipantCount: 18
  - ShotsFired: 1800
  - LastChecked: ISO8601
  - Integrity: ok|warning|error
  - Notes: JSON
```

### Email Integration (OTP Handling)

**Approach**: Azure Logic Apps with Office 365 Connector

**Workflow for OTP:**
1. Initiate WordPress login
2. WordPress sends OTP to registered email
3. Logic App monitors mailbox (specific folder/subject filter)
4. Extract OTP using regex pattern
5. Pass OTP to authentication function
6. Complete authentication

**Configuration:**
- Email account: Dedicated service account for automation
- Connector: Office 365 Outlook or Microsoft Graph API
- Filtering: Subject contains "verificiation code" or similar
- Timing: Poll every 10 seconds for 2 minutes

**Alternative (Microsoft Graph API):**
```powershell
# Read latest OTP email
$messages = Invoke-MgGraphRequest -Uri "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?`$filter=subject eq 'WordPress Verification Code'&`$top=1&`$orderby=receivedDateTime desc"
$otpCode = Extract-OTP -EmailBody $messages.value[0].body.content
```

---

## Security & Authentication

### Secret Management

**Azure Key Vault** for all sensitive credentials:
- SSI username/password
- SSI API key (GraphQL)
- WordPress username/password
- Email account credentials
- API keys and connection strings

**Access Control:**
- Managed identities for Azure Functions and Logic Apps
- No hard-coded secrets in code
- Secrets rotated regularly (90-day policy)

### Authentication Flows

**SSI Authentication:**
1. Retrieve credentials from Key Vault
2. Use Connect-SSI.ps1 with username/password
3. Cache session in Azure Storage (encrypted, 24-hour TTL)
4. Reuse session across operations
5. Refresh on expiration

**WordPress Authentication with OTP:**
1. Retrieve credentials from Key Vault
2. Initiate login via Connect-WordPress.ps1
3. Trigger email OTP via Logic App
4. Wait for OTP (max 2 minutes)
5. Complete authentication
6. Cache session (encrypted, 24-hour TTL)

**Security Best Practices:**
- All secrets encrypted at rest and in transit
- Network security groups restrict access
- Audit logs for all authentication attempts
- Session tokens never logged
- Rate limiting on authentication endpoints

---

## Data Flow

### Event Creation Flow

```
User/Schedule → Logic App (Batch Request)
                    ↓
         Orchestration Agent (Validates request)
                    ↓
              [For each date]
                    ↓
         Event Creation Agent (Creates plan)
                    ↓
    ┌───────────────┴───────────────┐
    ↓                               ↓
Azure Function                Azure Function
(CreateSSICup)               (CreateWordPressEvent)
    ↓                               ↓
  SSI API                      WordPress API
    ↓                               ↓
Event Created                 Event Created (Draft)
    ↓                               ↓
    └───────────────┬───────────────┘
                    ↓
         Event Creation Agent (Validates)
                    ↓
         Azure Storage (Save event mapping)
                    ↓
        Orchestration Agent (Reports success)
                    ↓
         User Notification (Email/Teams)
```

### Monitoring Flow

```
Schedule Trigger (Daily 8:00 AM)
                    ↓
         Logic App (Monitoring Workflow)
                    ↓
    Monitoring & Integrity Agent (Plans checks)
                    ↓
         Azure Function (CheckIntegrity)
                    ↓
    ┌───────────────┴───────────────┐
    ↓                               ↓
Query SSI API                Query WordPress API
    ↓                               ↓
Get events data              Get events data
    ↓                               ↓
    └───────────────┬───────────────┘
                    ↓
    Monitoring Agent (Analyzes data)
                    ↓
         [Anomaly detected?]
         Yes ↓           ↓ No
    Send Alert    Log Status
         ↓               ↓
    └───────┬───────────┘
            ↓
    Azure Storage (Log results)
            ↓
    Daily Status Report
```

### Reporting Flow

```
Schedule Trigger (Daily 6:00 PM)
                    ↓
         Logic App (Reporting Workflow)
                    ↓
    Azure Storage (Query completed events)
                    ↓
         [Events completed today?]
         Yes ↓           ↓ No
    Reporting Agent   Exit
         ↓
    [For each event]
         ↓
    Azure Function (GetEventStats)
         ↓
    Query SSI API (Participant count, results)
         ↓
    Reporting Agent (Generates report)
         ↓
    Azure Function (UpdateWordPressStats)
         ↓
    Update WordPress (Shots fired, participants)
         ↓
    Azure Storage (Archive report)
         ↓
    Send Report (Email/Teams)
```

---

## Implementation Roadmap

### Phase 1: Foundation (4-6 weeks)

**Goal**: Set up Azure infrastructure and migrate existing scripts

**Tasks:**
- [x] Document current system (Done)
- [ ] Set up Azure subscription and resource group
- [ ] Create Azure AI Foundry Hub and project
- [ ] Deploy Azure Functions with PowerShell runtime
- [ ] Migrate existing PowerShell scripts to Azure Functions
  - [ ] CreateSSICup function
  - [ ] CreateWordPressEvent function
  - [ ] CheckIntegrity function
  - [ ] UpdateStatistics function
- [ ] Set up Azure Key Vault with secrets
- [ ] Configure managed identities
- [ ] Set up Azure Storage (Blob, Table, Queue)
- [ ] Test individual functions in Azure

**Deliverables:**
- Working Azure Functions for all existing scripts
- Secure secret management
- Basic state storage

**Success Criteria:**
- All functions execute successfully in Azure
- Secrets managed securely
- No regressions from current PowerShell scripts

### Phase 2: Email OTP Automation (2-3 weeks)

**Goal**: Enable programmatic OTP handling for WordPress

**Tasks:**
- [ ] Set up dedicated email account for automation
- [ ] Configure Azure Logic App with Office 365 connector
- [ ] Create email monitoring workflow
- [ ] Implement OTP extraction logic (regex)
- [ ] Create ReadOTP Azure Function
- [ ] Update Connect-WordPress.ps1 for automated OTP
- [ ] Test end-to-end WordPress authentication
- [ ] Add error handling for OTP timeouts

**Deliverables:**
- Automated WordPress authentication with zero manual intervention
- Reliable OTP extraction (95%+ success rate)

**Success Criteria:**
- WordPress login succeeds automatically
- OTP retrieved within 30 seconds
- Graceful handling of OTP failures

### Phase 3: Agent Development (6-8 weeks)

**Goal**: Develop AI agents with intelligence and reasoning

**Tasks:**
- [ ] Define agent personas and system prompts
- [ ] Implement Orchestration Agent
  - [ ] Request parsing and validation
  - [ ] Agent coordination logic
  - [ ] State management
  - [ ] Error escalation
- [ ] Implement Event Creation Agent
  - [ ] Event planning logic
  - [ ] Intelligent retry with exponential backoff
  - [ ] Validation and self-healing
  - [ ] Conflict resolution
- [ ] Implement Monitoring & Integrity Agent
  - [ ] Data integrity check logic
  - [ ] Anomaly detection algorithms
  - [ ] Alert generation
  - [ ] Auto-remediation for minor issues
- [ ] Implement Reporting Agent
  - [ ] Statistics gathering
  - [ ] Natural language report generation
  - [ ] Insights and recommendations
- [ ] Connect agents to Azure Functions (tool calling)
- [ ] Test agents individually
- [ ] Test agent interactions

**Deliverables:**
- Four functional AI agents
- Agent memory and context management
- Tool calling to Azure Functions
- Comprehensive agent tests

**Success Criteria:**
- Agents make correct decisions 90%+ of the time
- Agents handle errors intelligently
- Agents collaborate effectively

### Phase 4: Workflow Automation (4-5 weeks)

**Goal**: Create automated workflows with Logic Apps

**Tasks:**
- [ ] Design Logic App workflows
- [ ] Implement Batch Event Creation Workflow
- [ ] Implement Daily Monitoring Workflow
- [ ] Implement Post-Event Reporting Workflow
- [ ] Implement Weekly Integrity Check Workflow
- [ ] Configure schedules and triggers
- [ ] Add workflow monitoring and alerting
- [ ] Test each workflow end-to-end
- [ ] Optimize for performance and cost

**Deliverables:**
- Four operational Logic App workflows
- Scheduled automation for monitoring and reporting
- Event-driven creation workflows

**Success Criteria:**
- Workflows execute on schedule
- Error handling and retries work correctly
- Notifications sent appropriately

### Phase 5: Testing & Validation (3-4 weeks)

**Goal**: Comprehensive testing and validation

**Tasks:**
- [ ] Create test event types in SSI and WordPress
- [ ] Execute end-to-end tests
  - [ ] Single event creation
  - [ ] Batch event creation (10 events)
  - [ ] Monitoring workflow
  - [ ] Post-event reporting
  - [ ] Integrity checks
- [ ] Load testing (batch of 50+ events)
- [ ] Error injection testing
  - [ ] SSI API failures
  - [ ] WordPress timeouts
  - [ ] OTP delays
  - [ ] Network issues
- [ ] Security testing
  - [ ] Secret exposure checks
  - [ ] Access control verification
  - [ ] Encryption validation
- [ ] Performance optimization
- [ ] Documentation updates

**Deliverables:**
- Comprehensive test suite
- Performance benchmarks
- Security audit report
- Updated documentation

**Success Criteria:**
- 95%+ success rate for event creation
- All error scenarios handled gracefully
- Security vulnerabilities addressed
- Performance acceptable (< 5 min per event)

### Phase 6: Production Deployment (2-3 weeks)

**Goal**: Deploy to production and transition from manual to automated

**Tasks:**
- [ ] Set up production environment (separate resource group)
- [ ] Deploy all components to production
- [ ] Configure production schedules
- [ ] Set up monitoring and alerting (Azure Monitor)
- [ ] Create operational runbooks
- [ ] Train users on monitoring dashboards
- [ ] Execute parallel run (automated + manual verification)
- [ ] Gradual transition to full automation
- [ ] Post-deployment monitoring

**Deliverables:**
- Production-ready system
- Operational documentation
- Monitoring dashboards
- Incident response procedures

**Success Criteria:**
- Zero downtime during deployment
- Manual verification confirms automated accuracy
- All stakeholders trained
- Monitoring alerts working

### Phase 7: Enhancement & Expansion (Ongoing)

**Goal**: Improve system and extend to other event types

**Tasks:**
- [ ] Gather feedback from initial weeks
- [ ] Implement improvements based on feedback
- [ ] Add support for other event types (generic framework)
- [ ] Enhance agent intelligence with learning
- [ ] Implement advanced analytics
- [ ] Consider GraphQL migration for SSI (if available)
- [ ] Explore WordPress full API integration (if available)

**Deliverables:**
- Continuous improvements
- Multi-event type support
- Advanced features

---

## Cost Estimation (Azure)

**Monthly Costs (Estimated):**

| Service | Configuration | Est. Cost (EUR) |
|---------|--------------|-----------------|
| Azure AI Foundry | GPT-4 Turbo, ~500K tokens/month | €25-50 |
| Azure Functions | Consumption, ~10K executions/month | €2-5 |
| Azure Logic Apps | Consumption, ~1K runs/month | €5-10 |
| Azure Storage | Standard, 100 GB Blob + 10 GB Table | €5 |
| Azure Key Vault | Standard, 1K operations/month | €2 |
| Azure Monitor | Basic logs and alerts | €5-10 |
| **Total** | | **€44-82/month** |

**Notes:**
- Actual costs depend on usage patterns
- Consumption plans scale to zero when idle
- Consider reserved capacity for production (cost savings)
- Monitor costs with Azure Cost Management

---

## Risks & Mitigation

### Risk 1: AI Agent Hallucination

**Risk**: AI agents may make incorrect decisions or generate invalid data

**Impact**: High - Could create malformed events or corrupt data

**Mitigation**:
- Use low temperature (0.1-0.3) for data entry tasks
- Implement strict validation after agent actions
- Use function calling with constrained schemas
- Human review for high-risk operations
- Comprehensive logging for audit trail

### Risk 2: OTP Retrieval Failure

**Risk**: Email OTP may not be retrieved in time or at all

**Impact**: Medium - WordPress event creation fails

**Mitigation**:
- Retry logic with exponential backoff
- Manual fallback mechanism (send alert)
- Extended timeout window (2-3 minutes)
- Alternative: Pre-authenticated sessions cached for 24 hours
- Monitor OTP success rate

### Risk 3: API Changes (SSI or WordPress)

**Risk**: External systems change their APIs or web structure

**Impact**: High - Breaks automation entirely

**Mitigation**:
- Monitor for API changes with validation tests
- Maintain multiple integration methods (GraphQL + web scraping)
- Alert on detection of changes
- Keep original PowerShell scripts as fallback
- Version control for all API interaction code

### Risk 4: Authentication Token Expiry

**Risk**: Cached sessions expire unexpectedly

**Impact**: Low-Medium - Operations fail until re-auth

**Mitigation**:
- Proactive session refresh before expiry
- Detect authentication failures and re-auth automatically
- Keep sessions in encrypted storage with TTL
- Monitor authentication success rates

### Risk 5: Cost Overruns (Azure)

**Risk**: Unexpected high usage leads to high Azure costs

**Impact**: Medium - Budget impact

**Mitigation**:
- Set up Azure Cost Management alerts
- Use Consumption plans (pay per use)
- Implement rate limiting
- Monitor token usage for AI models
- Regular cost reviews (monthly)

### Risk 6: Data Integrity Issues

**Risk**: Mismatch between SSI and WordPress data

**Impact**: Medium - Manual reconciliation required

**Mitigation**:
- Daily integrity checks
- Automated reconciliation for minor issues
- Alerts for manual review of major discrepancies
- Audit trail for all changes
- Regular backups of state data

---

## Decision Points Requiring User Approval

### Decision 1: Azure Subscription and Budgeting

**Question**: Which Azure subscription should be used, and what is the approved monthly budget?

**Options**:
- A) Use existing Azure subscription (if available)
- B) Create new subscription dedicated to this project
- C) Use trial/free tier initially

**Recommendation**: Option B - Dedicated subscription for clear cost tracking

**Budget**: €50-100/month recommended for production

**User Decision Required**: Yes/No to proceed with Azure, approved budget

---

### Decision 2: Email Account for OTP

**Question**: Which email account should be used for automation?

**Options**:
- A) Create new dedicated account (e.g., turres-automation@...)
- B) Use existing account with inbox rules
- C) Wait for alternative OTP method

**Recommendation**: Option A - Dedicated account for security and isolation

**Requirements**:
- Must support Office 365 or Microsoft Graph API
- Reliable email delivery
- Dedicated for automation only

**User Decision Required**: Provide email account details

---

### Decision 3: Notification Preferences

**Question**: How should the system notify users of events and issues?

**Options**:
- A) Email notifications
- B) Microsoft Teams messages
- C) Both email and Teams
- D) Dashboard only (no active notifications)

**Recommendation**: Option C - Email for critical issues, Teams for daily reports

**User Decision Required**: Preferred notification channels and recipients

---

### Decision 4: Monitoring Schedule

**Question**: What monitoring schedule is appropriate?

**Current Proposal**:
- Daily monitoring: 8:00 AM (upcoming events check)
- Daily reporting: 6:00 PM (completed events)
- Weekly integrity: Sunday 9:00 AM (full check)

**Options**:
- A) Accept proposed schedule
- B) Modify schedule (specify times)
- C) More frequent monitoring (hourly?)

**User Decision Required**: Approved monitoring schedule

---

### Decision 5: Event Type Expansion Timeline

**Question**: When should support for other event types be added?

**Options**:
- A) Phase 1: Only Kupittaa Cup (focus on reliability)
- B) Phase 2: Add 1-2 more event types during enhancement phase
- C) Design for multiple types from start (more complex, longer timeline)

**Recommendation**: Option A - Prove system with Kupittaa Cup first

**User Decision Required**: Confirm phased approach

---

### Decision 6: Manual Override Capability

**Question**: Should there be a manual override/approval step for certain operations?

**Options**:
- A) Fully automated (no manual approval required)
- B) Manual approval for batch creation only
- C) Manual approval for all creation operations
- D) Manual approval for detected anomalies only

**Recommendation**: Option D - Automated with manual review for anomalies

**User Decision Required**: Approval workflow requirements

---

### Decision 7: Implementation Timeline

**Question**: What is the acceptable timeline for full deployment?

**Proposed Timeline**: 21-29 weeks (~5-7 months)

**Options**:
- A) Full phased implementation as proposed (5-7 months)
- B) Accelerated timeline with reduced scope (3-4 months)
- C) Extended timeline with more features (9-12 months)

**Recommendation**: Option A - Balanced approach

**User Decision Required**: Confirm acceptable timeline

---

### Decision 8: Testing Strategy

**Question**: How should testing be conducted during development?

**Options**:
- A) Test mode with "TEST" prefix (current approach)
- B) Dedicated test environment (separate SSI group/WordPress site)
- C) Production testing during off-hours with real events

**Recommendation**: Option B - Dedicated test environment (if possible)

**User Decision Required**: Testing approach and environment availability

---

### Decision 9: Error Handling Philosophy

**Question**: How should the system handle errors?

**Options**:
- A) Fail fast - Stop on first error, alert immediately
- B) Best effort - Continue processing, log errors, report at end
- C) Intelligent retry - Retry transient errors, fail on permanent errors

**Recommendation**: Option C - Intelligent retry with clear error classification

**User Decision Required**: Preferred error handling approach

---

### Decision 10: Data Retention

**Question**: How long should system logs and event data be retained?

**Options**:
- A) 30 days (minimal)
- B) 1 year (recommended)
- C) Indefinitely (archive to cheaper storage)

**Recommendation**: Option B - 1 year active, then archive

**User Decision Required**: Data retention policy

---

## Success Metrics

### Key Performance Indicators (KPIs)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Event Creation Success Rate** | 95%+ | Successful creates / Total attempts |
| **Monitoring Uptime** | 99%+ | Successful checks / Total scheduled checks |
| **Data Integrity Score** | 98%+ | Consistent records / Total records checked |
| **Average Creation Time** | < 5 min | Time from trigger to completion |
| **OTP Retrieval Success** | 95%+ | Successful OTP / Total OTP attempts |
| **False Alert Rate** | < 5% | False alerts / Total alerts |
| **Manual Intervention Rate** | < 10% | Manual fixes / Total operations |
| **Cost per Event** | < €2 | Total Azure costs / Events created |

### Operational Metrics

- **Time Saved**: Compare manual vs automated time
- **Error Detection**: Number of issues detected automatically
- **User Satisfaction**: Feedback surveys
- **System Reliability**: Uptime and availability

---

## Maintenance & Operations

### Ongoing Maintenance Tasks

**Daily**:
- Monitor system health dashboard
- Review automated reports
- Respond to alerts

**Weekly**:
- Review integrity check reports
- Analyze performance metrics
- Check for API/web structure changes

**Monthly**:
- Review Azure costs
- Rotate secrets (if policy requires)
- Update agent prompts based on learnings
- Review and address accumulated issues

**Quarterly**:
- Security audit
- Performance optimization
- Feature enhancement planning
- Documentation updates

### Support & Escalation

**Tier 1 - Automated**:
- System detects and fixes minor issues automatically
- Standard retries and recovery

**Tier 2 - Alert & Manual Review**:
- System detects issue but requires human decision
- Alert sent to operators
- Runbook provided for resolution

**Tier 3 - Developer Escalation**:
- Complex issues requiring code changes
- API/system integration problems
- Escalated to development team

---

## Appendices

### Appendix A: Agent Prompt Examples

**Orchestration Agent System Prompt:**
```
You are the Orchestration Agent for the Kupittaa Cup event management system. 
Your role is to coordinate event creation, monitoring, and reporting workflows.

Responsibilities:
- Validate incoming requests for event creation
- Coordinate specialized agents (Event Creation, Monitoring, Reporting)
- Manage workflow state transitions
- Handle error escalation and recovery
- Provide clear status updates to users

Guidelines:
- Always validate inputs before starting workflows
- Break complex tasks into smaller steps for specialized agents
- Maintain clear audit trail of all decisions
- Escalate to human operators when uncertain
- Use low-risk approaches by default

Available Tools:
- event_creation_agent: Create events in SSI and WordPress
- monitoring_agent: Check event status and data integrity
- reporting_agent: Generate reports and update statistics
- send_notification: Notify users of status or issues
```

**Event Creation Agent System Prompt:**
```
You are the Event Creation Agent specializing in creating shooting events.
Your role is to create events accurately and handle any issues intelligently.

Responsibilities:
- Create RESUL CUP events in SSI with all components (matches, squads)
- Create corresponding WordPress calendar events
- Validate all created resources
- Handle authentication with OTP
- Retry on transient failures
- Detect and resolve conflicts

Guidelines:
- Accuracy is critical - double-check all data before submission
- Use the provided configuration files for event details
- Distinguish between transient errors (retry) and permanent errors (fail)
- Always validate created resources match specifications
- Log all actions for audit trail

Available Tools:
- create_ssi_cup: Create event in SSI
- create_wordpress_event: Create event in WordPress
- validate_event: Verify event was created correctly
- handle_otp: Retrieve and submit OTP code
```

### Appendix B: Configuration Examples

**Agent Configuration (agents-config.yml):**
```yaml
agents:
  orchestration:
    model: gpt-4-turbo
    temperature: 0.2
    max_tokens: 4000
    tools:
      - event_creation_agent
      - monitoring_agent
      - reporting_agent
      - send_notification
    system_prompt_file: prompts/orchestration-agent.txt
  
  event_creation:
    model: gpt-4-turbo
    temperature: 0.1
    max_tokens: 2000
    tools:
      - create_ssi_cup
      - create_wordpress_event
      - validate_event
      - handle_otp
    system_prompt_file: prompts/event-creation-agent.txt
    retry_config:
      max_retries: 3
      backoff_multiplier: 2
      initial_delay_seconds: 10
  
  monitoring:
    model: gpt-4-turbo
    temperature: 0.3
    max_tokens: 3000
    tools:
      - check_data_integrity
      - query_ssi_api
      - query_wordpress_api
      - send_alert
    system_prompt_file: prompts/monitoring-agent.txt
    anomaly_threshold: 0.8
  
  reporting:
    model: gpt-4-turbo
    temperature: 0.5
    max_tokens: 3000
    tools:
      - get_event_stats
      - update_wordpress_stats
      - generate_report
      - send_report
    system_prompt_file: prompts/reporting-agent.txt
```

**Workflow Configuration (workflows-config.yml):**
```yaml
workflows:
  batch_event_creation:
    trigger: http_request
    max_events_per_batch: 50
    parallel_processing: false
    error_handling: stop_on_error
  
  daily_monitoring:
    trigger: schedule
    schedule: "0 8 * * *"  # 8:00 AM daily
    look_ahead_days: 30
    alert_threshold: warning
  
  post_event_reporting:
    trigger: schedule
    schedule: "0 18 * * *"  # 6:00 PM daily
    look_back_days: 1
    auto_update_stats: true
  
  weekly_integrity:
    trigger: schedule
    schedule: "0 9 * * 0"  # Sunday 9:00 AM
    full_check: true
    auto_remediate: true
```

### Appendix C: Technology Alternatives Considered

| Technology | Considered | Reason Not Selected |
|------------|-----------|---------------------|
| AWS Lambda | Yes | Azure preferred per requirement |
| Google Cloud Functions | Yes | Azure preferred per requirement |
| OpenAI API (Direct) | Yes | Azure AI Foundry provides better integration |
| Custom ML Models | Yes | GPT-4 more suitable for reasoning tasks |
| Kubernetes | Yes | Over-engineering for this use case |
| Azure Durable Functions | Yes | Logic Apps provide better visual workflow |
| Power Automate | Yes | Logic Apps more powerful for complex workflows |

---

## Glossary

- **Agent**: An AI-powered component with reasoning capabilities and tool access
- **Orchestration**: Coordination of multiple agents and workflows
- **OTP**: One-Time Password used for two-factor authentication
- **SSI**: Shoot'n'ScoreIt - shooting sports event management platform
- **Tapahtumakalenteri**: Finnish WordPress-based event calendar
- **RESUL CUP**: A specific type of shooting competition format
- **Azure AI Foundry**: Microsoft's platform for building and deploying AI agents
- **Logic Apps**: Azure's workflow automation service
- **Managed Identity**: Azure's way of providing secure, credential-less authentication

---

## References

- Azure AI Foundry Documentation: https://learn.microsoft.com/en-us/azure/ai-studio/
- Azure Functions with PowerShell: https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-powershell
- Azure Logic Apps: https://learn.microsoft.com/en-us/azure/logic-apps/
- Microsoft Graph API: https://learn.microsoft.com/en-us/graph/
- Requirement #48: See docs/requirements.md

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-01 | Copilot | Initial design document (DRAFT) |

---

**Next Steps:**
1. Review this design document
2. Provide decisions for Decision Points 1-10
3. Approve or request modifications to the design
4. Approve implementation roadmap
5. Begin Phase 1 implementation

