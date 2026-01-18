# SSI Match Creation Examples
# This file contains various examples of how to use the New-SSIMatch.ps1 script

# Example 1: Basic weekend matches
Write-Host "Example 1: Basic Weekend Matches" -ForegroundColor Cyan
$weekendDates = @("2026-01-24", "2026-01-31")
./New-SSIMatch.ps1 -Dates $weekendDates -BaseName "Test-Kupittaa" -MatchAdminEmail "tohewi@gmail.com" -MatchType "USPSA" # -DryRun

# Example 2: Daily matches for a week
Write-Host "`nExample 2: Daily Matches for a Week" -ForegroundColor Cyan
$dailyDates = for ($i = 0; $i -lt 7; $i++) {
    (Get-Date).AddDays($i).ToString("yyyy-MM-dd")
}
./New-SSIMatch.ps1 -Dates $dailyDates -BaseName "Daily Steel" -MatchAdminEmail "director@club.com" -MatchType "USPSA" -DryRun

# Example 3: Monthly championship series
Write-Host "`nExample 3: Monthly Championship Series" -ForegroundColor Cyan
$monthlyDates = for ($month = 1; $month -le 12; $month++) {
    # First Saturday of each month
    $date = Get-Date -Month $month -Day 1 -Year 2024
    while ($date.DayOfWeek -ne "Saturday") { 
        $date = $date.AddDays(1) 
    }
    $date.ToString("yyyy-MM-dd")
}
./New-SSIMatch.ps1 -Dates $monthlyDates -BaseName "Monthly Championship" -MatchAdminEmail "president@club.com" -MatchType "USPSA" -DryRun

# Example 4: Specific day of week for a month
Write-Host "`nExample 4: Every Tuesday in March 2024" -ForegroundColor Cyan
$tuesdayDates = @()
$date = Get-Date -Month 3 -Day 1 -Year 2024
while ($date.Month -eq 3) {
    if ($date.DayOfWeek -eq "Tuesday") {
        $tuesdayDates += $date.ToString("yyyy-MM-dd")
    }
    $date = $date.AddDays(1)
}
./New-SSIMatch.ps1 -Dates $tuesdayDates -BaseName "Tuesday Night League" -MatchAdminEmail "league@club.com" -MatchType "USPSA" -DryRun

# Example 5: Bi-weekly matches
Write-Host "`nExample 5: Bi-weekly Matches" -ForegroundColor Cyan
$biweeklyDates = for ($i = 0; $i -lt 6; $i++) {
    (Get-Date).AddDays($i * 14).ToString("yyyy-MM-dd")
}
./New-SSIMatch.ps1 -Dates $biweeklyDates -BaseName "Bi-weekly Competition" -MatchAdminEmail "match@club.com" -MatchType "IPSC" -DryRun

# Example 6: Holiday weekend matches
Write-Host "`nExample 6: Holiday Weekend Matches" -ForegroundColor Cyan
$holidayDates = @(
    "2024-07-04", # Independence Day
    "2024-07-06", # Weekend following
    "2024-11-28", # Thanksgiving
    "2024-11-29", # Day after
    "2024-11-30"  # Weekend
)
./New-SSIMatch.ps1 -Dates $holidayDates -BaseName "Holiday Special" -MatchAdminEmail "events@club.com" -MatchType "USPSA" -DryRun

# Example 7: Training series with different match types
Write-Host "`nExample 7: Training Series with Different Types" -ForegroundColor Cyan
$trainingDates = @("2024-02-19", "2024-02-21", "2024-02-23")
./New-SSIMatch.ps1 -Dates $trainingDates -BaseName "Beginner Training" -MatchAdminEmail "training@club.com" -MatchType "USPSA" -DryRun

# Example 8: Large batch with custom batch size
Write-Host "`nExample 8: Large Batch with Custom Batch Size" -ForegroundColor Cyan
$largeBatch = for ($i = 0; $i -lt 20; $i++) {
    (Get-Date).AddDays($i * 2).ToString("yyyy-MM-dd")
}
./New-SSIMatch.ps1 -Dates $largeBatch -BaseName "Season Matches" -MatchAdminEmail "season@club.com" -MatchType "USPSA" -BatchSize 8 -DryRun

# Example 9: Using DateTime objects directly
Write-Host "`nExample 9: Using DateTime Objects Directly" -ForegroundColor Cyan
$dateTimeObjects = @(
    (Get-Date).AddDays(7),
    (Get-Date).AddDays(14),
    (Get-Date).AddDays(21)
)
./New-SSIMatch.ps1 -Dates $dateTimeObjects -BaseName "Future Matches" -MatchAdminEmail "future@club.com" -MatchType "IDPA" -DryRun

# Example 10: Complex date pattern - First and third weekends
Write-Host "`nExample 10: First and Third Weekends Pattern" -ForegroundColor Cyan
$complexDates = @()
for ($month = 1; $month -le 3; $month++) {
    # Find first weekend
    $date = Get-Date -Month $month -Day 1 -Year 2024
    while ($date.DayOfWeek -notin @("Saturday", "Sunday")) {
        $date = $date.AddDays(1)
    }
    $complexDates += $date.ToString("yyyy-MM-dd")
    if ($date.DayOfWeek -eq "Saturday") {
        $complexDates += $date.AddDays(1).ToString("yyyy-MM-dd")
    }
    
    # Find third weekend (skip 2 weeks)
    $date = $date.AddDays(14)
    $complexDates += $date.ToString("yyyy-MM-dd")
    if ($date.DayOfWeek -eq "Saturday") {
        $complexDates += $date.AddDays(1).ToString("yyyy-MM-dd")
    }
}
./New-SSIMatch.ps1 -Dates $complexDates -BaseName "Bi-Monthly Tournament" -MatchAdminEmail "tournament@club.com" -MatchType "USPSA" -DryRun

Write-Host "`nAll examples completed in dry-run mode!" -ForegroundColor Green
Write-Host "Remove the -DryRun parameter to actually create matches." -ForegroundColor Yellow
