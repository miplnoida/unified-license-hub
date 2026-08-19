import { mainNavSections } from '../src/config/navigation';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const rows: string[] = [];
const esc = (s: string) => s.replace(/'/g, "''");
const audienceOf = (roles: any[]) => {
  const r = roles || [];
  const internal = ['super_admin','admin','supervisor','licensing_officer','analyst','developer','legal_compliance'];
  const hasInt = r.some((x) => internal.includes(x));
  const hasExt = r.some((x) => !internal.includes(x));
  return hasInt && hasExt ? 'any' : hasExt ? 'external' : 'internal';
};
let order = 0;
for (const section of mainNavSections as any[]) {
  const gkey = 'grp_' + slug(section.label || 'main');
  order += 10;
  rows.push(`  ('${gkey}',NULL,'${esc(section.label || 'Main')}','group',NULL,NULL,NULL,NULL,false,${order},'any','{}')`);
  const walk = (items: any[], parentKey: string, prefix: string) => {
    for (const it of items) {
      order += 10;
      const key = prefix + slug(it.label);
      const icon = (it.icon?.type?.displayName || it.icon?.type?.name || '') as string;
      const type = it.children ? 'group' : 'link';
      const href = it.href ? `'${esc(it.href)}'` : 'NULL';
      const mod = it.module ? `'${it.module}'` : 'NULL';
      const act = it.requiredAction ? `'${it.requiredAction}'` : 'NULL';
      rows.push(`  ('${key}','${parentKey}','${esc(it.label)}','${type}',${href},${mod},${act},'${icon}',${it.adminOnly ? 'true' : 'false'},${order},'${audienceOf(it.roles)}','{}')`);
      if (it.children) walk(it.children, key, key + '_');
    }
  };
  walk(section.items, gkey, gkey.replace('grp_', 'nav_') + '_');
}
console.log(rows.join(',\n'));
