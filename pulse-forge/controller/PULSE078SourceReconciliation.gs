/**
 * PULSE-078 — read-only live-source reconciliation.
 *
 * Reads complete Apps Script HEAD source, compares it with GitHub, captures
 * immutable per-file hashes and source snapshots, and opens a reviewed PR.
 * It never writes Apps Script HEAD, creates a deployment, activates an engine,
 * merges a PR, or changes production data.
 */

const FORGE_PULSE078_TASK_ID_ = 'PULSE-078';
const FORGE_PULSE078_LATEST_RECEIPT_KEY_ = 'PULSE_FORGE_PULSE078_LATEST_RECEIPT';
const FORGE_PULSE078_RECEIPT_PREFIX_ = 'PULSE_FORGE_PULSE078_RECEIPT_';

function forgePulse078Targets_() {
  return [
    {
      alias: 'FORGE_CONTROLLER',
      scriptId: ScriptApp.getScriptId(),
      repoRoots: ['pulse-forge/core/', 'pulse-forge/controller/'],
      repoExact: ['pulse-forge/appsscript.json'],
      canonicalRoot: 'pulse-forge/controller',
      authority: 'REPO',
      rideRequestsWriter: false,
      importLiveOnly: false,
      controllerProject: true
    },
    {
      alias: 'HOY_DRIVER',
      scriptId: '1sN7MFrzEOD0GMIOc10XoA8j5IPzZwQynowIuZpXDCWuLbF2wqIDf8Zj0',
      repoRoots: ['apps-script/hoy-driver-os-writer/'],
      repoExact: [],
      canonicalRoot: 'apps-script/hoy-driver-os-writer',
      authority: 'LIVE',
      rideRequestsWriter: false,
      importLiveOnly: true,
      controllerProject: false
    },
    {
      alias: 'PULSE_REQUEST_APP',
      scriptId: '1pxF-tqlu-NrINv0QD-sQZEXMGUoc408YhHOuKccoU_URCtCyOmTiaVSm',
      repoRoots: ['pulse-autobuild/request-app/'],
      repoExact: [],
      canonicalRoot: 'pulse-autobuild/request-app',
      authority: 'LIVE',
      rideRequestsWriter: true,
      importLiveOnly: true,
      controllerProject: false
    },
    {
      alias: 'RIDER_STATUS_RUNTIME',
      scriptId: '1cABIzv0j8poYGy3hVbcmKe-DBuJQHR9Hcj-2l9VqvXMot_kmleKnHgUf',
      repoRoots: ['pulse-autobuild/runtime/'],
      repoExact: [],
      canonicalRoot: 'pulse-autobuild/runtime',
      authority: 'LIVE',
      rideRequestsWriter: false,
      importLiveOnly: true,
      controllerProject: false
    }
  ];
}

function forgePulse078AssertWriterBoundary_(targets) {
  const writers = (targets || []).filter(function(target) {
    return target.rideRequestsWriter === true;
  });
  forgeAssert_(writers.length === 1, 'Exactly one Ride Requests writer must be declared.');
  forgeAssert_(
    writers[0].alias === 'PULSE_REQUEST_APP',
    'The standalone Pulse Request App must remain the only Ride Requests writer.'
  );
  return {
    ok: true,
    authorizedWriterAlias: writers[0].alias,
    additionalWritersDeclared: false
  };
}

function forgePulse078FileIdentity_(file) {
  return forgeString_(file.name).toLowerCase() + '::' + forgeString_(file.type).toUpperCase();
}

function forgePulse078Extension_(type) {
  const normalized = forgeString_(type).toUpperCase();
  if (normalized === 'SERVER_JS') return '.gs';
  if (normalized === 'HTML') return '.html';
  if (normalized === 'JSON') return '.json';
  throw new Error('Unsupported Apps Script file type: ' + normalized);
}

