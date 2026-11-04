'use strict';
/**
 * Google OAuth (loopback) for the channel display only.
 * V1 streaming itself uses the Stream Key, so it works WITHOUT any
 * Google verification. OAuth is only used to show the channel name /
 * subscriber count in the Connected Channel card.
 *
 * Flow: local HTTP server on 127.0.0.1:<random port> -> open the Google
 * consent page in the system browser -> Google redirects back with a code
 * -> exchange the code for tokens. No password is ever asked for or stored.
 * Scopes: youtube.readonly + youtube.upload (the live-broadcast scope
 * "youtube" is NOT requested in V1, on purpose).
 */
const http = require('http');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = ['https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/youtube.upload'];

function authUrl(clientId, redirectUri) {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${AUTH_URL}?${p.toString()}`;
}

async function exchangeCode(code, clientId, clientSecret, redirectUri) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || `Token exchange failed (${res.status})`);
  return data; // { access_token, refresh_token, expires_in, ... }
}

async function refreshAccess(refreshToken, clientId, clientSecret) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || `Token refresh failed (${res.status})`);
  return data;
}

async function fetchChannel(accessToken) {
  const url = 'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true';
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `YouTube API failed (${res.status})`);
  const ch = (data.items || [])[0];
  if (!ch) throw new Error('No YouTube channel found on this Google account.');
  return {
    id: ch.id,
    title: ch.snippet?.title || '',
    thumbnail: ch.snippet?.thumbnails?.default?.url || '',
    subscribers: ch.statistics?.subscriberCount || '0',
    handle: ch.snippet?.customUrl || '',
  };
}

/** Starts the loopback server, resolves with the auth code (or rejects on timeout). */
function waitForCode(openBrowser, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/oauth-callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body style="font-family:sans-serif;padding:40px"><h2>YouTube connected.</h2><p>You can close this tab and return to the YouTube Live Loop Tool.</p></body></html>');
        server.close();
        clearTimeout(timer);
        if (code) resolve(code);
        else reject(new Error(error || 'Google sign-in was cancelled.'));
      } else {
        res.writeHead(404); res.end();
      }
    });
    const timer = setTimeout(() => {
      try { server.close(); } catch (e) { /* closed */ }
      reject(new Error('Sign-in timed out after 5 minutes. Please try again.'));
    }, timeoutMs);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      openBrowser(port, server);
    });
  });
}

module.exports = { authUrl, exchangeCode, refreshAccess, fetchChannel, waitForCode, SCOPES };
