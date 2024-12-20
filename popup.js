let selectedIndex = -1;
let currentMatches = [];

// 当输入框内容变化时搜索
document.getElementById('searchInput').addEventListener('input', async (e) => {
  const keyword = e.target.value.toLowerCase().trim();
  selectedIndex = -1; // 重置选中项
  
  if (!keyword) {
    clearResults();
    return;
  }
  
  // 从storage获取所有书签标签
  const { bookmarkTags } = await chrome.storage.local.get('bookmarkTags');
  if (!bookmarkTags) {
    showNoResults();
    return;
  }
  
  // 搜索匹配的书签
  currentMatches = await searchBookmarks(keyword, bookmarkTags);
  displayResults(currentMatches);
});

// 监听键盘事件
document.addEventListener('keydown', (e) => {
  if (!currentMatches.length) return;
  
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
async function searchBookmarks(keyword, bookmarkTags) {
  const matches = new Map(); // 使用Map来去重
  
  // 获取所有书签
  const bookmarks = await chrome.bookmarks.search({});
  
  // 遍历书签，检查标签是否匹配
  for (const bookmark of bookmarks) {
    // 跳过文件夹（没有URL的项目）
    if (!bookmark.url) continue;
    
    // 如果这个URL已经处理过，跳过
    if (matches.has(bookmark.url)) continue;
    
    const bookmarkData = bookmarkTags[bookmark.url] || { tags: [], favicon: null };
    const tags = bookmarkData.tags;
    
    // 检查标签和标题是否包含关键词
    if ((Array.isArray(tags) && tags.some(tag => tag.toLowerCase().includes(keyword))) ||
        bookmark.title.toLowerCase().includes(keyword)) {
      matches.set(bookmark.url, {
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        tags: Array.isArray(tags) ? tags : [],
        favicon: bookmarkData.favicon
      });
    }
  }
  
  return Array.from(matches.values());
}

// 显示搜索结果
function displayResults(matches) {
  const resultsContainer = document.getElementById('results');
  
  const keyboardHint = document.querySelector('.keyboard-hint-text');
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
        <img src="${getFaviconUrl(bookmark.url, bookmark.favicon)}" alt="icon" 
             onerror="this.src='assets/default-favicon.png'">
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
  resultsContainer.innerHTML = '<div class="no-results">未找到匹配的书签</div>';
}

// 清空结果
function clearResults() {
  document.getElementById('results').innerHTML = '';
  const keyboardHint = document.querySelector('.keyboard-hint-text');
  keyboardHint.classList.remove('show');
}

// 页面加载时聚焦到搜索框
document.addEventListener('DOMContentLoaded', () => {
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