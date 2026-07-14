#!/usr/bin/env node
// Generates the git-ignored environment files from their committed templates
// when they are missing, so a fresh clone / CI build has something to compile
// against without any secret being stored in version control.
//
// Values can be injected at build time via environment variables:
//   LLM_API_URL  - overrides `llmApiUrl`
//   LLM_API_KEY  - overrides `llmApiKey`
const fs = require('fs');
const path = require('path');

const envDir = path.resolve(__dirname, '../src/environments');

const targets = [
  { file: 'environment.ts', template: 'environment.example.ts' },
  { file: 'environment.prod.ts', template: 'environment.prod.example.ts' },
];

const apiUrl = process.env.LLM_API_URL;
const apiKey = process.env.LLM_API_KEY;

for (const { file, template } of targets) {
  const filePath = path.join(envDir, file);
  const templatePath = path.join(envDir, template);

  if (fs.existsSync(filePath)) {
    continue;
  }

  if (!fs.existsSync(templatePath)) {
    console.error(`[setup-env] Template not found: ${templatePath}`);
    process.exit(1);
  }

  let contents = fs.readFileSync(templatePath, 'utf8');

  if (apiUrl) {
    contents = contents.replace(/llmApiUrl:\s*'[^']*'/, `llmApiUrl: '${apiUrl}'`);
  }
  if (apiKey) {
    contents = contents.replace(/llmApiKey:\s*'[^']*'/, `llmApiKey: '${apiKey}'`);
  }

  fs.writeFileSync(filePath, contents);
  console.log(`[setup-env] Created ${file} from ${template}`);
}
