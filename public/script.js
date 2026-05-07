'use strict';

// ── Ganti BASE_URL sesuai domain deploy Vercel kamu ──
// Contoh: const BASE_URL = 'https://zaammusic.vercel.app';
// Untuk local dev biarkan kosong ''
const BASE_URL = '';

/* ─── YouTube IFrame API ─── */
let ytPlayer;
function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('yt-player-container', {
        height: '0',
        width: '0',
        playerVars: {
            playsinline: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
        },
        events: {
            'onStateChange': (event) => {
                // PLAYING
                if (event.data === YT.PlayerState.PLAYING) {
                    State.playing = true;
                    App._setPlayIcon(true);
                    $('fp-art').classList.add('playing');
                    setStreamStatus('', '');
                    // Avvia il tracker del progresso
                    App._startProgressTracker();
                }
                // PAUSED
                if (event.data === YT.PlayerState.PAUSED) {
                    State.playing = false;
                    App._setPlayIcon(false);
                    $('fp-art').classList.remove('playing');
                }
                // ENDED
                if (event.data === YT.PlayerState.ENDED) {
                    $('fp-art').classList.remove('playing');
                    if (State.repeat) {
                        ytPlayer.seekTo(0);
                        ytPlayer.playVideo();
                    } else {
                        App.nextTrack();
                    }
                }
                // BUFFERING
                if (event.data === YT.PlayerState.BUFFERING) {
                    setStreamStatus('loading', '⏳ Buffering...');
                }
            },
            'onError': (event) => {
                console.error('YT Error:', event.data);
                setStreamStatus('error', '❌ Gagal stream');
                toast('Gagal memuat video YouTube. Coba lagu lain.');
                App._setPlayIcon(false);
            }
        }
    });
}

/* ─── DB ─── */
const DB = {
    get(k, fallback = null) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    remove(k) { localStorage.removeItem(k); }
};

