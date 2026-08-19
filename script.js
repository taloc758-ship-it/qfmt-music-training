// Global variables
const notes = [];
let playTimeInMilliseconds = 800;
let playTimeInternalMilliseconds = 800;
const filePath = 'notes.txt';
let selectedNote = null;
let selectedCombination = null;
let lastComb = null;
const basePath = 'piano/'; // Change this to the path where audio files are stored
const appUrl = (path = '') => new URL(path, document.baseURI).toString();
const SETTINGS_KEY = 'qfmt.settings.v1';
let saveSettingsTimer = null;

// iOS audio: use Web Audio API to avoid silent-mode/autoplay quirks
let audioContext = null;
const audioBufferCache = new Map();
let audioUnlockRequested = false;

async function ensureAudioContext() {
    if (audioContext && audioContext.state === 'running') return audioContext;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    if (!audioContext) audioContext = new Ctx();

    if (audioContext.state !== 'running') {
        try {
            await audioContext.resume();
        } catch {
            // ignore, will retry on next user gesture
        }
    }

    return audioContext;
}

async function getAudioBuffer(url) {
    const cached = audioBufferCache.get(url);
    if (cached) return cached;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();

    const ctx = await ensureAudioContext();
    if (!ctx) throw new Error('AudioContext not available');

    const buffer = await new Promise((resolve, reject) => {
        ctx.decodeAudioData(arrayBuffer, resolve, reject);
    });
    audioBufferCache.set(url, buffer);
    return buffer;
}

function playBuffer(url) {
    (async () => {
        const ctx = await ensureAudioContext();
        if (!ctx || ctx.state !== 'running') throw new Error('AudioContext not running');
        const buffer = await getAudioBuffer(url);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
    })().catch(error => {
        console.error('WebAudio play failed:', error);
        // fallback to HTMLAudio
        try {
            const audio = new Audio();
            audio.src = url;
            audio.play().catch(() => {});
        } catch {}
    });
}

// DOM Elements
const keyInput = document.getElementById('keyInput');
const levelInput = document.getElementById('levelInput');
const playTimeInput = document.getElementById('playTimeInput');
const playTimeinterInput = document.getElementById('playTimeinterInput');
const playStdCheckbox = document.getElementById('playStdCheckbox');
const fixTxt = document.getElementById('fixTxt');
const fixChk = document.getElementById('fixChk');
const ranCnt = document.getElementById('ranCnt');
const statusText = document.getElementById('statusText');
const notesTable = document.getElementById('notesTable');
const combinationsTable = document.getElementById('combinationsTable');
const combinationsSingleTable = document.getElementById('combinationsSingleTable');
const selectAllCheckBox = document.getElementById('selectAllCheckBox');
const playingContent = document.getElementById('playingContent');
const playingInfo = document.querySelector('.playing-info');
const randomSeqLenInput = document.getElementById('randomSeqLen');
const randomSeqButton = document.getElementById('randomSeqButton');
const playRandomSeqButton = document.getElementById('playRandomSeqButton');
const randomSeqDisplay = document.getElementById('randomSeqDisplay');
const chordProgressionInput = document.getElementById('chordProgressionInput');
const chordLevelInput = document.getElementById('chordLevelInput');
const chordDurationInput = document.getElementById('chordDurationInput');
const chordPreview = document.getElementById('chordPreview');
const chordPlayingContent = document.getElementById('chordPlayingContent');
const chordStatusText = document.getElementById('chordStatusText');
let chordPlaybackMode = 'simultaneous';
let chordPlaybackTimers = [];
let chordPlaybackToken = 0;

const CHORD_DEFINITIONS = {
    1: { symbol: 'C', quality: '大三和弦', notes: [{ note: '1', offset: 0 }, { note: '3', offset: 0 }, { note: '5', offset: 0 }] },
    2: { symbol: 'Dm', quality: '小三和弦', notes: [{ note: '2', offset: 0 }, { note: '4', offset: 0 }, { note: '6', offset: 0 }] },
    3: { symbol: 'Em', quality: '小三和弦', notes: [{ note: '3', offset: 0 }, { note: '5', offset: 0 }, { note: '7', offset: 0 }] },
    4: { symbol: 'F', quality: '大三和弦', notes: [{ note: '4', offset: 0 }, { note: '6', offset: 0 }, { note: '1', offset: 1 }] },
    5: { symbol: 'G', quality: '大三和弦', notes: [{ note: '5', offset: 0 }, { note: '7', offset: 0 }, { note: '2', offset: 1 }] },
    // The 6 chord uses the common low-bass voicing: A3-C4-E4 when level is 4.
    6: { symbol: 'Am', quality: '小三和弦 · 低音6', notes: [{ note: '6', offset: -1 }, { note: '1', offset: 0 }, { note: '3', offset: 0 }] },
    7: { symbol: 'Bdim', quality: '减三和弦', notes: [{ note: '7', offset: 0 }, { note: '2', offset: 1 }, { note: '4', offset: 1 }] }
};
// 虚拟键盘元素
const clearKeyInputBtn = document.getElementById('clearKeyInput');
const playInputBtn = document.getElementById('playInputBtn');
const backspaceBtn = document.getElementById('backspaceBtn');
const keyBtns = document.querySelectorAll('.key-btn[data-key]');

function scheduleSaveAppSettings() {
    clearTimeout(saveSettingsTimer);
    saveSettingsTimer = setTimeout(saveAppSettings, 150);
}

function saveAppSettings() {
    try {
        const settings = {
            version: 1,
            main: {
                level: levelInput ? parseInt(levelInput.value) : undefined,
                ranCnt: ranCnt ? parseInt(ranCnt.value) : undefined,
                playTime: playTimeInput ? parseInt(playTimeInput.value) : undefined,
                playTimeInterval: playTimeinterInput ? parseInt(playTimeinterInput.value) : undefined,
                playStd: playStdCheckbox ? !!playStdCheckbox.checked : undefined,
                fixFirstEnabled: fixChk ? !!fixChk.checked : undefined,
                fixFirstNote: fixTxt ? String(fixTxt.value ?? '') : undefined,
                randomSeqLen: randomSeqLenInput ? parseInt(randomSeqLenInput.value) : undefined
            },
            interval: {
                intervalType: document.getElementById('intervalType')?.value,
                intervalStartNote: document.getElementById('intervalStartNote')?.value,
                intervalLevel: parseInt(document.getElementById('intervalLevel')?.value),
                intervalDelay: parseInt(document.getElementById('intervalDelay')?.value),
                sequentialPlayback: !!document.getElementById('sequentialPlayback')?.checked,
                simultaneousPlayback: !!document.getElementById('simultaneousPlayback')?.checked,
                playDirection: intervalTrainingState?.playDirection,
                ranges: Array.from(document.querySelectorAll('.interval-range-checkbox:checked')).map(el => el.value)
            }
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
        console.error('Failed to save settings:', error);
    }
}

function applyAppSettings(settings) {
    if (!settings || typeof settings !== 'object') return;

    try {
        const main = settings.main ?? {};
        if (levelInput && Number.isFinite(main.level)) levelInput.value = String(main.level);
        if (ranCnt && Number.isFinite(main.ranCnt)) ranCnt.value = String(main.ranCnt);
        if (playTimeInput && Number.isFinite(main.playTime)) playTimeInput.value = String(main.playTime);
        if (playTimeinterInput && Number.isFinite(main.playTimeInterval)) playTimeinterInput.value = String(main.playTimeInterval);
        if (playStdCheckbox && typeof main.playStd === 'boolean') playStdCheckbox.checked = main.playStd;
        if (fixChk && typeof main.fixFirstEnabled === 'boolean') fixChk.checked = main.fixFirstEnabled;
        if (fixTxt && typeof main.fixFirstNote === 'string') fixTxt.value = main.fixFirstNote;
        if (randomSeqLenInput && Number.isFinite(main.randomSeqLen)) randomSeqLenInput.value = String(main.randomSeqLen);

        const interval = settings.interval ?? {};
        const intervalTypeEl = document.getElementById('intervalType');
        const intervalStartNoteEl = document.getElementById('intervalStartNote');
        const intervalLevelEl = document.getElementById('intervalLevel');
        const intervalDelayEl = document.getElementById('intervalDelay');
        const sequentialPlaybackEl = document.getElementById('sequentialPlayback');
        const simultaneousPlaybackEl = document.getElementById('simultaneousPlayback');

        if (intervalTypeEl && typeof interval.intervalType === 'string') intervalTypeEl.value = interval.intervalType;
        if (intervalStartNoteEl && typeof interval.intervalStartNote === 'string') intervalStartNoteEl.value = interval.intervalStartNote;
        if (intervalLevelEl && Number.isFinite(interval.intervalLevel)) intervalLevelEl.value = String(interval.intervalLevel);
        if (intervalDelayEl && Number.isFinite(interval.intervalDelay)) intervalDelayEl.value = String(interval.intervalDelay);
        if (sequentialPlaybackEl && typeof interval.sequentialPlayback === 'boolean') sequentialPlaybackEl.checked = interval.sequentialPlayback;
        if (simultaneousPlaybackEl && typeof interval.simultaneousPlayback === 'boolean') simultaneousPlaybackEl.checked = interval.simultaneousPlayback;

        if (interval.playDirection === 'ascending' || interval.playDirection === 'descending' || interval.playDirection === 'random') {
            intervalTrainingState.playDirection = interval.playDirection;
            document.querySelectorAll('.direction-btn').forEach(btn => btn.classList.remove('active'));
            const btn = document.querySelector(`.direction-btn[data-direction="${interval.playDirection}"]`);
            if (btn) btn.classList.add('active');
        }

        if (Array.isArray(interval.ranges) && interval.ranges.length > 0) {
            const set = new Set(interval.ranges);
            document.querySelectorAll('.interval-range-checkbox').forEach(cb => {
                cb.checked = set.has(cb.value);
            });
        }
    } catch (error) {
        console.error('Failed to apply settings:', error);
    }
}

function loadAppSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return;
        applyAppSettings(JSON.parse(raw));
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

function initAutoSaveForSettings() {
    const inputs = [
        levelInput,
        ranCnt,
        playTimeInput,
        playTimeinterInput,
        playStdCheckbox,
        fixTxt,
        fixChk,
        randomSeqLenInput,
        document.getElementById('intervalType'),
        document.getElementById('intervalStartNote'),
        document.getElementById('intervalLevel'),
        document.getElementById('intervalDelay'),
        document.getElementById('sequentialPlayback'),
        document.getElementById('simultaneousPlayback')
    ].filter(Boolean);

    inputs.forEach(el => {
        el.addEventListener('input', scheduleSaveAppSettings);
        el.addEventListener('change', scheduleSaveAppSettings);
    });

    document.querySelectorAll('.interval-range-checkbox').forEach(cb => {
        cb.addEventListener('change', scheduleSaveAppSettings);
    });

    document.querySelectorAll('.direction-btn').forEach(btn => {
        btn.addEventListener('click', scheduleSaveAppSettings);
    });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Load notes from local storage
    loadNotesFromStorage();
    
    // Add event listeners
    document.getElementById('addNoteButton').addEventListener('click', addNote);
    document.getElementById('deleteNoteButton').addEventListener('click', deleteNote);
    document.getElementById('updateNoteButton').addEventListener('click', updateNote);
    document.getElementById('repeatButton').addEventListener('click', repeatButtonClick);
    document.getElementById('playButton').addEventListener('click', playButtonClick);
    document.getElementById('playCombButton').addEventListener('click', playCombButtonClick);
    document.getElementById('repeatCombButton').addEventListener('click', repeatCombButtonClick);
    initChordProgressions();
    if (randomSeqButton) randomSeqButton.addEventListener('click', randomSeqButtonClick);
    if (playRandomSeqButton) playRandomSeqButton.addEventListener('click', playRandomSeqButtonClick);
    selectAllCheckBox.addEventListener('click', selectAllCheckBoxClick);
    playTimeInput.addEventListener('input', playTimeInputChange);
    playTimeinterInput.addEventListener('input', playTimeInputChange);
    
    // 虚拟键盘事件监听
    initVirtualKeyboard();

    // 组合表内单个音符可点击发声（包含随机组合显示区）
    initCombinationNoteClickToPlay();

    // iOS: unlock audio on first user interaction
    if (!audioUnlockRequested) {
        audioUnlockRequested = true;
        const unlock = () => { ensureAudioContext(); };
        window.addEventListener('pointerdown', unlock, { once: true, passive: true });
        window.addEventListener('touchend', unlock, { once: true, passive: true });
    }
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', handleKeyDown);
});

