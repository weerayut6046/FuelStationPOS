param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile
)

$ErrorActionPreference = "Stop"
$resolvedBackup = (Resolve-Path -LiteralPath $BackupFile).Path
$containerId = (docker compose ps -q database).Trim()
if (-not $containerId) { throw "Database container is not running. Start it with: docker compose up -d database" }

$databaseUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "fuelops" }
$testDatabase = "fuelstation_restore_test"
$containerFile = "/tmp/fuelstation-restore-test.dump"

docker cp $resolvedBackup "${containerId}:${containerFile}"
if ($LASTEXITCODE -ne 0) { throw "Could not copy backup into database container" }

try {
  docker exec $containerId dropdb -U $databaseUser --if-exists $testDatabase
  if ($LASTEXITCODE -ne 0) { throw "Could not reset restore-test database" }
  docker exec $containerId createdb -U $databaseUser $testDatabase
  if ($LASTEXITCODE -ne 0) { throw "Could not create restore-test database" }
  docker exec $containerId pg_restore -U $databaseUser -d $testDatabase --clean --if-exists $containerFile
  if ($LASTEXITCODE -ne 0) { throw "pg_restore failed" }

  $verification = docker exec $containerId psql -U $databaseUser -d $testDatabase -Atc "select (select count(*) from stations) || '|' || (select count(*) from tax_documents) || '|' || (select count(*) from audit_logs);"
  if ($LASTEXITCODE -ne 0 -or -not ($verification -match '^\d+\|\d+\|\d+$')) { throw "Restored database verification failed" }
  Write-Output "Restore test passed (stations|documents|audit_logs=$verification)"
}
finally {
  docker exec $containerId dropdb -U $databaseUser --if-exists $testDatabase | Out-Null
}
