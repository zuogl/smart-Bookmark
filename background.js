import { processHistoryBookmarks } from './historyBookmarks.js';

console.log('Background service worker 已启动');

// 监听安装事件
chrome.runtime.onInstalled.addListener((details) => {
  console.log('安装类型:', details.reason);
  if (details.reason === 'install') {
    console.log(chrome.i18n.getMessage('processingBookmarks'));
    
    processHistoryBookmarks()
      .then((result) => {
        console.log(`书签处理完成。成功: ${result.successCount}, 失败: ${result.failureCount}`);
      })
      .catch(error => {
        console.error('处理历史书签时出错:', error);
      });
  }
});

self.onactivate = (event) => {
  console.log('Service Worker 已激活');
};

// 1. 首先注册所有的事件监听器
// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('background.js收到消息类型:', request.action);
  
  if (request.action === "processAI" && request.data) {
    console.log('background.js收到消息:', request.data);
    // 立即发送一个响应
    sendResponse({received: true});
    
    console.log('准备调用processWithAI函数...');
    // 异步处理AI调用
    processWithAI(request.data).catch(error => {
      console.error('processWithAI执行出错:', error);
    });
    
    console.log('processWithAI函数调用完成');
  }
  return true;
});

// 监听新建书签事件
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  console.log('检测到新书签:', bookmark);
  
  // 获取书签信息
  const url = bookmark.url;
  const title = bookmark.title;
  
  // 首先查找对应的标签页
  chrome.tabs.query({url: url}, async (tabs) => {
    console.log('找到匹配的标签页:', tabs);
    if (tabs[0]) {
      try {
        // 先注入content script
        await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ['content.js']
        });
        
        console.log('Content script 注入成功');
        
        const INIT_DELAY = 100;
        await new Promise(resolve => setTimeout(resolve, INIT_DELAY));
        
        // 然后发送消息
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "getMeta"
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('发送getMeta消息失败:', chrome.runtime.lastError);
          }
        });
        console.log('已发送getMeta消息到标签页');
      } catch (error) {
        console.error('注入或发送消息时出错:', error);
      }
    } else {
      console.log('未找到匹配的标签页');
    }
  });
});

// 2. 然后是功能函数
// AI处理逻辑
export async function processWithAI(metadata) {
  console.log('准备调用AI API...');
  const userLocale = metadata.userLanguage || 'zh-CN';
  const pageLocale = metadata.pageLanguage || 'auto';
  
  const prompt = `
  你是一位专业的多语言网页内容分析专家，擅长从网页内容中提取和生成高质量的标签。请根据以下页面信息生成4-6个关键标签：
  
  **页面信息：**
  - **标题：** ${metadata.title}
  - **网址：** ${metadata.url}
  - **描述：** ${metadata.description}
  - **关键词：** ${metadata.keywords}
  - **主要标题：** ${metadata.headings}
  - **页面内容：** ${metadata.content}
  - **页面语言：** ${pageLocale}
  - **用户语言：** ${userLocale}
  
  **要��：**
  1. **语言要求：** 生成标签必须使用用户的本地语言（${userLocale}）。
  2. **标签数量与长度：** 生成6-8个标签，每个标签由1-4个词组成。
  3. **标签维度：**
    - **URL关键词：** 请特别关注URL中的关键词
    - **页���内容：** �����析正文内容的主题和关键概念
    - **主题 (Topic)：** 网站的主要主题或领域
    - **内容形式 (Content Format)：** 内容的呈现形式
  4. **容相关性：** 标签应准确反映页面的核心内容和用途，助于后续检索和分类。
  5. **语言处理规则：**
     - 如果页面语言与用户语言不同，请先翻译内容再生成标签。
     - 专有名词（如品牌名、产品名）可保持原样。
     - 确保标签在用户语言环境下自然且易于理解。
  6. **输出格式：** 纯文本，标签之间用英文逗号分割。
  
  **示例输出：**
  github, repository, react, React框架, 开源项目, 代码仓库, 技术文档
  
  请确保标签符合用户的语言习惯，便于检索。仅返回标签列表,无需其他解释。
  `;

  try {
    console.log('发送API请求...');
    // 从配置文件或存储中获取API密钥
    const API_KEY = 'sk-b1d3726d217d475b88c614c2ab637b7c'; // 临时方案
    
    // TODO: 建议创建config.js来管理密钥：
    // import { API_KEY } from './config.js';
    
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{
          role: "user",
          content: prompt
        }],
        temperature: 1.0,
        max_tokens: 100
      })
    });

    if (!response.ok) {
      throw new APIError(`API request failed with status ${response.status}`);
    }

    console.log('API响应:', await response.clone().text());
    const result = await response.json();
    // 直接解析逗号分隔的标签
    const content = result.choices[0].message.content;
    const tags = content.split(',').map(tag => tag.trim()).filter(Boolean);
    
    console.log('收到元数据:', metadata);
    console.log('生成的标签:', tags);
    
    // 存储标签和图标
    saveTags(metadata.url, tags, metadata);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new NetworkError('Network request failed');
    }
    throw error;
  }
}

// 存储标签
export function saveTags(url, tags, metadata) {
  chrome.storage.local.get('bookmarkTags', (data) => {
    const bookmarkTags = data.bookmarkTags || {};
    const tagArray = Array.isArray(tags) ? tags : [];
    bookmarkTags[url] = {
      tags: tagArray,
      favicon: metadata.favicon || null
    };
    chrome.storage.local.set({bookmarkTags});
  });
}

console.log('图标URL:', chrome.runtime.getURL('assets/icon128.png'));
// 验证图标文件是否存在
fetch(chrome.runtime.getURL('assets/icon128.png'))
  .then(response => {
    console.log('图标文件状态:', response.status);
  })
  .catch(error => {
    console.error('图标文件加载失败:', error);
  }); 

// 自定义错误类
class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetworkError';
  }
}

class APIError extends Error {
  constructor(message) {
    super(message);
    this.name = 'APIError';
  }
}

// 错误通知函数
function notifyError(error) {
  console.error(`Error: ${error.message}`);
  // 可以添加用户通知逻辑
} 