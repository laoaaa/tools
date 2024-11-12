document.addEventListener('DOMContentLoaded', () => {
    loadForbiddenWords();
    document.getElementById('checkButton').addEventListener('click', checkForbiddenWords);
});

let forbiddenWords = [];
let isForbiddenWordsLoaded = false;

async function loadForbiddenWords() {
    try {
        console.log('正在加载违禁词列表...');
        const response = await fetch('forbidden_words.json');
        if (!response.ok) {
            throw new Error(`HTTP错误！状态：${response.status}`);
        }
        const data = await response.json();
        forbiddenWords = data.words || [];
        isForbiddenWordsLoaded = true;
        console.log('加载的违禁词列表:', forbiddenWords);
        document.getElementById('loadStatus').textContent = '鸣谢:维思;张叔;chatGPT4.0';
    } catch (error) {
        console.error('加载违禁词列表失败:', error);
        alert('加载违禁词列表失败，请稍后再试。');
        document.getElementById('loadStatus').textContent = '违禁词列表加载失败。';
    }
}

function checkForbiddenWords() {
    if (!isForbiddenWordsLoaded) {
        alert('违禁词列表尚未加载，请稍后再试。');
        return;
    }

    const textInput = document.getElementById('textInput').value;
    console.log('输入的文本:', textInput);
    let resultHTML = escapeHtml(textInput);
    let detectedWords = new Set();

    forbiddenWords.forEach(word => {
        const regex = new RegExp(`${escapeRegExp(word)}`, 'gi');
        console.log('检查的违禁词:', word);
        if (regex.test(textInput)) {
            detectedWords.add(word);
            resultHTML = resultHTML.replace(regex, `<span class="highlight">${word}</span>`);
        }
    });

    document.getElementById('result').innerHTML = resultHTML;
    displayDetectedWords(detectedWords);
}

function displayDetectedWords(detectedWords) {
    const detectedWordsDiv = document.getElementById('detectedWords');
    const wordList = document.getElementById('wordList');
    wordList.innerHTML = '';

    if (detectedWords.size > 0) {
        detectedWords.forEach(word => {
            const listItem = document.createElement('li');
            listItem.textContent = word;
            wordList.appendChild(listItem);
        });
        detectedWordsDiv.style.display = 'block';
        detectedWordsDiv.querySelector('.note').textContent = '提示：请避免使用以上检测到的违禁词。';
    } else {
        detectedWordsDiv.style.display = 'block';
        detectedWordsDiv.querySelector('.note').textContent = '未检测到违禁词。';
    }
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}