// PWA: register service worker for offline support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js', { scope: './' }).catch(err => {
            console.warn('Service worker registration failed:', err);
        });
    });
}

async function renderPwaStatus() {
    const el = document.getElementById('pwaStatus');
    if (!el) return;

    const lines = [];
    const isSecure = window.isSecureContext;
    lines.push(`SecureContext: ${isSecure ? 'yes' : 'no'}`);

    if (!('serviceWorker' in navigator)) {
        lines.push('ServiceWorker: not supported');
        el.textContent = lines.join(' | ');
        return;
    }

    const controlled = !!navigator.serviceWorker.controller;
    lines.push(`SW controlled: ${controlled ? 'yes' : 'no'}`);

    try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
            lines.push('SW registration: none');
        } else {
            lines.push(`SW scope: ${reg.scope}`);
            lines.push(`SW state: ${reg.active?.state || reg.installing?.state || reg.waiting?.state || 'unknown'}`);
        }

        if ('caches' in window) {
            const keys = await caches.keys();
            lines.push(`Caches: ${keys.length}`);

            const runtimeKey = keys.find(k => k.includes('-runtime'));
            if (runtimeKey) {
                const cache = await caches.open(runtimeKey);
                const requests = await cache.keys();
                const mp3Count = requests.filter(r => r.url.endsWith('.mp3')).length;
                lines.push(`Cached mp3: ${mp3Count}`);
            }
        }
    } catch (e) {
        lines.push(`SW error: ${String(e?.message || e)}`);
    }

    el.textContent = lines.join(' | ');
}

function getSwVersion() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    const controller = navigator.serviceWorker.controller;
    if (!controller) return Promise.resolve(null);

    return new Promise((resolve) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => resolve(null), 1500);
        channel.port1.onmessage = (event) => {
            clearTimeout(timer);
            resolve(event?.data?.version || null);
        };
        controller.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    });
}

async function cacheAllAudioFromManifest(options = {}) {
    const btn = document.getElementById('cacheAudioBtn');
    const setBtn = (text, disabled) => {
        if (!btn) return;
        btn.textContent = text;
        btn.disabled = disabled;
    };

    try {
        const silent = !!options.silent;
        const inputFiles = Array.isArray(options.files) ? options.files : null;

        let files = inputFiles;
        if (!files) {
            setBtn('读取清单...', true);
            const resp = await fetch(appUrl('piano-manifest.json'), { cache: 'no-store' });
            if (!resp.ok) throw new Error(`manifest HTTP ${resp.status}`);
            const data = await resp.json();
            files = Array.isArray(data.files) ? data.files : [];
        }
        if (files.length === 0) throw new Error('manifest empty');

        setBtn(`缓存中 0/${files.length}`, true);

        // Fetch sequentially to be gentle on iOS memory/network
        let done = 0;
        for (const file of files) {
            const rel = String(file).replace(/^\/+/, '');
            await fetch(appUrl(rel), { cache: 'reload' });
            done++;
            if (done % 5 === 0) setBtn(`缓存中 ${done}/${files.length}`, true);
        }

        setBtn('缓存音频(完成)', false);
        await renderPwaStatus();
    } catch (e) {
        console.warn('Cache audio failed:', e);
        setBtn('缓存音频(失败)', false);
        if (!options.silent) alert(`缓存音频失败：${String(e?.message || e)}`);
    }
}

async function autoCacheAllAudioIfNeeded() {
    try {
        if (!('serviceWorker' in navigator) || !('caches' in window)) return;
        await navigator.serviceWorker.ready;

        const [version, resp] = await Promise.all([
            getSwVersion(),
            fetch(appUrl('piano-manifest.json'), { cache: 'no-store' })
        ]);
        if (!resp.ok) return;

        const data = await resp.json();
        const files = Array.isArray(data.files) ? data.files : [];
        if (files.length === 0) return;

        const cacheKeys = await caches.keys();
        const runtimeKey = cacheKeys.find(k => k.includes('-runtime')) || '';
        const cachedVersionKey = `qfmt.audioCacheVersion`;
        const cachedVersion = localStorage.getItem(cachedVersionKey);

        if (version && cachedVersion === version) return;

        if (runtimeKey) {
            const cache = await caches.open(runtimeKey);
            const requests = await cache.keys();
            const mp3Count = requests.filter(r => r.url.endsWith('.mp3')).length;
            if (mp3Count >= files.length) {
                if (version) localStorage.setItem(cachedVersionKey, version);
                return;
            }
        }

        await cacheAllAudioFromManifest({ silent: true, files });
        if (version) localStorage.setItem(cachedVersionKey, version);
    } catch (e) {
        console.warn('Auto cache audio failed:', e);
    }
}

window.addEventListener('load', () => {
    const btn = document.getElementById('cacheAudioBtn');
    if (btn) btn.addEventListener('click', cacheAllAudioFromManifest);
});

window.addEventListener('load', () => {
    renderPwaStatus();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', renderPwaStatus);
        navigator.serviceWorker.addEventListener('message', renderPwaStatus);
    }

    // Default: cache all mp3 for offline use.
    autoCacheAllAudioIfNeeded();

    relocateRandomSeqBar();
    const mq = window.matchMedia('(min-width: 992px)');
    if (mq.addEventListener) mq.addEventListener('change', relocateRandomSeqBar);
    else if (mq.addListener) mq.addListener(relocateRandomSeqBar);
});

// 初始化虚拟键盘功能
function initVirtualKeyboard() {
    // 为每个按键添加点击事件
    keyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const keyValue = btn.getAttribute('data-key');
            appendToInput(keyValue);
        });
    });
    
    // 清除按钮（输入框的清除按钮）
    clearKeyInputBtn.addEventListener('click', () => {
        keyInput.value = '';
        keyInput.focus();
    });
    
    // 键盘区域的清除按钮
    const clearKeyboardBtn = document.getElementById('clearKeyboardBtn');
    if (clearKeyboardBtn) {
        clearKeyboardBtn.addEventListener('click', () => {
            keyInput.value = '';
            keyInput.focus();
        });
    }
    
    // 播放按钮
    playInputBtn.addEventListener('click', () => {
        // 直接播放输入框中的全部内容，不使用playButtonClick
        const inputValue = keyInput.value.trim();
        if (inputValue) {
            // 解析输入框的值并播放全部内容
            const keys = parseString(inputValue);
            if (keys.length > 0) {
                // 播放全部音符，不考虑ranCnt限制
                playSounds(keys, parseInt(levelInput.value) || 4);
                showStatus('播放全部输入内容', 'success');
            } else {
                showStatus('无效的音符输入！', 'error');
            }
        } else {
            showStatus('请先输入要播放的音符！', 'error');
        }
    });
    
    // 退格按钮
    backspaceBtn.addEventListener('click', () => {
        if (keyInput.value.length > 0) {
            keyInput.value = keyInput.value.slice(0, -1);
            keyInput.focus();
        }
    });
}

