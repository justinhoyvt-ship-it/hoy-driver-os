/**
 * Standalone PULSE-077 execution-permission probe.
 * Read-only: it only calls three existing API Executable deployments.
 */
function runPulse077PermissionProbe() {
  var tests = [
    {
      label: 'HEAD',
      deploymentId: 'AKfycbzUWyZScrL6Ib1aYKqOtnIroECGilCjCbs3jWkN-l-F',
      functionName: 'forgeEngineCoreSelfTest',
      devMode: true
    },
    {
      label: 'BOOTSTRAP_VERSION_2',
      deploymentId: 'AKfycbw2k1EVgGRCZ8DHNFEubolPnOCt8tIiQ_iqGm_w2IIX6aFxHbJSekj4ODw5f1XJRYre0g',
      functionName: 'forgeEngineSelfTest',
      devMode: false
    },
    {
      label: 'PULSE_077_VERSION_4',
      deploymentId: 'AKfycbxn-nYnBd-x4Z6RVXAm0so0Wu3joPB2r8zoMjFZCE-Y2HhfhTsUSiAApbIs3TxGScMPgg',
      functionName: 'forgeEngineCoreSelfTest',
      devMode: false
    }
  ];

  var token = ScriptApp.getOAuthToken();
  var results = [];

  for (var i = 0; i < tests.length; i++) {
    var test = tests[i];
    var response = UrlFetchApp.fetch(
      'https://script.googleapis.com/v1/scripts/' +
        encodeURIComponent(test.deploymentId) +
        ':run',
      {
        method: 'post',
        contentType: 'application/json',
        headers: {
          Authorization: 'Bearer ' + token
        },
        payload: JSON.stringify({
          function: test.functionName,
          parameters: [],
          devMode: test.devMode
        }),
        muteHttpExceptions: true
      }
    );

    var text = response.getContentText();
    var body = {};

    try {
      body = text ? JSON.parse(text) : {};
    } catch (error) {
      body = { raw: text };
    }

    results.push({
      label: test.label,
      deploymentId: test.deploymentId,
      functionName: test.functionName,
      devMode: test.devMode,
      httpStatus: response.getResponseCode(),
      body: body
    });
  }

  var report = {
    engineSlot: 'ENGINE_B',
    scriptId: '1Vpaj9VCRq1gqmU9cERxbtxrtlpic-H_E8Ox1ERKmm7oKndOLkeaSlNx-',
    results: results,
    writesPerformed: false,
    productionTouched: false
  };

  console.log(JSON.stringify(report, null, 2));
  return report;
}
