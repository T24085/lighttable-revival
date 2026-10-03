param([string]$ToolchainRoot)
$ErrorActionPreference='Stop'
$source=Split-Path -Parent $PSScriptRoot
if(!$ToolchainRoot){$ToolchainRoot=Join-Path $source '.revival\toolchain'}
Get-Command java,node,npm.cmd -ErrorAction Stop | Out-Null
New-Item -ItemType Directory -Force -Path $ToolchainRoot | Out-Null
$jar=Join-Path $ToolchainRoot 'leiningen-2.11.2-standalone.jar'
$launcher=Join-Path $ToolchainRoot 'lein.bat'
$items=@(@{path=$jar;url='https://github.com/technomancy/leiningen/releases/download/2.11.2/leiningen-2.11.2-standalone.jar';hash='7D31AE23AE769E927438B0CD55D15A93E7DABAB09FD4FC15877979161E108774'},@{path=$launcher;url='https://raw.githubusercontent.com/technomancy/leiningen/2.11.2/bin/lein.bat';hash='A32F532DD2DFC6BEF790561B2C71457E6BC5722DC02E1D64CAA4B490374312A4'})
foreach($item in $items){if(!(Test-Path -LiteralPath $item.path)){Invoke-WebRequest $item.url -OutFile $item.path};if((Get-FileHash -LiteralPath $item.path -Algorithm SHA256).Hash-ne $item.hash){throw 'Official Leiningen artifact hash mismatch'}}
$env:LEIN_HOME=Join-Path $ToolchainRoot 'lein-home';$env:LEIN_JAR=$jar
New-Item -ItemType Directory -Force -Path $env:LEIN_HOME | Out-Null
$repo=(Join-Path $ToolchainRoot 'm2').Replace('\','/')
[IO.File]::WriteAllText((Join-Path $env:LEIN_HOME 'profiles.clj'),'{:user {:local-repo "'+$repo+'"}}')
$cache=Join-Path $ToolchainRoot 'npm-cache'
foreach($part in 'core','electron'){Push-Location (Join-Path $source ('deploy\'+$part));try{& npm.cmd ci --ignore-scripts --no-audit --no-fund --cache $cache --registry https://registry.npmjs.org;if($LASTEXITCODE-ne 0){throw 'Locked dependency install failed'}}finally{Pop-Location}}
# Inspected official Electron 44.5.1 installer uses @electron/get with SHA256 validation.
$env:electron_config_cache=Join-Path $ToolchainRoot 'electron-cache'
& node (Join-Path $source 'deploy\electron\node_modules\electron\install.js');if($LASTEXITCODE-ne 0){throw 'Official Electron download failed'}
Push-Location $source;try{& $launcher cljsbuild once app;if($LASTEXITCODE-ne 0){throw 'Original ClojureScript build failed'}}finally{Pop-Location}
Write-Output 'Built. Run script/revival-test.ps1 or launch deploy/electron/node_modules/electron/dist/electron.exe with deploy/core.'