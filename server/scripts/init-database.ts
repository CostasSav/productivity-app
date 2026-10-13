import path from 'path';

// Deliberately no dotenv/default directory: the operator must choose the target.
async function main() {
  const directory = process.argv[2];
  if (!directory || !path.isAbsolute(directory) || process.argv.length !== 3) {
    throw new Error('Usage: npm run db:init -w server -- <absolute-existing-empty-data-directory>');
  }
  process.env.DATA_DIR = directory;
  const { initializeDatabase } = await import('../src/db/database');
  initializeDatabase();
  console.log('New database initialized. No existing file was replaced.');
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Database initialization failed');
  process.exitCode = 1;
});
