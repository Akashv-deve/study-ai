const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('http') || endpoint.startsWith('/health') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers as Record<string, string>),
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `HTTP error ${response.status}`);
  }

  const json = await response.json();
  return json.data !== undefined ? json.data : json;
}

export async function uploadZipFile(file: File, name: string, description?: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name);
  if (description) formData.append('description', description);

  const response = await fetch(`${API_BASE}/projects/upload`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Upload failed');
  }

  const json = await response.json();
  return json.data;
}
