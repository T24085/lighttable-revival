'use strict';
function files(template){
 if(template!=='vite-react-tailwind')throw Error('Unknown project template: '+template);
 return {
  'package.json':JSON.stringify({name:'light-table-web-app',version:'0.1.0',private:true,type:'module',scripts:{dev:'vite',build:'tsc --noEmit && vite build',typecheck:'tsc --noEmit',preview:'vite preview'},dependencies:{react:'19.2.8','react-dom':'19.2.8'},devDependencies:{'@types/react':'19.2.18','@types/react-dom':'19.2.7','@vitejs/plugin-react':'6.1.1',typescript:'6.0.2',vite:'8.3.0',tailwindcss:'4.3.3','@tailwindcss/vite':'4.3.3'}},null,2)+'\n',
  'index.html':'<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your new app</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
  'vite.config.ts':"import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport tailwindcss from '@tailwindcss/vite';\nexport default defineConfig({ plugins: [react(), tailwindcss()] });\n",
  'tsconfig.json':JSON.stringify({compilerOptions:{target:'ES2022',lib:['ES2022','DOM','DOM.Iterable'],module:'ESNext',moduleResolution:'Bundler',jsx:'react-jsx',strict:true,skipLibCheck:true,noEmit:true,types:['vite/client']},include:['src']},null,2)+'\n',
  'src/main.tsx':"import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\nimport './style.css';\ncreateRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);\n",
  'src/App.tsx':`import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <main className="min-h-screen bg-emerald-950 text-white flex items-center justify-center p-6">
      <section className="w-full max-w-xl rounded-3xl border border-emerald-700 p-8 md:p-12">
        <h1 className="text-4xl font-bold tracking-tight">Ready to build</h1>
        <p className="mt-4 text-emerald-200">Your React app is ready. Make it your own.</p>
        <div className="mt-8 flex items-center gap-4">
          <button
            id="increment"
            className="rounded-xl bg-emerald-300 px-5 py-3 font-semibold text-emerald-950 hover:bg-emerald-200"
            onClick={() => setCount(value => value + 1)}
          >
            Increment
          </button>
          <output id="count" aria-live="polite">{count}</output>
        </div>
      </section>
    </main>
  );
}
`,
  'src/style.css':'@import "tailwindcss";\n',
  '.gitignore':'node_modules/\ndist/\n',
  'README.md':'# Vite + React + Tailwind\n\nRequires Node 24+. Run `npm install`, then `npm run build` to type-check and build. Run `npm run dev -- --host 127.0.0.1` and preview its printed loopback URL in Light Table.\n\nTailwind v4 is configured through `@tailwindcss/vite` and the CSS import. No `tailwindcss init` command is needed. Edit `src/App.tsx` and save to see live updates.\n'
 };
}
module.exports={files};
