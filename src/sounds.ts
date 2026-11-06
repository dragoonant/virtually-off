// sounds.html: every generated track, effect and announcer line, to judge by ear (KB rule 9).
const base = import.meta.env.BASE_URL + 'assets/audio/'
const root = document.getElementById('sounds')!
document.body.style.cssText = 'background:#070a12;color:#cfe8ff;font:15px/1.4 system-ui,sans-serif;margin:24px'
root.innerHTML = '<h1 style="font-weight:600;letter-spacing:.08em">VIRTUALLY OFF · SOUNDS</h1><p>Every file the game plays. Generated locally; not verified by ear until the owner listens.</p>'
fetch(base + 'manifest.json')
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((m: Record<string, Record<string, string | { file: string }>>) => {
    for (const group of ['music', 'sfx', 'voice']) {
      const entries = Object.entries(m[group] ?? {})
      const sec = document.createElement('section')
      sec.innerHTML = `<h2 style="color:#5ff2ff">${group.toUpperCase()} (${entries.length})</h2>`
      for (const [name, v] of entries) {
        const file = typeof v === 'string' ? v : v.file
        const row = document.createElement('div')
        row.style.cssText = 'display:flex;align-items:center;gap:12px;margin:4px 0'
        row.innerHTML = `<code style="width:160px">${name}</code><audio controls preload="none" src="${base + file}"></audio><span style="opacity:.6">${file}</span>`
        sec.appendChild(row)
      }
      root.appendChild(sec)
    }
  })
  .catch(() => { root.innerHTML += '<p style="color:#ffb547">No audio manifest yet (public/assets/audio/manifest.json).</p>' })
