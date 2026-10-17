(() => {
const $ = id => document.getElementById(id);
const audio = $('audio');
let tracks = [], queue = [], index = -1, shuffle = false, repeat = 0, favorites = new Set();
const fmt = n => { if (!Number.isFinite(n) || n < 0) n = 0; return Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0'); };
async function load() {
  $('status').textContent = 'Loading tracks…';
  try {
    const r = await fetch('/api/tracks'); if (!r.ok) throw Error();
    const d = await r.json(); tracks = d.tracks || []; queue = tracks.map((_,i)=>i);
    $('track-count').textContent = tracks.length + (tracks.length === 1 ? ' track' : ' tracks');
    $('status').textContent = tracks.length ? '' : 'Your library is empty. Upload or re-send audio to your Telegram group, then open Admin → Sync.';
    render();
  } catch { $('status').textContent = 'Could not connect to the server. Check deployment and environment settings.'; }
}
function render() {
  const q = $('search').value.toLowerCase().trim();
  const shown = tracks.map((t,i)=>({...t,i})).filter(t => (t.title+' '+t.artist).toLowerCase().includes(q));
  $('tracks').innerHTML = shown.map(t => `<button class="track ${t.i===index?'active':''}" data-index="${t.i}"><span class="track-art">${t.i===index?'♫':'♪'}</span><span class="track-info"><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(t.artist || 'Telegram Library')}</small></span><span class="track-duration">${fmt(t.duration)}</span><span class="track-play">▶</span></button>`).join('');
  $('tracks').querySelectorAll('[data-index]').forEach(b=>b.addEventListener('click',()=>play(Number(b.dataset.index))));
}
function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function play(i) {
  if (!tracks.length) return;
  index = (i+tracks.length)%tracks.length; const t=tracks[index];
  $('now-title').textContent=t.title; $('now-sub').textContent=t.artist||'Telegram Library'; $('cover').textContent='♫';
  audio.src='/api/stream/'+encodeURIComponent(t.id); audio.load();
  try { await audio.play(); $('play').textContent='Ⅱ'; } catch { $('play').textContent='▶'; $('status').textContent='Tap play again to start audio.'; }
  render();
}
$('play').addEventListener('click',()=>{if(index<0){if(tracks.length)play(0);return;} if(audio.paused)audio.play().then(()=>$('play').textContent='Ⅱ').catch(()=>{});else{audio.pause();$('play').textContent='▶';}});
$('next').addEventListener('click',next); $('prev').addEventListener('click',()=>play(index<=0?tracks.length-1:index-1));
function next(){if(!tracks.length)return;if(shuffle&&tracks.length>1){let n=index;while(n===index)n=Math.floor(Math.random()*tracks.length);play(n);}else play(index+1);}
audio.addEventListener('ended',()=>{if(repeat===1){audio.currentTime=0;audio.play();}else if(index<tracks.length-1||repeat===2)next();else $('play').textContent='▶';});
$('shuffle').addEventListener('click',()=>{shuffle=!shuffle;$('shuffle').classList.toggle('selected',shuffle);});
$('repeat').addEventListener('click',()=>{repeat=(repeat+1)%3;$('repeat').classList.toggle('selected',repeat!==0);$('repeat').title=['Repeat off','Repeat one','Repeat all'][repeat];$('repeat').textContent=repeat===1?'↻¹':'↻';});
$('seek').addEventListener('input',()=>{if(audio.duration)audio.currentTime=(Number($('seek').value)/100)*audio.duration;});
audio.addEventListener('timeupdate',()=>{if(audio.duration){$('seek').value=audio.currentTime/audio.duration*100;$('current-time').textContent=fmt(audio.currentTime);$('duration').textContent=fmt(audio.duration);}});
$('volume').addEventListener('input',()=>audio.volume=Number($('volume').value)); audio.volume=.8;
$('search').addEventListener('input',render); $('refresh').addEventListener('click',load);
$('like').addEventListener('click',()=>{if(index<0)return;const id=tracks[index].id;if(favorites.has(id))favorites.delete(id);else favorites.add(id);$('like').textContent=favorites.has(id)?'♥':'♡';$('like').classList.toggle('selected',favorites.has(id));});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('search').focus();}if(e.code==='Space'&&document.activeElement.tagName!=='INPUT'){e.preventDefault();$('play').click();}});
load();
})();