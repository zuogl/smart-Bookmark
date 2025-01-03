let selectedIndex = -1;
let currentMatches = null;  // 初始化为null，表示还未进行搜索

// 标签管理相关变量
let currentEditingUrl = null;
let currentEditingTags = [];

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

// 命令处理相关变量和常量
const COMMANDS = {
  ALL: '@all',
  LATEST: '@latest',
  LATEST_WITH_COUNT: /^@latest\s+(\d+)$/,
  EXPORT: '@export',
  EXPORT_WITH_FORMAT: /^@export\s+(json|html)$/i,
  IMPORT: '@import'
};

// 导出格式枚举
const EXPORT_FORMATS = {
  CSV: 'csv',
  JSON: 'json',
  HTML: 'html'
};

// 检查输入是否是命令
function isCommand(input) {
  return input.startsWith('@');
}

// 处理 @all 命令
async function handleAllCommand() {
  try {
    // 获取所有书签
    const bookmarks = await chrome.bookmarks.getTree();
    // 获取所有标签信息
    const { bookmarkTags } = await chrome.storage.local.get('bookmarkTags');
    
    // 提取所有书签并扁平化
    const allBookmarks = [];
    
    function extractBookmarks(nodes) {
      for (const node of nodes) {
        if (node.url) {
          allBookmarks.push({
            id: node.id,
            title: node.title,
            url: node.url,
            dateAdded: node.dateAdded,
            tags: bookmarkTags[node.url]?.tags || [],
            favicon: bookmarkTags[node.url]?.favicon
          });
        }
        if (node.children) {
          extractBookmarks(node.children);
        }
      }
    }
    
    extractBookmarks(bookmarks);
    
    // 按添加时间倒序排序
    allBookmarks.sort((a, b) => b.dateAdded - a.dateAdded);
    
    // 更新当前匹配结果并显示
    currentMatches = allBookmarks;
    displayResults(currentMatches, []);
    
  } catch (error) {
    console.error('处理 @all 命令失败:', error);
    showNoResults();
  }
}

// 处理 @latest 命令
async function handleLatestCommand(count = 1) {
  try {
    // 获取最近的书签
    const recentBookmarks = await chrome.bookmarks.getRecent(count);
    // 获取所有标签信息
    const { bookmarkTags } = await chrome.storage.local.get('bookmarkTags');
    
    // 格式化书签数据
    const formattedBookmarks = recentBookmarks.map(bookmark => ({
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      dateAdded: bookmark.dateAdded,
      tags: bookmarkTags[bookmark.url]?.tags || [],
      favicon: bookmarkTags[bookmark.url]?.favicon
    }));
    
    // 更新当前匹配结果并显示
    currentMatches = formattedBookmarks;
    displayResults(currentMatches, [], {
      title: count === 1 
        ? chrome.i18n.getMessage('latestBookmarkTitle')
        : chrome.i18n.getMessage('latestBookmarksTitle', [count.toString()])
    });
    
  } catch (error) {
    console.error('处理 @latest 命令失败:', error);
    showNoResults();
  }
}

// 修改搜索处理函数
async function handleSearch(value) {
  // 检查是否是命令
  if (isCommand(value.trim())) {
    const command = value.trim().toLowerCase();
    
    switch (command) {
      case COMMANDS.ALL:
        await handleAllCommand();
        return;
      case command === COMMANDS.LATEST:
        await handleLatestCommand();
        return;
      case COMMANDS.LATEST_WITH_COUNT.test(command):
        const match = command.match(COMMANDS.LATEST_WITH_COUNT);
        const count = parseInt(match[1], 10);
        if (count > 0) {
          await handleLatestCommand(count);
        } else {
          showNoResults();
        }
        return;
      case command === COMMANDS.EXPORT:
        await handleExportCommand();
        return;
      case COMMANDS.EXPORT_WITH_FORMAT.test(command):
        const formatMatch = command.match(COMMANDS.EXPORT_WITH_FORMAT);
        const format = formatMatch[1].toLowerCase();
        await handleExportCommand(format);
        return;
      default:
        showNoResults();
        return;
    }
  }

  // 原有的搜索逻辑
  const keywords = value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (keywords.length === 0) {
    clearResults();
    return;
  }
  
  currentMatches = await searchBookmarksDebounced(keywords);
  displayResults(currentMatches, keywords);
}

