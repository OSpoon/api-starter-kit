import { defineConfig } from '@adonisjs/shield'

const shieldConfig = defineConfig({
  /**
   * Configure CSP policies for your app. Refer documentation
   * to learn more.
   */
  csp: {
    /**
     * Enable the Content-Security-Policy header.
     */
    enabled: true,

    /**
     * Per-resource CSP directives.
     * - 'self' for scripts, styles, images, fonts, connect.
     * - 'unsafe-inline' for styles (shadcn-vue/Tailwind require inline styles).
     * - 'unsafe-inline' for scripts is NOT included; use nonces/hashes if needed.
     * - cdn.jsdelivr.net / fonts.googleapis.com / fonts.gstatic.com
     *   proxy.scalar.com / api.scalar.com are for the Scalar OpenAPI docs UI
     *   (the only HTML the backend serves). API endpoints return JSON, so CSP
     *   does not affect them.
     */
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      // Scalar may load webfonts from various CDNs; fonts are non-executable
      // and the backend only serves HTML for the docs page (API returns JSON),
      // so allowing any HTTPS font source is safe here.
      fontSrc: ["'self'", 'data:', 'https:'],
      connectSrc: [
        "'self'",
        'https://proxy.scalar.com',
        'https://api.scalar.com',
        'https://cdn.jsdelivr.net',
      ],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
    },

    /**
     * Report violations without blocking resources during development.
     * Set to false in production to enforce the policy.
     */
    reportOnly: false,
  },

  /**
   * Configure CSRF protection options. Refer documentation
   * to learn more.
   */
  csrf: {
    /**
     * Enable CSRF token verification for state-changing requests.
     */
    enabled: false,

    /**
     * Route patterns to exclude from CSRF checks.
     * Useful for external webhooks or API endpoints.
     */
    exceptRoutes: [],

    /**
     * Expose an encrypted XSRF-TOKEN cookie for frontend HTTP clients.
     */
    enableXsrfCookie: true,

    /**
     * HTTP methods protected by CSRF validation.
     */
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  },

  /**
   * Control how your website should be embedded inside
   * iframes.
   */
  xFrame: {
    /**
     * Enable the X-Frame-Options header.
     */
    enabled: true,

    /**
     * Block all framing attempts. Default value is DENY.
     */
    action: 'DENY',
  },

  /**
   * Force browser to always use HTTPS.
   */
  hsts: {
    /**
     * Enable the Strict-Transport-Security header.
     */
    enabled: true,

    /**
     * HSTS policy duration remembered by browsers.
     */
    maxAge: '180 days',
  },

  /**
   * Disable browsers from sniffing content types and rely only
   * on the response content-type header.
   */
  contentTypeSniffing: {
    /**
     * Enable X-Content-Type-Options: nosniff.
     */
    enabled: true,
  },
})

export default shieldConfig