// 添加按键值到输入框
function appendToInput(value) {
    keyInput.value += value;
    keyInput.focus();
    
    // 修正正则表达式，支持带+/-前缀的音符（高音/低音）
    if (value.match(/[+-]?[1-7]/)) {
        // 从data-key属性中获取完整值（包括前缀）
        const key = value.replace(/[+-]/, ''); // 去掉前缀获取纯数字
        const level = parseInt(levelInput.value) || 4;
        const offset = value.startsWith('+') ? 1 : (value.startsWith('-') ? -1 : 0);
        playSound(key, level + offset);
    }
}

// Load notes from storage
function loadNotesFromStorage() {
    const storedNotes = localStorage.getItem('notes');
    if (storedNotes) {
        notes.length = 0; // Clear the array
        JSON.parse(storedNotes).forEach(note => notes.push(note));
        renderNotesTable();
    } else {
        // If no notes in localStorage, try to load from notes.txt
        loadNotesFromFile();
    }
}

// Load notes from text file
function loadNotesFromFile() {
    fetch(filePath)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.text();
        })
        .then(data => {
            const lines = data.split('\n');
            notes.length = 0; // Clear the array
            lines.forEach(line => {
                if (line.trim()) {
                    notes.push({ noteName: line.trim() });
                }
            });
            saveNotesToStorage();
            renderNotesTable();
        })
        .catch(error => {
            console.error('Error loading notes file:', error);
            statusText.textContent = '无法加载音符文件，创建默认音符';
            createDefaultNotesFile();
        });
}

// Save notes to storage
function saveNotesToStorage() {
    localStorage.setItem('notes', JSON.stringify(notes));
}

