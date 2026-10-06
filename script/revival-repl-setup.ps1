param([string]$PythonExecutable,[string]$ToolchainRoot)
$ErrorActionPreference='Stop'
$replSource=Split-Path -Parent $PSScriptRoot
$replToolchain=if($ToolchainRoot){$ToolchainRoot}elseif($env:LT_TOOLCHAIN_ROOT){$env:LT_TOOLCHAIN_ROOT}else{Join-Path $replSource '.revival\toolchain'}
$replEnvironment=Join-Path $replToolchain 'repl-python'
if(!$PythonExecutable){$PythonExecutable=(Get-Command python.exe -ErrorAction Stop).Source}
& $PythonExecutable -c 'import sys; assert sys.version_info >= (3,11), "Python 3.11 or newer is required"'
if($LASTEXITCODE-ne 0){throw 'Python 3.11 or newer is required'}
if(!(Test-Path -LiteralPath (Join-Path $replEnvironment 'Scripts\python.exe'))){
 & $PythonExecutable -m venv $replEnvironment
 if($LASTEXITCODE-ne 0){throw 'App-local REPL Python environment creation failed'}
}
$replPython=Join-Path $replEnvironment 'Scripts\python.exe'
& $replPython -m pip install --disable-pip-version-check --no-input --index-url https://pypi.org/simple -r (Join-Path $PSScriptRoot 'revival-ipython-requirements.txt')
if($LASTEXITCODE-ne 0){throw 'Pinned IPython client dependencies failed to install'}
& $replPython -m pip check
if($LASTEXITCODE-ne 0){throw 'IPython dependency consistency check failed'}
Write-Output ('IPython client ready: '+$replPython)
