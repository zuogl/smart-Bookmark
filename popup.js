let selectedIndex = -1;
let currentMatches = null;  // 初始化为null，表示还未进行搜索

// 添加防抖函数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    return new Promise((resolve) => {
      const later = async () => {
        clearTimeout(timeout);
        const result = await func(...args);
        resolve(result);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    });
  };
}

// 添加搜索缓存
const searchCache = new Map();

// 当输入框内容变化时搜索
document.getElementById('searchInput').addEventListener('input', async (e) => {
  const searchText = e.target.value.toLowerCase().trim();
  console.log('搜索文本:', searchText);
  selectedIndex = -1; // 重置选中项
  
  if (!searchText) {
    clearResults();
    return;
  }
  
  try {
    // 从storage获取所有书签标签
    const { bookmarkTags } = await chrome.storage.local.get('bookmarkTags');
    console.log('获取到的书签标签:', bookmarkTags);
    if (!bookmarkTags) {
      showNoResults();
      return;
    }
    
    // 将搜索文本分割成关键词数组
    const keywords = searchText.split(/\s+/).filter(Boolean);
    
    // 搜索匹配的书签
    currentMatches = await searchBookmarksDebounced(keywords, bookmarkTags);
    console.log('搜索结果:', currentMatches);
    displayResults(currentMatches, keywords);
  } catch (error) {
    console.error('搜索出错:', error);
    showNoResults();
  }
});

// 监听键盘事件
document.addEventListener('keydown', (e) => {
  // 确保currentMatches存在且有长度
  if (!Array.isArray(currentMatches) || currentMatches.length === 0) return;
  
  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault();
      moveSelection(-1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      moveSelection(1);
      break;
    case 'Enter':
      if (selectedIndex >= 0) {
        const selectedBookmark = currentMatches[selectedIndex];
        chrome.tabs.create({ url: selectedBookmark.url });
        window.close();
      }
      break;
    case 'Escape':
      document.getElementById('searchInput').value = '';
      clearResults();
      window.close();
      break;
  }
});

// 移动选中项
function moveSelection(direction) {
  const oldIndex = selectedIndex;
  selectedIndex = (selectedIndex + direction + currentMatches.length) % currentMatches.length;
  
  // 更新选中状态的样式
  const items = document.querySelectorAll('.bookmark-item');
  if (oldIndex >= 0) items[oldIndex].classList.remove('selected');
  items[selectedIndex].classList.add('selected');
  
  // 确保选中项可见
  items[selectedIndex].scrollIntoView({
    behavior: 'smooth',
    block: 'nearest'
  });
}

// 搜索书签
const searchBookmarksDebounced = debounce(async (keywords, bookmarkTags) => {
  try {
    // 使用关键词数组作为缓存key
    const cacheKey = keywords.join(',');
    if(searchCache.has(cacheKey)) {
      const cachedResults = searchCache.get(cacheKey);
      return Array.isArray(cachedResults) ? cachedResults : [];
    }
    
    const matches = new Map();
    
    // 获取所有书签树
    const bookmarkTree = await chrome.bookmarks.getTree();
    const allBookmarks = [];
    
    // 递归遍历书签树
    function traverseBookmarks(nodes) {
      for (const node of nodes) {
        if (node.url) {
          allBookmarks.push(node);
        }
        if (node.children) {
          traverseBookmarks(node.children);
        }
      }
    }
    
    traverseBookmarks(bookmarkTree);
    
    // 遍历所有书签
    for (const bookmark of allBookmarks) {
      // 跳过文件夹（没有URL的项目）
      if (!bookmark.url) continue;
      
      // 如果这个URL已经处理过，跳过
      if (matches.has(bookmark.url)) continue;
      
      const bookmarkData = bookmarkTags[bookmark.url] || { tags: [], favicon: null };
      const tags = bookmarkData.tags;
      
      // 检查每个关键词是否都能匹配到
      const allKeywordsMatch = keywords.every(keyword => {
        const title = bookmark.title.toLowerCase();
        const url = bookmark.url.toLowerCase();
        const lowercaseTags = Array.isArray(tags) ? tags.map(tag => tag.toLowerCase()) : [];
        
        return title.includes(keyword) || 
               url.includes(keyword) || 
               lowercaseTags.some(tag => tag.includes(keyword));
      });
      
      if (allKeywordsMatch) {
        // 计算匹配分数
        let score = 0;
        keywords.forEach(keyword => {
          // 标题匹配分数最高
          if (bookmark.title.toLowerCase().includes(keyword)) score += 3;
          // URL匹配分数其次
          if (bookmark.url.toLowerCase().includes(keyword)) score += 2;
          // 标签匹配分数最低
          if (tags.some(tag => tag.toLowerCase().includes(keyword))) score += 1;
        });
        
        matches.set(bookmark.url, {
          id: bookmark.id,
          title: bookmark.title,
          url: bookmark.url,
          tags: Array.isArray(tags) ? tags : [],
          favicon: bookmarkData.favicon,
          score: score
        });
      }
    }
    
    // 根据匹配得分排序结果
    const results = Array.from(matches.values()).sort((a, b) => b.score - a.score);
    searchCache.set(cacheKey, results);
    console.log(`找到 ${results.length} 个匹配结果`);
    return results;
  } catch (error) {
    console.error('搜索书签时出错:', error);
    return [];
  }
}, 300);

