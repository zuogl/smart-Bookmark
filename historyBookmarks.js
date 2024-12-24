import { processWithAI } from './background.js';

// 处理历史书签的主函数
async function processHistoryBookmarks() {
  console.log('开始处理历史书签...');
  
  // 获取所有书签
  const bookmarks = await chrome.bookmarks.getTree();
  const bookmarkList = [];
  
  // 递归遍历书签树
  function traverseBookmarks(node) {
    if (node.url) {
      bookmarkList.push({
        id: node.id,
        title: node.title,
        url: node.url
      });
    }
    if (node.children) {
      node.children.forEach(child => traverseBookmarks(child));
    }
  }
  
  // 遍历所有书签
  bookmarks.forEach(node => traverseBookmarks(node));
  console.log(`找到 ${bookmarkList.length} 个书签`);
  
  // 创建处理队列
  const result = await processBookmarkQueue(bookmarkList);
  return result;
}

// 获取页面元数据
async function fetchPageMetadata(url, bookmark) {
  try {
    // 尝试获取页面内容
    const response = await fetch(url);
    const html = await response.text();
    
    // 使用正则表达式提取元数据
    const getMetaContent = (pattern) => {
      const match = html.match(pattern);
      return match ? match[1] : '';
    };
    
    // 提取元数据
    const metadata = {
      url: url,
      title: bookmark.title || getMetaContent(/<title[^>]*>([^<]+)<\/title>/i),
      description: 
        getMetaContent(/<meta[^>]*name="description"[^>]*content="([^"]+)"[^>]*>/i) ||
        getMetaContent(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"[^>]*>/i) || '',
      keywords: 
        getMetaContent(/<meta[^>]*name="keywords"[^>]*content="([^"]+)"[^>]*>/i) || '',
      // 提取页面主要文本内容（前1000个字符）
      content: html.replace(/<[^>]+>/g, ' ')  // 移除HTML标签
                    .replace(/\s+/g, ' ')      // 合并空白字符
                    .trim()
                    .slice(0, 1000),
      // 提取所有h1-h3标题
      headings: (html.match(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/gi) || [])
        .map(h => h.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean)
        .join(', '),
      pageLanguage: getMetaContent(/<html[^>]*lang="([^"]+)"[^>]*>/i) || 'auto',
      userLanguage: navigator.language || 'zh-CN'
    };
    
    return metadata;
  } catch (error) {
    console.error(`获取页面内容失败: ${url}`, error);
    // 如果获取失败，返回基本信息
    return {
      url: url,
      title: bookmark.title,
      description: '',
      keywords: '',
      content: '',
      headings: '',
      pageLanguage: 'auto',
      userLanguage: navigator.language || 'zh-CN'
    };
  }
}

// 队列处理函数
async function processBookmarkQueue(bookmarks) {
  let successCount = 0;
  let failureCount = 0;
  const batchSize = 5; // 每批处理的书签数量
  const delay = 2000;  // 批次间延迟（毫秒）
  
  for (let i = 0; i < bookmarks.length; i += batchSize) {
    const batch = bookmarks.slice(i, i + batchSize);
    console.log(`处理批次 ${Math.floor(i/batchSize) + 1}/${Math.ceil(bookmarks.length/batchSize)}, 包含 ${batch.length} 个书签`);
    
    // 并行处理当前批次的书签
    await Promise.all(batch.map(async bookmark => {
      try {
        // 检查是否已经有标签
        const { bookmarkTags } = await chrome.storage.local.get('bookmarkTags');
        if (bookmarkTags && bookmarkTags[bookmark.url]) {
          console.log(`��签 ${bookmark.url} 已有标签，跳过`);
          successCount++;
          return;
        }
        
        // 获取完整的页面元数据
        const metadata = await fetchPageMetadata(bookmark.url, bookmark);
        
        // 调用AI处理
        await processWithAI(metadata);
        successCount++;
        
      } catch (error) {
        console.error(`处理书签失败: ${bookmark.url}`, error);
        failureCount++;
      }
    }));
    
    // 输出进度
    console.log(`处理进度: ${successCount + failureCount}/${bookmarks.length}`);
    console.log(`成功: ${successCount}, 失败: ${failureCount}`);
    
    // 批次间延迟
    if (i + batchSize < bookmarks.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.log(`历史书签处理完成。总计: ${bookmarks.length}, 成功: ${successCount}, 失败: ${failureCount}`);
  return {
    total: bookmarks.length,
    successCount,
    failureCount
  };
}

// 导出函数
export { processHistoryBookmarks }; 