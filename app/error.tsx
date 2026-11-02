'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="empty"><h1>تعذّر فتح المكتبة</h1><p>تحقّق من اتصال قاعدة البيانات ثم حاول مجدداً.</p><button className="primary" onClick={reset}>إعادة المحاولة</button></main>;}