function forgePulse078RepoIdentityFromPath_(path) {
  const clean = forgeString_(path).replace(/^\/+/, '');
  const base = clean.split('/').pop();
  if (base === 'appsscript.json') {
    return { name: 'appsscript', type: 'JSON', path: clean };
  }
  if (/\.gs$/i.test(base)) {
    return { name: base.replace(/\.gs$/i, ''), type: 'SERVER_JS', path: clean };
  }
  if (/\.html$/i.test(base)) {
    return { name: base.replace(/\.html$/i, ''), type: 'HTML', path: clean };
  }
  return null;
}

function forgePulse078CanonicalPath_(target, file) {
  if (forgeString_(file.name).toLowerCase() === 'appsscript' &&
      forgeString_(file.type).toUpperCase() === 'JSON') {
    return target.controllerProject
      ? 'pulse-forge/appsscript.json'
      : target.canonicalRoot.replace(/\/+$/, '') + '/appsscript.json';
  }

  const extension = forgePulse078Extension_(file.type);
  if (target.controllerProject) {
    const coreNames = {
      ForgeCore: true,
      ForgeRegistry: true,
      ForgeValidator: true,
      ForgeProjectApi: true,
      ForgeGitHub: true,
      ForgeEngine: true,
      ForgeReconcile: true
    };
    const folder = coreNames[file.name] ? 'pulse-forge/core' : 'pulse-forge/controller';
    return folder + '/' + file.name + extension;
  }
  return target.canonicalRoot.replace(/\/+$/, '') + '/' + file.name + extension;
}

function forgePulse078SnapshotPath_(captureId, alias, file) {
  const safeAlias = forgeString_(alias).replace(/[^A-Za-z0-9_-]/g, '_');
  const extension = forgePulse078Extension_(file.type);
  const name = forgeString_(file.name).replace(/[^A-Za-z0-9_.-]/g, '_');
  return 'pulse-forge/reconciliation/PULSE-078/' +
    captureId + '/' + safeAlias + '/live/' + name + extension;
}

function forgePulse078CompareFiles_(liveFiles, repoFiles) {
  const live = forgeCanonicalFiles_(liveFiles || []);
  const repo = (repoFiles || []).map(function(file) {
    return {
      name: forgeString_(file.name),
      type: forgeString_(file.type).toUpperCase(),
      source: forgeNormalizeText_(file.source),
      path: forgeString_(file.path)
    };
  }).sort(function(a, b) {
    return forgePulse078FileIdentity_(a).localeCompare(forgePulse078FileIdentity_(b));
  });

  const liveByKey = {};
  const repoByKey = {};

  live.forEach(function(file) {
    const key = forgePulse078FileIdentity_(file);
    forgeAssert_(!liveByKey[key], 'Duplicate live file identity: ' + key);
    liveByKey[key] = file;
  });
  repo.forEach(function(file) {
    const key = forgePulse078FileIdentity_(file);
    forgeAssert_(!repoByKey[key], 'Duplicate repository file identity: ' + key);
    repoByKey[key] = file;
  });

  const keys = Object.keys(Object.assign({}, liveByKey, repoByKey)).sort();
  return keys.map(function(key) {
    const liveFile = liveByKey[key] || null;
    const repoFile = repoByKey[key] || null;
    const liveSha = liveFile ? forgeSha256_(liveFile.source) : '';
    const repoSha = repoFile ? forgeSha256_(repoFile.source) : '';
    let status = 'MATCH';
    if (liveFile && !repoFile) status = 'LIVE_ONLY';
    else if (!liveFile && repoFile) status = 'REPO_ONLY';
    else if (liveSha !== repoSha) status = 'DIFF';

    return {
      key: key,
      name: (liveFile || repoFile).name,
      type: (liveFile || repoFile).type,
      status: status,
      liveSha256: liveSha,
      repoSha256: repoSha,
      repoPath: repoFile ? repoFile.path : '',
      liveBytes: liveFile ? forgeUtf8Bytes_(liveFile.source) : 0,
      repoBytes: repoFile ? forgeUtf8Bytes_(repoFile.source) : 0
    };
  });
}

function forgePulse078RepoTree_(ref) {
  const branch = forgeString_(ref || 'main');
  const tree = forgeGitHubApi_(
    '/git/trees/' + encodeURIComponent(branch) + '?recursive=1',
    { method: 'get' }
  );
  forgeAssert_(tree && Array.isArray(tree.tree), 'GitHub repository tree was not returned.');
  forgeAssert_(tree.truncated !== true, 'GitHub repository tree was truncated; reconciliation stopped.');
  return tree.tree;
}

