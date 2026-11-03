import {notFound} from 'next/navigation';
import {works} from '@/lib/catalogue';
import {LibraryApp} from '@/components/library';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{path?:string[]}>}){const {path=[]}=await params;const valid=path.length===0||['saved','authors','collections','downloads','about','account','admin'].includes(path[0])&&path.length===1||['book','read','collection'].includes(path[0])&&path.length===2||(path[0]==='shamela'&&(path.length>=1&&path.length<=3));if(!valid)notFound();return <LibraryApp path={path} initialBooks={await works()}/>;}
