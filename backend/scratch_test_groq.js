import dotenv from 'dotenv';
import { analyzeEmail } from './services/gemini.js';

dotenv.config();

console.log('Testing Groq AI connection...');
const result = await analyzeEmail(
  'I hate you',
  'Theshan Akila <akilatheshan23@gmail.com>',
  'I hate you'
);
console.log('Result:', JSON.stringify(result, null, 2));
