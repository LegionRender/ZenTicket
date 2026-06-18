$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$env:NODE_ENV = "production"
node dist/server.cjs
