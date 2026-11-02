import type { NextConfig } from 'next';
const config: NextConfig = { output:'standalone',outputFileTracingRoot:process.cwd(), poweredByHeader:false, serverExternalPackages:['pg'], experimental:{cpus:1,useTypeScriptCli:false,webpackBuildWorker:false,workerThreads:true}, async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'SAMEORIGIN'}]}];} };
export default config;
