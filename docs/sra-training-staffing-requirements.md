# SRA Training Staffing Requirements - Translation and Clarification

## Translation of Issue

### Issue Title
SRA training staffing ('vetäjät') should be simple to organize and follow

### Background Context
All Matches are managed in SSI (Shoot and Score It)
- Squads, etc.
- Enrollment, shooters and scoring

All Matches are advertised in Tapahtumakalenteri (Event Calendar).

There are two primary types of SRA trainings at Temppelivuori range:
- Oldies
- Newbie

All SRA trainings at Temppelivuori have the following squads:
- Squads 1-4 for shooters
- Squad 5 is for staff ('vetäjät')

### Staffing Requirements

#### Staff Count
- The number of 'vetäjät' depends on the number of shooters
- Oldies: maximum 4 'vetäjät' (one per squad)
- If there are three squads, only three 'vetäjät' are needed

#### Special Roles
- Two 'vetäjät' have special roles:
  - 'vastuuvetäjä' (lead instructor/responsible instructor)
  - 'kalustovastaava' (equipment manager)
- These roles should be marked explicitly to indicate who has which role
- If no one signs up for 'vastuuvetäjä' or 'kalustovastaava', the system should either:
  - Display a notification, OR
  - Randomly assign who has which role

#### Staff Registration
- Only admin accounts can sign up as 'vetäjät'
- Long-term goal: Track statistics (not immediately important)
- A 'vetäjä' should be able to cancel their registration
  - When cancelled, the next person in the queue should be promoted to the training

#### Post-Registration Closing
- When the registration period closes, excess 'vetäjät' should be placed into regular squads (1-4)
- Squad 5 signups should be notified about:
  - Who got staff positions
  - Who did not get staff positions

### Timeline and Logistics

#### Registration Timeline
Registration closes 24 hours before the event → this allows knowing the number of shooters

#### Squad Optimization
- From the shooter count, the number of squads should be determined
- It makes sense to optimize squad count so that each squad has 5 or more shooters
- Rationale: Otherwise, there won't be enough hands for setting up the ranges

### SSI Role Mapping Question
Can SSI's existing roles be used for these purposes?
- 'Quarter master' → 'kalustovastaava' (equipment manager)
- 'Match director' → 'vastuuvetäjä' (lead instructor)

---

## Clarification Questions

### 1. Squad and Staff Count Logic
**Q1.1:** You mentioned "Oldies max 4 vetäjät, one per squad" and "if there are 3 squads, only 3 vetäjät". This implies that the number of squads (1-4) varies based on shooter count. What is the formula or threshold for determining how many squads to create?
- Example: 0-10 shooters = 1 squad, 11-20 = 2 squads, etc.?
- Or is it based on the "5 or more shooters per squad" rule you mentioned?

**Q1.2:** If squad count is determined by shooter enrollment, how do 'vetäjät' know in advance how many staff positions will be available when they sign up?
- Should the system show "up to 4 positions available, final count depends on shooter enrollment"?

### 2. Staff Signup and Queueing
**Q2.1:** When staff sign up to Squad 5, is it first-come-first-served?
- If 6 people sign up but only 3 positions are needed, the first 3 are selected?

**Q2.2:** What happens to excess 'vetäjät' who signed up but aren't needed?
- You mentioned "place them into squads (1-4)" - should they be:
  - Automatically enrolled as regular shooters in squads 1-4?
  - Removed from the event entirely?
  - Kept on a waitlist in case a 'vetäjä' cancels?

**Q2.3:** When a 'vetäjä' cancels their registration:
- Should the next person in the queue automatically be promoted?
- Or should they receive a notification and have to confirm?

### 3. Special Role Assignment
**Q3.1:** For the special roles ('vastuuvetäjä' and 'kalustovastaava'):
- Should 'vetäjät' indicate interest in these roles when they sign up?
- Or should they be assigned after registration closes?
- Should there be a preference system (e.g., "I prefer to be kalustovastaava")?

**Q3.2:** If no one volunteers for special roles:
- You mentioned "notification or random assignment" - which is preferred?
- Or should this be configurable per event?

**Q3.3:** Can the same person have both special roles (vastuuvetäjä + kalustovastaava)?
- Or must they be different people?

### 4. Admin-Only Registration
**Q4.1:** What defines an "admin account" for this purpose?
- Is it a specific permission level in SSI?
- Or a specific group membership?
- How do we verify someone is eligible to sign up as 'vetäjä'?

**Q4.2:** Should non-admin users see Squad 5 at all?
- Or should it be hidden from them?
- Or visible but disabled with a message "Admin only"?

### 5. Notifications
**Q5.1:** You mentioned notifying Squad 5 signups about who got positions. When should this notification occur?
- Immediately when registration closes?
- At some other time?

**Q5.2:** What notification channels should be used?
- Email?
- In-app notification in SSI?
- Both?

**Q5.3:** Should 'vetäjät' who get promoted from queue (when someone cancels) also receive notifications?

### 6. SSI Role Mapping
**Q6.1:** You asked if SSI's 'Quarter master' and 'Match director' roles can be used. Are these:
- Existing roles in SSI that we can assign to squad members?
- Or would these need to be created/configured?

**Q6.2:** If these SSI roles exist, do they have any built-in permissions or functionality that would help?
- Or are they just labels?

### 7. Statistics Tracking (Long-term)
**Q7.1:** What statistics should be tracked for 'vetäjät'?
- Number of times they've served as staff?
- Number of times in each special role?
- Cancellation rate?
- Anything else?

**Q7.2:** Should statistics affect anything?
- Priority in queue?
- Automatic role assignment preference?

### 8. Event Types
**Q8.1:** You mentioned two training types: "Oldies" and "Newbie". Are the rules the same for both?
- Same staff count formula?
- Same special roles?
- Or are there differences?

**Q8.2:** Are there other event types that need this staffing system?
- Or only SRA trainings at Temppelivuori?

### 9. Integration with Existing System
**Q9.1:** Looking at the codebase, there are scripts for "Kupittaa Cup" events. Should this SRA training staffing system:
- Be a completely separate event type?
- Share the same infrastructure but with different configuration?
- Extend the existing event creation scripts?

**Q9.2:** Should SRA trainings be created in Tapahtumakalenteri like Cup events?
- If yes, should the staffing information be visible in the calendar?

### 10. Timeline Clarification
**Q10.1:** Registration closes 24h before. What happens in that 24-hour window?
- Squad optimization (determining final squad count)
- Staff position finalization
- Notification to excess staff
- Anything else?

**Q10.2:** When can 'vetäjät' start canceling their signup?
- Any time before registration closes?
- Only after registration closes?
- Even after the 24h window?

---

## Next Steps

Once these questions are answered, we can:
1. Create a detailed requirements document
2. Design the data model for staff management
3. Plan the implementation approach
4. Determine which SSI APIs/features we need to use
5. Create an implementation plan with minimal changes to existing code
