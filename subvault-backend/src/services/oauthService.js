const axios = require('axios');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const oauthConfig = require('../config/oauth');

const generateToken = (userId, email) => {
  return jwt.sign(
    { id: userId, email },
    process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

const getOrCreateUser = (email, name, provider) => {
  // Check if user already exists
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (user) {
    // User exists, link OAuth account if not already linked
    const existing = db.prepare(
      'SELECT * FROM oauth_accounts WHERE user_id = ? AND provider = ?'
    ).get(user.id, provider);

    if (!existing) {
      db.prepare(
        `INSERT INTO oauth_accounts (user_id, provider, provider_id, email, name)
         VALUES (?, ?, ?, ?, ?)`
      ).run(user.id, provider, `${provider}_${email}`, email, name);
    }
  } else {
    // Create new user with OAuth-only account (no password)
    const stmt = db.prepare(
      `INSERT INTO users (email, password, name)
       VALUES (?, ?, ?)`
    );

    // Use a placeholder for password since OAuth users don't have passwords
    const result = stmt.run(email, '', name || email.split('@')[0]);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

    // Link OAuth account
    db.prepare(
      `INSERT INTO oauth_accounts (user_id, provider, provider_id, email, name)
       VALUES (?, ?, ?, ?, ?)`
    ).run(user.id, provider, `${provider}_${email}`, email, name);
  }

  return user;
};

module.exports = {
  /**
   * Handle Google OAuth callback
   * Exchange authorization code for access token and create/link user
   */
  handleGoogleCallback: async (code, redirectUri) => {
    try {
      const config = oauthConfig.google;

      // Exchange code for access token
      // Google's token endpoint expects application/x-www-form-urlencoded,
      // not JSON. Using JSON here results in a 400 invalid_request.
      const body = new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString();

      const tokenResponse = await axios.post(
        config.tokenUrl,
        body,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const { access_token } = tokenResponse.data;

      // Fetch user info from Google
      const userResponse = await axios.get(config.userInfoUrl, {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const { email, name, id: googleId } = userResponse.data;

      // Get or create user
      const user = getOrCreateUser(email, name, 'google');

      // Generate JWT token
      const token = generateToken(user.id, user.email);

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      };
    } catch (error) {
      const detail =
        error.response?.data?.error_description ||
        error.response?.data?.error ||
        error.message;
      throw new Error(`Google OAuth error: ${detail}`);
    }
  },

  /**
   * Handle GitHub OAuth callback
   * Exchange authorization code for access token and create/link user
   */
  handleGithubCallback: async (code, redirectUri) => {
    try {
      const config = oauthConfig.github;

      // Exchange code for access token
      const tokenResponse = await axios.post(
        config.tokenUrl,
        {
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: redirectUri,
        },
        {
          headers: { Accept: 'application/json' },
        }
      );

      const { access_token } = tokenResponse.data;

      // Fetch user info from GitHub
      const userResponse = await axios.get(config.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      const { email: githubEmail, name: githubName, login: githubLogin } = userResponse.data;

      // GitHub may not provide email, so we need to fetch it separately if needed
      let email = githubEmail || `${githubLogin}@github.local`;
      const name = githubName || githubLogin;

      // If no email from public profile, try to fetch primary email
      if (!githubEmail) {
        try {
          const emailResponse = await axios.get('https://api.github.com/user/emails', {
            headers: {
              Authorization: `Bearer ${access_token}`,
              Accept: 'application/vnd.github.v3+json',
            },
          });

          const primaryEmail = emailResponse.data.find(e => e.primary);
          if (primaryEmail) {
            email = primaryEmail.email;
          }
        } catch (err) {
          // Fallback to constructed email
        }
      }

      // Get or create user
      const user = getOrCreateUser(email, name, 'github');

      // Generate JWT token
      const token = generateToken(user.id, user.email);

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      };
    } catch (error) {
      throw new Error(`GitHub OAuth error: ${error.message}`);
    }
  },

  /**
   * Get available auth methods for an email
   */
  getAuthMethods: (email) => {
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

    if (!user) {
      return [];
    }

    const methods = [];

    // Check if password is set (for email/password login)
    const emailUser = db.prepare('SELECT password FROM users WHERE id = ?').get(user.id);
    if (emailUser.password) {
      methods.push('email');
    }

    // Check OAuth providers
    const oauthAccounts = db.prepare(
      'SELECT DISTINCT provider FROM oauth_accounts WHERE user_id = ?'
    ).all(user.id);

    oauthAccounts.forEach(account => {
      methods.push(account.provider);
    });

    return methods;
  },
};
