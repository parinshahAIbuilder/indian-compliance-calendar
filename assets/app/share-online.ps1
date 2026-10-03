# Gives the dashboard a secure public https link (for clients outside the office) using Cloudflare Tunnel.
#
#  Quick link (testing / demo):   .\share-online.ps1
#     → prints a https://<random>.trycloudflare.com link. It changes every time this script restarts.
#
#  Permanent link (production):   .\share-online.ps1 -Token <tunnel-token>
#     → create a free Cloudflare account, add your domain (e.g. yourcompany.com), then Zero Trust → Networks →
#       Tunnels → Create tunnel → public hostname compliance.yourcompany.com → service http://localhost:4300,
#       and paste the token it shows. The link then stays the same and survives reboots.
param([string]$Token)
$dir = $PSScriptRoot
$exe = "$dir\cloudflared.exe"
if (-not (Test-Path $exe)) {
  Write-Host 'Downloading cloudflared (official Cloudflare release, ~60 MB)...'
  Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $exe
}
if ($Token) {
  & $exe service install $Token
  Write-Host 'Permanent tunnel installed as a Windows service. Set APP_URL in .env to your https address and restart the app.'
} else {
  Write-Host 'Starting a temporary public link — keep this window open. Look for the https://...trycloudflare.com address below.'
  & $exe tunnel --url http://localhost:4300
}
