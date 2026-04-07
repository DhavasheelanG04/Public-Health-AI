const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export async function sendChatMessage(message) {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    let detail = 'Unable to reach the NLP service.';

    try {
      const errorPayload = await response.json();
      detail = errorPayload.detail || detail;
    } catch (parseError) {
      detail = `${detail} (${response.status})`;
    }

    throw new Error(detail);
  }

  return response.json();
}