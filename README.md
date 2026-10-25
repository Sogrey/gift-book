# 电子礼簿 gift-book-vue

[![CI/CD](https://github.com/Sogrey/gift-book/actions/workflows/deploy.yml/badge.svg)](https://github.com/Sogrey/gift-book/actions/workflows/deploy.yml)
[![Deployed](https://img.shields.io/badge/GitHub-Pages-brightgreen)](https://sogrey.github.io/gift-book/)

> 纯本地、零后端、数据加密的红白喜事礼金管理系统
> Vue 3 + TypeScript + Vite + Pinia + Tailwind CSS 4
>
> **在线体验**：https://sogrey.github.io/gift-book/ （数据仍仅存于你自己浏览器的 localStorage，服务端不经手任何数据）

无论是儿女结婚的喜宴，还是亲友离世的白事，礼金记账都绕不开。传统手写礼簿考验书写速度与细心程度，还有"记重了、算错了、丢了账本"的风险。本项目提供一个**拔网线也能用**的现代化礼簿方案：数据 100% 存储在本机浏览器、AES-256 加密落库，隐私不外泄。

## 功能特性

- **秒级记账**：姓名 Enter → 金额 Enter → 完成，全键盘操作；数字键 `1-4` 快切渠道（微信/支付宝/现金/其他）
- **智能防错**：录入实时检测重名（Enter 二次确认 / Esc 取消）、重复金额提示；金额中文大写实时预览
- **语音播报**：登记成功即播报"姓名 + 礼金口语读法"（可开关）
- **金融级加密**：管理密码经 PBKDF2-SHA256（210,000 迭代）派生 256-bit 密钥，全量数据 AES-256-CBC 加密落库；密码丢失无法找回
- **传统竖排 PDF 礼簿**：A4 横向仿古版式，每页 12 格竖排——毛笔楷书姓名 + 「贺礼」题字 + 中文大写礼金 + 数字金额；含封面、渠道总计页、备注附录、记账人落款
- **Excel 明细导出**：8 列结构 + 合计行，即存即用
- **加密备份恢复**：一键导出 `.giftbook.json`（密文），跨设备全量恢复
- **副屏投影**：独立页签实时投射到外接屏幕——仿古竖排礼簿格布局（毛笔姓名 + 「贺礼」题字 + 大写金额竖排），新礼金自动滚动跟随；支持微信/支付宝收款码、自定义公告与隐私模式（非最新记录姓名打码、金额隐藏）；基于 BroadcastChannel + storage 双通道，主屏关闭不影响副屏打开方式
- **红白双主题**：喜事"喜庆红"、白事"肃穆灰"，跟随事项类型自动切换
- **专业统计**：总额大写、渠道分布、金额区间直方图、礼金 Top 榜
- **零门槛部署**：纯静态文件，`npm run build` 后扔到任意静态服务器即可；不联网也能跑

## 快速开始

```bash
npm install     # 国内源已配置（.npmrc → npmmirror）
npm run dev     # 开发：http://localhost:5173
npm run build   # 构建：dist/ 可部署到 GitHub Pages / Vercel / Nginx / file:// 双击
npm run preview # 本地预览构建产物
```

## CI/CD 自动部署

推送到 `main` 分支即自动触发 [GitHub Actions](.github/workflows/deploy.yml)：

1. **构建与校验**：`npm ci` → `npm run build`（vue-tsc 严格类型检查，类型错误直接阻断部署）
2. **部署**：产物自动发布到 GitHub Pages → https://sogrey.github.io/gift-book/

> **首次开通（仅需一次）**：GitHub 安全策略禁止 Actions 的 GITHUB_TOKEN 首次创建 Pages 站点，
> 需手动开通一次：仓库 **Settings → Pages → Build and deployment → Source 选 `GitHub Actions`** → Save。
> 开通后无需任何其他操作，push main 即全自动部署；如需手动触发，在 Actions 页面点 **Run workflow**；
> 新推送会自动取消进行中的旧部署（concurrency 控制）。

## 使用流程

1. **新建事项**：填写名称、选择类型（红事/白事）、设置管理密码（务必牢记，丢失无法找回）
2. **记账**：录入姓名 → Enter → 金额 → Enter，完成；语音自动播报核对
3. **投屏**：点顶栏「投屏」打开副屏页签，拖到外接屏幕，按 F11 全屏
4. **归档**：活动结束后在「归档」页导出 Excel、PDF 礼簿与加密备份，云端收藏永久保存

## 数据安全模型

```
管理密码 ──PBKDF2-SHA256(210k 迭代, 随机盐)──▶ 256-bit 密钥
                                                    │
        ┌───────────────────────────────────────────┤
        ▼                                           ▼
AES-256-CBC 加密全部数据            加密固定口令 → verifier（密码校验）
（localStorage 密文落库）
```

- 派生密钥仅驻留内存与 `sessionStorage`（关闭浏览器即清空），不落磁盘
- 副屏页面**不持有密钥、不解密数据**——只接收主屏主动推送的（可脱敏）快照，天然隐私边界
- 修改密码 = 重新派生 + 全量重加密

## 目录结构

```
src/
├── lib/
│   ├── crypto.ts    # PBKDF2 派生 + AES-256-CBC 加解密 + verifier
│   ├── bus.ts       # BroadcastChannel + storage 双通道跨页签总线
│   ├── pdf.ts       # pdf-lib 竖排仿古礼簿排版引擎
│   ├── excel.ts     # SheetJS 导出
│   ├── amount.ts    # 中文大写/口语读法/格式化
│   ├── speech.ts    # Web Speech 语音播报
│   └── image.ts     # 收款码/封面图压缩
├── stores/
│   ├── events.ts    # 事项元数据（多事项管理）
│   ├── ledger.ts    # 台账：解锁/CRUD/加密持久化/统计/副屏广播
│   └── ui.ts        # Toast / 确认对话 / 主题
├── views/
│   ├── HomeView.vue         # 事项列表 + 新建 + 备份导入
│   ├── EventView.vue        # 工作台：记账/礼簿/统计/归档
│   └── GuestScreenView.vue  # 副屏投影页
└── components/
    ├── QuickEntry.vue       # 秒录表单（重名/重复检测/语音播报）
    ├── LedgerTable.vue      # 礼簿列表（搜索/编辑/作废/删除）
    ├── StatsPanel.vue       # 统计图表（纯 CSS，零图表依赖）
    └── ArchivePanel.vue      # 归档导出 + 副屏/语音设置
public/fonts/                # MaShanZheng 毛笔楷书 + 思源宋体（SIL OFL 开源授权）
```

## 与原版 gift-book 的差异

本项目是对开源项目 [jingguanzhang/gift-book](https://github.com/jingguanzhang/gift-book)（单文件 HTML）的 Vue 3 工程化复刻，并做了以下升级：

| 维度 | 原版 | 本版 |
| --- | --- | --- |
| 架构 | 单文件内嵌 HTML + CDN 脚本 | Vue 3.5 + TS + Vite + Pinia 模块化工程 |
| 密码存储 | 裸 SHA-256 | PBKDF2-SHA256 210k 迭代派生 |
| 副屏通信 | window.opener + postMessage（主屏关闭即断） | BroadcastChannel + storage 双通道（独立打开任意页签均可） |
| 副屏打开方式 | 须由主屏 window.open | 任意页签打开 `#/guest/:id` 即可 |
| PDF 引擎 | pdf-lib（同） | pdf-lib + 全量汉字思源宋体（原版 mini 子集存在缺字风险） |
| 构建 | 无 | 类型检查 + 按需分包（xlsx/pdf-lib 懒加载） |

## 字体版权

- **MaShanZheng-Regular.ttf**（马善政毛笔楷书）—— Google Fonts，SIL Open Font License 1.1
- **SourceHanSerifCN-Regular.otf**（思源宋体）—— Adobe，SIL Open Font License 1.1

两字体授权均允许自由使用与再分发。

> AI生成
