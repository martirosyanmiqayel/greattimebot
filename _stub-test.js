// Stub better-sqlite3 (native build blocked in sandbox) so we can load real code.
const Module = require('module');
const origResolve = Module._resolveFilename;
const fakeDb = () => {
  const stmt = { get: () => undefined, all: () => [], run: () => ({ lastInsertRowid: 1, changes: 0 }) };
  return { pragma(){}, exec(){}, prepare(){ return stmt; } };
};
const orig = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'better-sqlite3') return function(){ return fakeDb(); };
  return orig.apply(this, arguments);
};

const fs = require('fs');
const path = require('path');

// --- load DB layer (logic runs against stub) ---
const db = require('./shared/db');
const s = db.getSettings('123');
console.log('default settings keys:', Object.keys(s).join(', '));
console.log('automod.punishment default:', s.automod.punishment);

// --- load all commands exactly like deploy-commands.js ---
const names = [];
function push(c){ if (c && c.data && c.execute) names.push(c.data.toJSON().name); }
function collect(dir){
  for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collect(full);
    else if (e.name.endsWith('.js')) { const m = require(full); Array.isArray(m)?m.forEach(push):push(m); }
  }
}
collect(path.join(__dirname, 'bot', 'commands'));
console.log('\ncommands ('+names.length+'):', names.sort().join(' '));

// --- load all events ---
const evNames = [];
function reg(ev){ if (ev && ev.name && ev.execute) evNames.push(ev.name); }
for (const f of fs.readdirSync(path.join(__dirname,'bot','events')).filter(f=>f.endsWith('.js'))) {
  const m = require(path.join(__dirname,'bot','events',f));
  Array.isArray(m)?m.forEach(reg):reg(m);
}
console.log('\nevents ('+evNames.length+'):', evNames.join(' '));
console.log('\nALL MODULES LOADED OK');
