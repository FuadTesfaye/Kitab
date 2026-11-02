import {api} from '@/lib/api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handle(request:Request,context:{params:Promise<{path:string[]}>}){return api(request,(await context.params).path);}
export {handle as GET,handle as POST,handle as PUT,handle as DELETE};
