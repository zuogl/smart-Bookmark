# Smart Bookmark Assistant (智能书签助手)

一个强大的浏览器扩展,帮助你更智能地管理和搜索书签。你只管收藏，剩下的交给智能书签助手。

## 功能特点

- 🔍 智能搜索: 支持标题、URL和标签的快速搜索
- 🏷️ 标签管理: 为书签添加和编辑标签
- ⌨️ 快捷键支持: 使用键盘快速操作
- 📥 导入导出: 支持多种格式的书签导入导出
- 🕒 时间排序: 查看最近添加的书签
## 安装

1. 从 [Chrome Web Store](https://chromewebstore.google.com/detail/%E6%99%BA%E8%83%BD%E4%B9%A6%E7%AD%BE%E5%8A%A9%E6%89%8B/ejigeagklbgfholdnpblgmoknojljmkj?hl=zh-CN&utm_source=ext_sidebar) 安装

## 使用说明

### 基本操作
1. 自动打标签
- 当你在点击收藏书签时，不用在头疼这个书签是做什么的，直接点击完成按钮就OK了。智能书签助手会自动获取网站的meta信息来调用大模型打标签。
2. 搜索
- 打开扩展: 点击工具栏图标或使用快捷键 `Ctrl+Shift+S` (Mac: `⌘⇧S`)
- 搜索书签: 直接输入关键词，支持多个关键词联合搜索，用空格分隔
- 选择结果: 使用 ↑↓ 方向键
- 打开书签: 按 Enter 键
- 关闭扩展: 按 Esc 键

### @命令功能
- `@all`: 显示所有书签(按时间倒序)
- `@latest`: 显示最新添加的书签
- `@latest n`: 显示最新添加的 n 个书签
- `@export`: 导出书签(默认 JSON 格式)
  - `@export json`: 导出为 JSON 格式
  - `@export csv`: 导出为 CSV 格式
  - `@export html`: 导出为 HTML 格式
- `@import`: 导入书签(支持 JSON/CSV/HTML 格式)

### 标签管理
1. 点击标签后的 + 按钮添加标签
2. 双击标签进行编辑，回车保存
3. 点击标签后的 x 按钮删除标签


## 隐私政策

本扩展不会收集任何个人信息。所有数据都存储在本地,不会上传到任何服务器。详细隐私政策请访问: [隐私政策](https://zuogl.github.io/ZuoglTools/privacy/browser-extensions/SmartBookmarkAssistantZH_CN.html)

## 许可证

本项目采用 [MIT 许可证](./LICENSE)。这意味着你可以：

- ✅ 自由使用
- ✅ 自由复制
- ✅ 自由修改
- ✅ 自由分发
- ✅ 私人或商业用途皆可

唯一的要求是在你的项目中包含原始许可证和版权声明。

完整许可证文本请查看 [LICENSE](./LICENSE) 文件。

## 联系方式

- [项目主页](https://github.com/zuogl/smart-Bookmark)
- [问题反馈](https://github.com/zuogl/smart-Bookmark/issues)
- 邮箱: zuogl448@gmail.com
