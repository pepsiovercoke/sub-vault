const express = require('express');
const { authenticate } = require('../middleware/auth');
const gmailService = require('../services/gmailService');

const router = express.Router();

/**
 * GET /api/gmail/auth-url
 * Returns the Google OAuth consent URL for Gmail access.
 * Query: ?redirectUri=...
 */
router.get('/auth-url', authenticate, (req, res) => {
    try {
        const redirectUri = req.query.redirectUri || undefined;
        const url = gmailService.getAuthUrl(redirectUri);
        res.json({ url });
    } catch (error) {
        console.error('Gmail auth URL error:', error);
        res.status(500).json({ error: 'Failed to generate Gmail auth URL' });
    }
});

/**
 * POST /api/gmail/scan
 * Exchange the OAuth code, scan Gmail, and return detected subscriptions.
 * Body: { code: string, redirectUri?: string }
 */
router.post('/scan', authenticate, async (req, res) => {
    try {
        const { code, redirectUri } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Authorization code is required' });
        }

        // Exchange code for access token
        const { tokens } = await gmailService.exchangeCode(code, redirectUri);

        if (!tokens.access_token) {
            return res.status(401).json({ error: 'Failed to obtain Gmail access token' });
        }

        // Scan Gmail for subscriptions
        const subscriptions = await gmailService.scanForSubscriptions(tokens.access_token);

        res.json({
            message: `Found ${subscriptions.length} potential subscriptions`,
            subscriptions,
        });
    } catch (error) {
        console.error('Gmail scan error:', error);

        // Handle specific Google API errors
        if (error.message?.includes('invalid_grant')) {
            return res.status(401).json({ error: 'Gmail authorization expired. Please try again.' });
        }

        res.status(500).json({ error: error.message || 'Failed to scan Gmail' });
    }
});

module.exports = router;
