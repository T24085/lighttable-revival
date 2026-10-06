$ErrorActionPreference='Stop'
$reviewerSource=Split-Path -Parent $PSScriptRoot
$reviewerEvidence=Join-Path $reviewerSource '.revival'
$reviewerElectron=Join-Path $reviewerSource 'deploy\electron\node_modules\electron\dist\electron.exe'
New-Item -ItemType Directory -Force -Path $reviewerEvidence | Out-Null
$reviewerUnit=& node (Join-Path $reviewerSource 'test\revival\reviewer.cjs')
if($LASTEXITCODE-ne 0){throw 'Reviewer controller checks failed'}
$reviewerUnit | Set-Content -LiteralPath (Join-Path $reviewerEvidence 'reviewer-unit-result.json') -Encoding utf8
$reviewerReceipt=Join-Path $reviewerEvidence 'reviewer-native-result.json'
if(Test-Path -LiteralPath $reviewerReceipt){Remove-Item -LiteralPath $reviewerReceipt}
$reviewerProcess=Start-Process $reviewerElectron -ArgumentList ('"'+(Join-Path $reviewerSource 'test\revival\reviewer-proof.cjs')+'"'),'--enable-logging' -WindowStyle Hidden -PassThru -RedirectStandardOutput ($reviewerReceipt+'-stdout.log') -RedirectStandardError ($reviewerReceipt+'-stderr.log')
$reviewerHandle=$reviewerProcess.Handle
try{
 if(!$reviewerProcess.WaitForExit(390000)){Stop-Process -Id $reviewerProcess.Id;throw 'Owned reviewer proof exceeded its deadline'}
 $reviewerProcess.Refresh()
 $reviewerResult=Get-Content -LiteralPath $reviewerReceipt -Raw | ConvertFrom-Json
 if($reviewerProcess.ExitCode-ne 0 -or !$reviewerResult.passed){throw 'Reviewer native proof failed; inspect reviewer-native-result.json and logs'}
 [pscustomobject]@{passed=$true;controllerChecks=($reviewerUnit -join "`n" | ConvertFrom-Json).checks.Count;nativeChecks=$reviewerResult.checks.Count;realModels='Not run; use Assistant Settings > Validate reviewer after explicit installation'} | ConvertTo-Json
}finally{if(!$reviewerProcess.HasExited){Stop-Process -Id $reviewerProcess.Id}}