// 当输入框内容变化时搜索
document.getElementById('searchInput').addEventListener('input', async (e) => {
  const searchText = e.target.value.toLowerCase().trim();
  console.log('搜索文本:', searchText);
  selectedIndex = -1; // 重置选中项
  
  try {
    // 检查是否是命令
    if (isCommand(searchText)) {
      const command = searchText.toLowerCase();
      switch (true) {  // 使用 switch(true) 来支持正则匹配
        case command === COMMANDS.ALL:
          await handleAllCommand();
          return;
        case command === COMMANDS.LATEST:
          await handleLatestCommand();
          return;
        case COMMANDS.LATEST_WITH_COUNT.test(command):
          const match = command.match(COMMANDS.LATEST_WITH_COUNT);
          const count = parseInt(match[1], 10);
          if (count > 0) {
            await handleLatestCommand(count);
          } else {
            showNoResults();
          }
          return;
        default:
          showNoResults();
          return;
      }
    }

    // 如果不是命令且搜索文本为空，清空结果
    if (!searchText) {
      clearResults();
      return;
    }

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
function displayResults(matches, keywords, options = {}) {
  const resultsContainer = document.getElementById('results');
  resultsContainer.innerHTML = '';
  
  if (!matches || matches.length === 0) {
    showNoResults();
    return;
  }
  
  // 如果是显示所有书签或有自定义标题，添加标题
  if ((keywords.length === 0 || options.title) && matches.length > 0) {
    const titleDiv = document.createElement('div');
    titleDiv.className = 'results-title';
    titleDiv.textContent = options.title || chrome.i18n.getMessage('allBookmarksTitle');
    resultsContainer.appendChild(titleDiv);
  }
  
  selectedIndex = 0;
  
  matches.forEach((bookmark, index) => {
    const bookmarkElement = document.createElement('div');
    bookmarkElement.className = 'bookmark-item';
    if (index === 0) {
      bookmarkElement.classList.add('selected');
    }
    bookmarkElement.setAttribute('data-index', index);
    bookmarkElement.setAttribute('data-url', bookmark.url);
    
    // 创建书签内容容器
    const contentDiv = document.createElement('div');
    contentDiv.className = 'bookmark-content';
    
    // 创建并设置图标
    const favicon = document.createElement('img');
    favicon.className = 'favicon';
    favicon.src = getFaviconUrl(bookmark.url, bookmark.favicon);
    favicon.onerror = () => { favicon.src = 'assets/default-favicon.png'; };
    
    // 创建书签信息容器
    const infoDiv = document.createElement('div');
    infoDiv.className = 'bookmark-info';
    
    // 创建并设置标题
    const titleDiv = document.createElement('div');
    titleDiv.className = 'bookmark-title';
    titleDiv.innerHTML = highlightText(bookmark.title, keywords);
    
    // 创建并设置URL
    const urlDiv = document.createElement('div');
    urlDiv.className = 'bookmark-url';
    urlDiv.innerHTML = highlightText(bookmark.url, keywords);
    
    // 创建标签容器
    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'bookmark-tags';
    
    // 添加标签
    bookmark.tags.forEach(tag => {
      const tagSpan = document.createElement('span');
      tagSpan.className = 'tag';
      
      // 标签文本
      const tagText = document.createElement('span');
      tagText.className = 'tag-text';
      tagText.innerHTML = highlightText(tag, keywords);
      tagSpan.appendChild(tagText);
      
      // 删除按钮
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'tag-delete';
      deleteBtn.textContent = '×';
      deleteBtn.setAttribute('data-tag', tag);
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        const url = bookmarkElement.getAttribute('data-url');
        await deleteTag(url, tag);
        // 直接从DOM中移除标签
        tagSpan.remove();
      };
      tagSpan.appendChild(deleteBtn);
      
      // 添加双击编辑功能
      tagSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        
        // 创建输入框
        const input = document.createElement('input');
        input.className = 'tag-edit-input';
        input.value = tag;
        
        // 隐藏原有内容
        tagText.style.display = 'none';
        deleteBtn.style.display = 'none';
        tagSpan.classList.add('editing');
        
        // 添加输入框
        tagSpan.insertBefore(input, tagText);
        input.focus();
        input.select();
        
        // 处理回车和失焦事件
        const finishEditing = async () => {
          const newTag = input.value.trim();
          if (newTag && newTag !== tag) {
            // 更新标签
            const url = bookmarkElement.getAttribute('data-url');
            const { bookmarkTags } = await chrome.storage.local.get('bookmarkTags');
            const bookmarkData = bookmarkTags[url] || {};
            bookmarkData.tags = (bookmarkData.tags || []).map(t => 
              t === tag ? newTag : t
            );
            
            await chrome.storage.local.set({
              bookmarkTags: {
                ...bookmarkTags,
                [url]: bookmarkData
              }
            });
            
            // 更新显示
            tagText.innerHTML = highlightText(newTag, keywords);
            deleteBtn.setAttribute('data-tag', newTag);
          }
          
          // 恢复显示
          tagText.style.display = '';
          deleteBtn.style.display = '';
          tagSpan.classList.remove('editing');
          input.remove();
        };
        
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();  // 阻止事件冒泡
            finishEditing();
            return false;  // 确保事件不会继续传播
          }
        });
        
        // 添加 keydown 事件监听器来阻止所有键盘事件的冒泡
        input.addEventListener('keydown', (e) => {
          e.stopPropagation();
        });
        
        input.addEventListener('blur', finishEditing);
      });
      
      tagsDiv.appendChild(tagSpan);
    });
    
    // 添加标签按钮
    const addTagBtn = document.createElement('button');
    addTagBtn.className = 'add-tag-btn';
    addTagBtn.textContent = '+';
    tagsDiv.appendChild(addTagBtn);
    
    // 组装DOM结构
    infoDiv.appendChild(titleDiv);
    infoDiv.appendChild(urlDiv);
    infoDiv.appendChild(tagsDiv);
    contentDiv.appendChild(favicon);
    contentDiv.appendChild(infoDiv);
    bookmarkElement.appendChild(contentDiv);
    
    // 修改点击事件处理
    bookmarkElement.addEventListener('click', (e) => {
      // 如果点击的是标签相关的按钮，不触发书签打开
      if (e.target.classList.contains('tag-delete') || 
          e.target.classList.contains('add-tag-btn') ||
          e.target.classList.contains('tag') ||
          e.target.classList.contains('tag-text') ||
          e.target.parentElement.classList.contains('tag')) {
        e.stopPropagation(); // 阻止事件冒泡
        return;
      }
      
      // 其他区域点击则打开书签
      chrome.tabs.create({ url: bookmark.url });
      window.close();
    });
    
    // 为添加标签按钮添加单独的点击事件
    addTagBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const url = bookmarkElement.getAttribute('data-url');
      const { bookmarkTags } = await chrome.storage.local.get('bookmarkTags');
      const tags = bookmarkTags[url]?.tags || [];
      showTagEditModal(url, tags);
    });
    
    resultsContainer.appendChild(bookmarkElement);
    
    // 如果有添加时间，显示时间信息
    if (bookmark.dateAdded) {
      const dateDiv = document.createElement('div');
      dateDiv.className = 'bookmark-date';
      dateDiv.textContent = new Date(bookmark.dateAdded).toLocaleString();
      infoDiv.insertBefore(dateDiv, tagsDiv);
    }
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

