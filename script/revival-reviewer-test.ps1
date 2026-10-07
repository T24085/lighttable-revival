$ErrorActionPreference='Stop'
$reviewerSource=Split-Path -Parent $PSScriptRoot
$reviewerEvidence=Join-Path $reviewerSource '.revival'
$reviewerElectron=Join-Path $reviewerSource 'deploy\electron\node_modules\electron\dist\electron.exe'
New-Item -ItemType Directory -Force -Path $reviewerEvidence | Out-Null
$reviewerUnit=& node (Join-Path $reviewerSource 'test\revival\reviewer.cjs')
if($LASTEXITCODE-ne 0){throw 'Reviewer controller checks failed'}
$reviewerUnit | Set-Content -LiteralPath (Join-Path $reviewerEvidence 'reviewer-unit-result.json') -Encoding utf8
$reviewerUIReceipt=Join-Path $reviewerEvidence 'reviewer-ui-result.json'
if(Test-Path -LiteralPath $reviewerUIReceipt){Remove-Item -LiteralPath $reviewerUIReceipt}
$reviewerUIProcess=Start-Process $reviewerElectron -ArgumentList ('"'+(Join-Path $reviewerSource 'test\revival\reviewer-ui-proof.cjs')+'"'),'--force-device-scale-factor=1' -WindowStyle Hidden -PassThru
$reviewerUIHandle=$reviewerUIProcess.Handle
try{
 if(!$reviewerUIProcess.WaitForExit(50000)){Stop-Process -Id $reviewerUIProcess.Id;throw 'Owned reviewer UI proof exceeded its deadline'}
 $reviewerUIProcess.Refresh()
 $reviewerUIResult=Get-Content -LiteralPath $reviewerUIReceipt -Raw | ConvertFrom-Json
 if($reviewerUIProcess.ExitCode-ne 0 -or !$reviewerUIResult.passed){throw 'Reviewer UI proof failed; inspect reviewer-ui-result.json'}
}finally{if(!$reviewerUIProcess.HasExited){Stop-Process -Id $reviewerUIProcess.Id}}
$reviewerReceipt=Join-Path $reviewerEvidence 'reviewer-native-result.json'
if(Test-Path -LiteralPath $reviewerReceipt){Remove-Item -LiteralPath $reviewerReceipt}
$reviewerProcess=Start-Process $reviewerElectron -ArgumentList ('"'+(Join-Path $reviewerSource 'test\revival\reviewer-proof.cjs')+'"'),'--enable-logging','--force-device-scale-factor=1' -WindowStyle Hidden -PassThru -RedirectStandardOutput ($reviewerReceipt+'-stdout.log') -RedirectStandardError ($reviewerReceipt+'-stderr.log')
$reviewerHandle=$reviewerProcess.Handle
try{
 if(!$reviewerProcess.WaitForExit(390000)){Stop-Process -Id $reviewerProcess.Id;throw 'Owned reviewer proof exceeded its deadline'}
 $reviewerProcess.Refresh()
 $reviewerResult=Get-Content -LiteralPath $reviewerReceipt -Raw | ConvertFrom-Json
 if($reviewerProcess.ExitCode-ne 0 -or !$reviewerResult.passed){throw 'Reviewer native proof failed; inspect reviewer-native-result.json and logs'}
 [pscustomobject]@{passed=$true;controllerChecks=($reviewerUnit -join "`n" | ConvertFrom-Json).checks.Count;uiChecks=$reviewerUIResult.checks.Count;nativeChecks=$reviewerResult.checks.Count;realModels='Not run; use Validate reviewer after explicit installation'} | ConvertTo-Json
}finally{if(!$reviewerProcess.HasExited){Stop-Process -Id $reviewerProcess.Id}}
