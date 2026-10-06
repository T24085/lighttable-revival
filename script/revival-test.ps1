param([switch]$NativeOnly)
$ErrorActionPreference='Stop'
# Legacy explicit-run fixtures remain isolated; live-editor enables auto-start.
$env:LT_REVIVAL_AUTO_LIVE='0'
$source=Split-Path -Parent $PSScriptRoot
$core=Join-Path $source 'deploy\core'
$runtime=Join-Path $source '.revival'
$testNode=if($env:LT_NODE_EXECUTABLE){$env:LT_NODE_EXECUTABLE}elseif(Test-Path -LiteralPath (Join-Path $runtime 'toolchain/node/node.exe')){Join-Path $runtime 'toolchain/node/node.exe'}else{'node'}
New-Item -ItemType Directory -Force -Path (Join-Path $runtime 'test-proof-files') | Out-Null
if(!$NativeOnly){
$runtimeSetupOutput=& $testNode (Join-Path $source 'test\revival\runtime-setup.cjs')
$runtimeSetupOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Checkpoint persistence, profile migration and portable runtime checks failed'}
$runtimeSetupChecks=($runtimeSetupOutput -join "`n" | ConvertFrom-Json).checks.Count
[IO.File]::WriteAllText((Join-Path $runtime 'test-proof-files\calculation.js'),'(12 + 30)')
$dependencyOutput=& $testNode (Join-Path $source 'test\revival\dependencies.cjs')
$dependencyOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Dependency API checks failed'}
$dependencyChecks=($dependencyOutput -join "`n" | ConvertFrom-Json).checks
$npmPreloadOutput=& $testNode (Join-Path $source 'test\revival\npm-preload.cjs')
$npmPreloadOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Lightweight npm launch gate, native flags and source-hook separation failed'}
$npmPreloadChecks=($npmPreloadOutput -join "`n" | ConvertFrom-Json).checks.Count
$policyOutput=& $testNode (Join-Path $source 'test\revival\policy.cjs')
$policyOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Policy tests failed'}
$policyChecks=($policyOutput -join "`n" | ConvertFrom-Json).passed
$projectOutput=& $testNode (Join-Path $source 'test\revival\projects.cjs')
$projectOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Project policy tests failed'}
$projectChecks=($projectOutput -join "`n" | ConvertFrom-Json).checks
$openTargetOutput=& $testNode (Join-Path $source 'test\revival\open-targets.cjs')
$openTargetOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Startup target parsing, file grants and queue ownership failed'}
$openTargetChecks=($openTargetOutput -join "`n" | ConvertFrom-Json).checks.Count
$moduleOutput=& $testNode (Join-Path $source 'test\revival\modules.cjs')
$moduleOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Module transformation tests failed'}
$moduleChecks=($moduleOutput -join "`n" | ConvertFrom-Json).checks
$packageOutput=& $testNode (Join-Path $source 'test\revival\packages.cjs')
$packageOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Package transformation tests failed'}
$packageChecks=($packageOutput -join "`n" | ConvertFrom-Json).checks
$watchOutput=& $testNode (Join-Path $source 'test\revival\watches.cjs')
$watchOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Watch compiler and source-position tests failed'}
$watchChecks=($watchOutput -join "`n" | ConvertFrom-Json).checks
$serverWatchOutput=& $testNode (Join-Path $source 'test\revival\server-watches.cjs')
$serverWatchOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Compiler source maps and HTTP watch identities failed'}
$serverWatchChecks=($serverWatchOutput -join "`n" | ConvertFrom-Json).checks.Count
$sourceMapOutput=& $testNode (Join-Path $source 'test\revival\source-maps.cjs')
$sourceMapOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Source map annotations, headers, decoding and limits failed'}
$sourceMapChecks=($sourceMapOutput -join "`n" | ConvertFrom-Json).checks.Count
$mapRecoveryOutput=& $testNode (Join-Path $source 'test\revival\map-recovery.cjs')
$mapRecoveryOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Original source recovery, compiler anchors and bounds failed'}
$mapRecoveryChecks=($mapRecoveryOutput -join "`n" | ConvertFrom-Json).checks.Count
$inlineHtmlOutput=& $testNode (Join-Path $source 'test\revival\inline-html.cjs')
$inlineHtmlOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Inline HTML parsing, source positions and strict-mode tests failed'}
$inlineHtmlChecks=($inlineHtmlOutput -join "`n" | ConvertFrom-Json).checks.Count
$inlineModuleErrorsOutput=& $testNode --experimental-vm-modules (Join-Path $source 'test\revival\inline-module-errors.cjs')
$inlineModuleErrorsOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Inline module parser, compiler and runtime source diagnostics failed'}
$inlineModuleErrorChecks=($inlineModuleErrorsOutput -join "`n" | ConvertFrom-Json).checks.Count
$identityEditorOutput=& $testNode (Join-Path $source 'test\revival\identity-editor-routes.cjs')
$identityEditorOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Saved editor identity, pending runs and destroyed editor routes failed'}
$identityEditorChecks=($identityEditorOutput -join "`n" | ConvertFrom-Json).checks.Count
$htmlRegionsOutput=& $testNode (Join-Path $source 'test\revival\html-regions.cjs')
$htmlRegionsOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Event handler and SVG parsing, semantics and source position tests failed'}
$htmlRegionsChecks=($htmlRegionsOutput -join "`n" | ConvertFrom-Json).checks.Count
$browserDependencyOutput=& $testNode (Join-Path $source 'test\revival\browser-dependencies.cjs')
$browserDependencyOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Classic browser dependency scopes failed'}
$browserDependencyChecks=($browserDependencyOutput -join "`n" | ConvertFrom-Json).checks.Count
$classicRuntimeOutput=& $testNode (Join-Path $source 'test\revival\classic-runtime.cjs')
$classicRuntimeOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Classic dependency dispatch semantics failed'}
$classicRuntimeChecks=($classicRuntimeOutput -join "`n" | ConvertFrom-Json).checks.Count
$classicPackageOutput=& $testNode (Join-Path $source 'test\revival\classic-packages.cjs')
$classicPackageOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Classic package compilation, source identity and bounds failed'}
$classicPackageChecks=($classicPackageOutput -join "`n" | ConvertFrom-Json).checks.Count
$classicLimitsOutput=& $testNode (Join-Path $source 'test\revival\classic-limits.cjs')
$classicLimitsOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Classic planning deadlines, transitive global writes and native Unicode locations failed'}
$classicLimitsChecks=($classicLimitsOutput -join "`n" | ConvertFrom-Json).checks.Count
$capturedCSSOutput=& $testNode (Join-Path $source 'test\revival\captured-css.cjs')
$capturedCSSOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Captured CSS, assets, original source locations and bounds failed'}
$capturedCSSChecks=($capturedCSSOutput -join "`n" | ConvertFrom-Json).checks.Count
$typedSyntaxOutput=& $testNode (Join-Path $source 'test\revival\typed-syntax.cjs')
$typedSyntaxOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'JSX and TypeScript original grammar/watch checks failed'}
$typedSyntaxChecks=($typedSyntaxOutput -join "`n" | ConvertFrom-Json).checks.Count
$typedPreviewOutput=& $testNode --experimental-vm-modules (Join-Path $source 'test\revival\typed-preview.cjs')
$typedPreviewOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Typed captured preview, compiler configuration and HTTP maps failed'}
$typedPreviewChecks=($typedPreviewOutput -join "`n" | ConvertFrom-Json).checks.Count
$typedExecutionOutput=& $testNode (Join-Path $source 'test\revival\typed-execution.cjs')
$typedExecutionOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Typed isolated and Node transformation checks failed'}
$typedExecutionChecks=($typedExecutionOutput -join "`n" | ConvertFrom-Json).checks.Count
$typedRouteOutput=& $testNode (Join-Path $source 'test\revival\typed-editor-routes.cjs')
$typedRouteOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Typed editor grammar routes and concurrent selection versions failed'}
$typedRouteChecks=($typedRouteOutput -join "`n" | ConvertFrom-Json).checks.Count
$grammarPreviewOutput=& $testNode --experimental-vm-modules (Join-Path $source 'test\revival\grammar-preview.cjs')
$grammarPreviewOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Whole-file grammar, imported sources, native classics and mapped watches failed'}
$grammarPreviewChecks=($grammarPreviewOutput -join "`n" | ConvertFrom-Json).checks.Count
$grammarRouteOutput=& $testNode (Join-Path $source 'test\revival\grammar-editor-routes.cjs')
$grammarRouteOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Editor whole-file grammar transport and stale identities failed'}
$grammarRouteChecks=($grammarRouteOutput -join "`n" | ConvertFrom-Json).checks.Count
$directoryModuleOutput=& $testNode (Join-Path $source 'test\revival\directory-modules.cjs')
$directoryModuleOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Local directory package entries, resolution identity and limits failed'}
$directoryModuleChecks=($directoryModuleOutput -join "`n" | ConvertFrom-Json).checks.Count
$directoryPreviewOutput=& $testNode --experimental-vm-modules (Join-Path $source 'test\revival\directory-preview.cjs')
$directoryPreviewOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Captured directory package entries, original sources and metadata identity failed'}
$directoryPreviewChecks=($directoryPreviewOutput -join "`n" | ConvertFrom-Json).checks.Count
$bufferModuleOutput=& $testNode (Join-Path $source 'test\revival\buffer-modules.cjs')
$bufferModuleOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Browser buffer-overlay isolated source choice, watches and disk identity failed'}
$bufferModuleChecks=($bufferModuleOutput -join "`n" | ConvertFrom-Json).checks.Count
$bufferBrowserOutput=& $testNode --experimental-vm-modules (Join-Path $source 'test\revival\buffer-browser.cjs')
$bufferBrowserOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Captured browser buffer-overlay choice, source identity and bounds failed'}
$bufferBrowserChecks=($bufferBrowserOutput -join "`n" | ConvertFrom-Json).checks.Count
$configParserOutput=& $testNode (Join-Path $source 'test\revival\config-parser.cjs')
$configParserOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Compiler configuration JSONC coordinates and bounded diagnostics failed'}
$configParserChecks=($configParserOutput -join "`n" | ConvertFrom-Json).checks.Count
$configErrorsOutput=& $testNode --experimental-vm-modules (Join-Path $source 'test\revival\config-errors.cjs')
$configErrorsOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Compiler configuration source links through isolated and captured compilation failed'}
$configErrorsChecks=($configErrorsOutput -join "`n" | ConvertFrom-Json).checks.Count
$configRouteOutput=& $testNode (Join-Path $source 'test\revival\config-editor-routes.cjs')
$configRouteOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Compiler configuration error transport and editor source ownership failed'}
$configRouteChecks=($configRouteOutput -join "`n" | ConvertFrom-Json).checks.Count
$configNodeOutput=& $testNode (Join-Path $source 'test\revival\config-node.cjs')
$configNodeOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Native Node worker/fork compiler configuration diagnostics failed'}
$configNodeChecks=($configNodeOutput -join "`n" | ConvertFrom-Json).checks
$lifecycleOutput=& $testNode (Join-Path $source 'test\revival\node-lifecycle.cjs')
$lifecycleOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Native Node lifecycle and plain-CLI comparison tests failed'}
$lifecycleChecks=($lifecycleOutput -join "`n" | ConvertFrom-Json).checks
$familyOutput=& $testNode (Join-Path $source 'test\revival\node-family.cjs')
$familyOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Native Node worker, child-process, source and quota tests failed'}
$familyChecks=($familyOutput -join "`n" | ConvertFrom-Json).checks
$watchFamilyOutput=& $testNode (Join-Path $source 'test\revival\watch-family.cjs')
$watchFamilyOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Cross-file Node watches and context capture tests failed'}
$watchFamilyChecks=($watchFamilyOutput -join "`n" | ConvertFrom-Json).checks.Count
$compatibilityOutput=& $testNode (Join-Path $source 'test\revival\node-compatibility.cjs')
$compatibilityOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Native Node worker flags, child-process API and plain-CLI comparison tests failed'}
$compatibilityChecks=($compatibilityOutput -join "`n" | ConvertFrom-Json).checks
$nodeOutput=& $testNode (Join-Path $source 'test\revival\node.cjs')
$nodeOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Native Node backend tests failed'}
$nodeChecks=($nodeOutput -join "`n" | ConvertFrom-Json).checks
$previewFilesOutput=& $testNode (Join-Path $source 'test\revival\preview-files.cjs')
$previewFilesOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'Browser preview source policy tests failed'}
$previewFileChecks=($previewFilesOutput -join "`n" | ConvertFrom-Json).checks.Count
$jsonStreamOutput=& $testNode (Join-Path $source 'test\revival\json-stream.cjs')
$jsonStreamOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'npm streaming JSON compatibility tests failed'}
$jsonStreamChecks=($jsonStreamOutput -join "`n" | ConvertFrom-Json).checks
$npmOutput=& $testNode (Join-Path $source 'test\revival\npm.cjs')
$npmOutput | Write-Output
if($LASTEXITCODE-ne 0){throw 'npm install and development-server backend tests failed'}
$npmBackendChecks=($npmOutput -join "`n" | ConvertFrom-Json).checks.Count
$bencodeOutput=& $testNode (Join-Path $source 'test\revival\bencode.cjs')
if($LASTEXITCODE-ne 0){throw 'External nREPL framing and protocol bounds failed'}
$bencodeResult=($bencodeOutput -join "`n" | ConvertFrom-Json)
$bencodeResult | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $runtime 'bencode-result.json') -Encoding utf8
$hotOutput=& $testNode (Join-Path $source 'test\revival\hot-code.cjs')
if($LASTEXITCODE-ne 0){throw 'Live function transform checks failed'}
$hotResult=($hotOutput -join "`n" | ConvertFrom-Json)
$hotResult | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $runtime 'hot-code-result.json') -Encoding utf8
$assistantOutput=& $testNode (Join-Path $source 'test\revival\assistant.cjs')
if($LASTEXITCODE-ne 0){throw 'Assistant streaming, tool schema, revisions, journal and lifecycle tests failed'}
$assistantResult=($assistantOutput -join "`n" | ConvertFrom-Json)
$assistantResult | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $runtime 'assistant-unit-result.json') -Encoding utf8
$reviewerOutput=& $testNode (Join-Path $source 'test\revival\reviewer.cjs')
if($LASTEXITCODE-ne 0){throw 'Reviewer transport and lifecycle checks failed'}
$reviewerResult=($reviewerOutput -join "`n" | ConvertFrom-Json)
$reviewerProfileOutput=& $testNode (Join-Path $source 'test\revival\reviewer-profile.cjs')
if($LASTEXITCODE-ne 0){throw 'Migrated reviewer profile checks failed'}
$reviewerProfileResult=($reviewerProfileOutput -join "`n" | ConvertFrom-Json)
$reviewerProfileResult | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $runtime 'reviewer-profile-unit-result.json') -Encoding utf8
$reviewerFocusOutput=& $testNode (Join-Path $source 'test\revival\reviewer-evidence-focus.cjs')
if($LASTEXITCODE-ne 0){throw 'Reviewer sampling restoration checks failed'}
$reviewerFocusResult=($reviewerFocusOutput -join "`n" | ConvertFrom-Json)
$reviewerFocusResult | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $runtime 'reviewer-evidence-focus-result.json') -Encoding utf8
$htmlViewerOutput=& $testNode (Join-Path $source 'test\revival\html-viewer.cjs')
if($LASTEXITCODE-ne 0){throw 'HTML viewer discovery and asset checks failed'}
$htmlViewerResult=($htmlViewerOutput -join "`n" | ConvertFrom-Json)
$htmlViewerResult | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $runtime 'html-viewer-unit-result.json') -Encoding utf8
$reviewerResult | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $runtime 'reviewer-unit-result.json') -Encoding utf8
}
# Reset only this harness's generated workspace history, keeping normal app data.
$testWorkspace=Join-Path $runtime 'test-user\ltcache\workspace'
if(Test-Path -LiteralPath $testWorkspace){Get-ChildItem -LiteralPath $testWorkspace -File -Filter '*.clj' | ForEach-Object {Remove-Item -LiteralPath $_.FullName}}
$testProjects=Join-Path $runtime 'test-projects.json'
if(Test-Path -LiteralPath $testProjects){Remove-Item -LiteralPath $testProjects}
$manifestPath=Join-Path $core 'package.json'
if((Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json).main-ne 'main.js'){throw 'Restore the normal main.js application entry before running tests'}
$manifestBefore=(Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash
$nativeRuns=[Collections.Generic.List[object]]::new()
function Invoke-RevivalProof([string]$EntryName,[string]$LogName,[int]$TimeoutMs,[string]$ResultName) {
    Write-Host ('Running native workflow: '+$LogName)
    $proofPath=Join-Path $source ('test\revival\'+$EntryName)
    $resultPath=Join-Path $runtime $ResultName
    # Direct script entry keeps the normal app's startup manifest intact.
    # Remove only the generated result being replaced, so a premature successful
    # process exit cannot pass by returning an earlier run's JSON.
    if(Test-Path -LiteralPath $resultPath){Remove-Item -LiteralPath $resultPath}
    # Capture fixtures assert CSS-pixel sizes, independent of Windows DPI.
    $proofArguments=@(('"'+$proofPath+'"'),'--enable-logging','--force-device-scale-factor=1')
    if($EntryName-eq 'open-targets-proof.cjs'){
        # Setup is shared with the focused wrapper; JSON stdout is ASCII so
        # Windows PowerShell 5.1 preserves the real Unicode duplicate file:2.
        $openFixtureOutput=& $testNode (Join-Path $source 'test\revival\open-target-fixtures.cjs')
        if($LASTEXITCODE-ne 0){throw 'Owned startup fixture setup failed'}
        $openFixtureData=($openFixtureOutput -join "`n" | ConvertFrom-Json)
        $openFixtureData | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $runtime 'open-targets-harness-fixture.json') -Encoding utf8
        $proofArguments=@(('"'+$proofPath+'"'))
        foreach($openArgument in $openFixtureData.arguments){$proofArguments+=('"{0}"' -f $openArgument)}
        # Retain this small unique temp fixture for launch/source attribution.
    }
    $proofProcess=Start-Process (Join-Path $source 'deploy\electron\node_modules\electron\dist\electron.exe') -ArgumentList $proofArguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime ($LogName+'-stdout.log')) -RedirectStandardError (Join-Path $runtime ($LogName+'-stderr.log'))
    $proofHandle=$proofProcess.Handle
    if(!$proofProcess.WaitForExit($TimeoutMs)){Stop-Process -Id $proofProcess.Id;throw ('Own '+$LogName+' proof timed out')}
    $proofProcess.Refresh()
    if($proofProcess.ExitCode-ne 0){throw ($LogName+' proof failed: see '+$resultPath)}
    $proofResult=[IO.File]::ReadAllText($resultPath,[Text.Encoding]::UTF8) | ConvertFrom-Json
    if(!$proofResult.passed){throw ($LogName+' proof reported failure: see '+$resultPath)}
    Write-Host ('Passed native workflow: '+$LogName)
    $nativeRuns.Add([pscustomobject]@{entry=$EntryName;passed=$proofResult.passed;checks=$proofResult.checks.Count;receipt=$resultPath})
    return $proofResult
}
$previousPhase=$env:LT_PROOF_PHASE
try {
    $env:LT_PROOF_PHASE='evaluation'
    $result=Invoke-RevivalProof 'electron-proof.cjs' 'evaluation' 93000 'evaluation-result.json'
} finally {$env:LT_PROOF_PHASE=$previousPhase}
$reopen=Invoke-RevivalProof 'project-reopen-proof.cjs' 'project-reopen' 28000 'project-reopen-result.json'
$openTargetsEditor=Invoke-RevivalProof 'open-targets-proof.cjs' 'open-targets-editor' 73000 'open-targets-editor-result.json'
$saveEditor=Invoke-RevivalProof 'save-editor-proof.cjs' 'save-editor' 103000 'save-editor-result.json'
$fileTypesEditor=Invoke-RevivalProof 'file-types-proof.cjs' 'file-types-editor' 43000 'file-types-editor-result.json'
$liveEditor=Invoke-RevivalProof 'live-editor-proof.cjs' 'live-editor' 107000 'live-editor-result.json'
$legacyEditing=Invoke-RevivalProof 'legacy-editing-proof.cjs' 'legacy-editing' 107000 'legacy-editing-result.json'
$hotView=Invoke-RevivalProof 'hot-view-proof.cjs' 'hot-view' 55000 'hot-view-result.json'
$memoryCap=Invoke-RevivalProof 'memory-cap-proof.cjs' 'memory-cap' 120000 'memory-cap-result.json'
$languages=Invoke-RevivalProof 'languages-proof.cjs' 'languages' 70000 'languages-result.json'
$stateReplEditor=Invoke-RevivalProof 'state-repl-editor-proof.cjs' 'state-repl-editor' 103000 'state-repl-editor-result.json'
$externalRepl=Invoke-RevivalProof 'external-repl-proof.cjs' 'external-repl' 135000 'external-repl-result.json'
$externalReplEditor=Invoke-RevivalProof 'external-repl-editor-proof.cjs' 'external-repl-editor' 175000 'external-repl-editor-result.json'
$modules=Invoke-RevivalProof 'module-proof.cjs' 'module' 48000 'module-result.json'
$packages=Invoke-RevivalProof 'package-proof.cjs' 'package' 48000 'package-result.json'
$nodeResult=Invoke-RevivalProof 'node-proof.cjs' 'node' 53000 'node-result.json'
$watchResult=Invoke-RevivalProof 'watch-proof.cjs' 'watch' 68000 'watch-result.json'
$previewResult=Invoke-RevivalProof 'preview-proof.cjs' 'preview' 103000 'preview-result.json'
$browserWatches=Invoke-RevivalProof 'browser-watch-proof.cjs' 'browser-watch' 68000 'browser-watch-result.json'
$serverWatches=Invoke-RevivalProof 'server-watch-proof.cjs' 'server-watch' 68000 'server-watch-result.json'
$serverReload=Invoke-RevivalProof 'server-reload-proof.cjs' 'server-reload' 68000 'server-reload-result.json'
$inlineHtml=Invoke-RevivalProof 'inline-html-proof.cjs' 'inline-html' 78000 'inline-html-result.json'
$inlineHtmlNested=Invoke-RevivalProof 'inline-html-nested-proof.cjs' 'inline-html-nested' 23000 'inline-html-nested-result.json'
$inlineModuleErrors=Invoke-RevivalProof 'inline-module-errors-proof.cjs' 'inline-module-errors-editor' 103000 'inline-module-errors-editor-result.json'
$eventSVG=Invoke-RevivalProof 'event-svg-proof.cjs' 'event-svg' 93000 'event-svg-result.json'
$bodyMaps=Invoke-RevivalProof 'body-map-proof.cjs' 'body-map' 68000 'body-map-result.json'
$contentMaps=Invoke-RevivalProof 'content-map-proof.cjs' 'content-map' 93000 'content-map-result.json'
$previewEditor=Invoke-RevivalProof 'preview-editor-proof.cjs' 'preview-editor' 68000 'preview-editor-result.json'
$capturedPackages=Invoke-RevivalProof 'captured-package-proof.cjs' 'captured-package' 68000 'captured-package-result.json'
$capturedPackageEditor=Invoke-RevivalProof 'captured-package-editor-proof.cjs' 'captured-package-editor' 68000 'captured-package-editor-result.json'
$classicPackageEditor=Invoke-RevivalProof 'classic-package-proof.cjs' 'classic-package' 93000 'classic-package-result.json'
$capturedCSSEditor=Invoke-RevivalProof 'captured-css-proof.cjs' 'captured-css' 93000 'captured-css-editor-result.json'
$typedEditor=Invoke-RevivalProof 'typed-editor-proof.cjs' 'typed-editor' 113000 'typed-editor-result.json'
$typedNode=Invoke-RevivalProof 'typed-node-proof.cjs' 'typed-node' 153000 'typed-node-result.json'
$grammarEditor=Invoke-RevivalProof 'grammar-editor-proof.cjs' 'grammar-editor' 153000 'grammar-editor-result.json'
$directoryEditor=Invoke-RevivalProof 'directory-editor-proof.cjs' 'directory-editor' 153000 'directory-editor-result.json'
$configEditor=Invoke-RevivalProof 'config-editor-proof.cjs' 'config-editor' 153000 'config-editor-result.json'
$bufferBrowserEditor=Invoke-RevivalProof 'buffer-browser-proof.cjs' 'buffer-browser-editor' 153000 'buffer-browser-editor-result.json'
$npmEditor=Invoke-RevivalProof 'npm-editor-proof.cjs' 'npm-editor' 63000 'npm-editor-result.json'
$serverEditor=Invoke-RevivalProof 'server-editor-proof.cjs' 'server-editor' 93000 'server-editor-result.json'
$viteTailwind=Invoke-RevivalProof 'vite-tailwind-proof.cjs' 'vite-tailwind' 305000 'vite-tailwind-result.json'
$autoVite=Invoke-RevivalProof 'auto-vite-proof.cjs' 'auto-vite' 305000 'auto-vite-result.json'
$htmlViewerNative=Invoke-RevivalProof 'html-viewer-proof.cjs' 'html-viewer' 270000 'html-viewer-native-result.json'
$assistantNative=Invoke-RevivalProof 'assistant-proof.cjs' 'assistant-native' 215000 'assistant-native-result.json'
$reviewerNative=Invoke-RevivalProof 'reviewer-proof.cjs' 'reviewer-native' 390000 'reviewer-native-result.json'
$reviewerProfileNative=Invoke-RevivalProof 'reviewer-profile-proof.cjs' 'reviewer-profile-native' 390000 'reviewer-profile-native-result.json'
$reviewerUI=Invoke-RevivalProof 'reviewer-ui-proof.cjs' 'reviewer-ui' 50000 'reviewer-ui-result.json'
$manifestAfter=(Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash
if($manifestAfter-ne $manifestBefore){throw 'Tests changed the normal startup manifest'}
$launchEvidence=[pscustomobject]@{passed=$true;main='main.js';manifestUnchanged=$true;beforeSha256=$manifestBefore;afterSha256=$manifestAfter;proofEntries=@('electron-proof.cjs','project-reopen-proof.cjs','open-targets-proof.cjs','save-editor-proof.cjs','file-types-proof.cjs','live-editor-proof.cjs','legacy-editing-proof.cjs','hot-view-proof.cjs','memory-cap-proof.cjs','languages-proof.cjs','state-repl-editor-proof.cjs','external-repl-proof.cjs','external-repl-editor-proof.cjs','module-proof.cjs','package-proof.cjs','node-proof.cjs','watch-proof.cjs','preview-proof.cjs','browser-watch-proof.cjs','server-watch-proof.cjs','server-reload-proof.cjs','inline-html-proof.cjs','inline-html-nested-proof.cjs','inline-module-errors-proof.cjs','event-svg-proof.cjs','body-map-proof.cjs','content-map-proof.cjs','preview-editor-proof.cjs','captured-package-proof.cjs','captured-package-editor-proof.cjs','classic-package-proof.cjs','captured-css-proof.cjs','typed-editor-proof.cjs','typed-node-proof.cjs','grammar-editor-proof.cjs','directory-editor-proof.cjs','config-editor-proof.cjs','buffer-browser-proof.cjs','npm-editor-proof.cjs','server-editor-proof.cjs','assistant-proof.cjs','reviewer-proof.cjs')}
$launchEvidence.proofEntries+=@('reviewer-ui-proof.cjs','reviewer-profile-proof.cjs','vite-tailwind-proof.cjs','auto-vite-proof.cjs','html-viewer-proof.cjs')
$launchEvidence | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $runtime 'test-launch-result.json') -Encoding utf8
$nativeSummary=[pscustomobject]@{passed=$true;workflows=$nativeRuns.Count;startupManifestUnchanged=$launchEvidence.manifestUnchanged;results=$nativeRuns}
$nativeSummary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $runtime 'native-test-result.json') -Encoding utf8
if($NativeOnly){$nativeSummary | Select-Object passed,workflows,startupManifestUnchanged | Format-List;return}
[pscustomobject]@{
    Passed=($memoryCap.passed -and $externalRepl.passed -and $externalReplEditor.passed -and $bencodeResult.passed -and $hotView.passed -and $languages.passed -and $stateReplEditor.passed -and $result.passed -and $saveEditor.passed -and $fileTypesEditor.passed -and $liveEditor.passed -and $legacyEditing.passed -and $reopen.passed -and $openTargetsEditor.passed -and $modules.passed -and $packages.passed -and $nodeResult.passed -and $watchResult.passed -and $previewResult.passed -and $browserWatches.passed -and $serverWatches.passed -and $serverReload.passed -and $inlineHtml.passed -and $inlineHtmlNested.passed -and $inlineModuleErrors.passed -and $eventSVG.passed -and $bodyMaps.passed -and $contentMaps.passed -and $previewEditor.passed -and $capturedPackages.passed -and $capturedPackageEditor.passed -and $classicPackageEditor.passed -and $capturedCSSEditor.passed -and $typedEditor.passed -and $typedNode.passed -and $grammarEditor.passed -and $directoryEditor.passed -and $configEditor.passed -and $bufferBrowserEditor.passed -and $npmEditor.passed -and $serverEditor.passed -and $assistantNative.passed -and $reviewerNative.passed -and $reviewerUI.passed)
    PolicyChecks=$policyChecks
    DependencyChecks=$dependencyChecks
    ProjectPolicyChecks=$projectChecks
    RuntimeSetupChecks=$runtimeSetupChecks
    OpenTargetTransportChecks=$openTargetChecks
    OpenTargetEditorChecks=$openTargetsEditor.checks.Count
    SavedIdentityRouteChecks=$identityEditorChecks
    SavePreservationEditorChecks=$saveEditor.checks.Count
    ModuleTransformChecks=$moduleChecks
    PackageTransformChecks=$packageChecks
    NodeBackendChecks=$nodeChecks
    NodeLifecycleChecks=$lifecycleChecks
    NodeFamilyChecks=$familyChecks
    NodeCompatibilityChecks=$compatibilityChecks
    WatchCompilerChecks=$watchChecks
    WatchFamilyChecks=$watchFamilyChecks
    UIEdgeChecks=$result.edgecases.checks
    JavaScriptChecks=$result.javascript.checks.Count
    AsyncChecks=$result.async.checks.Count
    WorkflowChecks=$result.workflow.checks.Count
    NativeMenuChecks=$result.menuActions.checks.Count
    ConnectionChecks=$result.connections.checks.Count
    ProjectUIChecks=$result.projects.checks.Count
    FileTypeEditorChecks=$fileTypesEditor.checks.Count
    HotCodeChecks=$hotResult.checks.Count
    HotViewChecks=$hotView.checks.Count
    LanguageChecks=$languages.checks.Count
    StateReplEditorChecks=$stateReplEditor.checks.Count
    MemoryCapChecks=$memoryCap.checks.Count
    ExternalReplChecks=$externalRepl.checks.Count
    ExternalReplEditorChecks=$externalReplEditor.checks.Count
    BencodeChecks=$bencodeResult.checks.Count
    LiveEditorChecks=$liveEditor.checks.Count
    LegacyEditingChecks=$legacyEditing.checks.Count
    ProjectRestartChecks=$reopen.checks.Count
    ModuleUIChecks=$modules.checks.Count
    PackageUIChecks=$packages.checks.Count
    NodeUIChecks=$nodeResult.checks.Count
    WatchUIChecks=$watchResult.checks.Count
    PreviewFileChecks=$previewFileChecks
    PreviewRuntimeChecks=$previewResult.checks.Count
    PreviewUIChecks=$previewEditor.checks.Count
    CapturedPackageRuntimeChecks=$capturedPackages.checks.Count
    CapturedPackageEditorChecks=$capturedPackageEditor.checks.Count
    BrowserDependencyChecks=$browserDependencyChecks
    ClassicRuntimeChecks=$classicRuntimeChecks
    ClassicPackageCompilerChecks=$classicPackageChecks
    ClassicPlanningChecks=$classicLimitsChecks
    ClassicPackageEditorChecks=$classicPackageEditor.checks.Count
    TypedSyntaxChecks=$typedSyntaxChecks
    TypedPreviewChecks=$typedPreviewChecks
    TypedExecutionChecks=$typedExecutionChecks
    TypedEditorChecks=$typedEditor.checks.Count
    TypedNodeRuntimeChecks=$typedNode.checks.Count
    TypedEditorRouteChecks=$typedRouteChecks
    GrammarPreviewChecks=$grammarPreviewChecks
    GrammarEditorRouteChecks=$grammarRouteChecks
    GrammarEditorChecks=$grammarEditor.checks.Count
    DirectoryModuleChecks=$directoryModuleChecks
    DirectoryPreviewChecks=$directoryPreviewChecks
    DirectoryEditorChecks=$directoryEditor.checks.Count
    BufferModuleChecks=$bufferModuleChecks
    BufferBrowserChecks=$bufferBrowserChecks
    BufferBrowserEditorChecks=$bufferBrowserEditor.checks.Count
    ConfigParserChecks=$configParserChecks
    ConfigCompilerChecks=$configErrorsChecks
    ConfigEditorRouteChecks=$configRouteChecks
    ConfigNodeChecks=$configNodeChecks
    ConfigEditorChecks=$configEditor.checks.Count
    CapturedCSSCompilerChecks=$capturedCSSChecks
    CapturedCSSEditorChecks=$capturedCSSEditor.checks.Count
    BrowserWatchRuntimeChecks=$browserWatches.checks.Count
    BrowserWatchUIChecks=$previewEditor.browserWatchChecks.Count
    ServerWatchCompilerChecks=$serverWatchChecks
    SourceMapCompilerChecks=$sourceMapChecks
    SourceRecoveryCompilerChecks=$mapRecoveryChecks
    ServerWatchRuntimeChecks=$serverWatches.checks.Count
    ServerReloadRuntimeChecks=$serverReload.checks.Count
    InlineHTMLCompilerChecks=$inlineHtmlChecks
    InlineHTMLUIChecks=$inlineHtml.checks.Count
    InlineHTMLNestedChecks=$inlineHtmlNested.checks.Count
    InlineModuleErrorCompilerChecks=$inlineModuleErrorChecks
    InlineModuleErrorEditorChecks=$inlineModuleErrors.checks.Count
    EventSVGCompilerChecks=$htmlRegionsChecks
    EventSVGEditorChecks=$eventSVG.checks.Count
    BodyMapEditorChecks=$bodyMaps.checks.Count
    SourceRecoveryEditorChecks=$contentMaps.checks.Count
    NpmBackendChecks=$npmBackendChecks
    NpmPreloadChecks=$npmPreloadChecks
    NpmJsonChecks=$jsonStreamChecks
    NpmUIChecks=$npmEditor.checks.Count
    ServerPreviewUIChecks=$serverEditor.checks.Count
    AssistantControllerChecks=$assistantResult.checks.Count
    ViteTailwindNativeChecks=$viteTailwind.checks.Count
    AutomaticViteNativeChecks=$autoVite.checks.Count
    AssistantNativeChecks=$assistantNative.checks.Count
    ReviewerControllerChecks=$reviewerResult.checks.Count
    ReviewerProfileChecks=$reviewerProfileResult.checks.Count
    ReviewerSamplingChecks=$reviewerFocusResult.checks.Count
    HtmlViewerChecks=$htmlViewerResult.checks.Count
    HtmlViewerNativeChecks=$htmlViewerNative.checks.Count
    ReviewerNativeChecks=$reviewerNative.checks.Count
    ReviewerProfileNativeChecks=$reviewerProfileNative.checks.Count
    ReviewerUIChecks=$reviewerUI.checks.Count
    Revenue=$result.workflow.report.revenue
    HardQuota=$result.workflow.result.memory.hardPrivateCommit
    ActiveRuns=($result.cleanup.active+$nodeResult.cleanup.nodeActive)
    RemainingQuotaJobs=$nodeResult.cleanup.jobs
    StartupManifestUnchanged=$launchEvidence.manifestUnchanged
    Evidence=(Join-Path $runtime 'evaluation-result.json')
} | Format-List
