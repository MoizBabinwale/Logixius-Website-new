const { onRequest } = require('firebase-functions/v2/https');
const app = require('./server');

// Export the Express app as a Firebase Cloud Function
// This handles all server-side routes (admin, portal, gallery, etc.)
exports.api = onRequest(
    {
        // Cloud Function configuration
        region: 'asia-south1', // Mumbai - closest to India
        timeoutSeconds: 60,
        memory: '512MiB',
        minInstances: 0,
        maxInstances: 10,
    },
    app
);
