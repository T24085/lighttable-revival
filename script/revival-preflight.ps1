param([string]$ToolchainRoot,[string]$ReceiptPath,[switch]$PassThru)
$ErrorActionPreference='Stop'
$source=Split-Path -Parent $PSScriptRoot
if(!$ToolchainRoot){$ToolchainRoot=Join-Path $source '.revival\toolchain'}
if(!$ReceiptPath){$ReceiptPath=Join-Path $source '.revival\preflight-result.json'}
$ToolchainRoot=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ToolchainRoot)
$ReceiptPath=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ReceiptPath)
$checks=[Collections.Generic.List[object]]::new()
$receipt=[ordered]@{
 schema=1;checkedAtUtc=[DateTime]::UtcNow.ToString('o');status='failed'
 platform=[ordered]@{supported=$false;name='Windows';version=[Environment]::OSVersion.Version.ToString()}
 node=$null;npm=$null;powershell=$null;java=$null
 toolchain=[ordered]@{root=$ToolchainRoot;leiningenVersion='2.11.2';artifacts=@()}
 source=$source;checks=@()
}

# Java can echo JAVA_TOOL_OPTIONS. Only recognized versions enter the receipt;
# full tool output, environment variables and the user's PATH are omitted.
function Invoke-VersionProbe([string]$Executable,[string[]]$Arguments){
 $start=[Diagnostics.ProcessStartInfo]::new()
 $start.FileName=$Executable;$start.UseShellExecute=$false
 $start.CreateNoWindow=$true;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
 $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 if($start.PSObject.Properties['ArgumentList']){
  foreach($argument in $Arguments){$start.ArgumentList.Add($argument)}
 }else{
  # Support invocation from Windows PowerShell too, using Windows argv quoting
  # without a shell or command-string interpolation.
  $quoted=foreach($argument in $Arguments){
   $builder=[Text.StringBuilder]::new();[void]$builder.Append('"');$slashes=0
   foreach($character in $argument.ToCharArray()){
    if($character -eq '\'){$slashes++;continue}
    if($character -eq '"'){[void]$builder.Append('\',2*$slashes+1)}else{[void]$builder.Append('\',$slashes)}
    [void]$builder.Append($character);$slashes=0
   }
   [void]$builder.Append('\',2*$slashes);[void]$builder.Append('"');$builder.ToString()
  }
  $start.Arguments=$quoted -join ' '
 }
 $process=[Diagnostics.Process]::new();$process.StartInfo=$start
 try{
  try{[void]$process.Start()}catch{throw 'The selected version executable could not be started.'}
  $probeClock=[Diagnostics.Stopwatch]::StartNew()
  $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
  if(!$process.WaitForExit(5000)){
   try{$process.Kill();[void]$process.WaitForExit(1000)}catch{}
   throw 'The selected executable did not finish its version check within five seconds.'
  }
  if($process.ExitCode -ne 0){throw 'The selected executable failed its version check.'}
  $remaining=[Math]::Max(1,5000-[int]$probeClock.ElapsedMilliseconds)
  if(![Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($stdout,$stderr),$remaining)){throw 'Version output did not finish within five seconds.'}
  $output=$stdout.GetAwaiter().GetResult()+"`n"+$stderr.GetAwaiter().GetResult()
  if($output.Length -gt 65536){throw 'Version output exceeds the 64 KiB preflight limit.'}
  return $output
 }finally{$process.Dispose()}
}
function Resolve-Executable([string]$Command){
 $commandName=$Command.Trim().Trim('"')
 if(!$commandName){throw 'No executable was selected.'}
 $resolved=Get-Command -Name $commandName -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
 if(!$resolved){throw 'The selected executable is unavailable.'}
 return (Get-Item -LiteralPath $resolved.Source -ErrorAction Stop).FullName
}
function Add-Check([string]$Name,[bool]$Passed,[string]$Detail){
 $checks.Add([pscustomobject]@{name=$Name;passed=$Passed;detail=$Detail})
}
$supported=[Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
$receipt.platform.supported=$supported
Add-Check 'windows' $supported 'Windows is required for the native execution Job Object quota.'
if($supported){
 try{
  $nodeChoice=if($env:LT_NODE_EXECUTABLE){$env:LT_NODE_EXECUTABLE}else{'node.exe'}
  $nodePath=Resolve-Executable $nodeChoice
  $nodeOutput=Invoke-VersionProbe $nodePath @('--version')
  $nodeMatch=[regex]::Match($nodeOutput,'(?m)^v(\d+)\.(\d+)\.(\d+)\r?$')
  if(!$nodeMatch.Success){throw 'Node did not report a recognized stable version.'}
  $receipt.node=[ordered]@{path=$nodePath;version=$nodeMatch.Value.Trim();minimumMajor=24}
  if([int]$nodeMatch.Groups[1].Value -lt 24){throw 'Node 24 or newer is required.'}
  Add-Check 'node' $true 'Selected Node executable supports the existing Node 24+ runtime requirement.'
 }catch{Add-Check 'node' $false $_.Exception.Message}
 if($receipt.node){
  try{
   $npmRoot=Join-Path (Split-Path -Parent $receipt.node.path) 'node_modules\npm'
   $npmCli=Join-Path $npmRoot 'bin\npm-cli.js';$npmManifest=Join-Path $npmRoot 'package.json'
   if(!(Test-Path -LiteralPath $npmCli -PathType Leaf) -or !(Test-Path -LiteralPath $npmManifest -PathType Leaf)){throw 'The selected Node installation needs its adjacent npm CLI and package manifest.'}
   if((Get-Item -LiteralPath $npmManifest).Length -gt 65536){throw 'The npm package manifest exceeds the 64 KiB preflight limit.'}
   try{$npmPackage=Get-Content -LiteralPath $npmManifest -Raw | ConvertFrom-Json}catch{throw 'The adjacent npm package manifest is not valid JSON.'}
   if($npmPackage.name -ne 'npm' -or $npmPackage.version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$'){throw 'The adjacent package is not a recognized npm installation.'}
   $npmOutput=Invoke-VersionProbe $receipt.node.path @($npmCli,'--version')
   $npmVersion=$npmOutput.Trim()
   if($npmVersion -ne $npmPackage.version){throw 'The selected npm CLI version differs from its package manifest.'}
   $receipt.npm=[ordered]@{cli=$npmCli;package=$npmManifest;version=$npmVersion;node=$receipt.node.path}
   Add-Check 'npm' $true 'Adjacent npm CLI runs with the selected Node executable.'
  }catch{Add-Check 'npm' $false $_.Exception.Message}
 }else{Add-Check 'npm' $false 'npm could not be checked without the selected Node executable.'}
 try{
  $quotaProgramFiles=$env:ProgramFiles
  if(!$quotaProgramFiles){throw 'ProgramFiles is unavailable; the quota helper PowerShell path cannot be checked.'}
  $pwshPath=Join-Path $quotaProgramFiles 'PowerShell\7\pwsh.exe'
  if(!(Test-Path -LiteralPath $pwshPath -PathType Leaf)){throw 'PowerShell 7 is required at ProgramFiles\PowerShell\7\pwsh.exe by the native quota helper.'}
  $pwshOutput=Invoke-VersionProbe $pwshPath @('-NoProfile','-NonInteractive','-Command','$PSVersionTable.PSVersion.ToString()')
  $pwshVersion=$pwshOutput.Trim()
  if($pwshVersion -notmatch '^(\d+)\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$' -or [int]$Matches[1] -lt 7){throw 'The quota helper executable must report PowerShell 7 or newer.'}
  $receipt.powershell=[ordered]@{path=$pwshPath;version=$pwshVersion;minimumMajor=7;invokingVersion=$PSVersionTable.PSVersion.ToString()}
  Add-Check 'powershell' $true 'The exact native quota-helper PowerShell path is available.'
 }catch{Add-Check 'powershell' $false $_.Exception.Message}
 try{
  $javaSelection=if($env:LEIN_JAVA_CMD){'LEIN_JAVA_CMD'}elseif($env:JAVA_CMD){'JAVA_CMD'}else{'PATH'}
  $javaChoice=if($env:LEIN_JAVA_CMD){$env:LEIN_JAVA_CMD}elseif($env:JAVA_CMD){$env:JAVA_CMD}else{'java.exe'}
  $javaPath=Resolve-Executable $javaChoice
  $javaOutput=Invoke-VersionProbe $javaPath @('-version')
  $javaMatch=[regex]::Match($javaOutput,'(?m)^(?:openjdk|java) version "([^"\r\n]{1,80})"')
  if(!$javaMatch.Success -or $javaMatch.Groups[1].Value -notmatch '^\d[0-9A-Za-z._+\-]*$'){throw 'The selected JVM did not report a recognized Java version.'}
  $receipt.java=[ordered]@{path=$javaPath;version=$javaMatch.Groups[1].Value;selection=$javaSelection}
  Add-Check 'java' $true 'Selected Leiningen JVM is available; the ClojureScript build establishes compatibility.'
 }catch{Add-Check 'java' $false $_.Exception.Message}
}
try{
 $inputs=@('project.clj','deploy\core\package.json','deploy\core\package-lock.json','deploy\electron\package.json','deploy\electron\package-lock.json')
 foreach($inputPath in $inputs){if(!(Test-Path -LiteralPath (Join-Path $source $inputPath) -PathType Leaf)){throw 'A required checked-in build manifest or lockfile is missing.'}}
 Add-Check 'build-inputs' $true 'ClojureScript project and both locked npm dependency trees are present.'
 $artifacts=@(
  @{name='leiningen-2.11.2-standalone.jar';url='https://github.com/technomancy/leiningen/releases/download/2.11.2/leiningen-2.11.2-standalone.jar';sha256='7D31AE23AE769E927438B0CD55D15A93E7DABAB09FD4FC15877979161E108774'},
  @{name='lein.bat';url='https://raw.githubusercontent.com/technomancy/leiningen/2.11.2/bin/lein.bat';sha256='A32F532DD2DFC6BEF790561B2C71457E6BC5722DC02E1D64CAA4B490374312A4'}
 )
 $receipt.toolchain.artifacts=@(foreach($artifact in $artifacts){
  $artifactPath=Join-Path $ToolchainRoot $artifact.name;$exists=Test-Path -LiteralPath $artifactPath -PathType Leaf
  $actualHash=if($exists){(Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash}else{$null}
  [pscustomobject]@{path=$artifactPath;url=$artifact.url;sha256=$artifact.sha256;present=$exists;actualSha256=$actualHash}
 })
 foreach($artifact in $receipt.toolchain.artifacts){if($artifact.present -and $artifact.actualSha256 -ne $artifact.sha256){throw 'An existing pinned Leiningen artifact has a different SHA256 hash.'}}
 Add-Check 'leiningen' $true 'Existing local artifacts match pinned hashes; absent artifacts will be downloaded by the build.'
}catch{Add-Check 'build-inputs-or-toolchain' $false $_.Exception.Message}
$receipt.checks=$checks.ToArray()
if(!($checks | Where-Object {!$_.passed})){$receipt.status='passed'}
$json=$receipt | ConvertTo-Json -Depth 8
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ReceiptPath) | Out-Null
[IO.File]::WriteAllText($ReceiptPath,$json+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
if($receipt.status -ne 'passed'){
 Write-Output $json
 throw 'Revival preflight failed. Inspect the preflight JSON receipt before building or running native tests.'
}
if($PassThru){[pscustomobject]$receipt}else{Write-Output $json}
