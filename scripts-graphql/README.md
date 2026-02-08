# Kupittaa Cup Automation - GraphQL API Version

**This is the STANDARD implementation for cup creation.**

This folder contains the GraphQL API-based implementation for creating Kupittaa RESUL CUP events on shootnscoreit.com. The legacy web scraping approach has been archived to `archive/scripts-legacy/`.

## Folder Structure

```
scripts-graphql/
├── config/
│   └── api-key.yml          # API key configuration (DO NOT commit)
├── lib/
│   └── SSI-GraphQL.psm1     # GraphQL API module
├── New-KupittaaCup.ps1      # Main script (GraphQL version)
└── README.md                # This file
```

## Configuration

This version uses **two configuration files**:

1. **Event Configuration**: `../config/kupittaa-cup-config.yml` (shared with web version)
   - Cup settings, match types, squad definitions
   - All event-related configuration

2. **API Key**: `config/api-key.yml` (GraphQL-specific)
   - SSI GraphQL API authentication key
   - Keep this file secure and out of version control

## Requirements

- PowerShell 7.0 or later (pwsh)
- powershell-yaml module (`Install-Module powershell-yaml`)
- Valid SSI GraphQL API key
- Internet connectivity

## Usage

```powershell
# Basic usage
.\New-KupittaaCup.ps1 -Date "31-01-2026"

# Test mode (adds TEST prefix to names)
.\New-KupittaaCup.ps1 -Date "31-01-2026" -TestMode

# Custom API key file
.\New-KupittaaCup.ps1 -Date "31-01-2026" -ApiKeyPath "path/to/api-key.yml"
```

## Getting Your API Key

1. Log in to shootnscoreit.com
2. Navigate to your profile/settings
3. Find the API section and generate/copy your API key
4. Paste it into `config/api-key.yml`

## Differences from Web Version

| Feature | Web Version | GraphQL Version |
|---------|-------------|-----------------|
| Authentication | Session cookie | API key |
| Method | Form submission | GraphQL mutations |
| CSRF handling | Required | Not needed |
| Rate limiting | Manual delays | API-managed |

## API Endpoints

- **GraphQL Endpoint**: `https://shootnscoreit.com/graphql/`
- **Authentication**: Bearer token in Authorization header

## Troubleshooting

### API Key Invalid
- Verify your API key is correct in `config/api-key.yml`
- Check if the key has expired
- Ensure you have the necessary permissions

### GraphQL Errors
- Check the error response for details
- Verify the mutation/query syntax
- Ensure all required fields are provided
