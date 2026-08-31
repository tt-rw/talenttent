// ─── profiel-gedeeld.js ───────────────────────────────────────────────────
// TT-168. Eén bron voor functies die zowel profiel-v2.html als (later, na
// akkoord) index.html gebruiken — geen dubbele versies van dezelfde functie.
// Verwacht een globale Supabase-client met de naam `db`, aangemaakt door het
// bestand dat dit script laadt, vóórdat een van onderstaande functies wordt
// aangeroepen.

// ─── Meldingen ────────────────────────────────────────────────────────────

let toastTimer;
function showToast(msg, duration) {
  const el = document.getElementById('appToast');
  if (!el) { console.warn('Toast:', msg); return; }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), duration || 3500);
}

// Zelfde vertaling als in index.html — technische Supabase-/netwerkfouten
// worden begrijpelijke NL-tekst. Zie index.html voor de volledige lijst; hier
// alleen de gevallen die in profiel-v2.html kunnen voorkomen.
function friendlyErrorMessage(err) {
  const msg = (err && err.message) ? err.message : String(err || '');
  console.error('Technische foutmelding:', msg);
  if (/failed to fetch|network|networkerror/i.test(msg)) {
    return 'Geen verbinding kunnen maken. Controleer je internetverbinding en probeer het opnieuw.';
  }
  if (/JWT|token|session|auth/i.test(msg)) {
    return 'Je sessie is verlopen. Log opnieuw in en probeer het nog eens.';
  }
  if (/duplicate key|unique constraint/i.test(msg)) {
    return 'Dit bestaat al. Kies een andere naam en probeer het opnieuw.';
  }
  if (/permission denied|rls/i.test(msg)) {
    return 'Je hebt geen toestemming voor deze actie.';
  }
  return 'Er ging iets mis. Probeer het opnieuw.';
}

// ─── Tekst-veiligheid (zelfde functies als index.html) ───────────────────

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}
function escAttr(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ');
}
function jsAttr(s) { return escHtml(escAttr(s)); }
function likeSafe(s) {
  return String(s ?? '').replace(/[%_*\\]/g, ' ').replace(/\s+/g, ' ').trim();
}
function orValue(s) {
  return '"' + String(s ?? '').replace(/["\\]/g, '') + '"';
}

// ─── Datum ─────────────────────────────────────────────────────────────────

function formatBirthDate(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 8);
  if (v.length >= 5) v = v.slice(0,2) + '-' + v.slice(2,4) + '-' + v.slice(4);
  else if (v.length >= 3) v = v.slice(0,2) + '-' + v.slice(2);
  input.value = v;
}
function toISODate(ddmmyyyy) {
  const [dd, mm, yyyy] = ddmmyyyy.split('-');
  return `${yyyy}-${mm}-${dd}`;
}
function fromISODate(iso) {
  if (!iso) return '';
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}-${mm}-${yyyy}`;
}

// ─── Plaatsnaam-schrijfwijze (TT-80, zelfde regels als index.html) ───────

function normalizeCityName(city) {
  const ALTIJD_KLEIN = new Set(["'s", "'t", "’s", "’t"]);
  const KLEIN_TENZIJ_EERSTE_WOORD = new Set(['aan','de','den','der','het','in','onder','op','over','te','ten','ter','van','bij']);
  return city
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (ALTIJD_KLEIN.has(word)) return word;
      if (i > 0 && KLEIN_TENZIJ_EERSTE_WOORD.has(word)) return word;
      let result;
      if (/^('s-|’s-|'t-|’t-)/.test(word)) {
        result = word.slice(0, 3) + word.slice(3).replace(/\b\w/g, c => c.toUpperCase());
      } else {
        result = word.replace(/\b\w/g, c => c.toUpperCase());
      }
      return result.replace(/\bIj/g, 'IJ');
    })
    .join(' ');
}
const CITY_NAME_EXCEPTIONS = {
  "'s-gravenhage": 'Den Haag', "s gravenhage": 'Den Haag', "s-gravenhage": 'Den Haag', "den haag": 'Den Haag',
  "'s-hertogenbosch": 'Den Bosch', "s hertogenbosch": 'Den Bosch', "s-hertogenbosch": 'Den Bosch', "den bosch": 'Den Bosch',
};
function pickDisplayCity(officialCity, altField) {
  const key = (officialCity || '').toLowerCase().replace(/[’']/g, "'").trim();
  if (CITY_NAME_EXCEPTIONS[key]) return CITY_NAME_EXCEPTIONS[key];
  return normalizeCityName(officialCity || '');
}

// ─── Postcode → plaats (PDOK, met terugval op de cache) ──────────────────
// Zelfde bron en dezelfde tt_cache_postcode/tt_check_username_available
// RPC's als index.html — geen aparte, nieuwe databaselogica.

function lookupPostcodeCity(normalized) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  return (async () => {
    try {
      const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?fq=postcode:${normalized}*&fq=type:postcode&fl=woonplaatsnaam,postcode&rows=1`;
      const res  = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('PDOK niet bereikbaar');
      const data = await res.json();
      const doc  = data?.response?.docs?.[0];
      if (doc?.woonplaatsnaam) {
        const { data: alt } = await db.from('postcode_cache').select('alternatieve_schrijfwijzen').eq('postcode', normalized).maybeSingle();
        const displayCity = pickDisplayCity(doc.woonplaatsnaam, alt?.alternatieve_schrijfwijzen);
        const officialName = doc.woonplaatsnaam;
        const altList = (alt?.alternatieve_schrijfwijzen || '').split(';').map(s => s.trim()).filter(Boolean);
        if (officialName.toLowerCase() !== displayCity.toLowerCase()
            && !altList.some(a => a.toLowerCase() === officialName.toLowerCase())) {
          altList.push(officialName);
        }
        db.rpc('tt_cache_postcode', {
          p_postcode: normalized,
          p_city: displayCity,
          p_alt: altList.join(';') || null
        }).then(() => {}).catch(() => {});
        return { found: true, city: displayCity, source: 'pdok' };
      }
      const { data: cachedNF } = await db.from('postcode_cache').select('city, alternatieve_schrijfwijzen').eq('postcode', normalized).maybeSingle();
      if (cachedNF?.city) return { found: true, city: pickDisplayCity(cachedNF.city, cachedNF.alternatieve_schrijfwijzen), source: 'cache' };
      return { found: false, reason: 'notfound' };
    } catch (e) {
      clearTimeout(timer);
      try {
        const { data: cached } = await db.from('postcode_cache').select('city, alternatieve_schrijfwijzen').eq('postcode', normalized).maybeSingle();
        if (cached?.city) return { found: true, city: pickDisplayCity(cached.city, cached.alternatieve_schrijfwijzen), source: 'cache' };
      } catch (e2) { }
      return { found: false, reason: 'error' };
    }
  })();
}

