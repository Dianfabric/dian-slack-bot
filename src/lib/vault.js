/**
 * 세컨드 브레인 볼트(GitHub 저장소) 읽기/쓰기.
 * Vercel에서 로컬 Obsidian 볼트에 직접 쓸 수 없으므로 GitHub Contents API를 다리로 사용.
 * 로컬에서는 Obsidian Git 플러그인이 주기적으로 pull/push.
 */

const REPO = process.env.VAULT_REPO || 'Dianfabric/dian-second-brain';
const BRANCH = process.env.VAULT_BRANCH || 'main';
const API = `https://api.github.com/repos/${REPO}/contents`;

function headers() {
  return {
    Authorization: `token ${process.env.VAULT_GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dian-slack-bot',
  };
}

/** 파일 읽기. 없으면 null. → { content, sha } */
export async function getVaultFile(path) {
  const res = await fetch(`${API}/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${BRANCH}`, {
    headers: headers(),
  });
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(`vault get ${path}: ${data.message}`);
  return { content: Buffer.from(data.content, 'base64').toString('utf8'), sha: data.sha };
}

/** 파일 생성/덮어쓰기 (sha는 기존 파일 수정 시 필수) */
export async function putVaultFile(path, content, message, sha = null) {
  const body = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(`${API}/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
    method: 'PUT',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`vault put ${path}: ${data.message}`);
  return data;
}

/** 파일 끝에 내용 추가. 파일이 없으면 initialContent + 내용으로 생성. */
export async function appendVaultFile(path, snippet, message, initialContent = '') {
  const existing = await getVaultFile(path);
  if (existing) {
    const content = existing.content.replace(/\n*$/, '\n') + snippet + '\n';
    return putVaultFile(path, content, message, existing.sha);
  }
  return putVaultFile(path, initialContent + snippet + '\n', message);
}

/** 디렉토리 파일 목록. 없으면 []. → [{ name, path }] */
export async function listVaultDir(path) {
  const res = await fetch(`${API}/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${BRANCH}`, {
    headers: headers(),
  });
  if (res.status === 404) return [];
  const data = await res.json();
  if (!res.ok) throw new Error(`vault list ${path}: ${data.message}`);
  return (Array.isArray(data) ? data : []).filter(f => f.type === 'file').map(f => ({ name: f.name, path: f.path }));
}

/** KST 기준 오늘 날짜 YYYY-MM-DD (Vercel은 UTC라 명시 변환 필요) */
export function kstToday(offsetDays = 0) {
  const now = new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return now.toISOString().slice(0, 10);
}

/** KST 기준 현재 시각 HH:MM */
export function kstTime() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return now.toISOString().slice(11, 16);
}
