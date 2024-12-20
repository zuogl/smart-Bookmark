console.log('Background service worker 已启动');

// 确保service worker正确加载
self.oninstall = (event) => {
  console.log('Service Worker 已安装');
};

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
  
  // 触发页面内容获取
  chrome.tabs.query({url: url}, (tabs) => {
    console.log('找到匹配的标签页:', tabs);
    if (tabs[0]) {
      try {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "getMeta"
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('发送getMeta消息失败:', chrome.runtime.lastError);
          }
        });
        console.log('已发送getMeta消息到标签页');
      } catch (error) {
        console.error('发送消息时出错:', error);
      }
    } else {
      console.log('未找到匹配的标签页');
    }
  });
}); 

// 2. 然后是功能函数
// AI处理逻辑
async function processWithAI(metadata) {
  console.log('准备调用AI API...');
  const prompt = `
    请基于以下网页信息生成3-5个关键标签：
    标题：${metadata.title}
    描述：${metadata.description}
    关键词：${metadata.keywords}
    
    要求：
    1. 每个标签限制在1-3个词
    2. 标签应该反映页面核心内容
    3. 返回格式为逗号分隔的标签列表
  `;

  try {
    console.log('发送API请求...');
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-b1d3726d217d475b88c614c2ab637b7c'
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

    console.log('API响应:', await response.clone().text());
    const result = await response.json();
    const tags = result.choices[0].message.content.split(',');
    
    console.log('收到元数据:', metadata);
    console.log('生成的标签:', tags);
    
    // 存储标签和图标
    saveTags(metadata.url, tags, metadata);
  } catch (error) {
    console.error('AI处理失败:', error);
  }
}

// 存储标签
function saveTags(url, tags, metadata) {
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