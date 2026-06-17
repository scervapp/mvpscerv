$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$credentialsPath = Join-Path $projectRoot "credentials.json"
$keystoreRelativePath = "credentials/android/scerv-play-upload-key.jks"
$keystorePath = Join-Path $projectRoot $keystoreRelativePath
$keyAlias = "0f0886e144025f3fe7955d80b151cbfd"

if (-not (Test-Path $keystorePath)) {
	throw "Missing keystore at $keystorePath"
}

function ConvertTo-PlainText {
	param([Security.SecureString] $SecureValue)

	$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
	try {
		return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
	}
	finally {
		[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
	}
}

$keystorePassword = ConvertTo-PlainText (Read-Host "Keystore password" -AsSecureString)
$keyPasswordInput = ConvertTo-PlainText (Read-Host "Key password (press Enter if same as keystore password)" -AsSecureString)

if ([string]::IsNullOrWhiteSpace($keyPasswordInput)) {
	$keyPasswordInput = $keystorePassword
}

# EAS local credentials are intentionally written to credentials.json. That file
# is gitignored and should stay local because it contains signing passwords.
$credentials = @{
	android = @{
		keystore = @{
			keystorePath = $keystoreRelativePath
			keystorePassword = $keystorePassword
			keyAlias = $keyAlias
			keyPassword = $keyPasswordInput
		}
	}
}

$json = $credentials | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($credentialsPath, $json, [System.Text.UTF8Encoding]::new($false))

Write-Host "Wrote $credentialsPath"
Write-Host "Keystore path: $keystoreRelativePath"
Write-Host "Key alias: $keyAlias"
