/**
 * API client for deploying workflows to ce-builder-studio.
 *
 * Endpoints:
 *  - POST /builder-studio/deploy   → deploy (register cron/webhook)
 *  - POST /builder-studio/undeploy → stop deployment
 *  - GET  /builder-studio/deployments → list active deployments
 */
const BASE = (import.meta.env?.VITE_CONVENGINE_BASE || 'http://localhost:8080/api/v1').replace(/\/$/, '')

/**
 * Deploy a workflow. Registers cron schedule or webhook trigger on the server.
 * @param {object} opts
 * @param {string} opts.workflowId
 * @param {{ nodes, edges, subBlockValues }} opts.workflow
 * @param {{ type: 'cron'|'webhook'|'manual', cron?, timezone?, webhookPath? }} [opts.trigger]
 */
export async function deployWorkflow({ workflowId, workflow, trigger }) {
  const url = `${BASE}/builder-studio/deploy`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflowId, workflow, trigger }),
  })
  if (!res.ok) {
    const body = await safeText(res)
    throw new Error(`Deploy failed (${res.status}): ${body}`)
  }
  return res.json()
}

/**
 * Undeploy a workflow. Stops cron and removes webhook.
 */
export async function undeployWorkflow(workflowId) {
  const url = `${BASE}/builder-studio/undeploy`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflowId }),
  })
  if (!res.ok) {
    const body = await safeText(res)
    throw new Error(`Undeploy failed (${res.status}): ${body}`)
  }
  return res.json()
}

/**
 * List all currently deployed workflows.
 */
export async function listDeployments() {
  const url = `${BASE}/builder-studio/deployments`
  const res = await fetch(url)
  if (!res.ok) {
    const body = await safeText(res)
    throw new Error(`List deployments failed (${res.status}): ${body}`)
  }
  return res.json()
}

async function safeText(res) {
  try { return await res.text() } catch { return '' }
}
