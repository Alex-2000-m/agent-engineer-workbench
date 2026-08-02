export function parseGitHubRemote(remote) {
  const match = String(remote).trim().match(/github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (!match) throw new Error("origin 必须指向当前用户自己的 GitHub Fork");
  return { owner: match[1], name: match[2] };
}

export function githubPagesUrl({ owner, name }) {
  return name.toLowerCase() === `${owner.toLowerCase()}.github.io`
    ? `https://${owner}.github.io/`
    : `https://${owner}.github.io/${name}/`;
}
