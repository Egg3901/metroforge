// Shared release-fetching logic for the MetroForge storefront pages.
// Fetches GitHub releases client-side. Falls back to a static releases-page
// link if the API is unreachable or rate-limited.
(function (global) {
  var REPO = 'Egg3901/metroforge-native';
  var API = 'https://api.github.com/repos/' + REPO + '/releases';
  var RELEASES_PAGE = 'https://github.com/' + REPO + '/releases';
  var LATEST_PAGE = RELEASES_PAGE + '/latest';

  function matchAsset(assets, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var re = patterns[i];
      for (var j = 0; j < assets.length; j++) {
        if (re.test(assets[j].name)) return assets[j];
      }
    }
    return null;
  }

  function platformAssets(release) {
    var assets = (release && release.assets) || [];
    return {
      windows: matchAsset(assets, [/windows/i, /win64/i, /\.exe$/i]),
      macos: matchAsset(assets, [/mac(os)?/i, /darwin/i, /\.dmg$/i]),
      linux: matchAsset(assets, [/linux/i, /\.tar\.gz$/i, /\.appimage$/i]),
    };
  }

  function fetchReleases(count) {
    return fetch(API + '?per_page=' + (count || 10), {
      headers: { Accept: 'application/vnd.github+json' },
    }).then(function (res) {
      if (!res.ok) throw new Error('GitHub API ' + res.status);
      return res.json();
    }).then(function (list) {
      return list.filter(function (r) { return !r.draft; });
    });
  }

  global.MetroForgeReleases = {
    REPO: REPO,
    RELEASES_PAGE: RELEASES_PAGE,
    LATEST_PAGE: LATEST_PAGE,
    fetchReleases: fetchReleases,
    platformAssets: platformAssets,
  };
})(window);