// 高亮文本的辅助函数
function highlightText(text, keywords) {
  let highlightedText = text;
  keywords.forEach(keyword => {
    const regex = new RegExp(keyword, 'gi');
    highlightedText = highlightedText.replace(regex, match => `<mark>${match}</mark>`);
  });
  return highlightedText;
}

// 显示无结果提示
function showNoResults() {
  const resultsContainer = document.getElementById('results');
  resultsContainer.innerHTML = `<div class="no-results">${chrome.i18n.getMessage('noResults')}</div>`;
}

// 清空结果
function clearResults() {
  document.getElementById('results').innerHTML = '';
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
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    const placeholder = chrome.i18n.getMessage('searchPlaceholder');
    if (placeholder) {
      searchInput.placeholder = placeholder;
    } else {
      searchInput.placeholder = "请输入你想找的收藏网址";
    }
  }
  
  // 确保键盘提示显示
  const keyboardHint = document.querySelector('.keyboard-hint-text');
  if (keyboardHint) {
    keyboardHint.textContent = chrome.i18n.getMessage('keyboardHint');
  }
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
  } else if (e.key === 'Enter') {
    const searchInput = document.getElementById('searchInput');
    const command = searchInput.value.trim().toLowerCase();
    
    // 处理导出命令
    if (command === COMMANDS.EXPORT) {
      handleExportCommand();
      return;
    } else if (COMMANDS.EXPORT_WITH_FORMAT.test(command)) {
      const formatMatch = command.match(COMMANDS.EXPORT_WITH_FORMAT);
      const format = formatMatch[1].toLowerCase();
      handleExportCommand(format);
      return;
    } else if (command === COMMANDS.IMPORT) {
      handleImportCommand();
      return;
    }
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

// 显示标签编辑模态框
function showTagEditModal(url, tags) {
  currentEditingUrl = url;
  currentEditingTags = [];  // 清空当前编辑的标签
  const modal = document.getElementById('tagEditModal');
  modal.classList.add('show');
  document.getElementById('newTagInput').focus();
}

// 更新标签预览
function updateTagPreview() {
  const previewContainer = document.querySelector('.tag-preview');
  previewContainer.innerHTML = '';
  
  currentEditingTags.forEach(tag => {
    const tagSpan = document.createElement('span');
    tagSpan.className = 'tag';
    tagSpan.innerHTML = `
      ${tag}
      <button class="tag-delete" data-tag="${tag}">×</button>
    `;
    
    // 为预览中的删除按钮添加点击事件
    const deleteBtn = tagSpan.querySelector('.tag-delete');
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      currentEditingTags = currentEditingTags.filter(t => t !== tag);
      updateTagPreview();
    };
    
    previewContainer.appendChild(tagSpan);
  });
}

