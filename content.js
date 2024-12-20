// 监听来自background的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getMeta') {
    // 获取页面元数据
    const metadata = {
      url: window.location.href,
      title: document.title,
      description: getMetaContent('description'),
      keywords: getMetaContent('keywords'),
      favicon: getFavicon()
    };
    // 发送到background处理
    chrome.runtime.sendMessage({
      action: 'processAI',
      data: metadata
    });
    // 立即响应
    sendResponse({ success: true });
    return false;
  }
});

// 辅助函数：获取meta标签内容
function getMetaContent(name) {
  const meta = document.querySelector(`meta[name="${name}"]`) || 
               document.querySelector(`meta[property="og:${name}"]`);
  return meta ? meta.content : '';
}

// 获取网站图标
function getFavicon() {
  // 尝试获取显式设置的图标
  const links = document.querySelectorAll('link[rel*="icon"]');
  for (const link of links) {
    const href = link.href;
    if (href) return href;
  }
  
  // 尝试获取默认位置的favicon.ico
  const url = new URL(window.location.href);
  return `${url.protocol}//${url.hostname}/favicon.ico`;
} 