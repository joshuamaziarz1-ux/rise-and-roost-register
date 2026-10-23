import { build } from 'esbuild';
await build({ stdin: { contents: "import * as supabase from '@supabase/supabase-js'; window.supabase=supabase;", resolveDir: process.cwd() }, bundle:true, minify:true, format:'iife', platform:'browser', outfile:'vendor/supabase.js', legalComments:'eof' });