// 添加新标签
function addNewTag(tagText) {
  tagText = tagText.trim();
  if (tagText && !currentEditingTags.includes(tagText)) {
    currentEditingTags.push(tagText);
    updateTagPreview();
    return true;
  }
  return false;
}

// 隐藏标签编辑模态框
function hideTagEditModal() {
  const modal = document.getElementById('tagEditModal');
  modal.classList.remove('show');
  currentEditingUrl = null;
  currentEditingTags = [];
  document.getElementById('newTagInput').value = '';
}

// 保存标签更改
async function saveTagChanges() {
  if (!currentEditingUrl) return;
  
  // 获取输入框中的标签
  const newTagInput = document.getElementById('newTagInput');
  const newTag = newTagInput.value.trim();
  
  if (!newTag) {
    hideTagEditModal();
    return;
  }
  
  try {
    const { bookmarkTags } = await chrome.storage.local.get('bookmarkTags');
    const bookmarkData = bookmarkTags[currentEditingUrl] || {};
    // 确保 tags 数组存在
    bookmarkData.tags = bookmarkData.tags || [];
    // 添加新标签
    if (!bookmarkData.tags.includes(newTag)) {
      bookmarkData.tags.push(newTag);
    }
    
    await chrome.storage.local.set({
      bookmarkTags: {
        ...bookmarkTags,
        [currentEditingUrl]: bookmarkData
      }
    });
    
    // 更新当前匹配结果中的标签
    if (currentMatches) {
      const matchIndex = currentMatches.findIndex(match => match.url === currentEditingUrl);
      if (matchIndex !== -1) {
        currentMatches[matchIndex].tags = [...bookmarkData.tags];
        // 立即更新显示
        displayResults(currentMatches, 
          document.getElementById('searchInput').value.toLowerCase().trim().split(/\s+/).filter(Boolean)
        );
      }
    }
    
    hideTagEditModal();
  } catch (error) {
    console.error('保存标签失败:', error);
  }
}

