# Archive Directory

This directory contains deprecated code that has been replaced by better implementations.

## scripts-legacy/

**Archived:** 2026-02-08  
**Reason:** Pure web scraping-based cup creation has been superseded by a mixed GraphQL + scraping approach (GraphQL for reads, scraping still required for writes because SSI GraphQL mutations like `create_event` are currently broken).

The legacy `scripts/` directory used web scraping and form parsing to create cups in ShootNScoreIt. This approach was:
- Fragile (broke when SSI HTML changed)
- Slower than API calls
- Harder to maintain

**Replacement:** Use `scripts-graphql/`, which uses the official ShootNScoreIt GraphQL API for reads while retaining maintained web-scraping fallbacks for write operations until the SSI GraphQL mutations are reliable.

### What was in scripts-legacy/
- `New-KupittaaCup.ps1` - Cup creation via form scraping
- `Connect-SSI.ps1` - Session management
- `Connect-WordPress.ps1` - WordPress XML-RPC integration
- `New-TapahtumakalenteriEvent.ps1` - Calendar event creation
- `Update-TapahtumakalenteriEvent.ps1` - Calendar event updates
- `Test-EventIntegrity.ps1` - Event validation
- `New-KupittaaCupBatch.ps1` - Batch cup creation
- `build-release.js` - Build utilities

All WordPress integration functionality remains available in `scripts-graphql/` directory.
