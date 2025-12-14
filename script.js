// Global variables
const notes = [];
let playTimeInMilliseconds = 800;
let playTimeInternalMilliseconds = 800;
const filePath = 'notes.txt';
let selectedNote = null;
let selectedCombination = null;
let lastComb = null;
const basePath = 'piano/'; // Change this to the path where audio files are stored

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
// 虚拟键盘元素
const clearKeyInputBtn = document.getElementById('clearKeyInput');
const playInputBtn = document.getElementById('playInputBtn');
const backspaceBtn = document.getElementById('backspaceBtn');
const keyBtns = document.querySelectorAll('.key-btn[data-key]');

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
    selectAllCheckBox.addEventListener('click', selectAllCheckBoxClick);
    playTimeInput.addEventListener('input', playTimeInputChange);
    playTimeinterInput.addEventListener('input', playTimeInputChange);
    
    // 虚拟键盘事件监听
    initVirtualKeyboard();
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', handleKeyDown);
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
        html = `<div class="note-with-dots"><span class="dots above">${'•'.repeat(Math.abs(item.offset))}</span><span class="note">${item.note}</span></div>`;
    } else if (item.offset < 0) {
        // Low note
        html = `<div class="note-with-dots"><span class="note">${item.note}</span><span class="dots below">${'•'.repeat(Math.abs(item.offset))}</span></div>`;
    } else {
        // Regular note
        html = `<div class="note-with-dots"><span class="note">${item.note}</span></div>`;
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
    const regex = /<div class="note-with-dots"><span class="dots above">.+?<\/span><span class="note">(\d)<\/span><\/div>|<div class="note-with-dots"><span class="note">(\d)<\/span><span class="dots below">.+?<\/span><\/div>|<div class="note-with-dots"><span class="note">(\d)<\/span><\/div>/g;
    
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
    keys.forEach((key, index) => {
        setTimeout(() => {
            playSound(key.note, level + key.offset);
            
            // If playStdCheckbox is checked, also play the standard sound
            if (playStdCheckbox.checked) {
                setTimeout(() => {
                    playSound(key.note, level);
                }, playTimeInMilliseconds / 2);
            }
        }, index * playTimeInternalMilliseconds);
    });
}

// Play a single sound
function playSound(key, level) {
    try {
        // Convert key to the appropriate format
        const note = toNote(key);
        
        // Create an audio element
        const audio = new Audio();
        
        // Set the source to the appropriate sound file
        audio.src = `${basePath}${note}${level}.mp3`;
        
        // Play the sound
        audio.play().catch(error => {
            console.error('Error playing sound:', error);
            showStatus(`无法播放音符 ${note}${level}`, 'error');
        });
    } catch (error) {
        console.error('Error playing sound:', error);
        showStatus('播放错误：' + error.message, 'error');
    }
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