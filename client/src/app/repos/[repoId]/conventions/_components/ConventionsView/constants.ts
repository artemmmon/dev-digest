/** Constants for the Conventions view. */

/** Skeleton cards shown while the list (or a scan) is loading. */
export const SKELETON_CARDS = 3;
export const SKELETON_CARD_HEIGHT = 170;

/** Number of hex chars of a commit sha shown in the header. */
export const SHORT_SHA_LENGTH = 7;

/** API error codes the page has a dedicated message for. */
export const ERROR_CODE_SCAN_IN_PROGRESS = "scan_in_progress";
/** The server raises `ConfigError` (code `config_error`) when a provider key is missing. */
export const ERROR_CODE_NO_API_KEY = "config_error";
export const ERROR_CODE_NETWORK = "network_error";
