# SSI Match Creation Tool

A PowerShell Core tool for creating SSI (Shoot'n'ScoreIt) matches using the GraphQL API.

## Features

- **Batch Creation**: Create multiple matches in one command
- **Flexible Date Input**: Support for string dates or DateTime objects
- **Dry Run Mode**: Preview what would be created without actually creating
- **Progress Tracking**: Real-time progress updates for large batches
- **Error Handling**: Comprehensive error reporting and retry capability
- **Parallel Processing**: Configurable batch size for optimal performance

## Requirements

- PowerShell Core 7.0 or later
- Internet connectivity to SSI GraphQL API
- Valid SSI API credentials (if required)
- Optional `config.yml` file containing credentials (see below)
- `ConvertFrom-Yaml` availability (built into PowerShell 7); if missing, install `PowerShell-Yaml` module

## Installation

1. Download the `New-SSIMatch.ps1` script
2. Open PowerShell Core
3. Navigate to the script directory
4. Set execution policy if needed:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

## Usage

### Basic Usage

```powershell
# Create matches for specific dates
$dates = @("2024-02-15", "2024-02-16", "2024-02-17")
./New-SSIMatch.ps1 -Dates $dates -BaseName "Winter Match" -MatchAdminEmail "admin@example.com" -MatchType "USPSA"
```

### Advanced Usage

```powershell
# Create matches for an entire month
$dates = Get-Date -Day 1..28 -Month "February" -Year 2024 | ForEach-Object { $_.ToString("yyyy-MM-dd") }
./New-SSIMatch.ps1 -Dates $dates -BaseName "Daily Practice" -MatchAdminEmail "range@club.com" -MatchType "USPSA" -BatchSize 10
```

### Dry Run Mode

```powershell
# Preview what would be created
$dates = @("2024-02-15", "2024-02-16")
./New-SSIMatch.ps1 -Dates $dates -BaseName "Test Match" -MatchAdminEmail "test@example.com" -MatchType "IPSC" -DryRun
```

Dry run output now lists match dates in `yyyy-MM-dd` format to mirror the GraphQL payload.

You can pass either string dates (`yyyy-MM-dd`) or native `DateTime` objects to `-Dates`; both are normalized internally.

### Using API Key

```powershell
# With explicit credentials
./New-SSIMatch.ps1 -Dates $dates -BaseName "Tournament" -MatchAdminEmail "director@club.com" -MatchType "IDPA" -ApiKey "your-api-key-here" -UserEmail "you@example.com" -UserSecret "supers3cret"
```

### Using config.yml

Create a `config.yml` file in the same directory as the script to load the API key automatically:

```yaml
variables:
  apikey: YOUR_API_KEY
  userEmail: your.email@example.com
  secret: yourPasswordOrToken
```

