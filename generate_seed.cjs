const data = require('./src/data/scams.json');
const esc = (t) => (t || '').replace(/'/g, "''");

const rows = data.scams.map((s) => {
  const tags  = JSON.stringify(s.tags   || []).replace(/'/g, "''");
  const flags = s.redFlags ? JSON.stringify(s.redFlags).replace(/'/g, "''") : null;
  const loss  = s.typicalLoss ? `'${esc(s.typicalLoss)}'` : 'NULL';
  const rf    = flags ? `'${flags}'::jsonb` : 'NULL';

  return `('${s.id}','${s.city}','${esc(s.location)}',${s.lat},${s.lng},` +
         `'${esc(s.title)}','${s.category}','${esc(s.description)}',` +
         `'${esc(s.howToAvoid)}',${loss},'${s.severity}','${s.serviceType}',` +
         `${rf},'${tags}'::jsonb,'seed')`;
});

const sql =
  'insert into public.community_scams\n' +
  '  (id,city,location,lat,lng,title,category,description,how_to_avoid,\n' +
  '   typical_loss,severity,service_type,red_flags,tags,source)\n' +
  'values\n' +
  rows.join(',\n') +
  '\non conflict (id) do nothing;';

require('fs').writeFileSync('seed_scams.sql', sql);
console.log('Written seed_scams.sql with', rows.length, 'rows');