// Render the notes table
function renderNotesTable() {
    const tbody = notesTable.querySelector('tbody');
    tbody.innerHTML = '';
    
    notes.forEach((note, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${note.noteName}</td>`;
        row.dataset.index = index;
        
        row.addEventListener('click', () => {
            // Remove selected class from all rows
            notesTable.querySelectorAll('tbody tr').forEach(r => r.classList.remove('selected'));
            // Add selected class to clicked row
            row.classList.add('selected');
            selectedNote = note;
            keyInput.value = note.noteName;
            
            // Generate combinations
            generateCombinations(note);
        });
        
        tbody.appendChild(row);
    });
}

// Generate combinations from a note
function generateCombinations(note) {
    const list = parseString(note.noteName);
    
    // 减小限制组合生成的最大数量
    const MAX_COMBINATIONS = 30;
    
    // 安全检查：如果输入长度超过6，直接显示警告
    if (list.length > 6) {
        showStatus(`输入长度为 ${list.length}，组合数量过多，请缩短输入`, 'error');
        // 只生成一小部分组合
        const limitedList = list.slice(0, 6);
        const combinations = getPermutations(limitedList);
        const limitedCombinations = combinations.slice(0, MAX_COMBINATIONS);
        const combinationStrings = limitedCombinations.map(c => 
            formatCombination(c)
        );
        
        renderCombinationsTable(combinationStrings);
        
        // 对组合也使用相同的限制
        const pairCombinations = getPairPermutations(limitedList);
        const limitedPairCombinations = pairCombinations.slice(0, MAX_COMBINATIONS);
        const pairStrings = limitedPairCombinations.map(c => 
            formatCombination(c)
        );
        
        renderCombinationsSingleTable(pairStrings);
        return;
    }
    
    // Generate permutations
    const combinations = getPermutations(list);
    // 限制显示的组合数量
    const limitedCombinations = combinations.slice(0, MAX_COMBINATIONS);
    const combinationStrings = limitedCombinations.map(c => 
        formatCombination(c)
    );
    
    // 显示组合数量信息
    if (combinations.length > MAX_COMBINATIONS) {
        showStatus(`共生成 ${combinations.length} 个组合，限制显示 ${MAX_COMBINATIONS} 个`, 'info');
    }
    
    renderCombinationsTable(combinationStrings);
    
    // Generate pair permutations for the single table
    const pairCombinations = getPairPermutations(list);
    // 限制显示的对组合数量
    const limitedPairCombinations = pairCombinations.slice(0, MAX_COMBINATIONS);
    const pairStrings = limitedPairCombinations.map(c => 
        formatCombination(c)
    );
    
    // 显示对组合数量信息
    if (pairCombinations.length > MAX_COMBINATIONS) {
        showStatus(`共生成 ${pairCombinations.length} 个对组合，限制显示 ${MAX_COMBINATIONS} 个`, 'info');
    }
    
    renderCombinationsSingleTable(pairStrings);
}

// Format a combination with musical notation for display
function formatCombination(combination) {
    return `<div class="note-combination">${combination.map(item => getMusicalNotation(item)).join('')}</div>`;
}

// Format a single note with proper notation
function formatNote(item) {
    return `<span class="musical-note">${getMusicalNotation(item)}</span>`;
}

// Format a note with musical notation
function getMusicalNotation(item) {
    let html = '';
    
    if (item.offset > 0) {
        // High note
        html = `<div class="note-with-dots" data-note="${item.note}" data-offset="${item.offset}"><span class="dots above">${renderDotsHtml(Math.abs(item.offset))}</span><span class="note">${item.note}</span></div>`;
    } else if (item.offset < 0) {
        // Low note
        html = `<div class="note-with-dots" data-note="${item.note}" data-offset="${item.offset}"><span class="note">${item.note}</span><span class="dots below">${renderDotsHtml(Math.abs(item.offset))}</span></div>`;
    } else {
        // Regular note
        html = `<div class="note-with-dots" data-note="${item.note}" data-offset="0"><span class="note">${item.note}</span></div>`;
    }
    
    return html;
}

// Render the combinations table
function renderCombinationsTable(combinations) {
    const tbody = combinationsTable.querySelector('tbody');
    tbody.innerHTML = '';
    
    // 使用文档片段减少DOM重排
    const fragment = document.createDocumentFragment();
    
    // 检查是否有太多组合需要渲染
    if (combinations.length > 50) {
        showStatus(`尝试渲染${combinations.length}个组合，数量过多可能导致页面卡顿`, 'error');
    }
    
    // 分批处理，每批最多处理20个组合
    const processInBatches = (startIndex) => {
        const batchSize = 20;
        const endIndex = Math.min(startIndex + batchSize, combinations.length);
        
        for (let i = startIndex; i < endIndex; i++) {
            const combinationHtml = combinations[i];
            const row = document.createElement('tr');
            
            // 提取音符数据
            const plainTextVersion = htmlToPlainText(combinationHtml);
            
            row.innerHTML = `
                <td><input type="checkbox" class="combination-checkbox"></td>
                <td>${combinationHtml}</td>
                <td><button class="btn primary">播放</button></td>
            `;
            
            // 存储原始组合字符串
            row.dataset.combination = plainTextVersion;
            
            // 添加到文档片段
            fragment.appendChild(row);
        }
        
        // 添加到tbody
        tbody.appendChild(fragment);
        
        // 处理事件（在添加到DOM后）
        for (let i = startIndex; i < endIndex; i++) {
            const row = tbody.children[i - startIndex];
            
            // 添加播放按钮点击事件
            const playBtn = row.querySelector('.btn');
            playBtn.addEventListener('click', function() {
                try {
                    // 解析组合字符串为音符数据
                    const plainTextVersion = row.dataset.combination;
                    const keys = parseString(plainTextVersion);
                    console.log("Play combination:", plainTextVersion, "Keys:", keys);
                    // 播放音符
                    if (keys && keys.length > 0) {
                        playSounds(keys, parseInt(levelInput.value) || 4);
                        // 更新播放内容显示
                        updatePlayingContent(plainTextVersion);
                        // 保存当前播放的组合
                        lastComb = keys;
                        selectedCombination = plainTextVersion;
                    } else {
                        showStatus('无效的音符组合！', 'error');
                    }
                } catch (error) {
                    console.error("播放出错:", error);
                    showStatus('播放错误：' + error.message, 'error');
                }
            });
            
            // Get the checkbox
            const checkbox = row.querySelector('.combination-checkbox');
            checkbox.addEventListener('change', () => {
                // Update "Select All" checkbox state
                updateSelectAllCheckbox();
            });
        }
        
        // 如果还有更多组合要处理，使用setTimeout继续处理下一批
        if (endIndex < combinations.length) {
            setTimeout(() => processInBatches(endIndex), 0);
        }
    };
    
    // 开始处理第一批
    if (combinations.length > 0) {
        processInBatches(0);
    }
}

// Update "Select All" checkbox state
function updateSelectAllCheckbox() {
    const checkboxes = combinationsTable.querySelectorAll('.combination-checkbox');
    const checkedBoxes = combinationsTable.querySelectorAll('.combination-checkbox:checked');
    
    // If all checkboxes are checked, set "Select All" to checked
    // If some checkboxes are checked, set "Select All" to indeterminate
    // If no checkboxes are checked, set "Select All" to unchecked
    if (checkboxes.length === checkedBoxes.length) {
        selectAllCheckBox.checked = true;
        selectAllCheckBox.indeterminate = false;
    } else if (checkedBoxes.length > 0) {
        selectAllCheckBox.checked = false;
        selectAllCheckBox.indeterminate = true;
    } else {
        selectAllCheckBox.checked = false;
        selectAllCheckBox.indeterminate = false;
    }
}

// Convert HTML notation to plain text for playing
function htmlToPlainText(html) {
    // 更新正则表达式以匹配新的HTML结构 (使用div而不是span)
    const plainText = [];
    const regex = /<div class="note-with-dots"[^>]*><span class="dots above">.+?<\/span><span class="note">(\d)<\/span><\/div>|<div class="note-with-dots"[^>]*><span class="note">(\d)<\/span><span class="dots below">.+?<\/span><\/div>|<div class="note-with-dots"[^>]*><span class="note">(\d)<\/span><\/div>/g;
    
    let match;
    while ((match = regex.exec(html)) !== null) {
        if (match[1]) {
            // Higher octave
            plainText.push(`+${match[1]}`);
        } else if (match[2]) {
            // Lower octave
            plainText.push(`-${match[2]}`);
        } else if (match[3]) {
            // Normal note
            plainText.push(match[3]);
        }
    }
    
    return plainText.join('');
}

// Render the single combinations table
function renderCombinationsSingleTable(combinations) {
    const tbody = combinationsSingleTable.querySelector('tbody');
    tbody.innerHTML = '';
    
    // 使用文档片段减少DOM重排
    const fragment = document.createDocumentFragment();
    
    // 检查是否有太多组合需要渲染
    if (combinations.length > 50) {
        showStatus(`尝试渲染${combinations.length}个对组合，数量过多可能导致页面卡顿`, 'error');
    }
    
    // 分批处理，每批最多处理20个组合
    const processInBatches = (startIndex) => {
        const batchSize = 20;
        const endIndex = Math.min(startIndex + batchSize, combinations.length);
        
        for (let i = startIndex; i < endIndex; i++) {
            const combinationHtml = combinations[i];
            const row = document.createElement('tr');
            
            // 提取音符数据
            const plainTextVersion = htmlToPlainText(combinationHtml);
            
            row.innerHTML = `
                <td>${combinationHtml}</td>
                <td><button class="btn primary">播放</button></td>
            `;
            
            // 存储原始组合字符串
            row.dataset.combination = plainTextVersion;
            
            // 添加到文档片段
            fragment.appendChild(row);
        }
        
        // 添加到tbody
        tbody.appendChild(fragment);
        
        // 处理事件（在添加到DOM后）
        for (let i = startIndex; i < endIndex; i++) {
            const row = tbody.children[i - startIndex];
            
            // 添加播放按钮点击事件
            const playBtn = row.querySelector('.btn');
            playBtn.addEventListener('click', function() {
                try {
                    // 解析组合字符串为音符数据
                    const plainTextVersion = row.dataset.combination;
                    const keys = parseString(plainTextVersion);
                    console.log("Play single combination:", plainTextVersion, "Keys:", keys);
                    // 播放音符
                    if (keys && keys.length > 0) {
                        playSounds(keys, parseInt(levelInput.value) || 4);
                        // 更新播放内容显示
                        updatePlayingContent(plainTextVersion);
                        // 保存当前播放的组合
                        lastComb = keys;
                        selectedCombination = plainTextVersion;
                    } else {
                        showStatus('无效的音符组合！', 'error');
                    }
                } catch (error) {
                    console.error("播放出错:", error);
                    showStatus('播放错误：' + error.message, 'error');
                }
            });
        }
        
        // 如果还有更多组合要处理，使用setTimeout继续处理下一批
        if (endIndex < combinations.length) {
            setTimeout(() => processInBatches(endIndex), 0);
        }
    };
    
    // 开始处理第一批
    if (combinations.length > 0) {
        processInBatches(0);
    }
}

function randomSeqButtonClick() {
    const source = selectedNote?.noteName ?? keyInput.value.trim();
    if (!source) {
        showStatus('请先选择一个音组或输入音组！', 'error');
        return;
    }

    const parsed = parseString(source);
    if (parsed.length === 0) {
        showStatus('音组解析失败！', 'error');
        return;
    }

    const uniq = new Map();
    for (const item of parsed) {
        const key = `${item.note}:${item.offset}`;
        if (!uniq.has(key)) uniq.set(key, item);
    }
    const pool = Array.from(uniq.values());

    const requestedLen = parseInt(randomSeqLenInput?.value) || 6;
    const len = Math.max(2, Math.min(50, requestedLen));
    if (randomSeqLenInput) randomSeqLenInput.value = String(len);

    if (pool.length === 1 && len > 1) {
        showStatus('音组只有 1 个音，无法生成相邻不相同的随机组合。', 'error');
        return;
    }

    let sequence = [];
    if (len <= pool.length) {
        sequence = shuffleArray(pool).slice(0, len);
    } else {
        const result = [];
        let last = null;
        let safety = 0;

        while (result.length < len && safety < 2000) {
            safety++;
            const batch = shuffleArray(pool);

            if (last && batch.length > 1 && batch[0].note === last.note && batch[0].offset === last.offset) {
                const idx = batch.findIndex(n => n.note !== last.note || n.offset !== last.offset);
                if (idx > 0) [batch[0], batch[idx]] = [batch[idx], batch[0]];
            }

            for (const item of batch) {
                if (result.length >= len) break;
                if (last && item.note === last.note && item.offset === last.offset) continue;
                result.push(item);
                last = item;
            }
        }

        if (result.length < len) {
            showStatus('随机组合生成失败，请增大音组内容。', 'error');
            return;
        }

        sequence = result;
    }

    const plainText = sequence.map(n => `${getSign(n.offset)}${n.note}`).join('');
    if (randomSeqDisplay) {
        randomSeqDisplay.innerHTML = formatCombination(sequence);
        randomSeqDisplay.dataset.combination = plainText;
    }

    updatePlayingContent(plainText);
    lastComb = sequence;
    selectedCombination = plainText;
    showStatus('已生成随机组合', 'success');
}

function relocateRandomSeqBar() {
    const bar = document.querySelector('.random-seq-bar');
    const hostMobile = document.getElementById('randomSeqHostMobile');
    const hostDesktop = document.getElementById('randomSeqHostDesktop');
    if (!bar || !hostMobile || !hostDesktop) return;

    const isDesktop = window.matchMedia('(min-width: 992px)').matches;
    const targetHost = isDesktop ? hostDesktop : hostMobile;
    if (bar.parentElement !== targetHost) targetHost.appendChild(bar);
}

function playRandomSeqButtonClick() {
    const plainText = randomSeqDisplay?.dataset?.combination;
    if (!plainText) {
        showStatus('请先生成随机组合！', 'error');
        return;
    }
    const keys = parseString(plainText);
    if (!keys || keys.length === 0) {
        showStatus('无效的随机组合！', 'error');
        return;
    }
    playSounds(keys, parseInt(levelInput.value) || 4);
    updatePlayingContent(plainText);
    lastComb = keys;
    selectedCombination = plainText;
}

function initCombinationNoteClickToPlay() {
    const containers = [combinationsTable, combinationsSingleTable, randomSeqDisplay].filter(Boolean);
    containers.forEach(container => {
        container.addEventListener('click', (event) => {
            const target = event.target;
            if (target.closest('button') || target.closest('input')) return;

            const noteEl = target.closest('.note-with-dots');
            if (!noteEl) return;

            const note = noteEl.dataset.note;
            const offset = parseInt(noteEl.dataset.offset) || 0;
            if (!note) return;

            const baseLevel = parseInt(levelInput.value) || 4;
            playSound(note, baseLevel + offset);
        });
    });
}

// Add a new note
function addNote() {
    const noteName = keyInput.value.trim();
    if (noteName) {
        notes.push({ noteName });
        saveNotesToStorage();
        renderNotesTable();
        keyInput.value = '';
        showStatus('音符已添加', 'success');
    } else {
        showStatus('请输入一个音符！', 'error');
    }
}

// Delete a note
function deleteNote() {
    if (selectedNote) {
        const index = notes.indexOf(selectedNote);
        if (index !== -1) {
            notes.splice(index, 1);
            saveNotesToStorage();
            renderNotesTable();
            keyInput.value = '';
            selectedNote = null;
            showStatus('音符已删除', 'success');
        }
    } else {
        showStatus('请选择要删除的音符！', 'error');
    }
}

// Update a note
function updateNote() {
    if (selectedNote && keyInput.value.trim()) {
        selectedNote.noteName = keyInput.value.trim();
        saveNotesToStorage();
        renderNotesTable();
        keyInput.value = '';
        selectedNote = null;
        showStatus('音符已更新', 'success');
    } else {
        showStatus('请选择要修改的音符并输入新内容！', 'error');
    }
}

// Show status message
function showStatus(message, type = 'error') {
    statusText.textContent = message;
    statusText.className = 'status-text';
    
    if (type === 'success') {
        statusText.style.color = 'var(--success-color)';
    } else if (type === 'info') {
        statusText.style.color = 'var(--primary-color)';
    } else {
        statusText.style.color = 'var(--danger-color)';
    }
    
    // Clear the status message after 3 seconds
    setTimeout(() => {
        statusText.textContent = '';
    }, 3000);
}

// Update playing content display
function updatePlayingContent(plainText) {
    // Parse the plain text to get the notes with offsets
    const notes = parseString(plainText);
    
    // Format the notes with dots notation for display
    const formattedContent = formatCombination(notes);
    
    // Set the formatted content to the playing area
    playingContent.innerHTML = formattedContent;
    playingInfo.classList.add('active');
}

// Handle key down events
function handleKeyDown(event) {
    if (event.key === 'q' || event.key === 'Q') {
        repeatButtonClick();
    } else if (event.key === 'w' || event.key === 'W') {
        playButtonClick();
    } else if (event.key === 's' || event.key === 'S') {
        playCombButtonClick();
    } else if (event.key === 'a' || event.key === 'A') {
        repeatCombButtonClick();
    }
}

// Handle play time input change
function playTimeInputChange() {
    playTimeInMilliseconds = parseInt(playTimeInput.value) || 800;
    playTimeInternalMilliseconds = parseInt(playTimeinterInput.value) || 800;
}

// Select all checkboxes
function selectAllCheckBoxClick() {
    const checkboxes = combinationsTable.querySelectorAll('.combination-checkbox');
    const checked = selectAllCheckBox.checked;
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = checked;
    });
    
    selectAllCheckBox.indeterminate = false;
}

// Play button click handler (重播上次随机内容)
function playButtonClick() {
    // 直接播放上次随机播放的内容
    if (lastComb && lastComb.length > 0) {
        // 复制上次的内容，不做任何修改
        const notesToPlay = [...lastComb];
        playSounds(notesToPlay, parseInt(levelInput.value) || 4);
        showStatus('重播上次内容', 'success');
    } else {
        // 如果没有上次播放内容，尝试播放输入框的内容
        const inputValue = keyInput.value.trim();
        if (inputValue) {
            // 直接解析输入框的值并播放
            const keys = parseString(inputValue);
            if (keys.length > 0) {
                // 只播放指定数量的音符
                const count = parseInt(ranCnt.value) || 3;
                const notesToPlay = keys.slice(0, count);
                playSounds(notesToPlay, parseInt(levelInput.value) || 4);
            } else {
                showStatus('无效的音符输入！', 'error');
            }
        } else {
            showStatus('没有可播放的内容！', 'error');
        }
    }
}

// Get notes to play
function getNotes() {
    // Get the number of notes to play
    const count = parseInt(ranCnt.value) || 3;
    console.log("Requested note count:", count);
    
    // Clone the notes array to avoid modifying the original
    let availableNotes = notes.map(note => parseString(note.noteName)).flat();
    console.log("Available notes:", availableNotes);
    
    // If fix first note is checked, make sure the first note is the fixed one
    if (fixChk.checked) {
        const fixedNote = fixTxt.value.trim();
        
        // Try to find the fixed note in the available notes
        const fixedNoteIndex = availableNotes.findIndex(note => note.note === fixedNote);
        
        if (fixedNoteIndex !== -1) {
            // Move the fixed note to the beginning
            const fixedNoteObj = availableNotes.splice(fixedNoteIndex, 1)[0];
            availableNotes.unshift(fixedNoteObj);
        }
    }
    
    // 随机选择指定数量的音符
    const selectedNotes = shuffleArray(availableNotes).slice(0, count);
    console.log("Selected notes:", selectedNotes);
    return selectedNotes;
}

// Repeat button click handler (now random play)
function repeatButtonClick() {
    // 获取输入框的值
    const inputValue = keyInput.value.trim();
    
    if (inputValue) {
        // 直接从输入框解析音符
        const keys = parseString(inputValue);
        if (keys.length > 0) {
            // 获取播放数量设置
            const count = parseInt(ranCnt.value) || 3;
            let keysToPlay = [...keys];
            
            // 处理固定首音
            if (fixChk.checked) {
                const fixedNote = fixTxt.value.trim();
                
                // 先从数组中移除固定首音（如果存在）
                const fixedNoteIndex = keysToPlay.findIndex(note => note.note === fixedNote);
                
                if (fixedNoteIndex !== -1) {
                    // 移除固定首音
                    const fixedNoteObj = keysToPlay.splice(fixedNoteIndex, 1)[0];
                    
                    // 打乱剩余音符
                    const shuffledKeys = shuffleArray(keysToPlay);
                    
                    // 重组数组：固定首音 + 打乱后的剩余音符
                    keysToPlay = [fixedNoteObj, ...shuffledKeys];
                } else {
                    // 如果找不到固定首音，则正常打乱
                    keysToPlay = shuffleArray(keysToPlay);
                }
            } else {
                // 如果未启用固定首音，则正常打乱
                keysToPlay = shuffleArray(keysToPlay);
            }
            
            // 只取指定数量的音符进行播放
            const notesToPlay = keysToPlay.slice(0, count);
            
            // 播放选定的音符
            playSounds(notesToPlay, parseInt(levelInput.value) || 4);
            showStatus('随机播放输入内容', 'success');
            return;
        }
    }
    
    // 如果输入框为空，则尝试使用lastComb
    if (lastComb && lastComb.length > 0) {
        // 创建一个深拷贝，确保不会修改原始数组
        let keysToPlay = JSON.parse(JSON.stringify(lastComb));
        // 获取播放数量设置
        const count = parseInt(ranCnt.value) || 3;
        
        // 处理固定首音
        if (fixChk.checked) {
            const fixedNote = fixTxt.value.trim();
            
            // 先从数组中移除固定首音（如果存在）
            const fixedNoteIndex = keysToPlay.findIndex(note => note.note === fixedNote);
            
            if (fixedNoteIndex !== -1) {
                // 移除固定首音
                const fixedNoteObj = keysToPlay.splice(fixedNoteIndex, 1)[0];
                
                // 打乱剩余音符
                const shuffledKeys = shuffleArray(keysToPlay);
                
                // 重组数组：固定首音 + 打乱后的剩余音符
                keysToPlay = [fixedNoteObj, ...shuffledKeys];
            } else {
                // 如果找不到固定首音，则正常打乱
                keysToPlay = shuffleArray(keysToPlay);
            }
        } else {
            // 如果未启用固定首音，则正常打乱
            keysToPlay = shuffleArray(keysToPlay);
        }
        
        // 只取指定数量的音符进行播放
        const notesToPlay = keysToPlay.slice(0, count);
        
        // 播放选定的音符
        playSounds(notesToPlay, parseInt(levelInput.value) || 4);
        showStatus('随机播放当前内容', 'success');
    } else {
        showStatus('没有可播放的音符！', 'error');
    }
}

// Play sounds
function playSounds(keys, level) {
    if (!keys || keys.length === 0) {
        showStatus('没有可播放的音符！', 'error');
        return;
    }
    
    console.log("Playing sounds:", keys);
    lastComb = keys;
    
    // Get the plain text representation for status message
    const plainTextString = keys.map(k => `${getSign(k.offset)}${k.note}`).join('');
    
    // Update the playing content display
    updatePlayingContent(plainTextString);
    
    // Show playing status (temporary)
    showStatus(`正在播放: ${plainTextString}`, 'success');
    
    // Play each sound with a delay
    // iOS Safari: first audio must be triggered synchronously by a user gesture
    keys.forEach((key, index) => {
        const playOne = () => {
            playSound(key.note, level + key.offset);

            // If playStdCheckbox is checked, also play the standard sound
            if (playStdCheckbox.checked) {
                setTimeout(() => {
                    playSound(key.note, level);
                }, playTimeInMilliseconds / 2);
            }
        };

        if (index === 0) {
            playOne();
        } else {
            setTimeout(playOne, index * playTimeInternalMilliseconds);
        }
    });
}

// Play a single sound
function playSound(key, level) {
    try {
        // Convert key to the appropriate format
        const note = toNote(key);

        const url = `${basePath}${note}${level}.mp3`;

        // Prefer WebAudio (more reliable on iOS / silent mode); includes HTMLAudio fallback internally.
        playBuffer(url);
    } catch (error) {
        console.error('Error playing sound:', error);
        const currentTab = document.querySelector('.main-content:not(.hidden)');
        if (currentTab && currentTab.id === 'interval-tab' && typeof showIntervalStatus === 'function') {
            showIntervalStatus('播放错误：' + error.message, 'error');
        } else {
            showStatus('播放错误：' + error.message, 'error');
        }
    }
}

function initChordProgressions() {
    if (!chordProgressionInput || !chordPreview) return;

    document.getElementById('playChordProgressionButton')?.addEventListener('click', playChordProgression);
    document.getElementById('stopChordProgressionButton')?.addEventListener('click', stopChordProgression);

    chordProgressionInput.addEventListener('input', () => {
        renderChordPreview();
        document.querySelectorAll('.chord-preset').forEach(button => {
            button.classList.toggle('active', button.dataset.progression === getChordProgression().join(''));
        });
    });

    document.querySelectorAll('.chord-preset').forEach(button => {
        button.addEventListener('click', () => {
            chordProgressionInput.value = button.dataset.progression || '';
            renderChordPreview();
            document.querySelectorAll('.chord-preset').forEach(item => item.classList.toggle('active', item === button));
            playChordProgression();
        });
    });

    document.querySelectorAll('.play-style-btn').forEach(button => {
        button.addEventListener('click', () => {
            chordPlaybackMode = button.dataset.chordMode === 'arpeggio' ? 'arpeggio' : 'simultaneous';
            document.querySelectorAll('.play-style-btn').forEach(item => item.classList.toggle('active', item === button));
        });
    });

    renderChordPreview();
}

function getChordProgression() {
    return Array.from(String(chordProgressionInput?.value || '').matchAll(/[1-7]/g), match => Number(match[0]));
}

function showChordStatus(message, type = 'info') {
    if (!chordStatusText) return;
    chordStatusText.textContent = message;
    chordStatusText.dataset.type = type;
    clearTimeout(showChordStatus.timer);
    showChordStatus.timer = setTimeout(() => {
        chordStatusText.textContent = '';
    }, 3500);
}

function renderChordPreview(activeIndex = -1) {
    const progression = getChordProgression();
    if (!progression.length) {
        chordPreview.innerHTML = '<div class="chord-empty-state"><i class="fas fa-keyboard"></i><span>输入 1–7 来创建和弦进行</span></div>';
        return;
    }

    chordPreview.innerHTML = progression.map((degree, index) => {
        const chord = CHORD_DEFINITIONS[degree];
        return `<button type="button" class="chord-step${index === activeIndex ? ' is-playing' : ''}" data-chord-degree="${degree}" data-chord-index="${index}">
            <span class="chord-degree">${degree}</span>
            <strong>${chord.symbol}</strong>
            <small>${chord.quality}</small>
        </button>`;
    }).join('<span class="chord-arrow"><i class="fas fa-chevron-right"></i></span>');

    chordPreview.querySelectorAll('.chord-step').forEach(button => {
        button.addEventListener('click', () => {
            const degree = Number(button.dataset.chordDegree);
            playSingleChord(degree, Number(button.dataset.chordIndex));
        });
    });
}

function stopChordProgression() {
    chordPlaybackToken++;
    chordPlaybackTimers.forEach(timer => clearTimeout(timer));
    chordPlaybackTimers = [];
    renderChordPreview();
    if (chordPlayingContent) chordPlayingContent.textContent = '播放已停止';
    showChordStatus('已停止播放', 'info');
}

function playChordNotes(chord, level, mode) {
    if (mode === 'arpeggio') {
        chord.notes.forEach((key, index) => {
            const timer = setTimeout(() => playSound(key.note, level + key.offset), index * 135);
            chordPlaybackTimers.push(timer);
        });
        return;
    }

    chord.notes.forEach(key => playSound(key.note, level + key.offset));
}

function playSingleChord(degree, activeIndex = -1) {
    const chord = CHORD_DEFINITIONS[degree];
    if (!chord) return;
    stopChordProgression();
    const level = Math.min(7, Math.max(1, parseInt(chordLevelInput?.value) || 4));
    renderChordPreview(activeIndex);
    playChordNotes(chord, level, chordPlaybackMode);
    if (chordPlayingContent) chordPlayingContent.textContent = `${degree} · ${chord.symbol}（${chord.quality}）`;
    showChordStatus(`正在播放 ${chord.symbol}`, 'success');
}

function playChordProgression() {
    const progression = getChordProgression();
    if (!progression.length) {
        showChordStatus('请输入由 1–7 组成的和弦进行', 'error');
        return;
    }

    stopChordProgression();
    const token = chordPlaybackToken;
    const level = Math.min(7, Math.max(1, parseInt(chordLevelInput?.value) || 4));
    const duration = Math.max(300, parseInt(chordDurationInput?.value) || 900);

    progression.forEach((degree, index) => {
        const timer = setTimeout(() => {
            if (token !== chordPlaybackToken) return;
            const chord = CHORD_DEFINITIONS[degree];
            renderChordPreview(index);
            playChordNotes(chord, level, chordPlaybackMode);
            if (chordPlayingContent) chordPlayingContent.textContent = `${index + 1} / ${progression.length} · ${degree} = ${chord.symbol}`;
        }, index * duration);
        chordPlaybackTimers.push(timer);
    });

    const finishTimer = setTimeout(() => {
        if (token !== chordPlaybackToken) return;
        renderChordPreview();
        if (chordPlayingContent) chordPlayingContent.textContent = `完成 · ${progression.join(' → ')}`;
        showChordStatus(`已完成 ${progression.join(' → ')} 进行`, 'success');
    }, progression.length * duration);
    chordPlaybackTimers.push(finishTimer);
    showChordStatus(`开始播放 ${progression.join(' → ')}`, 'success');
}

// Parse a string to get notes and offsets
function parseString(input) {
    if (!input) return [];
    
    const result = [];
    let i = 0;
    
    while (i < input.length) {
        let offset = 0;
        
        // Check for offset modifiers
        if (input[i] === '+') {
            offset = 1;
            i++;
        } else if (input[i] === '-') {
            offset = -1;
            i++;
        }
        
        // Get the note
        if (i < input.length) {
            const note = input[i];
            result.push({ note, offset });
            i++;
        }
    }
    
    return result;
}

// Helper functions
function getSign(offset) {
    if (offset < 0) return '-';
    if (offset > 0) return '+';
    return '';
}

// Get permutations of a list
function getPermutations(list) {
    const result = [];
    const MAX_PERMUTATIONS = 200; // 减小最大排列数量上限
    
    // 安全检查：如果列表长度大于5，直接限制最大数量为100
    if (list.length > 5) {
        const MAX_SAFE_PERMUTATIONS = 100;
        
        // 生成部分排列
        const partialResult = [];
        const queue = [[[], [...list]]]; // [已使用的元素, 剩余可用元素]
        
        while (queue.length > 0 && partialResult.length < MAX_SAFE_PERMUTATIONS) {
            const [current, remaining] = queue.shift();
            
            if (remaining.length === 0) {
                partialResult.push(current);
                continue;
            }
            
            // 限制最多处理4个分支，进一步避免队列爆炸
            const limit = Math.min(remaining.length, 4);
            for (let i = 0; i < limit; i++) {
                const next = remaining[i];
                const newRemaining = [...remaining];
                newRemaining.splice(i, 1);
                queue.push([[...current, next], newRemaining]);
            }
        }
        
        return partialResult;
    }
    
    // 计算可能的全排列数量
    let totalPermutations = 1;
    for (let i = 2; i <= list.length; i++) {
        totalPermutations *= i;
    }
    
    // 如果输入太长，可能生成的组合数量太多，直接返回前几个排列
    if (list.length > 6 || totalPermutations > MAX_PERMUTATIONS) {
        // 对于长度超过6的输入，返回部分排列，避免崩溃
        console.warn(`输入长度为 ${list.length}，可能生成 ${totalPermutations} 个排列，已限制生成数量`);
        
        // 生成部分排列
        const partialResult = [];
        const queue = [[[], [...list]]]; // [已使用的元素, 剩余可用元素]
        
        while (queue.length > 0 && partialResult.length < MAX_PERMUTATIONS) {
            const [current, remaining] = queue.shift();
            
            if (remaining.length === 0) {
                partialResult.push(current);
                continue;
            }
            
            // 限制最多处理5个分支，避免队列爆炸
            const limit = Math.min(remaining.length, 5);
            for (let i = 0; i < limit; i++) {
                const next = remaining[i];
                const newRemaining = [...remaining];
                newRemaining.splice(i, 1);
                queue.push([[...current, next], newRemaining]);
            }
        }
        
        return partialResult;
    }
    
    // 对于正常长度的输入，生成全部排列
    function permute(arr, m = []) {
        if (arr.length === 0) {
            result.push(m);
        } else {
            for (let i = 0; i < arr.length; i++) {
                const curr = arr.slice();
                const next = curr.splice(i, 1);
                permute(curr.slice(), m.concat(next));
            }
        }
    }
    
    permute(list);
    return result;
}

// Get pair permutations of a list
function getPairPermutations(list) {
    // 限制最大生成数量
    const MAX_PAIR_COMBINATIONS = 50; // 减小对组合的最大数量
    
    // 计算可能的对组合数量
    const possiblePairs = list.length * (list.length - 1);
    
    if (possiblePairs > MAX_PAIR_COMBINATIONS) {
        console.warn(`输入长度为 ${list.length}，可能生成 ${possiblePairs} 个对组合，已限制生成数量`);
    }
    
    const result = [];
    
    // 生成所有可能的对组合
    for (let i = 0; i < list.length && result.length < MAX_PAIR_COMBINATIONS; i++) {
        for (let j = 0; j < list.length && result.length < MAX_PAIR_COMBINATIONS; j++) {
            if (i !== j) {
                result.push([list[i], list[j]]);
            }
        }
    }
    
    return result;
}

// Shuffle an array (Fisher-Yates algorithm)
function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

// Convert note to standard format
function toNote(input) {
    // Maps numbers to notes
    const noteMap = {
        '1': 'C',
        '2': 'D',
        '3': 'E',
        '4': 'F',
        '5': 'G',
        '6': 'A',
        '7': 'B'
    };
    
    return noteMap[input] || input;
}

// Create a default notes.txt file
function createDefaultNotesFile() {
    const defaultNotes = ['1', '2', '3', '4', '5', '6', '7'];
    localStorage.setItem('notes', JSON.stringify(defaultNotes.map(note => ({ noteName: note }))));
    renderNotesTable();
}

// 获取当前播放区域的纯文本内容
function getCurrentPlayingText() {
    const playingDiv = document.querySelector('.playing-content');
    if (!playingDiv || playingDiv.textContent.trim() === '请选择音符进行播放') {
        return '';
    }
    
    // 使用文本内容而不是HTML内容
    const content = playingDiv.textContent.trim();
    console.log("Current playing text:", content);
    return content;
}

// 从播放内容区域提取音符数据
function getNotesFromPlayingContent() {
    // 先尝试从lastComb获取
    if (lastComb && lastComb.length > 0) {
        return lastComb;
    }
    
    // 如果lastComb不存在，从DOM元素中解析
    const notesContainer = document.querySelector('.playing-content .note-combination');
    if (!notesContainer) {
        return [];
    }
    
    // 收集所有音符及其偏移量
    const result = [];
    const noteElements = notesContainer.querySelectorAll('.note-with-dots');
    
    noteElements.forEach(element => {
        // 检查是高音、低音还是普通音符
        const noteElement = element.querySelector('.note');
        if (!noteElement) return;
        
        const note = noteElement.textContent;
        
        // 检查是否有高音点
        const highDot = element.querySelector('.dots.above');
        if (highDot) {
            result.push({ note, offset: 1 });
            return;
        }
        
        // 检查是否有低音点
        const lowDot = element.querySelector('.dots.below');
        if (lowDot) {
            result.push({ note, offset: -1 });
            return;
        }
        
        // 普通音符
        result.push({ note, offset: 0 });
    });
    
    console.log("Extracted notes from playing content:", result);
    return result;
}

// 随机播组 - 播放被选中的组合
function playCombButtonClick() {
    // 获取所有被选中的组合
    const checkedRows = combinationsTable.querySelectorAll('.combination-checkbox:checked');
    
    if (checkedRows.length === 0) {
        showStatus('请先选择要播放的组合！', 'error');
        return;
    }
    
    // 收集所有被选中的组合
    const selectedCombinations = [];
    checkedRows.forEach(checkbox => {
        const row = checkbox.closest('tr');
        const plainTextVersion = row.dataset.combination;
        if (plainTextVersion) {
            selectedCombinations.push(plainTextVersion);
        }
    });
    
    // 随机选择一个组合进行播放
    if (selectedCombinations.length > 0) {
        const randomIndex = Math.floor(Math.random() * selectedCombinations.length);
        const selectedCombination = selectedCombinations[randomIndex];
        
        // 解析组合字符串为音符数据
        const keys = parseString(selectedCombination);
        if (keys && keys.length > 0) {
            // 播放音符
            playSounds(keys, parseInt(levelInput.value) || 4);
            // 更新播放内容显示
            updatePlayingContent(selectedCombination);
            // 保存当前播放的组合
            lastComb = keys;
            selectedCombination = selectedCombination;
            
            showStatus(`随机播放组合: ${selectedCombination}`, 'success');
        } else {
            showStatus('无效的音符组合！', 'error');
        }
    }
}

// 重播组合 - 重复播放上一个随机选择的组合
function repeatCombButtonClick() {
    if (lastComb && lastComb.length > 0) {
        // 复制上次的内容，不做任何修改
        const notesToPlay = [...lastComb];
        playSounds(notesToPlay, parseInt(levelInput.value) || 4);
        showStatus('重播上次组合', 'success');
    } else {
        showStatus('没有上次播放的组合！', 'error');
    }
}

// ==================== 音程训练功能 ====================

// 音程定义表 (半音数)
const intervalDefinitions = {
    'unison': { semitones: 0, name: '一度' },
    'minor2': { semitones: 1, name: '小二度' },
    'major2': { semitones: 2, name: '大二度' },
    'minor3': { semitones: 3, name: '小三度' },
    'major3': { semitones: 4, name: '大三度' },
    'perfect4': { semitones: 5, name: '纯四度' },
    'augmented4': { semitones: 6, name: '增四度' },
    'perfect5': { semitones: 7, name: '纯五度' },
    'minor6': { semitones: 8, name: '小六度' },
    'major6': { semitones: 9, name: '大六度' },
    'minor7': { semitones: 10, name: '小七度' },
    'major7': { semitones: 11, name: '大七度' },
    'octave': { semitones: 12, name: '八度' }
};

// 音符的半音位置
const notePositions = {
    '1': 0,  // C
    '2': 2,  // D
    '3': 4,  // E
    '4': 5,  // F
    '5': 7,  // G
    '6': 9,  // A
    '7': 11  // B
};

// 音程训练相关变量
let intervalTrainingState = {
    currentNote1: null,
    currentNote2: null,
    currentIntervalType: null,
    isWaiting: false,
    playDirection: 'ascending', // 'ascending', 'descending', 'random'
    lastActualDirection: null,
    lastWasRandom: false
};

function getNormalizedPositionAndOctaveOffset(rawPosition) {
    const octaveOffset = Math.floor(rawPosition / 12);
    const normalizedPosition = ((rawPosition % 12) + 12) % 12;
    return { normalizedPosition, octaveOffset };
}

const pitchClassToJianpu = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];
const pitchClassToAudio = [
    { note: 'C', flat: false }, // 0
    { note: 'D', flat: true },  // 1 (Db)
    { note: 'D', flat: false }, // 2
    { note: 'E', flat: true },  // 3 (Eb)
    { note: 'E', flat: false }, // 4
    { note: 'F', flat: false }, // 5
    { note: 'G', flat: true },  // 6 (Gb)
    { note: 'G', flat: false }, // 7
    { note: 'A', flat: true },  // 8 (Ab)
    { note: 'A', flat: false }, // 9
    { note: 'B', flat: true },  // 10 (Bb)
    { note: 'B', flat: false }  // 11
];

function computeIntervalTarget(startNote, semitones, direction) {
    const startPosition = notePositions[startNote];
    if (startPosition === undefined) return null;

    const rawTargetPosition = direction === 'descending'
        ? (startPosition - semitones)
        : (startPosition + semitones);

    const { normalizedPosition, octaveOffset } = getNormalizedPositionAndOctaveOffset(rawTargetPosition);
    const display = pitchClassToJianpu[normalizedPosition];
    const audio = pitchClassToAudio[normalizedPosition];
    if (!display || !audio) return null;

    return { display, octaveOffset, audioNote: audio.note, audioFlat: audio.flat };
}

function formatNoteWithOffset(note, octaveOffset) {
    return `${getSign(octaveOffset)}${note}`;
}

function isNaturalJianpu(display) {
    return typeof display === 'string' && !display.startsWith('b');
}

function renderDotsHtml(dotCount) {
    return Array.from({ length: dotCount }, () => '<span class="dot" aria-hidden="true"></span>').join('');
}

function formatIntervalNoteWithDotsHtml(jianpuText, octaveOffset) {
    const dotCount = Math.abs(octaveOffset);
    const above = octaveOffset > 0 ? `<span class="dots above">${renderDotsHtml(dotCount)}</span>` : '';
    const below = octaveOffset < 0 ? `<span class="dots below">${renderDotsHtml(dotCount)}</span>` : '';

    const accidental = jianpuText.startsWith('b') ? '<span class="accidental">b</span>' : '';
    const digit = jianpuText.startsWith('b') ? jianpuText.slice(1) : jianpuText;

    return `<div class="note-with-dots">${above}<span class="note">${accidental}${digit}</span>${below}</div>`;
}

function formatIntervalDisplayHtml(note1Jianpu, note2Jianpu, note2OctaveOffset) {
    return `<span class="interval-display">${formatIntervalNoteWithDotsHtml(note1Jianpu, 0)}<span class="sep">-</span>${formatIntervalNoteWithDotsHtml(note2Jianpu, note2OctaveOffset)}</span>`;
}

function formatIntervalDisplayHtmlWithOffsets(note1Jianpu, note1OctaveOffset, note2Jianpu, note2OctaveOffset) {
    return `<span class="interval-display">${formatIntervalNoteWithDotsHtml(note1Jianpu, note1OctaveOffset)}<span class="sep">-</span>${formatIntervalNoteWithDotsHtml(note2Jianpu, note2OctaveOffset)}</span>`;
}

function getAudioDigitFromDisplay(display) {
    return display && display.startsWith('b') ? display.slice(1) : display;
}

function normalizeOctaveOffsets(offsetA, offsetB) {
    const minOffset = Math.min(offsetA, offsetB);
    const shift = minOffset < 0 ? -minOffset : 0;
    return { a: offsetA + shift, b: offsetB + shift };
}

// 初始化音程训练
function initIntervalTraining() {
    // Tab切换
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', switchTab);
    });

    // 音程训练按钮
    document.getElementById('playIntervalButton').addEventListener('click', playIntervalButtonClick);
    document.getElementById('randomIntervalButton').addEventListener('click', randomIntervalButtonClick);
    document.getElementById('generateIntervalsButton').addEventListener('click', generateIntervalsButtonClick);

    // 音程范围选择
    document.getElementById('selectAllIntervals').addEventListener('click', selectAllIntervalRanges);
    document.getElementById('deselectAllIntervals').addEventListener('click', deselectAllIntervalRanges);

    // 播放方向按钮
    document.getElementById('ascendingBtn').addEventListener('click', (e) => setPlayDirection('ascending', e.target.closest('button')));
    document.getElementById('descendingBtn').addEventListener('click', (e) => setPlayDirection('descending', e.target.closest('button')));
    document.getElementById('randomDirectionBtn').addEventListener('click', (e) => setPlayDirection('random', e.target.closest('button')));

    // 音程选择按钮
    document.querySelectorAll('.interval-option-btn').forEach(btn => {
        btn.addEventListener('click', handleIntervalOptionClick);
    });

    // 键盘快捷键
    document.addEventListener('keydown', handleIntervalKeyDown);
}

// 切换Tab页面
function switchTab(event) {
    const tabName = event.target.closest('.tab-btn').getAttribute('data-tab');
    const allTabs = document.querySelectorAll('.main-content');
    const allBtns = document.querySelectorAll('.tab-btn');

    allTabs.forEach(tab => tab.classList.add('hidden'));
    allBtns.forEach(btn => btn.classList.remove('active'));

    document.getElementById(tabName).classList.remove('hidden');
    event.target.closest('.tab-btn').classList.add('active');
}

// 计算两个音符之间的半音差
function getSemitonesDifference(note1, note2) {
    const pos1 = notePositions[note1];
    const pos2 = notePositions[note2];
    return (pos2 - pos1 + 12) % 12;
}

// 识别音程类型
function identifyInterval(semitones) {
    for (const [key, value] of Object.entries(intervalDefinitions)) {
        if (value.semitones === semitones) {
            return key;
        }
    }
    return null;
}

// 播放音程
function playInterval(note1, note2, level, sequential = true) {
    const level1 = typeof level === 'object' && level !== null ? level.level1 : level;
    const level2 = typeof level === 'object' && level !== null ? level.level2 : level;
    if (sequential) {
        // 顺序播放
        const delay = parseInt(document.getElementById('intervalDelay').value) || 500;
        playSound(note1, level1);
        setTimeout(() => {
            playSound(note2, level2);
        }, delay);
    } else {
        // 同时播放
        playSound(note1, level1);
        playSound(note2, level2);
    }
}

// 播放音程按钮点击
function playIntervalButtonClick(actualDirectionOverride) {
    const intervalType = document.getElementById('intervalType').value;
    const startNote = document.getElementById('intervalStartNote').value;
    const level = parseInt(document.getElementById('intervalLevel').value) || 4;
    const sequential = document.getElementById('sequentialPlayback').checked;

    if (!intervalType) {
        showIntervalStatus('请选择音程类型！', 'error');
        return;
    }

    const semitones = intervalDefinitions[intervalType].semitones;

    const directionSetting = intervalTrainingState.playDirection;
    const actualDirection = actualDirectionOverride ?? (directionSetting === 'random'
        ? (intervalTrainingState.lastWasRandom && (intervalTrainingState.lastActualDirection === 'ascending' || intervalTrainingState.lastActualDirection === 'descending')
            ? intervalTrainingState.lastActualDirection
            : (Math.random() > 0.5 ? 'ascending' : 'descending'))
        : directionSetting);

    const target = computeIntervalTarget(startNote, semitones, actualDirection);
    if (!target) {
        showIntervalStatus('无法生成该音程！', 'error');
        return;
    }

    intervalTrainingState.lastActualDirection = actualDirection;

    intervalTrainingState.currentNote1 = startNote;
    intervalTrainingState.currentNote2 = target.display;
    intervalTrainingState.currentIntervalType = intervalType;
    intervalTrainingState.lastWasRandom = false;

    // 规范化八度偏移：确保最低音为 0（下行时把“起始音”整体抬高，用上方点表示）
    const offsets = normalizeOctaveOffsets(0, target.octaveOffset);
    const level1 = level + offsets.a;
    const level2Raw = level + offsets.b;
    const level2 = target.audioFlat ? `${level2Raw}b` : level2Raw;
    const note2Digit = getAudioDigitFromDisplay(target.display);

    // 播放顺序与显示一致：起始音 -> 目标音
    playInterval(startNote, note2Digit, { level1, level2 }, sequential);

    // 更新显示
    const intervalName = intervalDefinitions[intervalType].name;
    const directionText = directionSetting === 'random'
        ? `(随机 ${actualDirection === 'ascending' ? '上行' : '下行'})`
        : (actualDirection === 'ascending' ? '(上行)' : '(下行)');
    const displayHtml = formatIntervalDisplayHtmlWithOffsets(startNote, offsets.a, target.display, offsets.b);
    document.getElementById('intervalPlayingContent').innerHTML = `${displayHtml} ${directionText} ${intervalName}`;

    // 不显示“播放音程: ...”状态提示（避免占位干扰界面）
}

// 随机音程按钮点击
function randomIntervalButtonClick() {
    // 获取选中的音程范围
    const selectedIntervals = getSelectedIntervalRanges();
    if (selectedIntervals.length === 0) {
        showIntervalStatus('请至少选择一个音程范围！', 'error');
        return;
    }

    const allNotes = ['1', '2', '3', '4', '5', '6', '7'];
    const directionSetting = intervalTrainingState.playDirection;

    // 随机模式下：不选含半音显示(b2/b3/b5/b6/b7)的结果
    const maxAttempts = 200;
    for (let i = 0; i < maxAttempts; i++) {
        const randomInterval = selectedIntervals[Math.floor(Math.random() * selectedIntervals.length)];
        const randomNote = allNotes[Math.floor(Math.random() * allNotes.length)];
        const semitones = intervalDefinitions[randomInterval]?.semitones;
        if (typeof semitones !== 'number') continue;

        const actualDirection = directionSetting === 'random'
            ? (Math.random() > 0.5 ? 'ascending' : 'descending')
            : directionSetting;

        const target = computeIntervalTarget(randomNote, semitones, actualDirection);
        if (!target || !isNaturalJianpu(target.display)) continue;

        document.getElementById('intervalType').value = randomInterval;
        document.getElementById('intervalStartNote').value = randomNote;
        intervalTrainingState.lastWasRandom = true;
        intervalTrainingState.lastActualDirection = actualDirection;
        playIntervalButtonClick(actualDirection);
        intervalTrainingState.isWaiting = true;
        return;
    }

    showIntervalStatus('随机模式下无法生成不含半音的音程组合，请调整音程范围或方向。', 'error');
}

// 处理音程选择点击
function handleIntervalOptionClick(event) {
    const btn = event.target.closest('.interval-option-btn');
    if (!btn) return;

    const selectedInterval = btn.getAttribute('data-interval');

    if (!intervalTrainingState.currentIntervalType) {
        showIntervalStatus('请先播放一个音程！', 'error');
        return;
    }

    if (intervalTrainingState.isWaiting) {
        const correct = selectedInterval === intervalTrainingState.currentIntervalType;

        if (correct) {
            showIntervalStatus('✓ 正确！', 'success');
            btn.classList.add('correct');
            setTimeout(() => {
                btn.classList.remove('correct');
            }, 1000);
        } else {
            const correctName = intervalDefinitions[intervalTrainingState.currentIntervalType].name;
            showIntervalStatus(`✗ 错误！正确答案是: ${correctName}`, 'error');
            btn.classList.add('incorrect');
            setTimeout(() => {
                btn.classList.remove('incorrect');
            }, 1000);
        }

        // 重置状态，准备下一题
        intervalTrainingState.isWaiting = false;
        intervalTrainingState.currentIntervalType = null;
    }
}

// 生成练习组按钮点击
function generateIntervalsButtonClick() {
    const startNote = document.getElementById('intervalStartNote').value;
    const level = parseInt(document.getElementById('intervalLevel').value) || 4;
    const tbody = document.querySelector('#generatedIntervalsTable tbody');

    // 获取选中的音程范围
    const selectedIntervals = getSelectedIntervalRanges();
    if (selectedIntervals.length === 0) {
        showIntervalStatus('请至少选择一个音程范围！', 'error');
        return;
    }

    tbody.innerHTML = '';

    const intervals = [];
    for (const [key, value] of Object.entries(intervalDefinitions)) {
        // 只处理选中的音程
        if (!selectedIntervals.includes(key)) {
            continue;
        }

        const semitones = value.semitones;
        const target = computeIntervalTarget(startNote, semitones, 'ascending');
        if (target) {
            intervals.push({
                interval: key,
                name: value.name,
                note1: startNote,
                note2: target.display,
                semitones: semitones
            });
        }
    }

    // 添加到表格
    intervals.forEach((interval, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${interval.note1} - ${interval.note2}</td>
            <td>${interval.name}</td>
            <td>${interval.semitones}</td>
            <td><button class="btn primary" onclick="playGeneratedInterval('${interval.note1}', ${interval.semitones}, ${level})">播放</button></td>
        `;
        tbody.appendChild(row);
    });

    showIntervalStatus(`已生成${intervals.length}个音程`, 'success');
}

