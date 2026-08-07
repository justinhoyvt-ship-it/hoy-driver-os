/**
 * PULSE-061 — Rider quote and request experience configuration.
 *
 * Read-only feature configuration and deterministic state tests. This file
 * performs no Sheet, Mail, Calendar, request, payment, network, deployment,
 * merge, or production-data operation.
 */

const PULSE_RIDER_EXPERIENCE_VERSION_ = 'pulse-rider-experience-v1';
const PULSE_RIDER_EXPERIENCE_PROPERTY_ = 'PULSE_RIDER_EXPERIENCE_V1';

function pulseRiderExperienceEnabled_() {
  if (typeof PropertiesService === 'undefined') return false;
  const value = PropertiesService.getScriptProperties()
    .getProperty(PULSE_RIDER_EXPERIENCE_PROPERTY_);
  return String(value || '').toLowerCase() === 'true';
}

function pulseGetRiderExperienceConfig(payload) {
  payload = payload || {};
  const cfg = rideCfg_();
  const testMode = payload.testMode === true;
  const requestAllowed = testMode || secureEqual_(
    String(payload.requestToken || ''),
    cfg.requestToken
  );
  const preview = testMode && payload.previewExperience === true;
  return {
    ok: true,
    version: PULSE_RIDER_EXPERIENCE_VERSION_,
    enabled: requestAllowed && (preview || pulseRiderExperienceEnabled_()),
    featureFlagDefault: false,
    requestAllowed: requestAllowed,
    existingWriter: 'submitRideRequest',
    writesPerformed: false
  };
}

function pulseRiderExperienceTransition_(state, event) {
  const transitions = {
    EDITING: {CALCULATE: 'CALCULATING'},
    CALCULATING: {QUOTE_OK: 'QUOTED', QUOTE_FAIL: 'UNAVAILABLE'},
    UNAVAILABLE: {RETRY_QUOTE: 'CALCULATING', EDIT: 'EDITING'},
    QUOTED: {REQUEST: 'REVIEW'},
    REVIEW: {EDIT: 'QUOTED', CONFIRM: 'SUBMITTING'},
    SUBMITTING: {SUCCESS: 'SUBMITTED', FAILURE: 'RETRY'},
    RETRY: {CONFIRM: 'SUBMITTING', EDIT: 'QUOTED'},
    SUBMITTED: {}
  };
  const current = String(state || '').toUpperCase();
  const action = String(event || '').toUpperCase();
  const next = transitions[current] && transitions[current][action];
  if (!next) throw new Error('Invalid rider experience transition: ' + current + ' + ' + action);
  return next;
}

function pulseRiderSubmissionGuard_(state) {
  const value = String(state || '').toLowerCase();
  return value !== 'submitting' && value !== 'submitted';
}

function pulseRunRiderExperienceTests() {
  let state = 'EDITING';
  const sequence = [
    ['CALCULATE', 'CALCULATING'],
    ['QUOTE_OK', 'QUOTED'],
    ['REQUEST', 'REVIEW'],
    ['CONFIRM', 'SUBMITTING'],
    ['SUCCESS', 'SUBMITTED']
  ];
  const sequenceChecks = sequence.map(function(step) {
    state = pulseRiderExperienceTransition_(state, step[0]);
    return state === step[1];
  });

  const failureChecks = [
    pulseRiderExperienceTransition_('CALCULATING', 'QUOTE_FAIL') === 'UNAVAILABLE',
    pulseRiderExperienceTransition_('UNAVAILABLE', 'RETRY_QUOTE') === 'CALCULATING',
    pulseRiderExperienceTransition_('SUBMITTING', 'FAILURE') === 'RETRY',
    pulseRiderSubmissionGuard_('idle') === true,
    pulseRiderSubmissionGuard_('submitting') === false,
    pulseRiderSubmissionGuard_('submitted') === false
  ];

  return {
    ok: sequenceChecks.concat(failureChecks).every(Boolean),
    sequenceChecks: sequenceChecks,
    failureChecks: failureChecks,
    featureFlagDefault: false,
    existingWriter: 'submitRideRequest',
    externalWritesPerformed: false,
    productionTouched: false
  };
}
