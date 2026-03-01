const express = require('express');
const oauthService = require('../services/oauthService');

const router = express.Router();

/**
 * POST /api/oauth/google/callback
 * Handle Google OAuth callback
 * Body: { code: string, redirectUri: string }
 */
router.post('/google/callback', async (req, res) => {
  try {
    const { code, redirectUri } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    const result = await oauthService.handleGoogleCallback(
      code,
      redirectUri || process.env.GOOGLE_REDIRECT_URI
    );

    res.json(result);
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(401).json({ error: error.message || 'Google OAuth failed' });
  }
});

/**
 * POST /api/oauth/github/callback
 * Handle GitHub OAuth callback
 * Body: { code: string, redirectUri: string }
 */
router.post('/github/callback', async (req, res) => {
  try {
    const { code, redirectUri } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    const result = await oauthService.handleGithubCallback(
      code,
      redirectUri || process.env.GITHUB_REDIRECT_URI
    );

    res.json(result);
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    res.status(401).json({ error: error.message || 'GitHub OAuth failed' });
  }
});

/**
 * GET /api/oauth/auth-methods/:email
 * Get available auth methods for an email
 */
router.get('/auth-methods/:email', (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const methods = oauthService.getAuthMethods(email);

    res.json({ methods });
  } catch (error) {
    console.error('Auth methods error:', error);
    res.status(500).json({ error: 'Failed to get auth methods' });
  }
});

module.exports = router;
