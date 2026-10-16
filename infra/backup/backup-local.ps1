[CmdletBinding()]
param(
  [string]$OutputRoot = '',
  [string]$PostgresContainer = 'cplan-postgres',
  [string]$Database = 'cplan',
  [string]$DatabaseUser = 'cplan',
  [string]$S3Endpoint = 'http://127.0.0.1:9010',
  [string]$S3Region = 'us-east-1',
  [string]$Bucket = 'cplan-dev',
  [string]$S3AccessKey = 'cplan',
  [string]$S3SecretKey = 'cplan_dev_password'
)

$ErrorActionPreference = 'Stop'
if (-not $OutputRoot) {
  $OutputRoot = Join-Path $PSScriptRoot '..\..\backups'
}
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$backupDirectory = Join-Path $OutputRoot $stamp
$counterSql = Join-Path $PSScriptRoot 'control-counters.sql'
$databaseArchive = Join-Path $backupDirectory 'postgres.dump'
$filesDirectory = Join-Path $backupDirectory 'files'
$countersFile = Join-Path $backupDirectory 'control-counters.json'
$manifestFile = Join-Path $backupDirectory 'manifest.json'
$databaseTemp = "/tmp/csb-backup-$stamp.dump"
$objectStoreScript = Join-Path $PSScriptRoot 'object-store.mjs'

function Assert-LastExitCode([string]$Action) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Action a échoué (code $LASTEXITCODE)."
  }
}

New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null

try {
  & docker exec $PostgresContainer pg_dump -U $DatabaseUser -d $Database --format=custom --no-owner --no-privileges "--file=$databaseTemp"
  Assert-LastExitCode 'pg_dump'
  & docker cp "${PostgresContainer}:$databaseTemp" $databaseArchive
  Assert-LastExitCode 'copie de la sauvegarde PostgreSQL'

  $counterOutput = Get-Content -LiteralPath $counterSql -Raw | & docker exec -i $PostgresContainer psql -X -U $DatabaseUser -d $Database -v ON_ERROR_STOP=1 -At -f -
  Assert-LastExitCode 'calcul des compteurs'
  $counterJson = ($counterOutput -join "`n").Trim() | ConvertFrom-Json
  $counterJson | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $countersFile -Encoding utf8

  $previousAccessKey = $env:CSB_S3_ACCESS_KEY
  $previousSecretKey = $env:CSB_S3_SECRET_KEY
  $env:CSB_S3_ACCESS_KEY = $S3AccessKey
  $env:CSB_S3_SECRET_KEY = $S3SecretKey
  try {
    $sourceDuOutput = & node $objectStoreScript backup --endpoint $S3Endpoint --region $S3Region --bucket $Bucket --directory $filesDirectory
    Assert-LastExitCode 'sauvegarde du bucket S3'
    $sourceDu = ($sourceDuOutput -join "`n") | ConvertFrom-Json
  }
  finally {
    $env:CSB_S3_ACCESS_KEY = $previousAccessKey
    $env:CSB_S3_SECRET_KEY = $previousSecretKey
  }

  $manifest = [ordered]@{
    format_version = 1
    created_at_utc = [DateTime]::UtcNow.ToString('o')
    source = [ordered]@{
      database = $Database
      bucket = $Bucket
    }
    artifacts = [ordered]@{
      postgres = [ordered]@{
        file = 'postgres.dump'
        sha256 = (Get-FileHash -LiteralPath $databaseArchive -Algorithm SHA256).Hash.ToLowerInvariant()
      }
      files = [ordered]@{
        directory = 'files'
        manifest_sha256 = (Get-FileHash -LiteralPath (Join-Path $filesDirectory 'manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
        objects = [long]$sourceDu.object_count
        size_bytes = [long]$sourceDu.size_bytes
      }
      counters = [ordered]@{
        file = 'control-counters.json'
        sha256 = (Get-FileHash -LiteralPath $countersFile -Algorithm SHA256).Hash.ToLowerInvariant()
      }
    }
  }
  $manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $manifestFile -Encoding utf8
  Write-Output $backupDirectory
}
finally {
  & docker exec $PostgresContainer rm -f $databaseTemp 2>$null
}
