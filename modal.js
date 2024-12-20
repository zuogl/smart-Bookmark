let selectedIndex = -1;
let currentMatches = [];
let modalElement = null;

// 初始化模态框
function initModal() {
  // 加载模板
  fetch(chrome.runtime.getURL('modal.html'))
    .then(response => response.text())
    .then(html => {
      const template = document.createElement('div');
      template.innerHTML = html;
      const modalTemplate = template.querySelector('#search-modal');
      
      // 创建shadow DOM
      const shadowHost = document.createElement('div');
      shadowHost.id = 'bookmark-search-host';
      const shadow = shadowHost.attachShadow({mode: 'open'});
      shadow.appendChild(modalTemplate.content.cloneNode(true));
      
      document.body.appendChild(shadowHost);
      modalElement = shadow.querySelector('.modal-overlay');
      
      // 初始化事件监听
      initEventListeners(shadow);
    });
}

// 初始化事件监听
function initEventListeners(shadow) {
  const searchInput = shadow.getElementById('searchInput');
  
  // 搜索输入
  searchInput.addEventListener('input', async (e) => {
    const keyword = e.target.value.toLowerCase().trim();
    selectedIndex = -1;
    
    if (!keyword) {
      clearResults(shadow);
      return;
    }
    
    const { bookmarkTags } = await chrome.storage.local.get('bookmarkTags');
    if (!bookmarkTags) {
      showNoResults(shadow);
      return;
    }
    
    currentMatches = await searchBookmarks(keyword, bookmarkTags);
    displayResults(shadow, currentMatches);
  });
  
  // 键盘事件
  document.addEventListener('keydown', (e) => {
    if (!modalElement.classList.contains('show')) return;
    
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        moveSelection(shadow, -1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveSelection(shadow, 1);
        break;
      case 'Enter':
        if (selectedIndex >= 0) {
          const selectedBookmark = currentMatches[selectedIndex];
          chrome.runtime.sendMessage({
            action: 'openBookmark',
            url: selectedBookmark.url
          });
          hideModal();
        }
        break;
      case 'Escape':
        hideModal();
        break;
    }
  });
  
  // 点击背景关闭
  modalElement.addEventListener('click', (e) => {
    if (e.target === modalElement) {
      hideModal();
    }
  });
}

// 显示模态框
function showModal() {
  modalElement.classList.add('show');
  const searchInput = modalElement.shadowRoot.getElementById('searchInput');
  searchInput.focus();
}

// 隐藏模态框
function hideModal() {
  modalElement.classList.remove('show');
  const searchInput = modalElement.shadowRoot.getElementById('searchInput');
  searchInput.value = '';
  clearResults(modalElement.shadowRoot);
}

// 其他函数（searchBookmarks, displayResults等）保持不变，
// 只需要修改DOM操作部分，使用shadow参数来获取shadow DOM中的元素

// 初始化
initModal();

// 监听来自content.js的事件
window.addEventListener('toggleSearch', () => {
  if (!modalElement.classList.contains('show')) {
    showModal();
  } else {
    hideModal();
  }
}); 