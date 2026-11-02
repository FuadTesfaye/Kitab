export type SourceId='internet-archive'|'openiti'|'turath'|'shamela'|'waqfeya'|'prophet-mosque'|'local';
export type RightsStatus='pending-review'|'public-domain-verified'|'open-license'|'permission-granted'|'link-only'|'personal-use-only'|'restricted';
export interface RemoteFile {name:string;format:'pdf'|'txt'|'json'|'markdown'|'docx'|'epub';url:string;checksum?:string}
export interface RemoteBook {externalId:string;title:string;authors:string[];categories:string[];description?:string;sourceUrl:string;revision:string;publisher?:string;editor?:string;year?:number;licenseUrl?:string;rightsHint?:string;files:RemoteFile[];raw?:unknown}
export interface Page {seq:number;part?:string;pageNo?:string;body:string;footnotes?:string}
export interface Section {title:string;seq:number;parent?:number}
export interface BookContent {pages:Page[];sections:Section[];files?:RemoteFile[]}
export interface Provider {id:SourceId;discover(cursor?:string):Promise<{books:RemoteBook[];nextCursor?:string;revision?:string}>;getBook(id:string):Promise<RemoteBook>;fetchContent(book:RemoteBook):Promise<BookContent>}
export interface Work {id:string;title:string;author:string;fullAuthor:string;death:number|null;category:string;color:string;description:string;topics:string[];chapters:string[];subtitle?:string;editions?:Edition[]}
export interface Edition {id:string;work_id:string;source_id:SourceId;external_id:string;revision:string;publisher:string;editor:string;publication_year:number|null;status:string;created_at:string;page_count:number;source_url:string;rights_status?:RightsStatus;license_url?:string;attribution?:string}
export interface User {id:string;name:string;email:string;role:'student'|'teacher'|'admin'}
