/**
 * Desktop client storefront config.
 *
 * MetroForge is moving to a native 3D desktop client (Bevy); this web build
 * stays live as the playable demo/storefront. Flip `SHOW_DESKTOP_PROMO` to
 * true once a real release exists at `DESKTOP_RELEASES_URL`.
 */

/** Master switch for the desktop promo section. Keep false until release. */
export const SHOW_DESKTOP_PROMO = false;

/** Single source of truth for the download link — swap when the repo goes live. */
export const DESKTOP_RELEASES_URL = 'https://github.com/Egg3901/metroforge-native/releases';