// 删除标签
async function deleteTag(url, tagToDelete) {
  try {
    const { bookmarkTags } = await chrome.storage.local.get('bookmarkTags');
    const bookmarkData = bookmarkTags[url];
    if (bookmarkData) {
      bookmarkData.tags = bookmarkData.tags.filter(tag => tag !== tagToDelete);
      await chrome.storage.local.set({
        bookmarkTags: {
          ...bookmarkTags,
          [url]: bookmarkData
        }
      });

      // 更新当前的搜索结果
      if (currentMatches) {
        // 找到并更新当前匹配结果中的标签
        const matchIndex = currentMatches.findIndex(match => match.url === url);
        if (matchIndex !== -1) {
          currentMatches[matchIndex].tags = bookmarkData.tags;
          
          // 如果当前搜索关键词中包含被删除的标签，需要重新搜索
          const searchInput = document.getElementById('searchInput');
          if (searchInput.value) {
            const keywords = searchInput.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
            if (keywords.some(keyword => tagToDelete.toLowerCase().includes(keyword))) {
              // 重新搜索
              currentMatches = await searchBookmarksDebounced(keywords, bookmarkTags);
              displayResults(currentMatches, keywords);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('删除标签失败:', error);
  }
}

// 添加事件监听器
document.addEventListener('DOMContentLoaded', () => {
  // 添加标签按钮点击事件
  document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('add-tag-btn')) {
      const bookmarkItem = e.target.closest('.bookmark-item');
      const url = bookmarkItem.dataset.url;
      const { bookmarkTags } = await chrome.storage.local.get('bookmarkTags');
      const tags = bookmarkTags[url]?.tags || [];
      showTagEditModal(url, tags);
    }
    
    if (e.target.classList.contains('tag-delete')) {
      const tag = e.target.dataset.tag;
      const bookmarkItem = e.target.closest('.bookmark-item');
      const url = bookmarkItem.dataset.url;
      await deleteTag(url, tag);
    }
  });
  
  // 保存按钮点击事件
  document.getElementById('saveTagBtn').addEventListener('click', async () => {
    await saveTagChanges();
  });
  
  // 取消按钮点击事件
  document.getElementById('cancelTagBtn').addEventListener('click', () => {
    hideTagEditModal();
  });
  
  // 新标签输入框回车事件
  document.getElementById('newTagInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveTagChanges();
    }
  });
});

// 处理导出命令
async function handleExportCommand(format = EXPORT_FORMATS.CSV) {
  try {
    // 获取所有书签和标签信息
    const bookmarks = await chrome.bookmarks.getTree();
    const { bookmarkTags } = await chrome.storage.local.get('bookmarkTags');
    
    // 提取所有书签数据
    const bookmarkData = [];
    
    function extractBookmarks(nodes) {
      for (const node of nodes) {
        if (node.url) {
          bookmarkData.push({
            title: node.title,
            url: node.url,
            dateAdded: node.dateAdded,
            tags: bookmarkTags[node.url]?.tags || [],
            favicon: bookmarkTags[node.url]?.favicon
          });
        }
        if (node.children) {
          extractBookmarks(node.children);
        }
      }
    }
    
    extractBookmarks(bookmarks);
    
    // 根据不同格式导出
    switch (format.toLowerCase()) {
      case EXPORT_FORMATS.CSV:
        exportAsCSV(bookmarkData);
        break;
      case EXPORT_FORMATS.JSON:
        exportAsJSON(bookmarkData);
        break;
      case EXPORT_FORMATS.HTML:
        exportAsHTML(bookmarkData);
        break;
    }
    
    // 显示导出成功消息
    showExportSuccess(format);
    
  } catch (error) {
    console.error('导出失败:', error);
    showExportError(format);
  }
}

// CSV 导出
function exportAsCSV(bookmarkData) {
  // CSV 头部
  const headers = ['Title', 'URL', 'Date Added', 'Tags'];
  const csvContent = [
    headers.join(','),
    ...bookmarkData.map(bookmark => [
      // 处理可能包含逗号的字段
      `"${bookmark.title.replace(/"/g, '""')}"`,
      `"${bookmark.url}"`,
      `"${new Date(bookmark.dateAdded).toLocaleString()}"`,
      `"${bookmark.tags.join(';')}"`,
    ].join(','))
  ].join('\n');
  
  downloadFile(csvContent, 'bookmarks.csv', 'text/csv');
}

// JSON 导出
function exportAsJSON(bookmarkData) {
  const jsonContent = JSON.stringify(bookmarkData, null, 2);
  downloadFile(jsonContent, 'bookmarks.json', 'application/json');
}

// HTML 导出
function exportAsHTML(bookmarkData) {
  const htmlContent = `
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${bookmarkData.map(bookmark => `
  <DT><A HREF="${bookmark.url}" ADD_DATE="${Math.floor(bookmark.dateAdded/1000)}">${bookmark.title}</A>
  ${bookmark.tags.length ? `<DD>Tags: ${bookmark.tags.join(', ')}` : ''}
`).join('')}
</DL><p>`;

  downloadFile(htmlContent, 'bookmarks.html', 'text/html');
}

