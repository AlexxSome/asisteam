import {check,suite} from './run.mjs';
import {randomBytes} from 'node:crypto';
process.env.ASISTEAM_QA_NAMESPACE??=randomBytes(4).toString('hex');
await suite('extended',async()=>{
 await check('chromium-install','pnpm',['--filter','@asisteam/web','exec','playwright','install','--with-deps','chromium']);
 await check('nest-domain-build','pnpm',['exec','turbo','run','build','--filter','@asisteam/api','--filter','@asisteam/api-client']);
 await check('private-storage-fixture-build','docker',['build','-f','scripts/migration/storage/Dockerfile.fixture','-t','asisteam-storage-fixture:161','.']);
 // One full native matrix covers every role/viewport/axe and module adapter.
 await check('playwright-nest-domain-responsive-axe','pnpm',['--filter','@asisteam/web','test:e2e:full','--reporter=json'],{env:{ASISTEAM_QA_INVITATIONS:'1',ASISTEAM_QA_STORAGE:'1',RUN_INVITATION_E2E:'1',PLAYWRIGHT_JSON_OUTPUT_NAME:'.ci-nest-domain.json'},report:'apps/web/.ci-nest-domain.json',playwright:true,requireAll:true});
 await check('playwright-vite-session', 'pnpm', ['--filter', '@asisteam/web-vite', 'test:e2e', '--reporter=json'], {env:{PLAYWRIGHT_JSON_OUTPUT_NAME:'.ci-vite.json'},report:'apps/web-vite/.ci-vite.json',playwright:true,requireAll:true});
 await check('playwright-transport-faults','pnpm',['--filter','@asisteam/web','test:e2e:faults','--reporter=json'],{env:{PLAYWRIGHT_JSON_OUTPUT_NAME:'.ci-faults.json'},report:'apps/web/.ci-faults.json',playwright:true,requireAll:true});
});
