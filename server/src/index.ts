import { pool } from './db.ts';
import { runMigrations } from './migrate.ts';
import { createApp } from './app.ts';

const applied = await runMigrations(pool);
if (applied.length > 0) console.log(`Applied migrations: ${applied.join(', ')}`);

const port = Number(process.env.PORT ?? 3000);
createApp().listen(port, () => console.log(`Listening on :${port}`));
