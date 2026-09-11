/* The Talent Tent — Supabase-stub voor de vaste testset (TT-231, laag 1).
   Vervangt de Supabase-bibliotheek van het CDN tijdens een test. Wordt door
   Playwright voor de echte bibliotheek in de plaats gezet; index.html is
   hiervoor niet gewijzigd.

   Dit bestand hoort NOOIT door index.html geladen te worden in productie.
   Het staat in tests/ zodat het versiebeheer heeft en elke sessie meekomt.

   Besturing vanuit een test, via window.TT_STUB:
     TT_STUB.data          vaste testdata per tabel
     TT_STUB.calls         elke aanroep, op volgorde
     TT_STUB.errors        { 'tabel.kolom': {code,message} } dwingt een fout af
     TT_STUB.rpcErrors     { 'functienaam': {code,message} }
     TT_STUB.session       null of een sessie-object (ingelogd)
*/
(function () {
  'use strict';

  const TT_STUB = {
    calls: [],
    errors: {},
    rpcErrors: {},
    session: null,
    data: {
      musicians: [
        { id: 'm1', user_id: 'u1', username: 'ronnie', first_name: 'Ronald', lname: 'Wever',
          city: 'Den Haag', postcode: '2497', bio: 'Test', avatar_url: null,
          city_source: 'pdok', profile_complete: true, rehearsal_frequency: null, musical_ambition: null },
        { id: 'm2', user_id: 'u2', username: 'dylan', first_name: 'Dylan', lname: 'de Vries',
          city: 'Delft', postcode: '2611', bio: '', avatar_url: null,
          city_source: 'pdok', profile_complete: true, rehearsal_frequency: null, musical_ambition: null },
        { id: 'm3', user_id: 'u3', username: 'sanne', first_name: 'Sanne', lname: 'Bakker',
          city: 'Rijswijk', postcode: '2282', bio: '', avatar_url: null,
          city_source: 'manual', profile_complete: true, rehearsal_frequency: null, musical_ambition: null }
      ],
      bands: [
        { id: 'b1', name: 'Van Delft', city: 'Delft', postcode: '2611', status: 'Zoekend naar leden',
          niveau: 3, description: '', photo_url: null, city_source: 'pdok' },
        { id: 'b2', name: 'Silver Earring', city: 'Hoorn', postcode: '1621', status: 'Compleet',
          niveau: 4, description: '', photo_url: null, city_source: 'pdok' }
      ],
      band_members: [
        { band_id: 'b1', musician_id: 'm1', role: 'Oprichter', status: 'bevestigd',
          founder_offer: null, founder_offer_at: null },
        { band_id: 'b1', musician_id: 'm2', role: 'Lid', status: 'bevestigd',
          founder_offer: null, founder_offer_at: null },
        { band_id: 'b2', musician_id: 'm3', role: 'Oprichter', status: 'bevestigd',
          founder_offer: null, founder_offer_at: null }
      ],
      musician_instruments: [
        { musician_id: 'm1', instrument: 'Drums', niveau: 3 },
        { musician_id: 'm2', instrument: 'Gitaar', niveau: 2 },
        { musician_id: 'm3', instrument: 'Zang', niveau: 4 }
      ],
      musician_genres: [
        { musician_id: 'm1', genre: 'Rock' },
        { musician_id: 'm2', genre: 'Rock' },
        { musician_id: 'm3', genre: 'Pop' }
      ],
      musician_songs: [], musician_media: [], musician_wanted: [],
      band_wanted: [{ band_id: 'b1', instrument: 'Bas' }],
      messages: [], postcode_cache: [], media: [], app_error_log: []
    },
    rpcResults: {
      tt_search_musicians: [], tt_search_musicians_anon: [],
      tt_search_musicians_by_songlist_anon: [], tt_search_bands_for_musician: [],
      tt_search_bands_anon: [], tt_get_musicians_public: [], tt_get_bands_public: [],
      tt_musician_distances: [], tt_musicians_ages: [], tt_get_my_birth_date: null,
      tt_resolve_search_origin: null, tt_check_username_available: true,
      tt_cache_postcode: null, tt_accept_founder_offer: null,
      tt_expire_old_founder_offers: null
    },
    reset() { this.calls = []; this.errors = {}; this.rpcErrors = {}; }
  };
  window.TT_STUB = TT_STUB;

  const clone = (v) => (v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)));

  /* Een afgedwongen fout geldt voor een tabel ('band_members') of voor een
     tabel plus kolom ('band_members.founder_offer'). Zo is TT-229 exact na te
     bootsen zonder de rest van de app te raken. */
  function forcedError(table, columns) {
    if (TT_STUB.errors[table]) return TT_STUB.errors[table];
    const cols = String(columns || '');
    for (const key of Object.keys(TT_STUB.errors)) {
      const dot = key.indexOf('.');
      if (dot < 0) continue;
      if (key.slice(0, dot) !== table) continue;
      const col = key.slice(dot + 1);
      if (cols === '*' || cols.indexOf(col) >= 0) return TT_STUB.errors[key];
    }
    return null;
  }

  class Query {
    constructor(table) {
      this.table = table;
      this.op = 'select';
      this.columns = '*';
      this.payload = null;
      this.filters = [];
      this.singleMode = null;
      this.limitN = null;
    }
    select(cols) { if (this.op === 'select') this.columns = cols || '*'; else this.columns = cols || '*'; return this; }
    insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
    update(vals) { this.op = 'update'; this.payload = vals; return this; }
    upsert(rows) { this.op = 'upsert'; this.payload = rows; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.filters.push({ t: 'eq', c, v }); return this; }
    neq(c, v) { this.filters.push({ t: 'neq', c, v }); return this; }
    in(c, v) { this.filters.push({ t: 'in', c, v }); return this; }
    is(c, v) { this.filters.push({ t: 'is', c, v }); return this; }
    gt(c, v) { this.filters.push({ t: 'gt', c, v }); return this; }
    gte(c, v) { this.filters.push({ t: 'gte', c, v }); return this; }
    lt(c, v) { this.filters.push({ t: 'lt', c, v }); return this; }
    lte(c, v) { this.filters.push({ t: 'lte', c, v }); return this; }
    or() { return this; }
    contains() { return this; }
    ilike() { return this; }
    not() { return this; }
    order() { return this; }
    range() { return this; }
    limit(n) { this.limitN = n; return this; }
    single() { this.singleMode = 'single'; return this; }
    maybeSingle() { this.singleMode = 'maybe'; return this; }

    _rows() {
      let rows = clone(TT_STUB.data[this.table] || []);
      for (const f of this.filters) {
        rows = rows.filter((r) => {
          const val = r[f.c];
          if (f.t === 'eq') return val === f.v;
          if (f.t === 'neq') return val !== f.v;
          if (f.t === 'in') return (f.v || []).indexOf(val) >= 0;
          if (f.t === 'is') return val === f.v;
          if (f.t === 'gt') return val > f.v;
          if (f.t === 'gte') return val >= f.v;
          if (f.t === 'lt') return val < f.v;
          if (f.t === 'lte') return val <= f.v;
          return true;
        });
      }
      if (this.limitN !== null) rows = rows.slice(0, this.limitN);
      return rows;
    }

    _run() {
      TT_STUB.calls.push({
        kind: 'table', table: this.table, op: this.op,
        columns: this.columns, filters: clone(this.filters)
      });
      const err = forcedError(this.table, this.columns);
      if (err) return { data: null, error: clone(err) };

      if (this.op === 'select') {
        const rows = this._rows();
        if (this.singleMode === 'single') {
          if (rows.length !== 1) {
            return { data: null, error: { code: 'PGRST116', message: 'geen of meerdere rijen', details: null, hint: null } };
          }
          return { data: rows[0], error: null };
        }
        if (this.singleMode === 'maybe') return { data: rows[0] || null, error: null };
        return { data: rows, error: null };
      }
      if (this.op === 'insert' || this.op === 'upsert') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        TT_STUB.data[this.table] = (TT_STUB.data[this.table] || []).concat(clone(rows));
        const out = clone(rows);
        if (this.singleMode) return { data: out[0] || null, error: null };
        return { data: out, error: null };
      }
      if (this.op === 'update') {
        const target = this._rows();
        const all = TT_STUB.data[this.table] || [];
        for (const row of all) {
          if (target.some((t) => JSON.stringify(t) === JSON.stringify(row))) Object.assign(row, clone(this.payload));
        }
        const out = clone(target).map((r) => Object.assign(r, clone(this.payload)));
        if (this.singleMode) return { data: out[0] || null, error: null };
        return { data: out, error: null };
      }
      if (this.op === 'delete') {
        const target = this._rows();
        TT_STUB.data[this.table] = (TT_STUB.data[this.table] || []).filter(
          (r) => !target.some((t) => JSON.stringify(t) === JSON.stringify(r))
        );
        return { data: clone(target), error: null };
      }
      return { data: null, error: null };
    }

    then(onOk, onErr) { return Promise.resolve().then(() => this._run()).then(onOk, onErr); }
    catch(fn) { return this.then(undefined, fn); }
    finally(fn) { return this.then().finally(fn); }
  }

  function createClient() {
    return {
      from(table) { return new Query(table); },
      rpc(name, params) {
        TT_STUB.calls.push({ kind: 'rpc', name, params: clone(params || null) });
        const err = TT_STUB.rpcErrors[name];
        if (err) return Promise.resolve({ data: null, error: clone(err) });
        const has = Object.prototype.hasOwnProperty.call(TT_STUB.rpcResults, name);
        if (has && typeof TT_STUB.rpcResults[name] === 'function') {
          // Een functie mag op de parameters reageren — nodig om bijvoorbeeld
          // een straal-afhankelijk antwoord na te bootsen (TT-62).
          return Promise.resolve({ data: clone(TT_STUB.rpcResults[name](params || {})), error: null });
        }
        if (!has) {
          return Promise.resolve({
            data: null,
            error: { code: 'PGRST202', message: 'Could not find the function public.' + name, details: null, hint: null }
          });
        }
        return Promise.resolve({ data: clone(TT_STUB.rpcResults[name]), error: null });
      },
      auth: {
        getSession() { return Promise.resolve({ data: { session: clone(TT_STUB.session) }, error: null }); },
        getUser() {
          const s = TT_STUB.session;
          return Promise.resolve({ data: { user: s ? clone(s.user) : null }, error: null });
        },
        onAuthStateChange(cb) {
          TT_STUB.authCallback = cb;
          return { data: { subscription: { unsubscribe() {} } } };
        },
        signInWithPassword(creds) {
          TT_STUB.calls.push({ kind: 'auth', name: 'signInWithPassword', email: creds && creds.email });
          if (TT_STUB.authError) return Promise.resolve({ data: { session: null, user: null }, error: clone(TT_STUB.authError) });
          TT_STUB.session = { user: { id: 'u1', email: (creds && creds.email) || 'test@talenttent.org' } };
          return Promise.resolve({ data: { session: clone(TT_STUB.session), user: clone(TT_STUB.session.user) }, error: null });
        },
        signUp(creds) {
          TT_STUB.calls.push({ kind: 'auth', name: 'signUp', email: creds && creds.email });
          TT_STUB.session = { user: { id: 'u9', email: (creds && creds.email) || 'nieuw@talenttent.org' } };
          return Promise.resolve({ data: { session: clone(TT_STUB.session), user: clone(TT_STUB.session.user) }, error: null });
        },
        signOut() { TT_STUB.session = null; TT_STUB.calls.push({ kind: 'auth', name: 'signOut' }); return Promise.resolve({ error: null }); },
        updateUser() { return Promise.resolve({ data: { user: null }, error: null }); },
        resetPasswordForEmail() { return Promise.resolve({ data: {}, error: null }); }
      },
      storage: {
        from() {
          return {
            upload() { return Promise.resolve({ data: { path: 'test.jpg' }, error: null }); },
            remove() { return Promise.resolve({ data: [], error: null }); },
            getPublicUrl(p) { return { data: { publicUrl: 'https://example.invalid/' + p } }; }
          };
        }
      }
    };
  }

  window.supabase = { createClient };
})();
