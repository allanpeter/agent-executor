import express from 'express';
import { execSync, exec } from 'child_process';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);
const app = express();
app.use(express.json());

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
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
    // Limpa workdir se existir
    if (existsSync(workdir)) rmSync(workdir, { recursive: true });
    mkdirSync(workdir, { recursive: true });

    console.log(`[${issue_id}] Cloning ${repo}...`);
    execSync(`git clone ${repoUrl} ${workdir}`, { stdio: 'pipe' });

    console.log(`[${issue_id}] Checking out branch ${branch}...`);
    execSync(`git -C ${workdir} checkout -b ${branch}`, { stdio: 'pipe' });

    // Configura git
    execSync(`git -C ${workdir} config user.email "agent@innatech.com.br"`, { stdio: 'pipe' });
    execSync(`git -C ${workdir} config user.name "Innatech Agent"`, { stdio: 'pipe' });

    const prompt = `
Você é um agente de desenvolvimento. Sua tarefa é implementar a seguinte issue:

## Contexto do Projeto
${project_context || 'Sem contexto adicional.'}

## Issue
**ID:** ${issue_id}
**Agente:** ${agent}
**Título:** ${title}
**Descrição:** ${description || 'Sem descrição.'}

## Instruções
1. Analise o código existente antes de fazer qualquer alteração
2. Implemente a solução seguindo as convenções do projeto
3. Faça commits atômicos com mensagens no formato Conventional Commits
4. Não quebre funcionalidades existentes
5. Se encontrar ambiguidade, implemente a interpretação mais conservadora
`;

    console.log(`[${issue_id}] Running Claude Code...`);
    const { stdout, stderr } = await execAsync(
      `cd ${workdir} && claude -p ${JSON.stringify(prompt)} --allowedTools "Read,Edit,Bash,Write" --dangerously-skip-permissions --output-format json`,
      {
        env: { ...process.env, ANTHROPIC_API_KEY },
        timeout: 300000 // 5 minutos
      }
    );

    let claudeResult;
    try {
      claudeResult = JSON.parse(stdout);
    } catch {
      claudeResult = { result: stdout };
    }

    if (claudeResult.is_error) {
      throw new Error(`Claude Code error: ${claudeResult.result}`);
    }

    // Verifica se houve mudanças
    const status = execSync(`git -C ${workdir} status --porcelain`, { encoding: 'utf8' });
    if (!status.trim()) {
      return res.json({ status: 'no_changes', message: 'Claude did not make any changes', branch });
    }

    // Commit e push
    console.log(`[${issue_id}] Committing and pushing...`);
    execSync(`git -C ${workdir} add -A`, { stdio: 'pipe' });
    execSync(`git -C ${workdir} commit -m "feat: ${title} [${issue_id}]"`, { stdio: 'pipe' });
    execSync(`git -C ${workdir} push origin ${branch}`, { stdio: 'pipe' });

    // Abre PR via GitHub API
    console.log(`[${issue_id}] Opening PR...`);
    const prBody = {
      title: `[${issue_id}] ${title}`,
      body: `## Issue\n${description || ''}\n\n## Implementado por\n${agent} via Innatech Agent\n\n## Resultado\n${claudeResult.result || ''}`,
      head: branch,
      base: 'main'
    };

    const prResponse = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify(prBody)
    });

    const pr = await prResponse.json();

    if (!prResponse.ok) {
      throw new Error(`GitHub API error: ${pr.message}`);
    }

    // Limpa workdir
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

app.listen(PORT, () => {
  console.log(`Agent Executor running on port ${PORT}`);
});
