import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const suites=['travel-regressions.mjs','persistence-regressions.mjs','discovery-regressions.mjs','ui-helpers-regressions.mjs','api-regressions.mjs','research-regressions.mjs'];
for(const suite of suites){
  const result=spawnSync(process.execPath,['--experimental-strip-types',`scripts/${suite}`],{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
console.log('All six regression suites passed.');