// 播放生成的音程
function playGeneratedInterval(note1, semitones, level) {
    const sequential = document.getElementById('sequentialPlayback').checked;
    const directionSetting = intervalTrainingState.playDirection;
    const actualDirection = directionSetting === 'random'
        ? (Math.random() > 0.5 ? 'ascending' : 'descending')
        : directionSetting;

    const target = computeIntervalTarget(note1, semitones, actualDirection);
    if (!target) {
        showIntervalStatus('无法生成该音程！', 'error');
        return;
    }

    const offsets = normalizeOctaveOffsets(0, target.octaveOffset);
    const level1 = level + offsets.a;
    const level2Raw = level + offsets.b;
    const level2 = target.audioFlat ? `${level2Raw}b` : level2Raw;
    const note2Digit = getAudioDigitFromDisplay(target.display);
    playInterval(note1, note2Digit, { level1, level2 }, sequential);

    intervalTrainingState.currentNote1 = note1;
    intervalTrainingState.currentNote2 = target.display;

    // 识别音程
    intervalTrainingState.currentIntervalType = identifyInterval(semitones);
    intervalTrainingState.isWaiting = true;

    const directionText = directionSetting === 'random'
        ? `(随机 ${actualDirection === 'ascending' ? '上行' : '下行'})`
        : (actualDirection === 'ascending' ? '(上行)' : '(下行)');
    const displayHtml = formatIntervalDisplayHtmlWithOffsets(note1, offsets.a, target.display, offsets.b);
    document.getElementById('intervalPlayingContent').innerHTML = `${displayHtml} ${directionText}`;
    showIntervalStatus(`请识别音程 ${directionText}`, 'info');
}