If credentials are omitted from the command line, the script will attempt to read values from this file.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `Dates` | String[] | Yes | Array of dates (yyyy-MM-dd format or DateTime objects) |
| `BaseName` | String | Yes | Base name for matches |
| `MatchAdminEmail` | String | Yes | Email address of match administrator |
| `MatchType` | String | Yes | Type of match (USPSA, IPSC, IDPA, etc.) |
| `ApiUrl` | URI | No | SSI GraphQL API endpoint (default: https://api.shootnscoreit.com/graphql) |
| `ApiKey` | String | No | API key for authentication |
| `UserEmail` | String | No | SSI account email (used for header-based auth) |
| `UserSecret` | String | No | SSI account secret/password (used for header-based auth) |
| `DryRun` | Switch | No | Show what would be created without creating |
| `BatchSize` | Int | No | Number of matches to create in parallel (default: 5) |

## Examples

### Example 1: Weekend Matches

Create matches for upcoming weekends:

```powershell
# Get next 4 Saturdays
$saturdays = for ($i = 0; $i -lt 4; $i++) {
    $date = Get-Date
    while ($date.DayOfWeek -ne "Saturday") { $date = $date.AddDays(1) }
    $date.ToString("yyyy-MM-dd")
    $date = $date.AddDays(7)
}

./New-SSIMatch.ps1 -Dates $saturdays -BaseName "Saturday Steel Challenge" -MatchAdminEmail "match@range.com" -MatchType "USPSA"
```

### Example 2: Monthly Series

Create a monthly series for the year:

```powershell
# First Saturday of each month
$firstSaturdays = for ($month = 1; $month -le 12; $month++) {
    $date = Get-Date -Month $month -Day 1 -Year 2024
    while ($date.DayOfWeek -ne "Saturday") { $date = $date.AddDays(1) }
    $date.ToString("yyyy-MM-dd")
}

./New-SSIMatch.ps1 -Dates $firstSaturdays -BaseName "Monthly Championship" -MatchAdminEmail "director@club.com" -MatchType "USPSA" -BatchSize 3
```

### Example 3: Custom Date Range

Create matches for a specific date range:

```powershell
# Every Tuesday in March 2024
$tuesdays = @()
$date = Get-Date -Month 3 -Day 1 -Year 2024
while ($date.Month -eq 3) {
    if ($date.DayOfWeek -eq "Tuesday") {
        $tuesdays += $date.ToString("yyyy-MM-dd")
    }
    $date = $date.AddDays(1)
}

./New-SSIMatch.ps1 -Dates $tuesdays -BaseName "Tuesday Night League" -MatchAdminEmail "league@range.com" -MatchType "USPSA"
```

## Output

The script provides detailed output including:

- Configuration summary
- Progress updates during creation
- Success/failure status for each match
- Match IDs for successful creations
- Error messages for failed attempts
- Final summary statistics

### Sample Output

```
SSI Match Creation Tool
========================
Creating 3 match(es) with the following details:
  Base Name: Winter Match
  Match Type: USPSA
  Admin Email: admin@example.com
  API Endpoint: https://api.shootnscoreit.com/graphql
  Dates: 2024-02-15, 2024-02-16, 2024-02-17

Testing API connection...
API connection successful!

Processing batch: matches 1 through 3
  ✓ Created: Winter Match - Feb 15, 2024
  ✓ Created: Winter Match - Feb 16, 2024
  ✓ Created: Winter Match - Feb 17, 2024

Match Creation Summary
======================
Successfully created: 3
Failed: 0

Successfully Created Matches:
  • Winter Match - Feb 15, 2024 (ID: abc123)
  • Winter Match - Feb 16, 2024 (ID: def456)
  • Winter Match - Feb 17, 2024 (ID: ghi789)

🎉 All matches created successfully!
```

## Troubleshooting

### Common Issues

1. **API Connection Failed**
   - Check internet connectivity
   - Verify API endpoint URL
   - Confirm API key if required

2. **Invalid Date Format**
   - Use yyyy-MM-dd format
   - Or provide DateTime objects

3. **Authentication Errors**
   - Verify API key is valid
   - Check if API key has required permissions

4. **Rate Limiting**
   - Reduce BatchSize parameter
   - Add delays between batches if needed

### Getting Help

For issues with the SSI API itself:
- Consult SSI documentation
- Contact SSI support
- Check API status page

For script issues:
- Verify PowerShell version (7.0+)
- Check execution policy
- Ensure script file is not corrupted

## Customization

### Modifying GraphQL Mutation

If the SSI API schema differs, update the `$graphqlMutationTemplate` variable in the script:

```powershell
$graphqlMutationTemplate = @"
mutation CreateMatch($input: MatchInput!) {
  createMatch(input: $input) {
    id
    name
    date
    matchType
    adminEmail
    status
    createdAt
    # Add any additional fields you need
  }
}
"@
```

### Adding Additional Match Fields

To include additional fields in match creation, modify the `New-MatchInput` function:

```powershell
$input.additionalFields['customField'] = 'customValue'
```

## License

This tool is provided as-is for use with the SSI platform. Please ensure compliance with SSI's terms of service and API usage policies.

## Contributing

Feel free to submit improvements, bug reports, or feature requests to enhance this tool.
