/** The only place the repository is named. */
export const REPO = 'mmartinsoliv/mindwhisper';
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const ACCESS_REQUEST_URL =
  `https://github.com/${REPO}/issues/new?title=${encodeURIComponent('Access request')}` +
  `&body=${encodeURIComponent('Which system do you use (macOS or Windows), and where will you dictate? Do not paste any token or key here.')}`;
