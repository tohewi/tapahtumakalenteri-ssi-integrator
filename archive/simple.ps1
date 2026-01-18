# Example 1: Basic weekend matches
Write-Host "Example 1: Basic Weekend Matches" -ForegroundColor Cyan
$weekendDates = @("2026-01-24", "2026-01-31")
./New-SSIMatch.ps1 -Dates $weekendDates -BaseName "Test-Kupittaa" -MatchAdminEmail "tohewi@gmail.com" -MatchType "USPSA" # -DryRun