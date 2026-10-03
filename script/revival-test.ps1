$ErrorActionPreference='Stop'
$source=Split-Path -Parent $PSScriptRoot
$core=Join-Path $source 'deploy\core'
$runtime=Join-Path $source '.revival'
New-Item -ItemType Directory -Force -Path (Join-Path $runtime 'proof-files') | Out-Null
[IO.File]::WriteAllText((Join-Path $runtime 'proof-files\calculation.js'),'(12 + 30)')
& node (Join-Path $source 'test\revival\policy.cjs')
if($LASTEXITCODE-ne 0){throw 'Policy tests failed'}
$manifest=[IO.File]::ReadAllText((Join-Path $core 'package.json'))
[IO.File]::WriteAllText((Join-Path $core 'package.json'),$manifest.Replace('"main": "main.js"','"main": "../../test/revival/electron-proof.cjs"'))
$env:LT_PROOF_PHASE='evaluation'
try {
$p=Start-Process (Join-Path $source 'deploy\electron\node_modules\electron\dist\electron.exe') -ArgumentList ('"'+$core+'"'),'--enable-logging' -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'evaluation-stdout.log') -RedirectStandardError (Join-Path $runtime 'evaluation-stderr.log')
if(!$p.WaitForExit(25000)){Stop-Process -Id $p.Id;throw 'Own proof process timed out'}
if($p.ExitCode-ne 0){throw ('Editor proof failed: see '+(Join-Path $runtime 'evaluation-result.json'))}
} finally {[IO.File]::WriteAllText((Join-Path $core 'package.json'),$manifest)}
Get-Content (Join-Path $runtime 'evaluation-result.json')