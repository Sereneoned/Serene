---
title: 给 Antigravity 桌面端加上 Codex 级对话分叉：我用官方 MCP App 做了个零魔改插件
published: 2026-11-22
description: 完整复盘开源插件 antigravity-conversation-forker 的设计与实现：基于 SEP-1865 MCP Apps 与 ui/message (target: "new")，零客户端魔改实现按 Turn 1..K 硬切片、transcript_full.jsonl 流式回读与 Smart/Compact/Full 三档记忆继承。
image: /images/posts/antigravity-conversation-forker-cover.webp
tags:
  - Antigravity
  - MCP
  - MCP Apps
  - 对话分叉
  - 开源实战
category: 工程实战
---

Google Antigravity 的命令行客户端 `agy` 原生自带了 `/fork` 命令，但在日常主力开发常用的 **Antigravity 桌面端（Desktop App）** 里，至今没有一个图形化的“按轮次分叉对话”按钮。

于是我基于官方原生的 **Plugin + MCP Apps（SEP-1865 + `com.google.antigravity/ui` 扩展）** 机制，开发并开源了 **`antigravity-conversation-forker`**——无需解压或魔改桌面端二进制文件，直接在右上角侧边栏 `+` 菜单中嵌入可视化时间线，点击任意历史轮次即可把截至第 `K` 轮的完整记忆带进同项目的新对话里继续执行。

::github{repo="Sereneoned/antigravity-conversation-forker"}

---

## 一、为什么要做这个插件？（三大真实痛点）

在实际重度使用 Antigravity 桌面端配合 Gemini 4 跑长任务或跨账号续跑时，原有工作方式有三个绕不开的痛点：

1. **桌面端缺少图形化 `/fork`，转去 CLI 体验割裂**
   在内置终端里敲 `agy /resume` 接管会话再 `/fork`，生成的是一条终端会话，**并不会出现在桌面端左侧项目对话列表里**，后续交互和上下文视图都被迫切回命令行。
2. **`@conversation:` 本质上是“按需读摘要”，做不到精准切片**
   新建对话并用 `@` 引用旧会话时，宿主注入的只是旧会话的标题与 ID，新 Agent 只能再自行按需检索。如果你的对话走到第 12 轮发现第 5～12 轮走错了方向，想干净地**只继承第 1～4 轮、彻底丢弃第 5～12 轮的试错噪音**，靠 `@` 引用很难精确切干净。
3. **跨分支试错或切换账号时，手工整理上下文成本高且易漏**
   切换账户前如果靠手工复制粘贴历史聊天记录，极容易漏掉关键工具调用参数、报错堆栈与改过的文件路径，新开窗口后模型很容易偏离原有状态。

---

## 二、为什么选择官方 MCP App，而不是魔改客户端本体？

Antigravity 桌面端属于签名分发、更新节奏极快的桌面应用，强行解包 `app.asar` 或篡改内部私有存储不仅在每次更新后失效，还存在损坏历史会话数据的风险。

相比之下，Antigravity 原生支持基于 **SEP-1865** 标准的 **MCP Apps** 扩展协议，只需把插件放进 `~/.gemini/config/plugins/<插件名>/`，即可获得官方正统扩展能力：

- **双入口原生 UI 挂载**：通过工具元数据 `_meta.com.google.antigravity/ui.entrypoints` 直接注册进对话右上角 **Side Pane（`+`）** 与左侧全局导航栏，并自动继承宿主亮/暗主题变量。
- **直接读取官方落盘轨迹**：后端读取桌面端 `~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl` 与终端 `~/.gemini/antigravity-cli/brain/` 日志；遇到 `"truncated_fields"` 标记的长记录时，再按 `step_index` 流式扫描 `transcript_full.jsonl` 还原完整原文。
- **同项目原生拉起新会话**：调用官方扩展能力 `ui/message`（携带 `_meta: {"com.google.antigravity/message": {"target": "new"}}`），可以在当前所属项目下直接生成一条新的独立桌面会话，并返回新会话 ID 写回分叉谱系。

:::warning[与 Codex 原生 Fork 的坦诚对比（不吹不黑）]
| 能力维度 | OpenAI Codex 原生 Fork | `antigravity-conversation-forker` |
| :--- | :--- | :--- |
| **图形化点选任意轮次 `1..K` 分叉** | 原生支持 | **支持**（Side Pane 可视化时间线） |
| **同项目内一键拉起新桌面端对话** | 原生支持 | **支持**（`ui/message` `target: "new"`） |
| **严格隔离第 `K+1..N` 轮试错噪音** | 原生支持 | **支持**（服务端强制截取 `turns[:cutoff]`） |
| **恢复被截断的回复与工具调用原文** | 原生支持 | **支持**（流式按需回读 `transcript_full.jsonl`） |
| **零客户端魔改 / 抗版本升级** | 原生 | **支持**（纯用户目录插件） |
| **复用上游 Prompt 前缀缓存（KV Cache）** | 共享同前缀缓存 | **不支持**（新对话以完整记忆快照首轮启动，无法跨分支复用原会话上游 KV 缓存） |
:::

---

## 三、整体架构与核心设计细节