function forgePulse078PathIncluded_(target, path) {
  const clean = forgeString_(path);
  if ((target.repoExact || []).indexOf(clean) >= 0) return true;
  return (target.repoRoots || []).some(function(root) {
    return clean.indexOf(root) === 0;
  });
}

function forgePulse078ReadRepoText_(path, ref) {
  const encoded = forgeString_(path).split('/').map(encodeURIComponent).join('/');
  const result = forgeGitHubApi_(
    '/contents/' + encoded + '?ref=' + encodeURIComponent(ref || 'main'),
    { method: 'get' }
  );
  forgeAssert_(
    result && result.encoding === 'base64' && result.content,
    'GitHub source was not returned for ' + path
  );
  const compact = forgeString_(result.content).replace(/\s/g, '');
  return Utilities.newBlob(Utilities.base64Decode(compact)).getDataAsString('UTF-8');
}

function forgePulse078RepoFilesForTarget_(target, tree, ref) {
  const files = [];
  (tree || []).forEach(function(entry) {
    if (!entry || entry.type !== 'blob') return;
    if (!forgePulse078PathIncluded_(target, entry.path)) return;
    const identity = forgePulse078RepoIdentityFromPath_(entry.path);
    if (!identity) return;
    files.push({
      name: identity.name,
      type: identity.type,
      path: identity.path,
      source: forgePulse078ReadRepoText_(identity.path, ref)
    });
  });

  const seen = {};
  files.forEach(function(file) {
    const key = forgePulse078FileIdentity_(file);
    forgeAssert_(!seen[key], 'Repository maps multiple files to Apps Script identity ' + key);
    seen[key] = true;
  });
  return files;
}

function forgePulse078LiveFileMap_(files) {
  const map = {};
  forgeCanonicalFiles_(files || []).forEach(function(file) {
    map[forgePulse078FileIdentity_(file)] = file;
  });
  return map;
}

function forgePulse078RepoFileMap_(files) {
  const map = {};
  (files || []).forEach(function(file) {
    map[forgePulse078FileIdentity_(file)] = file;
  });
  return map;
}

function forgePulse078ActionFor_(target, comparison) {
  if (comparison.status === 'MATCH') return 'NO_CHANGE';
  if (comparison.status === 'REPO_ONLY') return 'KEEP_REPO';
  if (target.authority === 'REPO' && comparison.status === 'DIFF') {
    return 'REVIEW_REPO_PREFERRED';
  }
  if (comparison.status === 'LIVE_ONLY' && target.importLiveOnly !== true) {
    return 'SNAPSHOT_ONLY';
  }
  if (target.allowCanonicalProposal !== true) {
    return 'REVIEW_LIVE_PREFERRED';
  }
  return 'PROPOSE_LIVE_TO_CANONICAL';
}

function forgePulse078PutPrFile_(fileMap, path, content) {
  const clean = forgeString_(path).replace(/^\/+/, '');
  forgeAssert_(clean, 'PR file path is required.');
  const normalized = forgeNormalizeText_(content);
  if (Object.prototype.hasOwnProperty.call(fileMap, clean)) {
    forgeAssert_(fileMap[clean] === normalized, 'Conflicting generated PR content for ' + clean);
    return;
  }
  fileMap[clean] = normalized;
}

