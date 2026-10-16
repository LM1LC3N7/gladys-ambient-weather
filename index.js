// -----------------------------------------------------------------------------
// Entry point: SDK wiring only. Every handler is registered BEFORE connect(),
// and delegates to the AmbientApp (src/app.js).
//
// Environment variables provided by the Gladys supervisor, read by the SDK:
// GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { AmbientApp } from './src/app.js';
import { ACTIONS } from './src/constants.js';

const gladys = new GladysIntegration();
const app = new AmbientApp({ gladys });

// --- Discovery: the stations of the account and the public ones nearby -------
gladys.onScanRequest(async () => {
  await app.pollAccount();
  await app.pollPublic();
  await app.publishDiscovered({ force: true });
});

// --- A device was created: send its values now, not at the next reading ------
gladys.onDeviceCreated(() => app.publish());

// --- Configuration screen button -----------------------------------------------
gladys.onAction(ACTIONS.TEST, () => app.testConnection());

// --- Configuration changed by the user -----------------------------------------
gladys.onConfigUpdated(async (config) => {
  logger.info('Configuration updated: restarting');
  await app.start(config);
});

// --- Connection lifecycle -------------------------------------------------------
gladys.on('connected', async () => {
  try {
    await app.start(await gladys.getConfig());
  } catch (err) {
    logger.error('Start failed', err);
  }
});
gladys.on('disconnected', () => app.stop());
gladys.handleShutdown(() => app.stop());

logger.info('Starting the Ambient Weather integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
