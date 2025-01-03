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
 