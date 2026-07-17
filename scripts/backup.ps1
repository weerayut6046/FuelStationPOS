param(
  [string]$OutputDirectory = "outputs/backups"
)

$ErrorActionPreference = "Stop"
$containerId = (docker compose ps -q database).Trim()
if (-not $containerId) { throw "Database container is not running. Start it with: docker compose up -d database" }

$databaseName = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "fuelstation" }
$databaseUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "fuelops" }
$resolvedOutput = Join-Path (Get-Location) $OutputDirectory
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = "fuelstation-$timestamp.dump"
$containerFile = "/tmp/$fileName"
$hostFile = Join-Path $resolvedOutput $fileName

docker exec $containerId pg_dump -U $databaseUser -d $databaseName --format=custom --file=$containerFile
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
docker cp "${containerId}:${containerFile}" $hostFile
if ($LASTEXITCODE -ne 0) { throw "docker cp failed" }

$backup = Get-Item -LiteralPath $hostFile
if ($backup.Length -le 0) { throw "Backup file is empty: $hostFile" }
Write-Output $backup.FullName
