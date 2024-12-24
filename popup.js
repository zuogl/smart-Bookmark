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
  debugger
  const keyword = e.target.value.toLowerCase().trim();
  selectedIndex = -1; // 重置选中项
  
  if (!keyword) {
    clearResults();
    return;
  }
  
  try {
    // 从storage获取所有书签标签
    const { bookmarkTags } = await chrome.storage.local.get('bookmarkTags');
    if (!bookmarkTags) {
      showNoResults();
      return;
    }
    
    // 搜索匹配的书签
    currentMatches = await searchBookmarksDebounced(keyword, bookmarkTags);
    console.log('currentMatches', currentMatches);
    displayResults(currentMatches);
  } catch (error) {
    console.error('处理搜索时出错:', error);
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
const searchBookmarksDebounced = debounce(async (keyword, bookmarkTags) => {
  try {
    if(searchCache.has(keyword)) {
      const cachedResults = searchCache.get(keyword);
      return Array.isArray(cachedResults) ? cachedResults : [];
    }
    
    const matches = new Map();
    // 使用关键词进行初步搜索
    const bookmarks = await chrome.bookmarks.search({
      query: keyword
    });
    
    // 获取所有书签树，用于补充搜索结果
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
    
    // 合并两种搜索结果
    const searchSet = new Set([...bookmarks, ...allBookmarks]);
    
    // 遍历所有唯一的书签
    for (const bookmark of searchSet) {
      // 跳过文件夹（没有URL的项目）
      if (!bookmark.url) continue;
      
      // 如果这个URL已经处理过，跳过
      if (matches.has(bookmark.url)) continue;
      
      const bookmarkData = bookmarkTags[bookmark.url] || { tags: [], favicon: null };
      const tags = bookmarkData.tags;
      
      // 改进搜索匹配逻辑
      const titleMatch = bookmark.title.toLowerCase().includes(keyword);
      const urlMatch = bookmark.url.toLowerCase().includes(keyword);
      const tagMatch = Array.isArray(tags) && tags.some(tag => 
        tag.toLowerCase().includes(keyword)
      );
      
      if (titleMatch || urlMatch || tagMatch) {
        matches.set(bookmark.url, {
          id: bookmark.id,
          title: bookmark.title,
          url: bookmark.url,
          tags: Array.isArray(tags) ? tags : [],
          favicon: bookmarkData.favicon,
          // 添加匹配得分以便排序
          score: (titleMatch ? 3 : 0) + (urlMatch ? 2 : 0) + (tagMatch ? 1 : 0)
        });
      }
    }
    
    // 根据匹配得分排序结果
    const results = Array.from(matches.values()).sort((a, b) => b.score - a.score);
    searchCache.set(keyword, results);
    console.log(`找到 ${results.length} 个匹配结果`);
    return results;
  } catch (error) {
    console.error('搜索书签时出错:', error);
    return [];
  }
}, 300);

// 显示搜索结果
function displayResults(matches) {
  // 更严格的类型检查
  if (!matches || !Array.isArray(matches)) {
    matches = [];
  }
  
  // 更新全局变量
  currentMatches = matches;
  
  const resultsContainer = document.getElementById('results');
  const keyboardHint = document.querySelector('.keyboard-hint-text');
  
  if (!resultsContainer || !keyboardHint) {
    console.error('找不到必要的DOM元素');
    return;
  }
  
  resultsContainer.innerHTML = '';
  
  if (matches.length === 0) {
    showNoResults();
    keyboardHint.classList.remove('show');
    return;
  }
  
  // 显示键盘提示
  keyboardHint.classList.add('show');
  
  // 默认选中第一项
  selectedIndex = 0;
  
  matches.forEach((bookmark, index) => {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    if (index === selectedIndex) item.classList.add('selected');
    
    item.innerHTML = `
      <div class="bookmark-icon">
        <img src="${getFaviconUrl(bookmark.url, bookmark.favicon)}" alt="${chrome.i18n.getMessage('iconAlt')}" 
             onerror="this.src='${chrome.i18n.getMessage('defaultFaviconPath')}'">
      </div>
      <div class="bookmark-content">
        <div class="bookmark-title">${bookmark.title}</div>
        <div class="bookmark-url">${bookmark.url}</div>
        <div class="bookmark-tags">
          ${Array.isArray(bookmark.tags) ? bookmark.tags.map(tag => `<span class="tag">${tag}</span>`).join('') : ''}
        </div>
      </div>
    `;
    
    // 点击打开书签
    item.addEventListener('click', () => {
      chrome.tabs.create({ url: bookmark.url });
      window.close();
    });
    
    // 鼠标悬停时更新选中项
    item.addEventListener('mouseenter', () => {
      const oldIndex = selectedIndex;
      selectedIndex = index;
      const items = document.querySelectorAll('.bookmark-item');
      if (oldIndex >= 0) items[oldIndex].classList.remove('selected');
      item.classList.add('selected');
    });
    
    resultsContainer.appendChild(item);
  });
  
  // 确保第一个选中项可见
  if (matches.length > 0) {
    const firstItem = document.querySelector('.bookmark-item');
    firstItem.scrollIntoView({ block: 'nearest' });
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
  // 替换所有带有i18n属性的元素的文本
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const messageKey = element.getAttribute('data-i18n');
    element.textContent = chrome.i18n.getMessage(messageKey);
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
 