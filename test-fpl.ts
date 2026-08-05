import { fetchFixtures, fetchBootstrapStatic } from './lib/fpl-api/index.js';

async function test() {
  const fixtures = await fetchFixtures();
  const fplData = await fetchBootstrapStatic();
  
  console.log("Teams:", fplData.teams.slice(0,2).map((t:any) => ({ id: t.id, name: t.name, short_name: t.short_name })));
  console.log("Fixtures:", fixtures.slice(0, 2));
}
test();
