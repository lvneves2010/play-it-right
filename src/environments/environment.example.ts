// Template for the development environment file.
//
// Copy this file to `environment.ts` and fill in your own values, or let the
// `setup:env` script (run automatically on `postinstall`/`prestart`/`prebuild`)
// create it from this template.
//
// IMPORTANT: `environment.ts` is git-ignored on purpose. Never commit real API
// keys or secrets. The LLM key below is bundled into the client, so treat it as
// a low-privilege, rotatable key (ideally proxied through a backend you control).
export const environment = {
  production: false,
  llmApiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
  llmApiKey: '',
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
