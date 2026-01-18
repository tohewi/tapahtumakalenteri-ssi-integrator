<#
Creates an SRA event on shootnscoreit.com by replaying the HTML form POST.
Requires: PowerShell 7+ recommended (works on Windows PowerShell 5.1 too).
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$SessionId,   # from your browser cookie "sessionid=..."

  [Parameter(Mandatory = $true)]
  [string]$EventName,

  [string]$BaseUri = "https://shootnscoreit.com",

  # These IDs come from the form options (e.g., organizer=1215 in your HTML).
  # If you leave them as-is, it will create as "not arranged by a club" unless you set OrganizerId.
  [string]$GroupId = "xxx",
  [string]$OrganizerId = ""  # e.g. "1215"
)

$createUrl = "$BaseUri/sra/create-match/"

# Create a session and add cookies (sessionid is what authenticates you)
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$uriObj  = [Uri]$BaseUri

$session.Cookies.Add((New-Object System.Net.Cookie("sessionid", $SessionId, "/", $uriObj.Host)))
$session.Cookies.Add((New-Object System.Net.Cookie("django_language", "en", "/", $uriObj.Host)))

# 1) GET the form page to obtain CSRF token (Django commonly uses csrftoken cookie + hidden field)
$getHeaders = @{
  "Accept"  = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  "Referer" = $createUrl
}

$formPage = Invoke-WebRequest -Uri $createUrl -Method GET -WebSession $session -Headers $getHeaders

# Try to get CSRF token from cookie first
$csrfToken = $null
$cookiesForHost = $session.Cookies.GetCookies($uriObj)
foreach ($c in $cookiesForHost) {
  if ($c.Name -eq "csrftoken") { $csrfToken = $c.Value }
}

# If not in cookie, try hidden input: name="csrfmiddlewaretoken" value="..."
if (-not $csrfToken) {
  $m = [regex]::Match($formPage.Content, 'name="csrfmiddlewaretoken"\s+value="([^"]+)"')
  if ($m.Success) { $csrfToken = $m.Groups[1].Value }
}

<#
if (-not $csrfToken) {
  throw "Could not find CSRF token (csrftoken cookie or csrfmiddlewaretoken hidden field). Capture the GET in Fiddler and check Set-Cookie / page HTML."
}
#>

# 2) Build the POST form body (based on actual browser HAR capture).
$body = @{
  "csrfmiddlewaretoken" = $csrfToken

  # Basic required fields
  "group"       = $GroupId
  "name"        = $EventName
  "organizer"   = $OrganizerId
  "visibility"  = "csd"   # csd = closed (from HAR), res = restricted
  "status"      = "on"    # checkbox value
  "results"     = "org"
  "registration"= "op"
  "max_competitors" = "45"
  "description" = ""
  "level"       = "tr"
  "region"      = "FIN"

  # Dates/times
  "starts_date"    = (Get-Date).ToString("yyyy-MM-dd")
  "starts_time"    = "16:00"
  "reg_start_date" = (Get-Date).ToString("yyyy-MM-dd")
  "reg_start_time" = "15:00"

  # Checkboxes
  "has_accepted_event_data_ass_agreement" = "on"
  "is_live_scores_accessible" = "on"

  # Additional required fields from HAR
  "include_pcc_in_combined" = "False"
  "transfer_mode" = "no"
  "cat_result_limit" = "5"
  "merge_ss_with_s" = "True"
  "number_of_team_members" = "3"
  "result_from_team_members" = "3"
  "prematch" = "no"
  "max_prematch_competitors" = "0"
  "verify_using" = "sgn"
  "information" = ""
  "state" = ""
  "timezone" = "Europe/Helsinki"
  "venue" = ""
  "url" = ""
  "url_display" = ""
  "currency" = "EUR"
  "ends_date" = ""
  "ends_time" = ""
  "reg_close_date" = ""
  "reg_close_time" = ""
  "sq_start_date" = ""
  "sq_start_time" = ""
  "pm_sq_start_date" = ""
  "pm_sq_start_time" = ""
  "sq_close_date" = ""
  "sq_close_time" = ""
  "imported" = ""

  # Multi-select fields
  "firearms" = @("hg","rf","sg")
  "tournament_divisions" = @("sop","sst","sml")
  "categories" = @("L","S","7.62")
}

