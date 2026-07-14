// Template for the production environment file.
//
// Copy this file to `environment.prod.ts` and provide values at build time, or
// let the `setup:env` script create it from this template. `environment.prod.ts`
// is git-ignored on purpose — never commit real API keys or secrets.
export const environment = {
  production: true,
  llmApiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
  llmApiKey: '',
};
