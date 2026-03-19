const BASE = '/api';

export async function fetchDashboard() {
  const res = await fetch(`${BASE}/dashboard`);
  return res.json();
}

export async function fetchRequests(limit = 50, offset = 0, scenarioTag = null) {
  const params = new URLSearchParams({ limit, offset });
  if (scenarioTag) params.set('scenario_tag', scenarioTag);
  const res = await fetch(`${BASE}/requests?${params}`);
  return res.json();
}

export async function fetchRequestDetail(id) {
  const res = await fetch(`${BASE}/requests/${id}`);
  return res.json();
}

export async function processRequest(payload) {
  const res = await fetch(`${BASE}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function processRequestStreaming(payload, onStep) {
  const res = await fetch(`${BASE}/process/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6));
          if (event.step === 'done' && event.result) {
            finalResult = event.result;
          }
          onStep(event);
        } catch (e) {
          // skip malformed events
        }
      }
    }
  }

  return finalResult;
}

export async function processBatch(requestIds = null, limit = 20) {
  const res = await fetch(`${BASE}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestIds ? { request_ids: requestIds } : { limit }),
  });
  return res.json();
}
