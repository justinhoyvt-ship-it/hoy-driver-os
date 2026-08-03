/** Persistent registry and A/B engine slot controls. */
const FORGE_REGISTRY_KEY_ = 'PULSE_FORGE_PROJECT_REGISTRY_V1';
const FORGE_ACTIVE_ENGINE_KEY_ = 'PULSE_FORGE_ACTIVE_ENGINE_SLOT';

function forgeRegistryProps_() {
  return PropertiesService.getScriptProperties();
}

function forgeRegistryRead_() {
  const raw = forgeRegistryProps_().getProperty(FORGE_REGISTRY_KEY_);
  if (!raw) return { projects: {}, updatedAt: null };
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.projects ? parsed : { projects: {}, updatedAt: null };
  } catch (error) {
    throw new Error('Forge registry is invalid JSON: ' + error.message);
  }
}

function forgeRegistryWrite_(registry) {
  const copy = forgeClone_(registry || { projects: {} });
  copy.updatedAt = forgeNowIso_();
  forgeRegistryProps_().setProperty(FORGE_REGISTRY_KEY_, forgeStableJson_(copy));
  return copy;
}

function forgeRegisterProject(project) {
  project = project || {};
  const alias = forgeString_(project.alias).trim().toUpperCase();
  const scriptId = forgeString_(project.scriptId).trim();
  const environment = forgeString_(project.environment).trim().toUpperCase();
  forgeAssert_(/^[A-Z0-9_\-]+$/.test(alias), 'Project alias is required and must be simple text.');
  forgeAssert_(scriptId, 'scriptId is required.');
  forgeAssert_(FORGE_CORE.ENVIRONMENTS.indexOf(environment) >= 0, 'Unsupported Forge environment.');

  const registry = forgeRegistryRead_();
  registry.projects[alias] = {
    alias: alias,
    scriptId: scriptId,
    environment: environment,
    allowHeadWrite: environment !== 'PRODUCTION' && project.allowHeadWrite === true,
    allowTestDeployment: environment !== 'PRODUCTION' && project.allowTestDeployment === true,
    productionDeploymentId: environment === 'PRODUCTION' ? forgeString_(project.productionDeploymentId) : '',
    description: forgeString_(project.description),
    updatedAt: forgeNowIso_()
  };
  forgeRegistryWrite_(registry);
  return forgeResult_(true, { project: forgeClone_(registry.projects[alias]) });
}

function forgeListRegisteredProjects() {
  const registry = forgeRegistryRead_();
  return forgeResult_(true, {
    activeEngineSlot: forgeGetActiveEngineSlot_(),
    projects: Object.keys(registry.projects).sort().map(function(alias) {
      return forgeClone_(registry.projects[alias]);
    })
  });
}

function forgeRegistryGetProject_(alias) {
  const key = forgeString_(alias).trim().toUpperCase();
  const project = forgeRegistryRead_().projects[key];
  forgeAssert_(project, 'Forge project is not registered: ' + key);
  return forgeClone_(project);
}

function forgeGetActiveEngineSlot_() {
  return forgeRegistryProps_().getProperty(FORGE_ACTIVE_ENGINE_KEY_) || 'ENGINE_A';
}

function forgeSetActiveEngineSlot(slot, validationReceipt) {
  const normalized = forgeString_(slot).trim().toUpperCase();
  forgeAssert_(normalized === 'ENGINE_A' || normalized === 'ENGINE_B', 'Engine slot must be ENGINE_A or ENGINE_B.');
  forgeAssert_(validationReceipt && validationReceipt.ok === true, 'A passing validation receipt is required.');
  forgeAssert_(forgeString_(validationReceipt.slot).toUpperCase() === normalized, 'Validation receipt slot mismatch.');
  forgeRegistryProps_().setProperty(FORGE_ACTIVE_ENGINE_KEY_, normalized);
  return forgeResult_(true, { activeEngineSlot: normalized, automaticDeployment: false });
}
