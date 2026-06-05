import express from 'express';
import { execSync, exec } from 'child_process';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);
const app = express();
app.use(express.json());

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/debug', (req, res) => {
  try {
    const files = execSync('find /usr/local -name "claude*" 2>/dev/null && which npx', { encoding: 'utf8' });
    const npxTest = execSync('npx --version', { encoding: 'utf8' }).trim();
    res.json({ files: files.trim().split('\n'), npx_version: npxTest });
  } catch(e) {
    res.json({ error: e.message });
  }
});

app.post('/execute', async (req, res) => {
  const { issue_id, title, description, agent, repo, project_context } = req.body;

  if (!issue_id || !title || !repo) {
    return res.status(400).json({ error: 'issue_id, title and repo are required' });
  }

  const workdir = `/tmp/agent-${issue_id}`;
  const branch = `feature/${issue_id}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
  const repoUrl = `https://${GITHUB_TOKEN}@github.com/${repo}.git`;

  try {
    if (existsSync(workdir)) rmSync(workdir, { recursive: true });
    mkdirSync(workdir, { recursive: true });

    console.log(`[${issue_id}] Cloning ${repo}...`);
    execSync(`git clone ${repoUrl} ${workdir}`, { stdio: 'pipe' });
    execSync(`git -C ${workdir} checkout -b ${branch}`, { stdio: 'pipe' });
    execSync(`git -C ${workdir} config user.email "agent@innatech.com.br"`, { stdio: 'pipe' });
    execSync(`git -C ${workdir} config user.name "Innatech Agent"`, { stdio: 'pipe' });

    const prompt = `Voce e um agente de desenvolvimento. Sua tarefa e implementar a seguinte issue:\n\n## Contexto do Projeto\n${project_context || 'Sem contexto.'}\n\n## Issue\nID: ${issue_id}\nAgente: ${agent}\nTitulo: ${title}\nDescricao: ${description || 'Sem descricao.'}\n\n## Instrucoes\n1. Analise o codigo existente antes de fazer qualquer alteracao\n2. Implemente seguindo as convencoes do projeto\n3. Commits no formato Conventional Commits\n4. Nao quebre funcionalidades existentes\n5. Se houver ambiguidade, implemente a opcao mais conservadora`;

    console.log(`[${issue_id}] Running Claude Code via npx...`);
    const { stdout } = await execAsync(
      `cd ${workdir} && npx claude -p ${JSON.stringify(prompt)} --allowedTools "Read,Edit,Bash,Write" --dangerously-skip-permissions --output-format json`,
      { env: { ...process.env, ANTHROPIC_API_KEY }, timeout: 300000 }
    );

    let claudeResult;
    try { claudeResult = JSON.parse(stdout); }
    catch { claudeResult = { result: stdout }; }

    if (claudeResult.is_error) throw new Error(`Claude Code error: ${claudeResult.result}`);

    const status = execSync(`git -C ${workdir} status --porcelain`, { encoding: 'utf8' });
    if (!status.trim()) {
      return res.json({ status: 'no_changes', branch });
    }

    execSync(`git -C ${workdir} add -A`, { stdio: 'pipe' });
    execSync(`git -C ${workdir} commit -m "feat: ${title} [${issue_id}]"`, { stdio: 'pipe' });
    execSync(`git -C ${workdir} push origin ${branch}`, { stdio: 'pipe' });

    const prResponse = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        title: `[${issue_id}] ${title}`,
        body: `## Issue\n${description || ''}\n\n## Implementado por\n${agent} via Innatech Agent\n\n## Resultado\n${claudeResult.result || ''}`,
        head: branch,
        base: 'main'
      })
    });

    const pr = await prResponse.json();
    if (!prResponse.ok) throw new Error(`GitHub API error: ${pr.message}`);

    rmSync(workdir, { recursive: true });
    console.log(`[${issue_id}] Done. PR: ${pr.html_url}`);

    res.json({
      status: 'success',
      pr_url: pr.html_url,
      pr_number: pr.number,
      branch,
      cost_usd: claudeResult.total_cost_usd || null
    });

  } catch (error) {
    console.error(`[${issue_id}] Error:`, error.message);
    if (existsSync(workdir)) rmSync(workdir, { recursive: true });
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`Agent Executor running on port ${PORT}`));