param([Parameter(Mandatory=$true)][ValidateCount(1,4)][string[]]$Models)
$ErrorActionPreference='Stop'
$realSource=Split-Path -Parent $PSScriptRoot
$realRuntime=Join-Path $realSource '.revival'
New-Item -ItemType Directory -Force -Path $realRuntime | Out-Null
$realResult=Join-Path $realRuntime 'reviewer-real-result.json'
$realArguments=@(('"'+(Join-Path $realSource 'test\revival\reviewer-real-proof.cjs')+'"'),'--enable-logging')
foreach($realModel in $Models){if($realModel -notmatch '^[A-Za-z0-9_./:-]+$'){throw 'Use an explicit installed Ollama model name and tag'};$realArguments+=('--reviewer-model='+$realModel)}
if(Test-Path -LiteralPath $realResult){Remove-Item -LiteralPath $realResult}
$realProcess=Start-Process -FilePath (Join-Path $realSource 'deploy\electron\node_modules\electron\dist\electron.exe') -ArgumentList $realArguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $realRuntime 'reviewer-real-stdout.log') -RedirectStandardError (Join-Path $realRuntime 'reviewer-real-stderr.log')
$realHandle=$realProcess.Handle
try{
 if(!$realProcess.WaitForExit(60000+1800000*$Models.Count)){Stop-Process -Id $realProcess.Id;throw 'Owned real reviewer qualification exceeded its bounded deadline'}
 $realProcess.Refresh()
 if(!(Test-Path -LiteralPath $realResult)){throw 'Native runner exited without a qualification receipt'}
 $realReceipt=Get-Content -LiteralPath $realResult -Raw | ConvertFrom-Json
 if($realProcess.ExitCode-ne 0 -or !$realReceipt.completed){throw 'Native reviewer runner failed; inspect reviewer-real-result.json'}
 $realReceipt.models | ForEach-Object {[pscustomobject]@{model=$_.name;passed=$_.receipt.passed;correct=$_.receipt.correct;durationMs=$_.durationMs;error=$_.error}} | ConvertTo-Json
 if(@($realReceipt.models | Where-Object {!$_.receipt.passed}).Count){throw 'One or more reviewers failed the optional diagnostic fixtures; inspect the receipt before relying on their judgments'}
}finally{if(!$realProcess.HasExited){Stop-Process -Id $realProcess.Id}}
