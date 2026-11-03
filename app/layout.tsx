import type {Metadata} from 'next';
import '../src/styles.css';
import './library.css';
export const metadata:Metadata={title:{default:'كِتاب | المكتبة الإسلامية الرقمية',template:'%s | كِتاب'},description:'مكتبة إسلامية رقمية شاملة تجمع أمهات الكتب، التفاسير، الحديث، والفقه، مع توثيق الطبعات والمصادر وقراءة تفاعلية.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Scheherazade+New:wght@400;700&family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
