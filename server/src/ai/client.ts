import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
