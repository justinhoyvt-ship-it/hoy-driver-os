/** Built-in bootstrap templates. Later engines can replace these packages. */
function forgeEngineTemplateFiles_(slot, version) {
  const normalizedSlot = forgeString_(slot).toUpperCase();
  const normalizedVersion = forgeString_(version || '0.1.0-bootstrap');
  const engineSource = [
    '/** Replaceable Forge Engine slot. Built by the stable controller. */',
    'const FORGE_ENGINE = Object.freeze({',
    "  SLOT: '" + normalizedSlot + "',",
    "  VERSION: '" + normalizedVersion + "'",
    '});',
    '',
    'function forgeEngineSelfTest() {',
    '  return {',
    '    ok: true,',
    '    slot: FORGE_ENGINE.SLOT,',
    '    version: FORGE_ENGINE.VERSION,',
    '    writesPerformed: false',
    '  };',
    '}'
  ].join('\n');
  const manifest = {
    timeZone: 'America/New_York',
    dependencies: {},
    exceptionLogging: 'STACKDRIVER',
    runtimeVersion: 'V8',
    executionApi: { access: 'MYSELF' },
    oauthScopes: ['https://www.googleapis.com/auth/script.external_request']
  };
  return [
    { name: 'Engine', type: 'SERVER_JS', source: engineSource },
    { name: 'appsscript', type: 'JSON', source: JSON.stringify(manifest, null, 2) }
  ];
}
