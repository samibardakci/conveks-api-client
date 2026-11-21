import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { exampleRequest } from './fixtures.mjs';

export class Store {
  constructor(file) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(
      'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(kind,id))',
    );
    this.secrets = new Map();
    if (!this.list('profiles').length)
      this.put('profiles', { id: 'local', name: 'Yerel Conveks', url: 'http://localhost:8095' });
    if (!this.list('scenarios').length)
      this.put('scenarios', {
        id: 'izmir',
        name: 'İzmir · saha bakım',
        description: '2 ekip, 4 iş. Acil iş, geç vardiya ve yetkinlik eksikliği.',
        request: exampleRequest(),
      });
    for (const run of this.list('runs'))
      if (['queued', 'running'].includes(run.status))
        this.put('runs', {
          ...run,
          status: 'interrupted',
          error:
            'Yerel sunucu yeniden başlatıldı. Plan kimliği varsa yeniden sorgulayın; yoksa aynı anahtar ve gövdeyle tekrar deneyin.',
        });
  }
  list(kind) {
    return this.db
      .prepare('SELECT body FROM records WHERE kind=? ORDER BY rowid DESC')
      .all(kind)
      .map((r) => JSON.parse(r.body));
  }
  get(kind, id) {
    if (typeof id !== 'string') return null;
    const r = this.db.prepare('SELECT body FROM records WHERE kind=? AND id=?').get(kind, id);
    return r ? JSON.parse(r.body) : null;
  }
  put(kind, value) {
    const saved = { ...value, id: value.id || randomUUID(), updatedAt: new Date().toISOString() };
    this.db
      .prepare(
        'INSERT INTO records(kind,id,body) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body',
      )
      .run(kind, saved.id, JSON.stringify(saved));
    return saved;
  }
  delete(kind, id) {
    this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id);
  }
  profile(id) {
    const p = this.get('profiles', id);
    return (
      p && { ...p, key: this.secrets.get(id) || (id === 'local' ? process.env.CONVEKS_KEY : '') }
    );
  }
  publicProfiles() {
    return this.list('profiles').map((p) => ({ ...p, hasKey: Boolean(this.profile(p.id)?.key) }));
  }
  close() {
    this.db.close();
  }
}
