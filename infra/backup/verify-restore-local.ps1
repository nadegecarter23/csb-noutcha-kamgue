[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDirectory,
  [string]$PostgresContainer = 'cplan-postgres',
  [string]$DatabaseUser = 'cplan',
  [string]$S3Endpoint = 'http://127.0.0.1:9010',
  [string]$S3Region = 'us-east-1',
  [string]$S3AccessKey = 'cplan',
  [string]$S3SecretKey = 'cplan_dev_password'
)

$ErrorActionPreference = 'Stop'
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddHHmmss')
$targetDatabase = "cplan_restore_verify_$stamp"
$targetBucket = "cplan-restore-verify-$stamp"
$databaseTemp = "/tmp/$targetDatabase.dump"
$counterSqlTemp = "/tmp/$targetDatabase-counters.sql"
$counterSql = Join-Path $PSScriptRoot 'control-counters.sql'
$objectStoreScript = Join-Path $PSScriptRoot 'object-store.mjs'
$manifestFile = Join-Path $BackupDirectory 'manifest.json'
$countersFile = Join-Path $BackupDirectory 'control-counters.json'
$databaseArchive = Join-Path $BackupDirectory 'postgres.dump'
$filesDirectory = Join-Path $BackupDirectory 'files'
$databaseCreated = $false
$bucketCreated = $false

function Assert-LastExitCode([string]$Action) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Action a échoué (code $LASTEXITCODE)."
  }
}

function Assert-Checksum([string]$Path, [string]$Expected) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Artefact absent : $Path"
  }
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $Expected) {
    throw "Checksum invalide pour $Path."
  }
}

if (-not (Test-Path -LiteralPath $manifestFile -PathType Leaf)) {
  throw "Manifest absent : $manifestFile"
}
$manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
if ($manifest.format_version -ne 1) {
  throw "Version de sauvegarde non prise en charge : $($manifest.format_version)"
}
if ($targetDatabase -notlike 'cplan_restore_verify_*' -or $targetBucket -notlike 'cplan-restore-verify-*') {
  throw 'Les cibles de vérification ne respectent pas les préfixes de sécurité.'
}

Assert-Checksum $databaseArchive $manifest.artifacts.postgres.sha256
Assert-Checksum (Join-Path $filesDirectory 'manifest.json') $manifest.artifacts.files.manifest_sha256
Assert-Checksum $countersFile $manifest.artifacts.counters.sha256

try {
  & docker exec $PostgresContainer createdb -U $DatabaseUser $targetDatabase
  Assert-LastExitCode 'création de la base isolée'
  $databaseCreated = $true
  & docker cp $databaseArchive "${PostgresContainer}:$databaseTemp"
  Assert-LastExitCode 'copie de la sauvegarde PostgreSQL'
  & docker exec $PostgresContainer pg_restore -U $DatabaseUser -d $targetDatabase --no-owner --no-privileges --exit-on-error $databaseTemp
  Assert-LastExitCode 'restauration PostgreSQL'
  & docker cp $counterSql "${PostgresContainer}:$counterSqlTemp"
  Assert-LastExitCode 'copie de la requête de contrôle'
  $restoredCounterOutput = & docker exec $PostgresContainer psql -X -U $DatabaseUser -d $targetDatabase -v ON_ERROR_STOP=1 -At -f $counterSqlTemp
  Assert-LastExitCode 'calcul des compteurs restaurés'
  $restoredCounters = (($restoredCounterOutput -join "`n").Trim() | ConvertFrom-Json) | ConvertTo-Json -Compress -Depth 20
  $sourceCounters = (Get-Content -LiteralPath $countersFile -Raw | ConvertFrom-Json) | ConvertTo-Json -Compress -Depth 20
  if ($restoredCounters -ne $sourceCounters) {
    throw 'Les compteurs PostgreSQL diffèrent après restauration.'
  }

  $previousAccessKey = $env:CSB_S3_ACCESS_KEY
  $previousSecretKey = $env:CSB_S3_SECRET_KEY
  $env:CSB_S3_ACCESS_KEY = $S3AccessKey
  $env:CSB_S3_SECRET_KEY = $S3SecretKey
  $restoredDuOutput = & node $objectStoreScript restore --endpoint $S3Endpoint --region $S3Region --bucket $targetBucket --directory $filesDirectory
  Assert-LastExitCode 'restauration du bucket isolé'
  $bucketCreated = $true
  $restoredDu = ($restoredDuOutput -join "`n") | ConvertFrom-Json
  if ([long]$restoredDu.object_count -ne [long]$manifest.artifacts.files.objects -or [long]$restoredDu.size_bytes -ne [long]$manifest.artifacts.files.size_bytes) {
    throw 'Le nombre ou la taille totale des objets diffère après restauration.'
  }

  [ordered]@{
    status = 'PASS'
    database = $targetDatabase
    bucket = $targetBucket
    database_counters_match = $true
    file_objects = [long]$restoredDu.object_count
    file_size_bytes = [long]$restoredDu.size_bytes
    verified_at_utc = [DateTime]::UtcNow.ToString('o')
  } | ConvertTo-Json -Depth 5
}
finally {
  if ($bucketCreated) {
    & node $objectStoreScript delete-bucket --endpoint $S3Endpoint --region $S3Region --bucket $targetBucket 2>$null
  }
  if ($databaseCreated) {
    & docker exec $PostgresContainer dropdb -U $DatabaseUser --if-exists $targetDatabase 2>$null
  }
  & docker exec $PostgresContainer rm -f $databaseTemp $counterSqlTemp 2>$null
  $env:CSB_S3_ACCESS_KEY = $previousAccessKey
  $env:CSB_S3_SECRET_KEY = $previousSecretKey
}
