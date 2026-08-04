/**
 * PULSE-077 runtime verification.
 *
 * Verifies the staged inactive engine through the Apps Script Execution API.
 * Does not activate an engine, change the active pointer, merge, or deploy production.
 */
function forgeVerifyPulse077InactiveEngine() {
  const active = forgeGetActiveEngineSlot_();
  const target = active === 'ENGINE_A' ? 'ENGINE_B' : 'ENGINE_A';
  const project = forgeRegistryGetProject_(target);
  const live = forgeGetScriptContent(project.scriptId);

  const test = forgeRunScriptFunction({
    scriptId: project.scriptId,
    functionName: 'forgeEngineCoreSelfTest',
    parameters: [],
    devMode: false
  });
  const payload = test.response &&
    test.response.response &&
    test.response.response.result;

  forgeAssert_(
    test.ok && payload && payload.ok === true,
    'PULSE-077 inactive engine runtime test did not return an explicit passing receipt.'
  );

  const identity = {
    taskId: 'PULSE-077',
    projectAlias: target,
    scriptId: project.scriptId,
    packageHash: live.packageHash,
    testFunction: 'forgeEngineCoreSelfTest',
    testResultHash: forgeSha256_(forgeStableJson_(payload))
  };
  const receiptId = forgeSha256_(forgeStableJson_(identity));
  const receipt = Object.assign({}, identity, {
    receiptId: receiptId,
    ok: true,
    testedAt: forgeNowIso_(),
    testResult: payload,
    activeEngineUnchanged: active,
    productionTouched: false
  });

  const props = PropertiesService.getScriptProperties();
  const key = 'PULSE_FORGE_PULSE077_RECEIPT_' + receiptId;
  const existing = props.getProperty(key);
  if (!existing) props.setProperty(key, forgeStableJson_(receipt));
  props.setProperty('PULSE_FORGE_PULSE077_LATEST_RECEIPT', receiptId);

  console.log(JSON.stringify(receipt, null, 2));
  return receipt;
}
