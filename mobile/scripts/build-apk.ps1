# Builds an Android APK locally (Windows, no Docker, no EAS account needed).
#
#   Test build (developer sign-in on, talks to your PC over Wi-Fi, server address editable in the app):
#     powershell -File scripts\build-apk.ps1 -Profile test
#     powershell -File scripts\build-apk.ps1 -Profile test -ApiUrl http://192.168.1.53:5000
#
#   Production build (HTTPS API only, developer sign-in off, does not depend on this PC):
#     powershell -File scripts\build-apk.ps1 -Profile production -ApiUrl https://solar-api.example.net -Keystore C:\keys\solar-release.jks -KeyAlias solar
#
# Without -Keystore the APK is signed with the debug key: fine for sideloading, not for the Play Store. Keep the same
# release key for every future version, otherwise phones must uninstall the app (and lose unsynced drafts) to update.
# Needs: Node, JDK 17, Android SDK (ANDROID_HOME), Windows long paths enabled (see README).
param(
  [Parameter(Mandatory = $true)][ValidateSet("test", "production")][string]$Profile,
  [string]$ApiUrl,
  [string]$Keystore,
  [string]$KeyAlias = "solar"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot          # mobile/
Set-Location $root

if (-not $env:ANDROID_HOME) {
  $defaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
  if (Test-Path $defaultSdk) { $env:ANDROID_HOME = $defaultSdk }
}
if (-not $env:JAVA_HOME) {
  $jbr = "C:\Program Files\Android\Android Studio\jbr"
  if (Test-Path $jbr) { $env:JAVA_HOME = $jbr }
}

function Read-EnvValue([string]$file, [string]$name) {
  $p = Join-Path $root $file
  if (-not (Test-Path $p)) { return $null }
  $line = Get-Content $p | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -Last 1
  if ($line) { return ($line -split "=", 2)[1].Trim() } else { return $null }
}

if (-not $ApiUrl) {
  if ($Profile -eq "production") { throw "Production builds need -ApiUrl https://<your deployed API>" }
  $ApiUrl = Read-EnvValue ".env.development.local" "EXPO_PUBLIC_API_URL"
  if (-not $ApiUrl) { $ApiUrl = Read-EnvValue ".env.development" "EXPO_PUBLIC_API_URL" }
}
$ApiUrl = $ApiUrl.TrimEnd("/")

if ($Profile -eq "production") {
  if ($ApiUrl -notmatch "^https://") { throw "Production builds must use an https:// API address (got $ApiUrl)" }
  if ($ApiUrl -match "localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.|example\.com|your-api") { throw "Production API address looks like a development or placeholder address: $ApiUrl" }
  $env:APP_VARIANT = "production"
  $env:EXPO_PUBLIC_DEV_LOGIN = "false"
} else {
  Remove-Item Env:APP_VARIANT -ErrorAction SilentlyContinue
  $env:EXPO_PUBLIC_DEV_LOGIN = "true"
}
# Explicit values win over every .env file, so a release bundle can never pick up another profile's settings.
$env:EXPO_PUBLIC_API_URL = $ApiUrl
$env:NODE_ENV = "production"
Write-Host "Profile: $Profile   API: $ApiUrl   Dev sign-in: $($env:EXPO_PUBLIC_DEV_LOGIN)"

# The bundler caches compiled code without the EXPO_PUBLIC_* values, so a build could keep another profile's API address
# or developer sign-in. Always start from an empty cache.
Remove-Item -Recurse -Force (Join-Path $env:TEMP "metro-cache"), (Join-Path $root "node_modules\.cache"), (Join-Path $root "android\app\build\generated\assets") -ErrorAction SilentlyContinue
Get-ChildItem $env:TEMP -Directory -Filter "metro-*" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

npx expo prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) { throw "expo prebuild failed" }

if ($env:ANDROID_HOME) {
  $escapedSdk = $env:ANDROID_HOME.Replace("\", "\\")
  Set-Content -Path (Join-Path $root "android\local.properties") -Value "sdk.dir=$escapedSdk"
}

Push-Location android
try {
  .\gradlew.bat assembleRelease --no-daemon
  if ($LASTEXITCODE -ne 0) { throw "Gradle build failed" }
} finally { Pop-Location }
$apk = Join-Path $root "android\app\build\outputs\apk\release\app-release.apk"

# ---- verify what was baked into the JavaScript bundle
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($apk)
try {
  $entry = $zip.GetEntry("assets/index.android.bundle")
  $ms = New-Object IO.MemoryStream; $s = $entry.Open(); $s.CopyTo($ms); $s.Dispose()
  $text = [Text.Encoding]::ASCII.GetString($ms.ToArray())
} finally { $zip.Dispose() }
if (-not $text.Contains($ApiUrl)) { throw "Verification failed: the bundle does not contain $ApiUrl" }
if ($Profile -eq "production") {
  foreach ($bad in @("192.168.", "10.0.2.2", "localhost:5000", "127.0.0.1")) {
    if ($text.Contains($bad)) { throw "Verification failed: the production bundle contains a development address ($bad)" }
  }
  if ($text.Contains("Quick sign-in")) { throw "Verification failed: the production bundle contains the developer quick sign-in" }
}
Write-Host "Verified: bundle uses $ApiUrl"

# ---- sign with the release key (optional)
$out = Join-Path (Split-Path -Parent (Split-Path -Parent $root)) "solar-maintenance-$Profile.apk"
if ($Keystore) {
  $sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
  $bt = Get-ChildItem (Join-Path $sdk "build-tools") -Directory | Sort-Object { [version]($_.Name -replace "[^\d.]", "") } | Select-Object -Last 1
  $apksigner = Join-Path $bt.FullName "apksigner.bat"
  $pw = Read-Host "Password for keystore $Keystore" -AsSecureString
  $env:SOLAR_KS_PASS = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw))
  try {
    & $apksigner sign --v4-signing-enabled false --ks $Keystore --ks-key-alias $KeyAlias --ks-pass env:SOLAR_KS_PASS --out $out $apk
    if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }
    & $apksigner verify $out
    if ($LASTEXITCODE -ne 0) { throw "apksigner verify failed" }
  } finally { Remove-Item Env:SOLAR_KS_PASS -ErrorAction SilentlyContinue }
  Write-Host "Signed with release key: $out"
} else {
  Copy-Item $apk $out -Force
  Write-Host "Signed with the DEBUG key (sideloading/testing only): $out"
}
