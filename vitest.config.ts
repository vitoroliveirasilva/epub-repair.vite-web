import { defineConfig } from 'vitest/config';

const jsdomFiles = `
accessibilitySemantics99
activeStructuralFalsePositive99
adversarialHtml
adversarialSvg
concurrencyOptions99
conservativeActiveSecurity99
corpusHistorical99
coverAndScriptInventory99
coverReplacementReferences
coverSvgAccessibilityAndLoadingLayout
cssAndBinaryQuality99
cssFontFallbackE2E
deterministicFuzzExpanded99
downloadObjectUrlLifecycle99
editorialHtmlLegacyIntegrity
editorialOcrHeuristics99
editorialVisualIntegrity
encodingRewrite99
epub-audit-132-149
epub-audit-150-157
epub-audit-upload-137
epub-fourth-wave
epub-third-wave-core
epub-third-wave-cover
epub-third-wave-fallback
epub-third-wave-sequence
epub2MixedLanguageCoverRegression
epubCheckFixtureGenerator
externalResourcesAndToc
fallbackSpine99
fixedLayout99
focusRerender99
fontObfuscation99
footnoteSemantics99
foreignImageFallback99
heroPreviewFactualScore
idempotenceProperties99
imageAndAccessibility99
imageMetadata99
imageMetadataIntegration99
internalAnchorsRegression99
manifestContentProperties99
manifestDependenciesRegression99
manifestRepairProperties99
mediaOverlayPreservation99
mediaOverlays99
mediaOverlaysDeep99
mimetypePhysicalZip99
multipleRootfilesRoundtrip99
navNcxSpecialUrls99
navSemanticPreservation
navigationEditorialTitles99
navigationFullRoundtrip99
navigationHierarchy99
ncxToNavEditorial99
ncxSparseCoverageRegression
opfMetadataPrefix99
opfRepairRegression99
orphanActiveContent99
orphanAndBinaryRegression99
packageSemantics99
performanceBudget99
post99-coverNavigation
post99-hardening
postRepairRealContent99
preservationEditorial99
processingUiCancel99
provenanceState99
redosBudget99
remoteManifestPolicy99
remoteManifestRegression99
repairConsentPreview99
repairPolicyRegression99
residualIssues99
singleLoadRepair99
skippedActionsReport99
specialZipPaths99
spineSemanticsMatrix99
structuralReferences99
svgStylePreservation
textDiff99
typographyPreservation99
w3cExternalCorpus
workflowAndScore99
xmlDtdSecurity99
xmlPrologPreservation99
zipBuildWorker99
zipLegacyEncoding99
zipRebuildProgress99
zipStreamingMemory99
zipWorkerCancellation99
`.trim().split(/\s+/u).map((name) => 'tests/' + name + '.test.ts');

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: jsdomFiles,
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: jsdomFiles,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: [
        'src/epub/utils/pathUtils.ts',
        'src/epub/reader/rawZipInspector.ts',
        'src/epub/validation/validateNavigation.ts',
        'src/epub/sanitize/sanitizeActiveContent.ts',
        'src/epub/repair/preservationAudit.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        perFile: true,
        lines: 88,
        statements: 85,
        branches: 70,
        functions: 82,
      },
    },
  },
});
