export function normalizeArabic(value:string):string{return value.normalize('NFC').replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().toLowerCase();}
export function plainText(value:string):string{return value.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
export function likePattern(value:string){return `%${value.replace(/[!%_]/g,'!$&')}%`;}