// 通用文件下载函数
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 显示导出成功消息
function showExportSuccess(format) {
  const resultsContainer = document.getElementById('results');
  resultsContainer.innerHTML = `
    <div class="export-success">
      ${chrome.i18n.getMessage('exportSuccess', [format.toUpperCase()])}
    </div>
  `;
}

// 显示导出错误消息
function showExportError(format) {
  const resultsContainer = document.getElementById('results');
  resultsContainer.innerHTML = `
    <div class="export-error">
      ${chrome.i18n.getMessage('exportError', [format.toUpperCase()])}
    </div>
  `;
}

// 处理导入命令
async function handleImportCommand() {
  try {
    // 创建文件输入元素
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.json,.html';
    
    // 监听文件选择
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        // 根据文件类型选择不同的导入处理函数
        switch (file.type) {
          case 'text/csv':
            await importFromCSV(file);
            break;
          case 'application/json':
            await importFromJSON(file);
            break;
          case 'text/html':
            await importFromHTML(file);
            break;
          default:
            throw new Error('不支持的文件格式');
        }
        
        // 显示导入成功消息
        showImportSuccess();
      } catch (error) {
        console.error('导入失败:', error);
        showImportError(error.message);
      }
    };
    
    // 触发文件选择
    input.click();
  } catch (error) {
    console.error('导入命令处理失败:', error);
    showImportError(error.message);
  }
}

// 从CSV文件导入
async function importFromCSV(file) {
  const text = await file.text();
  const lines = text.split('\n');
  const headers = lines[0].split(',');
  
  // 验证CSV格式
  if (!headers.includes('Title') || !headers.includes('URL')) {
    throw new Error('无效的CSV格式');
  }
  
  const bookmarks = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)
      .map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"'));
    
    const bookmark = {
      title: values[headers.indexOf('Title')],
      url: values[headers.indexOf('URL')],
      tags: values[headers.indexOf('Tags')]?.split(';').filter(Boolean) || []
    };
    bookmarks.push(bookmark);
  }
  
  await importBookmarks(bookmarks);
}

// 从JSON文件导入
async function importFromJSON(file) {
  const text = await file.text();
  const bookmarks = JSON.parse(text);
  
  // 验证JSON格式
  if (!Array.isArray(bookmarks) || !bookmarks.every(b => b.title && b.url)) {
    throw new Error('无效的JSON格式');
  }
  
  await importBookmarks(bookmarks);
}

// 从HTML文件导入
async function importFromHTML(file) {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  
  const bookmarks = [];
  const links = doc.getElementsByTagName('a');
  
  for (const link of links) {
    const bookmark = {
      title: link.textContent,
      url: link.href,
      tags: []
    };
    
    // 尝试获取标签信息
    const dd = link.parentElement.nextElementSibling;
    if (dd && dd.tagName === 'DD' && dd.textContent.startsWith('Tags:')) {
      bookmark.tags = dd.textContent.replace('Tags:', '').split(',').map(t => t.trim());
    }
    
    bookmarks.push(bookmark);
  }
  
  await importBookmarks(bookmarks);
}

// 通用导入处理函数
async function importBookmarks(bookmarks) {
  // 获取现有标签数据
  const { bookmarkTags } = await chrome.storage.local.get('bookmarkTags');
  const updatedTags = { ...bookmarkTags };
  
  // 导入每个书签
  for (const bookmark of bookmarks) {
    try {
      // 创建书签
      const newBookmark = await chrome.bookmarks.create({
        title: bookmark.title,
        url: bookmark.url
      });
      
      // 保存标签
      if (bookmark.tags && bookmark.tags.length > 0) {
        updatedTags[bookmark.url] = {
          tags: bookmark.tags,
          favicon: bookmark.favicon
        };
      }
    } catch (error) {
      console.error(`导入书签失败: ${bookmark.url}`, error);
    }
  }
  
  // 更新存储的标签数据
  await chrome.storage.local.set({ bookmarkTags: updatedTags });
}

// 显示导入成功消息
function showImportSuccess() {
  const resultsContainer = document.getElementById('results');
  resultsContainer.innerHTML = `
    <div class="import-success">
      ${chrome.i18n.getMessage('importSuccess')}
    </div>
  `;
}

// 显示导入错误消息
function showImportError(error) {
  const resultsContainer = document.getElementById('results');
  resultsContainer.innerHTML = `
    <div class="import-error">
      ${chrome.i18n.getMessage('importError', [error])}
    </div>
  `;
}
 