// lib/fpl-api/index.ts

const FPL_BASE_URL = 'https://fantasy.premierleague.com/api';

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 PPL-App/1.0',
};

export async function fetchWithRetry(url: string, options?: RequestInit, retries = 3, delay = 1000): Promise<Response> {
  const mergedHeaders = {
    ...DEFAULT_HEADERS,
    ...(options?.headers ? (options.headers instanceof Headers ? Object.fromEntries(options.headers.entries()) : options.headers) : {}),
  };

  const fetchOptions: RequestInit = {
    ...options,
    headers: mergedHeaders,
  };

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, fetchOptions);
      if (response.ok) return response;
      if (response.status === 429) {
         await new Promise(res => setTimeout(res, delay * 2));
         continue;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(res => setTimeout(res, delay));
      delay *= 2;
    }
  }
  throw new Error(`Failed to fetch after ${retries} retries`);
}

export async function fetchBootstrapStatic(options?: RequestInit) {
  const defaultOptions: RequestInit = { next: { revalidate: 300 } } as RequestInit;
  const merged = { ...defaultOptions, ...options };
  const response = await fetchWithRetry(`${FPL_BASE_URL}/bootstrap-static/`, merged);
  return response.json();
}

export async function fetchFixtures(options?: RequestInit) {
  const defaultOptions: RequestInit = { next: { revalidate: 60 } } as RequestInit;
  const merged = { ...defaultOptions, ...options };
  const response = await fetchWithRetry(`${FPL_BASE_URL}/fixtures/`, merged);
  return response.json();
}