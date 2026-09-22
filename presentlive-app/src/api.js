const API_URL = import.meta.env.VITE_API_URL;
const TOKEN = import.meta.env.VITE_API_TOKEN;

export async function apiGet(path) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!response.ok)
    throw new Error(`GET ${path} failed with status ${response.status}`);
  const json = await response.json();
  return json.data !== undefined ? json.data : json;
}

export async function apiPost(path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`POST ${path} failed with status ${response.status}`);
  return await response.json();
}

export async function apiPut(path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok)
    throw new Error(`PUT ${path} failed with status ${response.status}`);

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function apiDelete(path) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!response.ok)
    throw new Error(`DELETE ${path} failed with status ${response.status}`);
}