const citySuggestCache = new Map();
async function searchCitySuggestions(q) {
  const cacheKey = q.toLowerCase();
  if (citySuggestCache.has(cacheKey)) return citySuggestCache.get(cacheKey);
  const pattern = orValue('%' + likeSafe(q) + '%');
  const { data, error } = await db.from('postcode_cache')
    .select('city, alternatieve_schrijfwijzen')
    .or(`city.ilike.${pattern},alternatieve_schrijfwijzen.ilike.${pattern}`)
    .limit(50);
  if (error) return [];
  const seen = new Set();
  const names = [];
  (data || []).forEach(row => {
    const display = pickDisplayCity(row.city, row.alternatieve_schrijfwijzen);
    const key = display.toLowerCase();
    if (display && !seen.has(key)) { seen.add(key); names.push(display); }
  });
  names.sort((a, b) => a.localeCompare(b, 'nl'));
  const top = names.slice(0, 8);
  citySuggestCache.set(cacheKey, top);
  return top;
}

// ─── Gebruikersnaam ────────────────────────────────────────────────────────

function usernameFormatValid(u) {
  return /^[A-Za-z0-9_]{3,20}$/.test(u);
}
const RESERVED_USERNAME_WORDS = [
  'admin', 'administrator', 'beheer', 'beheerder', 'moderator', 'moderatie', 'mod',
  'support', 'helpdesk', 'klantenservice', 'systeem', 'system', 'root', 'owner', 'eigenaar',
  'official', 'officieel', 'staff', 'medewerker', 'team', 'webmaster', 'superuser', 'developer', 'ontwikkelaar',
];
function isReservedUsername(value) {
  const v = value.toLowerCase();
  if (v.includes('talent') && v.includes('tent')) return true;
  return RESERVED_USERNAME_WORDS.some(w => v.includes(w));
}
// Roept dezelfde tt_check_username_available-RPC aan als index.html.
async function checkUsernameAvailability(value, excludeId) {
  if (!usernameFormatValid(value)) return { ok: false, reason: 'Alleen letters, cijfers en underscore, 3-20 tekens.' };
  if (isReservedUsername(value)) return { ok: false, reason: 'Deze gebruikersnaam is niet beschikbaar. Kies een andere.' };
  try {
    const { data, error } = await db.rpc('tt_check_username_available', { uname: value, exclude_id: excludeId || null });
    if (error) throw error;
    return data ? { ok: true } : { ok: false, reason: 'Al in gebruik, kies een andere.' };
  } catch (e) {
    return { ok: false, reason: friendlyErrorMessage(e), technical: true };
  }
}

// ─── Bio-prompts (TT-...: aanvullen, niet overschrijven) ─────────────────

function applyBioPrompt(el, text) {
  const current = el.value;
  if (!current.trim()) {
    el.value = text;
  } else {
    const sep = /[\s\n]$/.test(current) ? '' : ' ';
    el.value = current + sep + text;
  }
  el.focus();
  el.setSelectionRange(el.value.length, el.value.length);
  return el.value;
}