# Division lists (will be expanded below)
$arrayFields = @{
  "handgun_divs"    = @("hg1","hg2","hg37","hg33","hg3","hg5","hg12","hg18","hg19")
  "rifle_divs"      = @("rf1","rf2","rf19","rf20")
  "mini_rifle_divs" = @("mr1","mr2","mr3")
  "prec_rifle_divs" = @("rf1","rf2","rf12","rf3","rf4","rf11","rf16","rf17","rf18","rf19","rf20","rfc")
  "shotgun_divs"    = @("sg1","sg2","sg3","sg4")
  "air_divs"        = @("ai1","ai2","ai3","ai3a","ai8","ai9","ai10","ai11","ai12")
  "pcc_divs"        = @("pc2","pc3")
  "firearms"        = @("hg","rf","sg")
  "tournament_divisions" = @("sop","sst","sml")
  "categories"      = @("L","S","7.62")
}

# Remove array fields from $body (they'll be added to the encoded string manually)
$body.Remove("firearms")
$body.Remove("tournament_divisions")
$body.Remove("categories")

# Build URL-encoded form body manually to handle arrays correctly
$encodedPairs = @()
foreach ($key in $body.Keys) {
  $encodedPairs += "$([Uri]::EscapeDataString($key))=$([Uri]::EscapeDataString($body[$key]))"
}

# Add array fields as repeated key=value pairs
foreach ($fieldName in $arrayFields.Keys) {
  foreach ($value in $arrayFields[$fieldName]) {
    $encodedPairs += "$([Uri]::EscapeDataString($fieldName))=$([Uri]::EscapeDataString($value))"
  }
}

$encodedBody = $encodedPairs -join "&"

# Django CSRF also expects a header + Referer on many configs
$postHeaders = @{
  "Content-Type" = "application/x-www-form-urlencoded"
  "Referer"      = $createUrl
  "Origin"       = $BaseUri
  "X-CSRFToken"  = $csrfToken
}

# 3) POST the form. The site returns HTTP 302 to /event/<...>/ on success.
try {
  $response = Invoke-WebRequest -Uri $createUrl -Method POST -WebSession $session -Headers $postHeaders -Body $encodedBody -MaximumRedirection 5
  
  # Check where we landed (works in both PS5.1 and PS7)
  $finalUrl = if ($response.BaseResponse.ResponseUri) {
    $response.BaseResponse.ResponseUri.AbsoluteUri
  } elseif ($response.BaseResponse.RequestMessage.RequestUri) {
    $response.BaseResponse.RequestMessage.RequestUri.AbsoluteUri
  } else {
    "Unknown"
  }
  
  # Check if we got redirected to an event page (success) or stayed on create page (failure)
  if ($finalUrl -match "/event/\d+" -or $finalUrl -match "/sra/match/\d+") {
    Write-Host "SUCCESS: Created event at: $finalUrl" -ForegroundColor Green
  } elseif ($finalUrl -eq $createUrl -or $finalUrl -like "*create-match*") {
    Write-Host "FAILED: Still on create page. Form validation likely failed." -ForegroundColor Red
    
    # Try multiple patterns to extract error messages
    $errorPatterns = @(
      'class="[^"]*error[^"]*"[^>]*>([^<]+)<',
      '<ul class="errorlist"[^>]*><li>([^<]+)',
      'class="invalid-feedback"[^>]*>([^<]+)',
      '<p class="help-block">([^<]+)',
      'aria-invalid="true"[^>]*>([^<]*)',
      'This field is required',
      'Enter a valid'
    )
    
    $foundErrors = @()
    foreach ($pattern in $errorPatterns) {
      $matches = [regex]::Matches($response.Content, $pattern)
      foreach ($m in $matches) {
        if ($m.Groups.Count -gt 1) {
          $foundErrors += $m.Groups[1].Value.Trim()
        } else {
          $foundErrors += $m.Value.Trim()
        }
      }
    }
    
    if ($foundErrors.Count -gt 0) {
      Write-Host "Form errors:" -ForegroundColor Yellow
      $foundErrors | Select-Object -Unique | ForEach-Object { Write-Host "  - $_" }
    } else {
      Write-Host "No specific errors found. Dumping response to debug..." -ForegroundColor Yellow
      # Save response to file for inspection
      $response.Content | Out-File -FilePath "debug-response.html" -Encoding UTF8
      Write-Host "Response saved to debug-response.html" -ForegroundColor Cyan
    }
  } else {
    Write-Host "Redirected to: $finalUrl" -ForegroundColor Cyan
  }
  
  Write-Host "`nResponse status: $($response.StatusCode)" -ForegroundColor Gray
}
catch {
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  if ($_.Exception.Response) {
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    $errorBody = $reader.ReadToEnd()
    Write-Host "Response body: $errorBody" -ForegroundColor Yellow
  }
}