/* ─── Utilities ─── */
function $(id) { return document.getElementById(id); }
function fmtTime(s) {
    if (isNaN(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2,'0')}`;
}
function toast(msg, dur = 2500) {
    const t = $('toast');
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(t._tid);
    t._tid = setTimeout(() => { t.style.display = 'none'; }, dur);
}
function greeting() {
    const h = new Date().getHours();
    if (h < 5) return 'Selamat Malam 🌙';
    if (h < 11) return 'Selamat Pagi ☀️';
    if (h < 15) return 'Selamat Siang 🌤';
    if (h < 19) return 'Selamat Sore 🌆';
    return 'Selamat Malam 🌙';
}
function setStreamStatus(mode, text) {
    const el = $('stream-status');
    el.className = mode; // '' | 'loading' | 'error'
    el.textContent = text;
}

/* ─── App State ─── */
const State = {
    queue: [],
    queueIdx: -1,
    playing: false,
    repeat: false,
    shuffle: false,
    currentTrack: null,
    favorites: DB.get('zaam_favorites', []),
    history: DB.get('zaam_history', []),
};

/* ─── Audio ─── */
const audio = $('audio');

/* ─── Main App ─── */
const App = {

    /* ── Navigation ── */
    navigate(page) {
        const pages = ['home','search','library','zaam'];
        pages.forEach(p => {
            $(`page-${p}`).classList.toggle('active', p === page);
            $(`nav-${p}`).classList.toggle('active', p === page);
        });
        if (page === 'library') App.renderLibCounts();
        if (page === 'zaam') App.renderStats();
        if (page !== 'search') {
            $('search-input').value = '';
            $('browse-view').style.display = 'block';
            $('search-results').innerHTML = '';
            $('search-loading').style.display = 'none';
            $('search-clear').style.display = 'none';
        }
    },

    /* ── Home Data ── */
    async loadHome() {
        $('home-greeting').textContent = greeting();
        try {
            const res = await fetch(`${BASE_URL}/api/home`);
            const json = await res.json();
            if (json.status !== 'success') throw new Error(json.message);
            const d = json.data;
            App._renderRecent(d.recent || []);
            App._renderHScroll('home-trending', d.trending || []);
            App._renderHScroll('home-chill', d.chill || []);
            App._renderHScroll('home-galau', d.galau || []);
        } catch (e) {
            console.error('Home load failed:', e);
            ['home-recent','home-trending','home-chill','home-galau'].forEach(id => {
                $(id).innerHTML = '<div class="empty-state"><i class="fas fa-wifi-slash"></i>Gagal memuat. Cek koneksi.</div>';
            });
        }
    },

    _renderRecent(songs) {
        const el = $('home-recent');
        const combined = [...State.history.slice(0,4), ...songs].slice(0,6);
        if (!combined.length) { el.innerHTML = '<div class="empty-state" style="grid-column:span 2"><i class="fas fa-music"></i>Belum ada lagu</div>'; return; }
        el.innerHTML = combined.map(s => `
            <div class="recent-item" onclick="App.play(${JSON.stringify(s).replace(/"/g,'&quot;')}, [])">
                <img src="${s.thumbnail}" onerror="this.src='https://picsum.photos/seed/${s.videoId}/52'">
                <span>${s.title}</span>
            </div>`).join('');
    },

    _renderHScroll(containerId, songs) {
        const el = $(containerId);
        if (!songs.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-music"></i>Kosong</div>'; return; }
        el.innerHTML = songs.map(s => `
            <div class="song-card" onclick="App.play(${JSON.stringify(s).replace(/"/g,'&quot;')}, ${JSON.stringify(songs).replace(/"/g,'&quot;')})">
                <img src="${s.thumbnail}" onerror="this.src='https://picsum.photos/seed/${s.videoId}/130'" loading="lazy">
                <div class="card-title">${s.title}</div>
                <div class="card-sub">${s.artist}</div>
            </div>`).join('');
    },

    /* ── Search ── */
    _searchTimer: null,
    initSearch() {
        const inp = $('search-input');
        const clr = $('search-clear');
        inp.addEventListener('input', () => {
            const q = inp.value.trim();
            clr.style.display = q ? 'block' : 'none';
            clearTimeout(App._searchTimer);
            if (!q) {
                $('browse-view').style.display = 'block';
                $('search-results').innerHTML = '';
                $('search-loading').style.display = 'none';
                return;
            }
            $('browse-view').style.display = 'none';
            App._searchTimer = setTimeout(() => App.searchQuery(q), 450);
        });
        clr.addEventListener('click', () => {
            inp.value = ''; clr.style.display = 'none';
            $('browse-view').style.display = 'block';
            $('search-results').innerHTML = '';
        });
    },

    async searchQuery(q) {
        $('search-input').value = q;
        $('search-clear').style.display = 'block';
        $('browse-view').style.display = 'none';
        $('search-results').innerHTML = '';
        $('search-loading').style.display = 'block';
        App.navigate('search');
        try {
            const res = await fetch(`${BASE_URL}/api/search?query=${encodeURIComponent(q)}`);
            const json = await res.json();
            $('search-loading').style.display = 'none';
            if (json.status !== 'success' || !json.data.length) {
                $('search-results').innerHTML = '<div class="empty-state"><i class="fas fa-search"></i>Tidak ditemukan</div>';
                return;
            }
            const songs = json.data;
            State.queue = songs; State.queueIdx = -1;
            $('search-results').innerHTML = songs.map(s => `
                <div class="song-list-item" onclick="App.play(${JSON.stringify(s).replace(/"/g,'&quot;')}, ${JSON.stringify(songs).replace(/"/g,'&quot;')})">
                    <img class="song-list-img" src="${s.thumbnail}" onerror="this.src='https://picsum.photos/seed/${s.videoId}/50'" loading="lazy">
                    <div class="song-list-meta">
                        <div class="song-list-title">${s.title}</div>
                        <div class="song-list-sub">${s.artist}</div>
                    </div>
                    <i class="fas fa-ellipsis-v song-list-more" onclick="event.stopPropagation();App.songMenu(${JSON.stringify(s).replace(/"/g,'&quot;')})"></i>
                </div>`).join('');
        } catch (e) {
            $('search-loading').style.display = 'none';
            $('search-results').innerHTML = '<div class="empty-state"><i class="fas fa-wifi-slash"></i>Gagal. Cek koneksi.</div>';
        }
    },

    songMenu(song) {
        const isFav = State.favorites.some(f => f.videoId === song.videoId);
        const action = isFav ? 'Hapus dari Favorit' : 'Tambah ke Favorit';
        if (confirm(action + '?\n' + song.title)) {
            if (isFav) {
                State.favorites = State.favorites.filter(f => f.videoId !== song.videoId);
                toast('Dihapus dari Favorit');
            } else {
                State.favorites.unshift(song);
                toast('Ditambah ke Favorit ♥');
            }
            DB.set('zaam_favorites', State.favorites);
        }
    },

    /* ── Player ── */
    play(song, queue = []) {
        State.currentTrack = song;
        if (queue.length) State.queue = queue;
        State.queueIdx = State.queue.findIndex(s => s.videoId === song.videoId);

        // Add to history
        State.history = [song, ...State.history.filter(h => h.videoId !== song.videoId)].slice(0, 20);
        DB.set('zaam_history', State.history);

        // Update UI
        App._updatePlayerUI(song);

        // ══ STREAMING via YouTube IFrame API ══
        setStreamStatus('loading', '⏳ Memuat dari Server...');
        if (ytPlayer && ytPlayer.loadVideoById) {
            ytPlayer.loadVideoById(song.videoId);
            // State.playing akan di-set oleh onStateChange: PLAYING
        } else {
            // ytPlayer belum siap, tunggu sebentar lalu coba lagi
            const waitAndPlay = setInterval(() => {
                if (ytPlayer && ytPlayer.loadVideoById) {
                    clearInterval(waitAndPlay);
                    ytPlayer.loadVideoById(song.videoId);
                }
            }, 300);
        }

        $('mini-player').style.display = 'block';
    },

    _updatePlayerUI(song) {
        $('mini-art').src = song.thumbnail;
        $('mini-title').textContent = song.title;
        $('mini-artist').textContent = song.artist;
        $('fp-art').src = song.thumbnail;
        $('fp-title').textContent = song.title;
        $('fp-artist').textContent = song.artist;
        $('fp-bg').style.background = `linear-gradient(to bottom, #1a3a2a 0%, #0a1a0a 100%)`;

        const isFav = State.favorites.some(f => f.videoId === song.videoId);
        $('fp-heart').className = isFav ? 'fas fa-heart fp-heart' : 'far fa-heart fp-heart';
        $('fp-heart').style.color = isFav ? 'var(--green)' : '';
    },

    togglePlay() {
        if (!State.currentTrack || !ytPlayer) return;
        if (State.playing) {
            ytPlayer.pauseVideo();
            State.playing = false;
            App._setPlayIcon(false);
            $('fp-art').classList.remove('playing');
        } else {
            ytPlayer.playVideo();
            State.playing = true;
            App._setPlayIcon(true);
            $('fp-art').classList.add('playing');
        }
    },

    _setPlayIcon(playing) {
        const icon = playing ? 'fa-pause' : 'fa-play';
        $('mini-play-btn').className = `fas ${icon}`;
        $('fp-play-btn').innerHTML = `<i class="fas ${icon}"></i>`;
    },

    nextTrack() {
        if (!State.queue.length) return;
        let next;
        if (State.shuffle) {
            next = Math.floor(Math.random() * State.queue.length);
        } else {
            next = (State.queueIdx + 1) % State.queue.length;
        }
        State.queueIdx = next;
        App.play(State.queue[next], State.queue);
    },

    prevTrack() {
        if (!State.queue.length) return;
        // Jika sudah lebih dari 3 detik, restart lagu
        const currentTime = ytPlayer ? ytPlayer.getCurrentTime() : 0;
        if (currentTime > 3) {
            if (ytPlayer) ytPlayer.seekTo(0);
            return;
        }
        const prev = (State.queueIdx - 1 + State.queue.length) % State.queue.length;
        State.queueIdx = prev;
        App.play(State.queue[prev], State.queue);
    },

    toggleRepeat() {
        State.repeat = !State.repeat;
        $('fp-repeat').style.color = State.repeat ? 'var(--green)' : '';
        toast(State.repeat ? 'Repeat: ON' : 'Repeat: OFF');
    },

    toggleShuffle() {
        State.shuffle = !State.shuffle;
        $('fp-shuffle').classList.toggle('fp-shuffle-active', State.shuffle);
        toast(State.shuffle ? 'Shuffle: ON' : 'Shuffle: OFF');
    },

    toggleFavorite() {
        if (!State.currentTrack) return;
        const song = State.currentTrack;
        const idx = State.favorites.findIndex(f => f.videoId === song.videoId);
        if (idx >= 0) {
            State.favorites.splice(idx, 1);
            toast('Dihapus dari Favorit');
            $('fp-heart').className = 'far fa-heart fp-heart';
            $('fp-heart').style.color = '';
        } else {
            State.favorites.unshift(song);
            toast('Ditambah ke Favorit ♥');
            $('fp-heart').className = 'fas fa-heart fp-heart';
            $('fp-heart').style.color = 'var(--green)';
        }
        DB.set('zaam_favorites', State.favorites);
    },

    openFullPlayer() {
        $('full-player').classList.add('open');
    },

    closeFullPlayer() {
        $('full-player').classList.remove('open');
    },

    /* ── Library ── */
    renderLibCounts() {
        State.history = DB.get('zaam_history', []);
        State.favorites = DB.get('zaam_favorites', []);
        $('hist-count').textContent = `${State.history.length} lagu diputar`;
        $('fav-count').textContent = `${State.favorites.length} lagu disimpan`;
    },

    openLibCat(cat) {
        State.history = DB.get('zaam_history', []);
        State.favorites = DB.get('zaam_favorites', []);
        const songs = cat === 'history' ? State.history : State.favorites;
        $('lib-detail-title').textContent = cat === 'history' ? '🕓 History' : '♥ Favorit';
        $('lib-hub').style.display = 'none';
        $('lib-detail').style.display = 'block';
        $('lib-detail-list').innerHTML = songs.length
            ? songs.map(s => `
                <div class="song-list-item" onclick="App.play(${JSON.stringify(s).replace(/"/g,'&quot;')}, ${JSON.stringify(songs).replace(/"/g,'&quot;')})">
                    <img class="song-list-img" src="${s.thumbnail}" onerror="this.src='https://picsum.photos/seed/${s.videoId}/50'" loading="lazy">
                    <div class="song-list-meta">
                        <div class="song-list-title">${s.title}</div>
                        <div class="song-list-sub">${s.artist}</div>
                    </div>
                </div>`).join('')
            : '<div class="empty-state"><i class="fas fa-music"></i>Masih kosong</div>';
    },

    closeLibDetail() {
        $('lib-detail').style.display = 'none';
        $('lib-hub').style.display = 'block';
    },

    clearDB() {
        if (!confirm('Hapus semua data history & favorit?')) return;
        DB.remove('zaam_favorites'); DB.remove('zaam_history');
        State.favorites = []; State.history = [];
        App.renderLibCounts();
        toast('Database dihapus');
    },

    /* ── Stats ── */
    renderStats() {
        State.history = DB.get('zaam_history', []);
        State.favorites = DB.get('zaam_favorites', []);
        $('stat-played').textContent = State.history.length;
        $('stat-fav').textContent = State.favorites.length;
    },

    /* ── YouTube Progress Tracker ── */
    _progressTimer: null,
    _startProgressTracker() {
        clearInterval(App._progressTimer);
        App._progressTimer = setInterval(() => {
            if (!ytPlayer || !ytPlayer.getDuration) return;
            const duration = ytPlayer.getDuration();
            const current = ytPlayer.getCurrentTime();
            if (!duration) return;
            const pct = (current / duration) * 100;
            $('mini-fill').style.width = pct + '%';
            $('fp-range').value = pct;
            $('fp-now').textContent = fmtTime(current);
            $('fp-total').textContent = fmtTime(duration);
        }, 500);
    },

    initSeekBar() {
        $('fp-range').addEventListener('input', function() {
            if (ytPlayer && ytPlayer.getDuration) {
                const duration = ytPlayer.getDuration();
                ytPlayer.seekTo((this.value / 100) * duration, true);
            }
        });
    },

    /* ── PWA ── */
    initPWA() {
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', e => {
            e.preventDefault(); deferredPrompt = e;
            $('pwa-btn').onclick = () => { deferredPrompt.prompt(); };
        });
    },

    /* ── Init ── */
    init() {
        $('home-greeting').textContent = greeting();
        App.initSeekBar();
        App.initSearch();
        App.initPWA();
        App.loadHome();
    }
};

