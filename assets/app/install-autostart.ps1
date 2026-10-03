# Runs the Compliance Calendar automatically whenever this PC starts (no login window needed).
# Right-click → "Run with PowerShell" as Administrator. Run uninstall with:  .\install-autostart.ps1 -Remove
param([switch]$Remove)
$name = 'ComplianceCalendar'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false; Write-Host 'Auto-start removed.'; exit }

$node = (Get-Command node -ErrorAction Stop).Source
$dir = $PSScriptRoot
if (-not (Test-Path "$dir\node_modules")) { Push-Location $dir; npm install --no-audit --no-fund; Pop-Location }

$action   = New-ScheduledTaskAction -Execute $node -Argument "`"$dir\server.js`"" -WorkingDirectory $dir
$trigger  = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
            -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $name

# Allow other PCs on the office network to open the dashboard
New-NetFirewallRule -DisplayName 'Compliance Calendar (4300)' -Direction Inbound -Protocol TCP -LocalPort 4300 -Action Allow -Profile Domain,Private -ErrorAction SilentlyContinue | Out-Null

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127|169)\.' } | Select-Object -First 1).IPAddress
Write-Host "`nInstalled. The app starts with Windows and restarts itself if it stops."
Write-Host "This PC:            http://localhost:4300"
Write-Host "Office network:     http://$($ip):4300"
Write-Host "Keep the PC switched on and set Sleep to 'Never' (Settings → System → Power)."
