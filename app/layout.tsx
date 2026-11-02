import type {Metadata} from 'next';
import '../src/styles.css';
import './library.css';
export const metadata:Metadata={title:{default:'كتاب | المكتبة الإسلامية',template:'%s | كتاب'},description:'مكتبة عربية للبحث والقراءة مع توثيق الطبعات والمصادر',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body>{children}</body></html>;}
