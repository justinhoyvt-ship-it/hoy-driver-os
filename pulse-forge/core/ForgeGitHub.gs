/** GitHub Git-database adapter. Creates branches and PRs; never merges. */
const FORGE_GITHUB_DEFAULT_REPOSITORY_ = 'justinhoyvt-ship-it/hoy-driver-os';

function forgeGitHubProps_() {
  return PropertiesService.getScriptProperties();
}

function forgeGitHubToken_() {
  const props = forgeGitHubProps_();
  const token = props.getProperty('PULSE_FORGE_GITHUB_TOKEN') ||
    props.getProperty('GITHUB_TOKEN') ||
    props.getProperty('PULSE_GITHUB_TOKEN') || '';
  forgeAssert_(token, 'GitHub token is not configured in Script Properties.');
  return token;
}

function forgeGitHubRepository_() {
  return forgeGitHubProps_().getProperty('PULSE_FORGE_GITHUB_REPOSITORY') || FORGE_GITHUB_DEFAULT_REPOSITORY_;
}

function forgeGitHubApi_(path, options) {
  const request = Object.assign({
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + forgeGitHubToken_(),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Pulse-Forge'
    }
  }, options || {});
  if (request.payload && typeof request.payload !== 'string') {
    request.contentType = 'application/json';
    request.payload = JSON.stringify(request.payload);
  }
  const url = 'https://api.github.com/repos/' + forgeGitHubRepository_() + path;
  const response = UrlFetchApp.fetch(url, request);
  const status = response.getResponseCode();
  const text = response.getContentText();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (error) { body = { raw: text }; }
  if (status < 200 || status >= 300) {
    const message = body && body.message ? body.message : text;
    throw new Error('GitHub API ' + status + ': ' + message);
  }
  return body;
}

function forgeGitHubConnectionTest() {
  const repo = forgeGitHubApi_('', { method: 'get' });
  return forgeResult_(true, {
    repository: repo.full_name,
    defaultBranch: repo.default_branch,
    private: !!repo.private,
    permissions: repo.permissions || {},
    token: forgeRedact_(forgeGitHubToken_()),
    writesPerformed: false
  });
}

function forgeGitHubCreateBlob_(source) {
  return forgeGitHubApi_('/git/blobs', {
    method: 'post',
    payload: { content: forgeNormalizeText_(source), encoding: 'utf-8' }
  }).sha;
}

function forgeGitHubCreatePullRequest(request) {
  request = request || {};
  const baseBranch = forgeString_(request.baseBranch || 'main').trim();
  const headBranch = forgeString_(request.headBranch).trim();
  const title = forgeString_(request.title).trim();
  const files = Array.isArray(request.files) ? request.files : [];
  forgeAssert_(baseBranch && headBranch && title, 'baseBranch, headBranch, and title are required.');
  forgeAssert_(files.length > 0, 'At least one repository file is required.');
  forgeAssert_(headBranch !== baseBranch, 'Forge will not commit directly to the base branch.');

  const baseRef = forgeGitHubApi_('/git/ref/heads/' + baseBranch.split('/').map(encodeURIComponent).join('/'), { method: 'get' });
  const baseCommitSha = baseRef.object.sha;
  const baseCommit = forgeGitHubApi_('/git/commits/' + encodeURIComponent(baseCommitSha), { method: 'get' });
  const seen = {};
  const treeItems = files.map(function(file) {
    const path = forgeString_(file.path).replace(/^\/+/, '');
    forgeAssert_(path, 'Repository file path is required.');
    forgeAssert_(!seen[path], 'Duplicate repository path: ' + path);
    seen[path] = true;
    return {
      path: path,
      mode: '100644',
      type: 'blob',
      sha: forgeGitHubCreateBlob_(file.content)
    };
  });
  const tree = forgeGitHubApi_('/git/trees', {
    method: 'post',
    payload: { base_tree: baseCommit.tree.sha, tree: treeItems }
  });
  const commit = forgeGitHubApi_('/git/commits', {
    method: 'post',
    payload: {
      message: forgeString_(request.commitMessage || title),
      tree: tree.sha,
      parents: [baseCommitSha]
    }
  });
  forgeGitHubApi_('/git/refs', {
    method: 'post',
    payload: { ref: 'refs/heads/' + headBranch, sha: commit.sha }
  });
  const pull = forgeGitHubApi_('/pulls', {
    method: 'post',
    payload: {
      title: title,
      head: headBranch,
      base: baseBranch,
      body: forgeString_(request.body),
      draft: request.draft === true
    }
  });
  return forgeResult_(true, {
    repository: forgeGitHubRepository_(),
    baseBranch: baseBranch,
    headBranch: headBranch,
    commitSha: commit.sha,
    pullRequest: {
      number: pull.number,
      url: pull.html_url,
      state: pull.state,
      draft: !!pull.draft
    },
    filesWritten: treeItems.length,
    automaticMerge: false,
    productionTouched: false
  });
}
