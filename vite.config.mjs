import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{port:43910,proxy:{'/api':'http://127.0.0.1:43911','/health':'http://127.0.0.1:43911'}},build:{outDir:'dist',sourcemap:false,chunkSizeWarningLimit:900}});
