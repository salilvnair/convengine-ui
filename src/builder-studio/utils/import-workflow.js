/**
 * Validates and parses a JSON file exported from ConvEngine Agent Builder Studio.
 *
 * Three export shapes are supported:
 *   1. Canvas "Export JSON"          — { nodes, edges, subBlockValues }
 *   2. Full workspace-store workflow — { id, name, teamId, nodes, edges, subBlockValues, … }
 *   3. demo-workflow.json / seed file — { workflow: { nodes, edges, subBlockValues, … }, skill?, agent1?, … }
 *
 * Returns { ok: true, workflow } or { ok: false, error: string }.
 */
export function parseImportedWorkflowJSON(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'JSON root must be an object.' }
  }

  // Shape 3: demo-workflow.json seed format — workflow is nested under "workflow" key
  const source = (parsed.workflow && typeof parsed.workflow === 'object' && !Array.isArray(parsed.workflow))
    ? parsed.workflow
    : parsed

  const nodes = source.nodes
  const edges = source.edges
  const subBlockValues = source.subBlockValues ?? {}

  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return {
      ok: false,
      error: 'Not a ConvEngine workflow JSON — missing "nodes" and/or "edges" arrays.',
    }
  }

  // Must have at least one node with blockType to qualify as our format
  const hasBlockTypes = nodes.some(
    (n) => n?.data?.blockType && typeof n.data.blockType === 'string'
  )
  if (!hasBlockTypes) {
    return {
      ok: false,
      error: 'Not a ConvEngine workflow JSON — nodes are missing "data.blockType" field.',
    }
  }

  return {
    ok: true,
    workflow: {
      name:           source.name   || parsed.name   || 'Imported Workflow',
      id:             source.id     || parsed.id     || null,
      teamId:         source.teamId || parsed.teamId || null,
      nodes,
      edges,
      subBlockValues,
      createdAt:      source.createdAt || parsed.createdAt || new Date().toISOString(),
    },
  }
}

/**
 * Opens a file-picker restricted to .json files, reads the selected file, and
 * resolves with the parsed workflow object.  Rejects on cancel or parse error.
 *
 * @returns {Promise<{name,nodes,edges,subBlockValues,id?,teamId?}>}
 */
export function pickAndParseWorkflowJSON() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.style.display = 'none'
    document.body.appendChild(input)

    input.addEventListener('change', () => {
      const file = input.files?.[0]
      document.body.removeChild(input)
      if (!file) { reject(new Error('cancelled')); return }

      const reader = new FileReader()
      reader.onload = (ev) => {
        const result = parseImportedWorkflowJSON(ev.target.result)
        if (result.ok) resolve(result.workflow)
        else reject(new Error(result.error))
      }
      reader.onerror = () => reject(new Error('Failed to read file.'))
      reader.readAsText(file)
    })

    // If user closes dialog without picking, input change won't fire
    // We clean up on focus return (500 ms delay to let change fire first)
    window.addEventListener(
      'focus',
      () => setTimeout(() => { if (input.parentNode) document.body.removeChild(input); reject(new Error('cancelled')) }, 500),
      { once: true }
    )

    input.click()
  })
}
