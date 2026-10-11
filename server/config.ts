/**
 * server/config.ts — global feature flags
 */

/**
 * The CVScore website has been retired; the backend is being reused as an MCP
 * connector. While this is false:
 *   - every website API route returns HTTP 410 (see the gate in routes.ts)
 *   - no email is sent (see sendEmail in email.ts)
 *
 * Defaults to false. To re-enable the website, set WEBSITE_ENABLED=true.
 * Route handler code is intentionally left intact for reuse.
 */
export const WEBSITE_ENABLED = process.env.WEBSITE_ENABLED === "true";
