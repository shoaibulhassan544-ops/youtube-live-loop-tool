'use strict';
/**
 * Update check — MetaBox-style in-app notification, without a paid server.
 *
 * How it works:
 *  - The app compares its own version (package.json) with the latest
 *    release of the GitHub repo set in Settings ("Update repo",
 *    e.g. ShoaibAzeez/youtube-live-loop-tool). It calls the public
 *    GitHub Releases API — no token, no account, no licence server.
 *  - If a newer version exists, the app shows a pop-up with the version
 *    number, the changelog (the release notes) and a Download button.
 *  - Fallback: if the user sets a custom "Update URL" instead, the app
 *    fetches that version.json: { "version": "1.1.0",
 *    "changelog": "- ...", "downloadUrl": "https://..." }.
 *  - Nothing is downloaded or installed automatically. The user decides.
 */
const { app } = require('electron');

function parseVersion(v) {
  return String(v || '').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
}
/** -1 if a<b, 0 if equal, 1 if a>b */
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

async function checkForUpdate({ repo, updateUrl }) {
  const current = app.getVersion();
  let latest = null;
  if (updateUrl) {
    const res = await fetch(updateUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Update check failed (${res.status})`);
    latest = await res.json(); // { version, changelog, downloadUrl }
  } else if (repo) {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'youtube-live-loop-tool' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) throw new Error(`No releases found for ${repo} yet. Publish a release first (see README).`);
    if (!res.ok) throw new Error(`Update check failed (${res.status})`);
    const rel = await res.json();
    latest = { version: rel.tag_name, changelog: rel.body || '', downloadUrl: rel.html_url };
  } else {
    throw new Error('No update source set. Add the GitHub repo (Settings → Updates) or a version.json URL.');
  }
  const available = compareVersions(latest.version, current) > 0;
  return { current, available, version: String(latest.version).replace(/^v/, ''), changelog: latest.changelog || '', downloadUrl: latest.downloadUrl || '' };
}

module.exports = { checkForUpdate, compareVersions, parseVersion };
