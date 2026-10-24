import { appendFile } from 'node:fs/promises';

const repository = process.env.GITHUB_REPOSITORY;
if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository ?? '')) throw new Error('Missing GitHub repository context.');
const response = await fetch(`https://api.github.com/repos/${repository}/pages`, {
  headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28' },
});
let enabled = false;
if (response.ok) {
  const pages = await response.json();
  enabled = pages.build_type === 'workflow';
  if (enabled) console.log(`Pages is configured: ${pages.html_url}`);
} else if (response.status !== 404) {
  throw new Error(`Cannot inspect Pages configuration (${response.status}). The catalogue was built but was not deployed.`);
}
await appendFile(process.env.GITHUB_OUTPUT, `enabled=${enabled}\n`);
if (!enabled) {
  const message = `## Website built; one-time Pages setup remains\n\nThe tests and build passed. The website artifact is attached to this run.\n\nAn owner must open [Settings → Pages](https://github.com/${repository}/settings/pages), choose **GitHub Actions** under **Build and deployment → Source**, then run this workflow again from the Actions tab. Later approved catalogue updates deploy automatically.\n\nThis job cannot grant itself repository administration permissions.\n`;
  await appendFile(process.env.GITHUB_STEP_SUMMARY, message);
  console.log('::notice::Website built. Enable GitHub Pages with GitHub Actions in repository Settings → Pages, then rerun this workflow.');
}