```text
Antigravity Desktop App（宿主）
  │
  ├── Side Pane "+" / 全局侧栏 / Chat Skill
  │     └── 调用 MCP 工具：open_forker({})
  │           (_meta.ui.resourceUri = "ui://conversation-forker/app.html")
  │
  ├── 读取 UI 资源：ui://conversation-forker/app.html
  │     （esbuild + @modelcontextprotocol/ext-apps 打包的单文件 HTML）
  │
  └── 隔离沙箱 Iframe <── postMessage JSON-RPC ──> 宿主
        │                                               │
        ├── app_get_conversation_turns ───▶ server/mcp_server.py
        │                                     ├── server/transcript_parser.py
        │                                     │     ├── 扫描 App 与 CLI 会话目录
        │                                     │     └── 按需回读 transcript_full.jsonl
        │                                     └── server/fork_store.py
        │                                           └── ${PLUGIN_DATA}/forks/<id>.md + index.json
        │
        ├── app_create_fork_snapshot ─────▶ 在 Turn K 硬切片并生成无损快照与分叉 Prompt
        │
        ├── app.request("ui/message", { target: "new" }) ──▶ 同项目建新对话返回 childId
        │
        └── app_record_fork_result ───────▶ 将 parent -> turn -> child 写入 index.json
```

### 1. 轨迹扫描与内部子代理过滤

在真实 Antigravity 会话日志中，用户主动发起的主对话首条步骤通常满足 `type == "USER_INPUT"` 且 `source == "USER_EXPLICIT"`，而宿主派生的内部子代理会话多以 `type == "SYSTEM_MESSAGE"`（`source == "SYSTEM"`）开场。

`server/transcript_parser.py` 默认利用这一结构特征自动过滤内部子代理噪音（界面保留勾选开关可按需显示），同时以 `(path, mtime_ns, size)` 对列表头信息做缓存，即使本地积累了数百个历史会话目录也能在百毫秒级完成扫描排序。

### 2. 三档记忆继承模式 + 24,000 字符自适应交接

为了在“保真度”与“新会话首轮 Token 开销”之间自由切换，后端提供三种继承策略：

- **`smart`（智能均衡，推荐）**：完整保留所有轮次的用户提问 + 最近 4 轮富上下文（包含关键结论与文件改动） + 更早轮次的精简摘要。
- **`compact`（省额度精简）**：仅抽取每轮用户意图、助手最终结论与触及文件清单，把新分支的冷启动输入压到最低。
- **`full`（全量无损）**：严格回读 `transcript_full.jsonl` 中的每条推理步骤与工具交互；当生成的正文超过 **24,000 字符** 时，`build_fork_payload` 会自动改为“内联全轮次目录 + 涉及文件汇总 + 最近若干完整轮次 + 命令新对话先调用 `read_file` 读取已落盘的 `${PLUGIN_DATA}/forks/<fork_id>.md` 无损快照文件”，兼顾首轮不超限与零信息丢失。

### 3. 零运行时依赖与 CSP 沙箱合规

- **终端用户无需安装 Node.js**：仓库中已经内置前端源码预编译产物 `ui/dist/app.html`，所有 TypeScript 与 CSS 全部内联进单个 HTML 资源，**不请求任何外部 `http(s)://` 脚本、样式或字体**，完整契合 MCP Apps 的 `default-src 'none'` 内容安全策略；后端完全使用 **Python 3.10+ 标准库** 构建 MCP stdio 服务。
- **不依赖浏览器存储**：面板全程不读写 `localStorage`、`IndexedDB` 或 Cookie，所有分叉快照与 `index.json` 谱系状态均由服务端工具经过严格 `fork_id` 正则校验（`^[a-zA-Z0-9_-]{4,64}$`）后落盘到插件数据目录。

---

## 四、一键安装与桌面端上手流程

:::steps
1. **克隆仓库并运行零依赖安装脚本（前置仅需 Python 3.10+）**

   ```bash
   git clone https://github.com/Sereneoned/antigravity-conversation-forker.git
   cd antigravity-conversation-forker
   python scripts/install.py
   ```

   安装脚本会自动将插件复制到 `~/.gemini/config/plugins/conversation-forker/`，把 `mcp_config.json` 绑定到当前可运行的 Python 解释器（其余路径统一通过 `${PLUGIN_ROOT}` 与 `${PLUGIN_DATA}` 引用），且支持 `python scripts/install.py --uninstall` 一键卸载。

2. **从当前对话的右上角 Side Pane（`+`）呼出面板**

   在任意项目对话中点击右上角 **`+`** → 选择 **Conversation Forker**（或直接在聊天里对 Agent 说 *“打开 Conversation Forker，从第 K 轮分叉出去”* 触发配套 Skill）。

3. **选择截止轮次 `Turn K` 与继承模式**

   面板默认选中最近活跃对话；展开时间线任意一轮可预览完整 Prompt 与修改文件，点击选中作为截止点 `Turn K` 后，在 `Smart` / `Compact` / `Full` 之间选择继承策略并填写新分支起点提示。

4. **点击「分叉到新对话」一键起跑**

   如果是在项目对话的 Side Pane 打开，插件会直接通过 `ui/message`（`target: "new"`）在当前项目创建全新对话并开始接续；如果是从左侧全局入口（不归属特定对话）打开，界面则自动降级为 **生成并复制分叉提示词** 模式，方便跨项目或切换账号后手动新建粘贴。
:::

:::details[二次开发与本地单元测试命令]
如果你想修改前端视图（`ui/src/`）或扩展服务端解析逻辑，可以执行以下命令构建与测试：

```bash
# 重新打包内联单文件 UI 资源
cd ui
npm install
npm run typecheck
npm run build

# 回到仓库根目录运行 Python 标准库测试套件
cd ..
python -m unittest discover -s tests -v
```
:::

:::tip[与上一篇 codex-agy-subagents 的组合用法]
如果你同时用着 **OpenAI Codex** 和 **Google Antigravity**，这两款开源项目刚好互补：用 [`codex-agy-subagents`](https://github.com/Sereneoned/codex-agy-subagents) 在 Codex 中并发调度本地 `agy` 子代理池跑重活，用 **`antigravity-conversation-forker`** 在 Antigravity 桌面端随时对长对话切片分叉，两条线各有清晰的上下文与额度控制工具。
:::
