param([string]$ToolchainRoot)
$ErrorActionPreference='Stop'
$source=Split-Path -Parent $PSScriptRoot
$preflight=& (Join-Path $PSScriptRoot 'revival-preflight.ps1') -ToolchainRoot $ToolchainRoot -PassThru
$ToolchainRoot=$preflight.toolchain.root
$nodeExecutable=$preflight.node.path;$npmCli=$preflight.npm.cli
Write-Output ('Preflight passed: Node '+$preflight.node.version+', npm '+$preflight.npm.version+', PowerShell '+$preflight.powershell.version+', Java '+$preflight.java.version+'. Receipt: .revival/preflight-result.json')
New-Item -ItemType Directory -Force -Path $ToolchainRoot | Out-Null
$jar=Join-Path $ToolchainRoot 'leiningen-2.11.2-standalone.jar'
$launcher=Join-Path $ToolchainRoot 'lein.bat'
foreach($artifact in $preflight.toolchain.artifacts){
 if(!(Test-Path -LiteralPath $artifact.path -PathType Leaf)){Invoke-WebRequest $artifact.url -OutFile $artifact.path}
 if((Get-FileHash -LiteralPath $artifact.path -Algorithm SHA256).Hash -ne $artifact.sha256){throw 'Official Leiningen artifact hash mismatch'}
}
$buildEnvironment=@{}
foreach($name in 'LEIN_HOME','LEIN_JAR','LEIN_JAVA_CMD','electron_config_cache'){$buildEnvironment[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:LEIN_HOME=Join-Path $ToolchainRoot 'lein-home';$env:LEIN_JAR=$jar
 # Freeze the explicit/default JVM checked above; restore the caller's choice afterward.
 $env:LEIN_JAVA_CMD=$preflight.java.path
 New-Item -ItemType Directory -Force -Path $env:LEIN_HOME | Out-Null
 $repo=(Join-Path $ToolchainRoot 'm2').Replace('\','/').Replace('"','\"')
 [IO.File]::WriteAllText((Join-Path $env:LEIN_HOME 'profiles.clj'),'{:user {:local-repo "'+$repo+'"}}')
 $cache=Join-Path $ToolchainRoot 'npm-cache'
 foreach($part in 'core','electron'){
  Push-Location (Join-Path $source ('deploy\'+$part))
  try{
   & $nodeExecutable $npmCli ci --ignore-scripts --no-audit --no-fund --cache $cache --registry https://registry.npmjs.org
   if($LASTEXITCODE -ne 0){throw ('Locked dependency install failed for '+$part)}
  }finally{Pop-Location}
 }
 # Inspected official Electron 44.5.1 installer uses @electron/get with SHA256 validation.
 $env:electron_config_cache=Join-Path $ToolchainRoot 'electron-cache'
 & $nodeExecutable (Join-Path $source 'deploy\electron\node_modules\electron\install.js')
 if($LASTEXITCODE -ne 0){throw 'Official Electron download failed'}
 Push-Location $source
 try{
  & $launcher cljsbuild once app repl
  if($LASTEXITCODE -ne 0){throw 'Original ClojureScript build failed'}
 }finally{Pop-Location}
}finally{
 foreach($name in $buildEnvironment.Keys){[Environment]::SetEnvironmentVariable($name,$buildEnvironment[$name],'Process')}
}
Write-Output 'Built. Run script/revival-test.ps1 or launch deploy/electron/node_modules/electron/dist/electron.exe with deploy/core.'
