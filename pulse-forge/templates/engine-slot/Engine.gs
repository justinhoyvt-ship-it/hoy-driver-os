/** Replaceable Forge Engine slot. The stable controller builds this project. */
const FORGE_ENGINE = Object.freeze({
  SLOT: '__ENGINE_SLOT__',
  VERSION: '__ENGINE_VERSION__',
  PACKAGE_HASH: '__PACKAGE_HASH__'
});

function forgeEngineSelfTest() {
  return {
    ok: true,
    slot: FORGE_ENGINE.SLOT,
    version: FORGE_ENGINE.VERSION,
    packageHash: FORGE_ENGINE.PACKAGE_HASH,
    writesPerformed: false
  };
}
