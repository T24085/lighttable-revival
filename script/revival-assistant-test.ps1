param([string]$OllamaWebModel, [string]$OllamaPythonModel, [string]$OllamaViteModel)
$ErrorActionPreference='Stop'
$assistantSource=Split-Path -Parent $PSScriptRoot
$assistantEvidence=Join-Path $assistantSource '.revival'
$assistantElectron=Join-Path $assistantSource 'deploy\electron\node_modules\electron\dist\electron.exe'
New-Item -ItemType Directory -Force -Path $assistantEvidence | Out-Null
$assistantNode=if($env:LT_NODE_EXECUTABLE){$env:LT_NODE_EXECUTABLE}elseif(Test-Path -LiteralPath (Join-Path $assistantEvidence 'toolchain/node/node.exe')){Join-Path $assistantEvidence 'toolchain/node/node.exe'}else{'node'}
$assistantUnit=& $assistantNode (Join-Path $assistantSource 'test\revival\assistant.cjs')
if($LASTEXITCODE-ne 0){throw 'Assistant controller checks failed'}
$assistantUnit | Set-Content -LiteralPath (Join-Path $assistantEvidence 'assistant-unit-result.json') -Encoding utf8
function Invoke-AssistantProof([string]$Entry,[string]$Receipt,[int]$Timeout){
    $receiptPath=Join-Path $assistantEvidence $Receipt
    if(Test-Path -LiteralPath $receiptPath){Remove-Item -LiteralPath $receiptPath}
    $proofProcess=Start-Process $assistantElectron -ArgumentList ('"'+(Join-Path $assistantSource ('test\revival\'+$Entry))+'"'),'--enable-logging','--force-device-scale-factor=1' -WindowStyle Hidden -PassThru -RedirectStandardOutput ($receiptPath+'-stdout.log') -RedirectStandardError ($receiptPath+'-stderr.log')
    $proofHandle=$proofProcess.Handle
    if(!$proofProcess.WaitForExit($Timeout)){Stop-Process -Id $proofProcess.Id;throw ('Owned assistant validation exceeded its deadline: '+$Entry)}
    $proofProcess.Refresh()
    $receiptValue=Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    if($proofProcess.ExitCode-ne 0 -or !$receiptValue.passed){throw ('Assistant validation failed; inspect '+$receiptPath)}
    [pscustomobject]@{entry=$Entry;passed=$true;checks=$receiptValue.checks.Count;receipt=$receiptPath}
}
# Native fixtures share the test profile and quota helper; keep them serialized.
Invoke-AssistantProof 'assistant-proof.cjs' 'assistant-native-result.json' 215000
$assistantEnv=@{}
foreach($key in @('LT_ASSISTANT_PROOF_MODEL','LT_ASSISTANT_PROOF_KIND','LT_ASSISTANT_PROOF_RESUME')){$assistantEnv[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
try{
    [Environment]::SetEnvironmentVariable('LT_ASSISTANT_PROOF_RESUME',$null,'Process')
    foreach($item in @(@{kind='web';model=$OllamaWebModel},@{kind='python';model=$OllamaPythonModel},@{kind='vite';model=$OllamaViteModel})){
        if(!$item.model){continue}
        $env:LT_ASSISTANT_PROOF_MODEL=$item.model
        $env:LT_ASSISTANT_PROOF_KIND=$item.kind
        Invoke-AssistantProof 'assistant-ollama-proof.cjs' ('assistant-ollama-'+$item.kind+'-result.json') 1830000
        if($item.kind-eq 'web'){
            Invoke-AssistantProof 'assistant-generated-behavior-proof.cjs' 'assistant-generated-behavior-result.json' 33000
        }
    }
}finally{foreach($key in $assistantEnv.Keys){[Environment]::SetEnvironmentVariable($key,$assistantEnv[$key],'Process')}}