function forgePulse078RunSourceReconciliation() {
  return forgeWithBuildLock_(function() {
    const targets = forgePulse078Targets_();
    const writerBoundary = forgePulse078AssertWriterBoundary_(targets);
    const ref = 'main';
    const tree = forgePulse078RepoTree_(ref);
    const captureId = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone() || 'America/New_York',
      'yyyyMMdd-HHmmss'
    );

    const prFiles = {};
    const targetReports = [];
    let proposedCanonicalChanges = 0;

    targets.forEach(function(target) {
      const live = forgeGetScriptContent(target.scriptId);
      const repoFiles = forgePulse078RepoFilesForTarget_(target, tree, ref);
      const comparisons = forgePulse078CompareFiles_(live.files, repoFiles);
      const liveMap = forgePulse078LiveFileMap_(live.files);
      const repoMap = forgePulse078RepoFileMap_(repoFiles);

      live.files.forEach(function(file) {
        forgePulse078PutPrFile_(
          prFiles,
          forgePulse078SnapshotPath_(captureId, target.alias, file),
          file.source
        );
      });

      const fileReports = comparisons.map(function(comparison) {
        const action = forgePulse078ActionFor_(target, comparison);
        const liveFile = liveMap[comparison.key] || null;
        const repoFile = repoMap[comparison.key] || null;
        let canonicalPath = repoFile ? repoFile.path : '';

        if (action === 'PROPOSE_LIVE_TO_CANONICAL') {
          forgeAssert_(liveFile, 'Live source is required for canonical import.');
          canonicalPath = canonicalPath || forgePulse078CanonicalPath_(target, liveFile);
          forgePulse078PutPrFile_(prFiles, canonicalPath, liveFile.source);
          proposedCanonicalChanges += 1;
        }

        return Object.assign({}, comparison, {
          action: action,
          canonicalPath: canonicalPath
        });
      });

      const inventory = {
        taskId: FORGE_PULSE078_TASK_ID_,
        captureId: captureId,
        alias: target.alias,
        scriptId: target.scriptId,
        authority: target.authority,
        rideRequestsWriter: target.rideRequestsWriter === true,
        livePackageHash: live.packageHash,
        liveInventory: live.inventory,
        repositoryFiles: repoFiles.map(function(file) {
          return {
            path: file.path,
            name: file.name,
            type: file.type,
            bytes: forgeUtf8Bytes_(file.source),
            sha256: forgeSha256_(file.source)
          };
        }),
        files: fileReports,
        productionProjectMutated: false
      };
      const inventoryPath = 'pulse-forge/reconciliation/PULSE-078/' +
        captureId + '/' + target.alias + '/inventory.json';
      forgePulse078PutPrFile_(prFiles, inventoryPath, JSON.stringify(inventory, null, 2) + '\n');

      targetReports.push(inventory);
    });

    const counts = { MATCH: 0, DIFF: 0, LIVE_ONLY: 0, REPO_ONLY: 0 };
    targetReports.forEach(function(target) {
      target.files.forEach(function(file) {
        counts[file.status] += 1;
      });
    });

    const report = {
      taskId: FORGE_PULSE078_TASK_ID_,
      captureId: captureId,
      capturedAt: forgeNowIso_(),
      repository: forgeGitHubRepository_(),
      repositoryRef: ref,
      writerBoundary: writerBoundary,
      targets: targetReports,
      counts: counts,
      proposedCanonicalChanges: proposedCanonicalChanges,
      appsScriptHeadWrites: 0,
      deploymentsCreated: 0,
      engineActivations: 0,
      productionDataChanged: false,
      automaticMerge: false,
      productionTouched: false
    };
    report.reportHash = forgeSha256_(forgeStableJson_(report));

    const basePath = 'pulse-forge/reconciliation/PULSE-078/' + captureId;
    forgePulse078PutPrFile_(
      prFiles,
      basePath + '/report.json',
      JSON.stringify(report, null, 2) + '\n'
    );
    forgePulse078PutPrFile_(
      prFiles,
      basePath + '/README.md',
      [
        '# PULSE-078 live-source reconciliation',
        '',
        '- Capture: `' + captureId + '`',
        '- Report hash: `' + report.reportHash + '`',
        '- MATCH: ' + counts.MATCH,
        '- DIFF: ' + counts.DIFF,
        '- LIVE_ONLY: ' + counts.LIVE_ONLY,
        '- REPO_ONLY: ' + counts.REPO_ONLY,
        '- Proposed canonical changes: ' + proposedCanonicalChanges,
        '- Authorized Ride Requests writer: `PULSE_REQUEST_APP`',
        '- Apps Script HEAD writes: 0',
        '- Deployments: 0',
        '- Production data changes: none',
        '',
        'Controller drift remains repository-preferred. Live application drift is captured',
        'for review and is not copied into canonical paths unless explicitly enabled.',
        'Every complete live source file is preserved under the capture folder.',
        ''
      ].join('\n')
    );

    const stamp = captureId;
    const pull = forgeGitHubCreatePullRequest({
      baseBranch: 'main',
      headBranch: 'pulse/pulse-078-source-reconciliation-' + stamp,
      title: 'PULSE-078: Reconcile live Pulse Apps Script source',
      commitMessage: 'Capture and reconcile live Pulse Apps Script source',
      body: [
        '## PULSE-078 source reconciliation',
        '',
        'Reads complete live source for the Forge controller, Hoy Driver, standalone',
        'request app, and Runtime Lite/rider-status project.',
        '',
        '### Evidence',
        '- Immutable live source snapshots and SHA-256 inventories',
        '- Per-file MATCH / DIFF / LIVE_ONLY / REPO_ONLY classification',
        '- Repository-preferred controller drift handling',
        '- Live-preferred application drift captured for explicit review',
        '- Standalone request app remains the only declared Ride Requests writer',
        '',
        '### Safety',
        '- No Apps Script HEAD writes',
        '- No deployments',
        '- No engine activation',
        '- No automatic merge',
        '- No production data mutation',
        '',
        'Report hash: `' + report.reportHash + '`'
      ].join('\n'),
      files: Object.keys(prFiles).sort().map(function(path) {
        return { path: path, content: prFiles[path] };
      })
    });

    const receiptIdentity = {
      taskId: FORGE_PULSE078_TASK_ID_,
      captureId: captureId,
      reportHash: report.reportHash,
      commitSha: pull.commitSha,
      pullRequestNumber: pull.pullRequest.number
    };
    const receiptId = forgeSha256_(forgeStableJson_(receiptIdentity));
    const receipt = Object.assign({}, receiptIdentity, {
      receiptId: receiptId,
      ok: true,
      pullRequestUrl: pull.pullRequest.url,
      counts: counts,
      proposedCanonicalChanges: proposedCanonicalChanges,
      writerBoundary: writerBoundary,
      appsScriptHeadWrites: 0,
      productionTouched: false,
      automaticMerge: false,
      createdAt: forgeNowIso_()
    });

    const props = PropertiesService.getScriptProperties();
    props.setProperty(FORGE_PULSE078_RECEIPT_PREFIX_ + receiptId, forgeStableJson_(receipt));
    props.setProperty(FORGE_PULSE078_LATEST_RECEIPT_KEY_, receiptId);

    console.log(JSON.stringify(receipt, null, 2));
    return receipt;
  });
}

