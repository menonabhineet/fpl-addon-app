// lib/fpl-api/index.ts

const FPL_BASE_URL = 'https://fantasy.premierleague.com/api';

export async function fetchBootstrapStatic() {
  const response = await fetch(`${FPL_BASE_URL}/bootstrap-static/`);
  if (!response.ok) throw new Error('Failed to fetch bootstrap-static data');
  return response.json();
}

export async function fetchFixtures() {
  const response = await fetch(`${FPL_BASE_URL}/fixtures/`);
  if (!response.ok) throw new Error('Failed to fetch fixtures data');
  return response.json();
}