// 处理音程相关的键盘快捷键
function handleIntervalKeyDown(event) {
    const currentTab = document.querySelector('.main-content:not(.hidden)');
    if (currentTab.id !== 'interval-tab') return;

    if (event.key === 'w' || event.key === 'W') {
        playIntervalButtonClick();
    } else if (event.key === 'q' || event.key === 'Q') {
        randomIntervalButtonClick();
    } else if (event.key === 's' || event.key === 'S') {
        generateIntervalsButtonClick();
    }
}

// 显示音程训练状态信息
function showIntervalStatus(message, type = 'error') {
    const statusText = document.getElementById('intervalStatusText');
    statusText.textContent = message;
    statusText.className = 'status-text';

    if (type === 'success') {
        statusText.style.color = 'var(--success-color)';
    } else if (type === 'info') {
        statusText.style.color = 'var(--primary-color)';
    } else {
        statusText.style.color = 'var(--danger-color)';
    }

    // 清除状态消息
    setTimeout(() => {
        statusText.textContent = '';
    }, 3000);
}

// 获取选中的音程范围
function getSelectedIntervalRanges() {
    const checkboxes = document.querySelectorAll('.interval-range-checkbox:checked');
    const selectedIntervals = [];
    checkboxes.forEach(checkbox => {
        selectedIntervals.push(checkbox.value);
    });
    return selectedIntervals;
}

// 设置播放方向
function setPlayDirection(direction, buttonElement) {
    intervalTrainingState.playDirection = direction;
    intervalTrainingState.lastWasRandom = false;

    // 更新按钮样式
    document.querySelectorAll('.direction-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    buttonElement.classList.add('active');

    scheduleSaveAppSettings();
}

// 全选所有音程范围
function selectAllIntervalRanges() {
    document.querySelectorAll('.interval-range-checkbox').forEach(checkbox => {
        checkbox.checked = true;
    });
    showIntervalStatus('已全选所有音程', 'success');
}

// 反选所有音程范围
function deselectAllIntervalRanges() {
    document.querySelectorAll('.interval-range-checkbox').forEach(checkbox => {
        checkbox.checked = !checkbox.checked;
    });
    const selected = getSelectedIntervalRanges().length;
    showIntervalStatus(`已反选，当前选中${selected}个音程`, 'info');
}

// 在DOMContentLoaded事件中初始化音程训练
document.addEventListener('DOMContentLoaded', () => {
    initIntervalTraining();
    loadAppSettings();
    initAutoSaveForSettings();
}); 
