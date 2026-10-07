param([string]$CodingModel='ornith-1.5:9b',[string]$ReviewerModel='tev1:4b')
$ErrorActionPreference='Stop'
foreach($selectedModel in @($CodingModel,$ReviewerModel)){if($selectedModel -notmatch '^[A-Za-z0-9_./:-]+$'){throw 'Use an explicit installed local model tag'}}
$proofSource=Split-Path -Parent $PSScriptRoot
$proofDirectory=Join-Path $proofSource '.revival'
New-Item -ItemType Directory -Force -Path $proofDirectory|Out-Null
$proofReceiptPath=Join-Path $proofDirectory 'assistant-reviewer-ollama-result.json'
$proofVariables=@('LT_ASSISTANT_PROOF_MODEL','LT_REVIEWER_PROOF_MODEL','ELECTRON_RUN_AS_NODE')
$proofPrevious=@{}
foreach($proofVariable in $proofVariables){$proofPrevious[$proofVariable]=[Environment]::GetEnvironmentVariable($proofVariable,'Process')}
$proofProcess=$null
try{
 $env:LT_ASSISTANT_PROOF_MODEL=$CodingModel
 $env:LT_REVIEWER_PROOF_MODEL=$ReviewerModel
 Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
 if(Test-Path -LiteralPath $proofReceiptPath){Remove-Item -LiteralPath $proofReceiptPath}
 $proofArguments=@((Join-Path $proofSource 'test\revival\assistant-reviewer-ollama-proof.cjs'),'--enable-logging','--force-device-scale-factor=1')
 $proofProcess=Start-Process -FilePath (Join-Path $proofSource 'deploy\electron\node_modules\electron\dist\electron.exe') -ArgumentList $proofArguments -WorkingDirectory $proofSource -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $proofDirectory 'assistant-reviewer-ollama-stdout.log') -RedirectStandardError (Join-Path $proofDirectory 'assistant-reviewer-ollama-stderr.log')
 $null=$proofProcess.Handle
 if(!$proofProcess.WaitForExit(1850000)){throw 'Owned coding and reviewer proof exceeded its deadline'}
 $proofProcess.Refresh()
 if(!(Test-Path -LiteralPath $proofReceiptPath)){throw 'Real-model proof exited without a receipt'}
 $proofReceipt=Get-Content -LiteralPath $proofReceiptPath -Raw|ConvertFrom-Json
 if($proofProcess.ExitCode -ne 0 -or !$proofReceipt.passed){throw "Integration proof failed. Inspect $proofReceiptPath"}
 [pscustomobject]@{reviewerInvoked=$proofReceipt.passed;workflowPassed=$proofReceipt.workflowPassed;status=$proofReceipt.state.status;reason=$proofReceipt.state.reason;correctionRounds=$proofReceipt.correctionRounds;receipt=$proofReceiptPath}|ConvertTo-Json
 if(!$proofReceipt.workflowPassed){Write-Warning 'Real review ran, but the correction workflow did not finish with passing checks. The receipt records the pause and judgments.'}
}finally{
 if($proofProcess -and !$proofProcess.HasExited){Stop-Process -Id $proofProcess.Id}
 foreach($proofVariable in $proofVariables){[Environment]::SetEnvironmentVariable($proofVariable,$proofPrevious[$proofVariable],'Process')}
}