// 搜索书签的函数
async function searchBookmarks(keywords, bookmarkTags) {
  // 获取所有书签
  const bookmarks = await chrome.bookmarks.getTree();
  const matches = [];
  
  // 递归搜索书签树
  function searchBookmarkNode(node) {
    if (node.url) {
      const title = node.title.toLowerCase();
      const url = node.url.toLowerCase();
      const tags = (bookmarkTags[node.url]?.tags || []).map(tag => tag.toLowerCase());
      
      // 检查是否所有关键词都匹配
      const allKeywordsMatch = keywords.every(keyword => {
        return title.includes(keyword) || 
               url.includes(keyword) || 
               tags.some(tag => tag.includes(keyword));
      });
      
      if (allKeywordsMatch) {
        matches.push({
          id: node.id,
          title: node.title,
          url: node.url,
          tags: bookmarkTags[node.url]?.tags || [],
          favicon: bookmarkTags[node.url]?.favicon
        });
      }
    }
    
    if (node.children) {
      node.children.forEach(child => searchBookmarkNode(child));
    }
  }
  
  bookmarks.forEach(node => searchBookmarkNode(node));
  return matches;
}

// 显示搜索结果
function displayResults(matches, keywords) {
  const resultsContainer = document.getElementById('results');
  resultsContainer.innerHTML = '';
  
  if (!matches || matches.length === 0) {
    showNoResults();
    return;
  }
  
  // 默认选中第一项
  selectedIndex = 0;
  
  matches.forEach((bookmark, index) => {
    const bookmarkElement = document.createElement('div');
    bookmarkElement.className = 'bookmark-item';
    // 如果是第一项，添加selected类
    if (index === 0) {
      bookmarkElement.classList.add('selected');
    }
    bookmarkElement.setAttribute('data-index', index);
    
    // 高亮显示匹配的关键词
    let title = bookmark.title;
    let url = bookmark.url;
    
    keywords.forEach(keyword => {
      const regex = new RegExp(keyword, 'gi');
      title = title.replace(regex, match => `<mark>${match}</mark>`);
      url = url.replace(regex, match => `<mark>${match}</mark>`);
    });
    
    // 获取favicon URL
    const faviconUrl = getFaviconUrl(bookmark.url, bookmark.favicon);
    
    bookmarkElement.innerHTML = `
      <div class="bookmark-content">
        <img class="favicon" src="${faviconUrl}" alt="" onerror="this.src='assets/default-favicon.png'">
        <div class="bookmark-info">
          <div class="bookmark-title">${title}</div>
          <div class="bookmark-url">${url}</div>
          <div class="bookmark-tags">
            ${bookmark.tags.map(tag => {
              let tagText = tag;
              keywords.forEach(keyword => {
                const regex = new RegExp(keyword, 'gi');
                tagText = tagText.replace(regex, match => `<mark>${match}</mark>`);
              });
              return `<span class="tag">${tagText}</span>`;
            }).join('')}
          </div>
        </div>
      </div>
    `;
    
    bookmarkElement.addEventListener('click', () => {
      chrome.tabs.create({ url: bookmark.url });
      window.close();
    });
    
    resultsContainer.appendChild(bookmarkElement);
  });
  
  // 确保第一项可见
  const firstItem = resultsContainer.querySelector('.bookmark-item');
  if (firstItem) {
    firstItem.scrollIntoView({
      behavior: 'auto',
      block: 'nearest'
    });
  }
}

// 显示无结果提示
function showNoResults() {
  const resultsContainer = document.getElementById('results');
  resultsContainer.innerHTML = `<div class="no-results">${chrome.i18n.getMessage('noResults')}</div>`;
}

// 清空结果
function clearResults() {
  document.getElementById('results').innerHTML = '';
  const keyboardHint = document.querySelector('.keyboard-hint-text');
  keyboardHint.classList.remove('show');
}

// 初始化国际化文本
function initializeI18n() {
  // 替换所有带有data-i18n属性的元素的文本
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const messageKey = element.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(messageKey);
    if (message) {
      element.textContent = message;
    }
  });
  
  // 替换搜索框占位符
  document.getElementById('searchInput').placeholder = 
    chrome.i18n.getMessage('searchPlaceholder');
}

// 页面加载时
document.addEventListener('DOMContentLoaded', () => {
  initializeI18n();
  document.getElementById('searchInput').focus();
});

// 处理Esc键
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.close();
  }
});

// 获取favicon的URL
function getFaviconUrl(url, storedFavicon) {
  if (storedFavicon) return storedFavicon;
  
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
  } catch (e) {
    return 'assets/default-favicon.png';
  }
}
 