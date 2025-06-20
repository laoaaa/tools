document.addEventListener('DOMContentLoaded', () => {
    // 元素引用
    const apiKeyInput = document.getElementById('api-key');
    const saveKeyButton = document.getElementById('save-key');
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');
    const previewImage = document.getElementById('preview-image');
    const analyzeButton = document.getElementById('analyze-button');
    const resultSection = document.getElementById('result-section');
    const loadingIndicator = document.getElementById('loading');
    const resultContent = document.getElementById('result-content');

    // 从本地存储加载API密钥
    const savedApiKey = localStorage.getItem('doubao_api_key');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
    }

    // 保存API密钥到本地存储
    saveKeyButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem('doubao_api_key', apiKey);
            alert('API Key 已保存！');
        } else {
            alert('请输入有效的 API Key');
        }
    });

    // 拖放区域事件处理
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => {
            dropArea.classList.add('highlight');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => {
            dropArea.classList.remove('highlight');
        });
    });

    // 处理文件拖放
    dropArea.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFiles);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles({ target: { files } });
    }

    function handleFiles(e) {
        const files = e.target.files;
        if (files.length) {
            const file = files[0];
            if (!file.type.match('image.*')) {
                alert('请上传图片文件');
                return;
            }
            displayPreview(file);
        }
    }

    // 显示图片预览
    function displayPreview(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            // 创建一个Image对象来加载图片
            const img = new Image();
            img.onload = function() {
                // 创建canvas元素来转换图片格式
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                
                // 在canvas上绘制图片
                ctx.drawImage(img, 0, 0);
                
                // 将canvas内容转换为JPEG格式的数据URL
                previewImage.src = canvas.toDataURL('image/jpeg', 0.92); // 0.92是质量参数
                previewContainer.classList.remove('hidden');
                dropArea.classList.add('hidden');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // 分析按钮点击事件
    analyzeButton.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            alert('请先输入豆包 API Key');
            return;
        }

        // 获取图片数据
        const imageData = previewImage.src;
        if (!imageData) {
            alert('请先上传图片');
            return;
        }

        // 显示加载指示器
        resultSection.classList.remove('hidden');
        loadingIndicator.classList.remove('hidden');
        resultContent.innerHTML = '';

        try {
            const result = await analyzeMathProblem(apiKey, imageData);
            renderResult(result);
        } catch (error) {
            console.error('解析过程出错:', error);
            
            // 提供更友好的错误提示
            let errorMessage = error.message;
            if (error.message.includes('Failed to fetch') || error.message.includes('CORS') || error.message.includes('network')) {
                errorMessage = '无法连接到API服务器。请确保：<br>' +
                    '1. 网络连接正常<br>' +
                    '2. 豆包API服务可用<br>' +
                    '3. 如果使用HTTPS，可能需要处理证书信任问题';
            } else if (error.message.includes('timeout')) {
                errorMessage = '请求超时，请稍后重试或检查网络连接';
            } else if (error.message.includes('authorization') || error.message.includes('invalid')) {
                errorMessage = 'API密钥可能无效，请检查您的豆包API密钥是否正确';
            }
            
            resultContent.innerHTML = `<div class="error">
                <h3>错误</h3>
                <p>${errorMessage}</p>
                <div class="tips">
                    <strong>提示：</strong>请参考README.md文件中的故障排除指南。
                </div>
            </div>`;
        } finally {
            loadingIndicator.classList.add('hidden');
        }
    });

    // 添加粘贴事件监听
    document.addEventListener('paste', (event) => {
        const items = event.clipboardData.items;
        let imageFile = null;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                imageFile = items[i].getAsFile();
                break;
            }
        }

        if (imageFile) {
            event.preventDefault(); // 阻止默认粘贴行为
            displayPreview(imageFile); // 使用现有函数显示预览
        }
    });

    // 调用豆包API分析试题
    async function analyzeMathProblem(apiKey, imageData) {
        // 确保图片是JPEG格式
        let base64Image;
        
        // 如果图片数据不是以JPEG格式开头，则重新创建JPEG格式
        if (!imageData.startsWith('data:image/jpeg')) {
            // 创建一个临时图片对象
            const img = new Image();
            img.src = imageData;
            
            // 创建一个canvas元素
            const canvas = document.createElement('canvas');
            canvas.width = img.width || 800; // 默认宽度
            canvas.height = img.height || 600; // 默认高度
            
            // 在canvas上绘制图片
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            // 将canvas内容转换为JPEG格式的数据URL
            imageData = canvas.toDataURL('image/jpeg', 0.92);
        }
        
        // 从Base64数据URL中提取Base64字符串
        base64Image = imageData.replace(/^data:image\/jpeg;base64,/, '');
        
        // 直接访问豆包API
        const url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
        
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };
        
        const data = {
            model: 'doubao-1-5-thinking-vision-pro-250428',  // 使用豆包视觉深度思考模型
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: '这是一道理科题，请帮我解答，并用LaTeX格式表示理科公式。请给出详细的解题步骤和思路。'
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`
                            }
                        }
                    ]
                }
            ],
            temperature: 0.7
        };
        
        // 获取深度思考复选框的状态
        const disableThinkingCheckbox = document.getElementById('disable-thinking');
        if (disableThinkingCheckbox) {
            if (disableThinkingCheckbox.checked) {
                // 如果复选框被勾选，设置 thinking 参数为 { enabled: false } 以关闭深度思考模式
                data.thinking = { enabled: false };
            } else {
                // 如果复选框未勾选，设置 thinking 参数为 { enabled: true } 以开启深度思考模式
                data.thinking = { enabled: true };
            }
        }
        
        try {
            console.log('发送API请求:', url);
            console.log('请求头:', JSON.stringify(headers));
            console.log('请求体:', JSON.stringify(data).substring(0, 100) + '...');
            
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(data)
            });
            
            console.log('API响应状态:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API错误响应:', errorText);
                let errorMessage = '请求失败';
                try {
                    const errorData = JSON.parse(errorText);
                    errorMessage = errorData.error?.message || errorData.message || '请求失败';
                } catch (e) {
                    errorMessage = `请求失败 (${response.status}): ${errorText.substring(0, 100)}`;
                }
                throw new Error(errorMessage);
            }
            
            const responseData = await response.json();
            console.log('API响应成功:', JSON.stringify(responseData).substring(0, 100) + '...');
            return responseData;
        } catch (error) {
            console.error('API调用异常:', error);
            if (error.message === 'Failed to fetch') {
                throw new Error('无法连接到API服务器，请检查网络连接或API密钥是否正确。');
            } else {
                throw error;
            }
        }
    }

    // 渲染结果并处理LaTeX公式
    function renderResult(result) {
        // 提取API返回的文本内容
        const content = result.choices[0].message.content;
        
        // 将内容分成段落
        const paragraphs = content.split('\n\n');
        
        // 创建HTML内容
        let html = '';
        
        paragraphs.forEach(paragraph => {
            if (paragraph.trim()) {
                // 检查是否是LaTeX块（被$$包围）
                if (paragraph.includes('$$')) {
                    // 处理块级LaTeX公式
                    const parts = paragraph.split('$$');
                    for (let i = 0; i < parts.length; i++) {
                        if (i % 2 === 0) {
                            // 文本部分
                            if (parts[i].trim()) {
                                html += `<p>${parts[i]}</p>`;
                            }
                        } else {
                            // LaTeX部分
                            html += `<div class="math-block">$$${parts[i]}$$</div>`;
                        }
                    }
                } else if (paragraph.includes('$')) {
                    // 处理行内LaTeX公式
                    html += `<p>${paragraph}</p>`;
                } else {
                    // 普通文本
                    html += `<p>${paragraph}</p>`;
                }
            }
        });
        
        resultContent.innerHTML = html;
        
        // 渲染LaTeX公式
        renderMathInElement(resultContent, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false}
            ],
            throwOnError: false
        });
    }

    // 重新上传按钮
    document.getElementById('result-section').insertAdjacentHTML('beforeend', 
        '<button id="upload-again" class="upload-button" style="margin-top: 20px;">重新上传图片</button>');
    
    document.getElementById('upload-again').addEventListener('click', () => {
        previewContainer.classList.add('hidden');
        resultSection.classList.add('hidden');
        dropArea.classList.remove('hidden');
        previewImage.src = '';
        fileInput.value = '';
    });
});