document.addEventListener('DOMContentLoaded', App.init);

/* ══════════════════════════════════════════
   LYRICS MODULE — Full-screen Spotify-style
   API: https://api.danzy.web.id/api/search/lyrics?q=
══════════════════════════════════════════ */
const Lyrics = {
    _isOpen: false,
    _synced: [],
    _plain: [],
    _hasSynced: false,
    _timer: null,
    _progressTimer: null,
    _activeIdx: -1,
    _loadedFor: null,   // videoId of track we loaded lyrics for
    _fetching: false,

    /* ── Open lyrics screen ── */
    open() {
        this._isOpen = true;
        $('lyrics-screen').classList.add('open');
        // Update header info
        if (State.currentTrack) {
            this._updateHeader(State.currentTrack);
        }
        // Load lyrics if needed (always fetch for current track if not loaded)
        const vid = State.currentTrack ? State.currentTrack.videoId : null;
        if (vid && vid !== this._loadedFor) {
            this._loadedFor = vid;
            this.fetch(State.currentTrack.title + ' ' + State.currentTrack.artist);
        }
        this._startProgressTimer();
        if (this._hasSynced) this._startSyncTimer();
    },

    /* ── Close lyrics screen ── */
    close() {
        this._isOpen = false;
        $('lyrics-screen').classList.remove('open');
        this._stopSyncTimer();
        this._stopProgressTimer();
    },

    /* ── Update header & mini player info ── */
    _updateHeader(song) {
        $('lyr-song-title').textContent = song.title || '—';
        $('lyr-song-artist').textContent = song.artist || '—';
        $('lyr-mini-title').textContent = song.title || '—';
        $('lyr-mini-artist').textContent = song.artist || '—';
        $('lyr-mini-art').src = song.thumbnail || '';
        // Set blurred background
        $('lyr-bg-art').style.backgroundImage = `url(${song.thumbnail})`;
    },

    /* ── Called when a new song plays ── */
    onTrackChange(song) {
        this._synced = [];
        this._plain = [];
        this._hasSynced = false;
        this._activeIdx = -1;
         this._stopSyncTimer();
        this._updateHeader(song);
        this._syncPlayIcon();

        const vid = song.videoId;
        if (this._isOpen && vid !== this._loadedFor) {
            this._loadedFor = vid;
            this.fetch(song.title + ' ' + song.artist);
        } else {
            // Reset display to loading so it shows when opened next
            this._loadedFor = null;
            $('lyrics-scroll').innerHTML = `
                <div class="lyrics-loading">
                    <div class="loader-spin"></div>
                    <span>Mencari lirik...</span>
                </div>`;
        }
    },

    /* ── Sync play icon state ── */
    _syncPlayIcon() {
        const icon = $('lyr-play-icon');
        if (icon) icon.className = State.playing ? 'fas fa-pause' : 'fas fa-play';
    },

    /* ── Fetch from Danzy API ── */
    async fetch(query) {
        if (this._fetching) return;
        this._fetching = true;
        $('lyrics-scroll').innerHTML = `
            <div class="lyrics-loading">
                <div class="loader-spin"></div>
                <span>Mencari lirik...</span>
            </div>`;
        try {
            const url = `https://api.danzy.web.id/api/search/lyrics?q=${encodeURIComponent(query)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Network error');
            const json = await res.json();

            if (!json.status || !json.result || json.result.length === 0) {
                this._renderEmpty('Lirik tidak ditemukan 🎵');
                this._fetching = false;
                return;
            }

            // Best result: prefer synced, match track name closely
            let chosen = json.result.find(r => r.syncedLyrics) || json.result[0];

            if (chosen.syncedLyrics) {
                this._parseSynced(chosen.syncedLyrics);
                this._renderSynced();
                this._hasSynced = true;
                this._activeIdx = -1;
                if (this._isOpen) this._startSyncTimer();
            } else if (chosen.plainLyrics) {
                this._parsePlain(chosen.plainLyrics);
                this._renderPlain();
                this._hasSynced = false;
            } else {
                this._renderEmpty('Lirik tidak tersedia untuk lagu ini');
            }
        } catch(e) {
            this._renderEmpty('Gagal memuat lirik 😢\nCoba lagi nanti');
        }
        this._fetching = false;
    },

    /* ── Parse synced LRC ── */
    _parseSynced(raw) {
        this._synced = [];
        const regex = /\[(\d+):(\d+\.\d+)\]\s*(.*)/;
        raw.split('\n').forEach(line => {
            const m = line.match(regex);
            if (m) {
                const time = parseInt(m[1]) * 60 + parseFloat(m[2]);
                this._synced.push({ time, text: m[3] });
            }
        });
    },

    _parsePlain(raw) {
        this._plain = raw.split('\n');
    },

    _renderSynced() {
        $('lyrics-scroll').innerHTML = this._synced.map((l, i) =>
            l.text
                ? `<div class="lyric-line" id="ll-${i}" onclick="Lyrics._seek(${l.time})">${l.text}</div>`
                : `<div class="lyric-line empty-line" id="ll-${i}"></div>`
        ).join('');
    },

    _renderPlain() {
        $('lyrics-scroll').innerHTML = `<div class="lyrics-plain-wrap">${
            this._plain.map((l, i) =>
                l.trim()
                    ? `<span class="lyric-plain-line" id="lp-${i}">${l}</span>`
                    : `<span class="lyric-plain-line" id="lp-${i}" style="display:block;height:14px"></span>`
            ).join('')
        }</div>`;
    },

    _renderEmpty(msg) {
        $('lyrics-scroll').innerHTML = `
            <div class="lyrics-empty">
                <i class="fas fa-music"></i>
                <span>${msg}</span>
            </div>`;
    },

    _seek(time) {
        if (ytPlayer && ytPlayer.seekTo) ytPlayer.seekTo(time, true);
    },

    /* ── Sync timer (highlights active line) ── */
    _startSyncTimer() {
        this._stopSyncTimer();
        this._timer = setInterval(() => this._tick(), 250);
    },
    _stopSyncTimer() { clearInterval(this._timer); this._timer = null; },

    _tick() {
        if (!this._hasSynced || !this._synced.length) return;
        if (!ytPlayer || !ytPlayer.getCurrentTime) return;
        const cur = ytPlayer.getCurrentTime();

        let idx = -1;
        for (let i = 0; i < this._synced.length; i++) {
            if (this._synced[i].time <= cur + 0.2) idx = i;
            else break;
        }
        if (idx === this._activeIdx) return;
        this._activeIdx = idx;

        const lines = $('lyrics-scroll').querySelectorAll('.lyric-line');
        lines.forEach((el, i) => {
            el.classList.remove('active', 'past');
            if (i < idx) el.classList.add('past');
            else if (i === idx) el.classList.add('active');
        });

        if (idx >= 0) {
            const el = $(`ll-${idx}`);
            if (el) {
                const sc = $('lyrics-scroll');
                sc.scrollTop = el.offsetTop - sc.clientHeight / 2 + el.offsetHeight / 2;
            }
        }
    },

    /* ── Progress timer (updates mini progress bar & time) ── */
    _startProgressTimer() {
        this._stopProgressTimer();
        this._progressTimer = setInterval(() => {
            if (!ytPlayer || !ytPlayer.getDuration) return;
            const dur = ytPlayer.getDuration();
            const cur = ytPlayer.getCurrentTime();
            if (!dur) return;
            const pct = (cur / dur) * 100;
            $('lyr-progress-fill').style.width = pct + '%';
            $('lyr-now').textContent = fmtTime(cur);
            $('lyr-total').textContent = fmtTime(dur);
            this._syncPlayIcon();
        }, 500);
    },
    _stopProgressTimer() { clearInterval(this._progressTimer); this._progressTimer = null; },
};

/* ── Hook into App._updatePlayerUI ── */
const _origUpdatePlayerUI = App._updatePlayerUI.bind(App);
App._updatePlayerUI = function(song) {
    _origUpdatePlayerUI(song);
    Lyrics.onTrackChange(song);
};