function forgePulse078SelfTest() {
  const live = [
    { name: 'A', type: 'SERVER_JS', source: 'same' },
    { name: 'B', type: 'HTML', source: 'live-diff' },
    { name: 'C', type: 'SERVER_JS', source: 'live-only' }
  ];
  const repo = [
    { name: 'A', type: 'SERVER_JS', source: 'same', path: 'A.gs' },
    { name: 'B', type: 'HTML', source: 'repo-diff', path: 'B.html' },
    { name: 'D', type: 'JSON', source: '{}', path: 'D.json' }
  ];
  const statuses = forgePulse078CompareFiles_(live, repo).map(function(item) {
    return item.status;
  }).sort();

  const boundary = forgePulse078AssertWriterBoundary_([
    { alias: 'PULSE_REQUEST_APP', rideRequestsWriter: true },
    { alias: 'HOY_DRIVER', rideRequestsWriter: false }
  ]);

  return {
    ok: forgeStableJson_(statuses) === forgeStableJson_(['DIFF', 'LIVE_ONLY', 'MATCH', 'REPO_ONLY']) &&
      boundary.ok === true &&
      forgePulse078CanonicalPath_(
        { controllerProject: false, canonicalRoot: 'example' },
        { name: 'Code', type: 'SERVER_JS' }
      ) === 'example/Code.gs',
    statuses: statuses,
    writerBoundary: boundary,
    writesPerformed: false,
    productionTouched: false
  };
}
