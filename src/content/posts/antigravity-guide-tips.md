---
title: Google Antigravity（反重力）全面使用指南：从零基础到进阶定制技巧全汇总
published: 2026-11-22
description: 结合 Google 最新 Gemini 4 模型体系与 Antigravity 2.0 订阅背景，系统梳理反重力的基础高效用法、省额度配模技巧，以及 Rules/Skills/Hooks/Plugins、CLI 无头编排与 Python SDK 全套进阶玩法。
image: /images/posts/antigravity-guide-tips-cover.webp
tags:
  - Antigravity
  - Gemini
  - AI编程
  - 效率工具
  - 工具科普
category: 工具科普
---

## 引言：为什么现在值得把主力工作流迁进 Google Antigravity？

随着 Google 陆续推出 **Gemini 4 系列编程与推理模型**，并把 **Antigravity 2.0（俗称“反重力”）** 打造成统一的多 Agent 指挥中心（涵盖独立桌面端 App、基于 VS Code 的 Antigravity IDE、轻量命令行 `agy` 以及 Python SDK），不少开发者开始发现一件很香的事：**不仅模型代码能力和长链推理上限明显拉高，而且在同等强度下的额度获取门槛与性价比也比单一闭源高价终端友好得多**。

具体来看当前这套模型与订阅背景（实际计费与地区权益以 Google 账号官方账单页为准）：

1. **Gemini 4 分层模型矩阵已经成型**
   - **`Gemini 4 Neon`**：旗舰级编码与 Agent 主力模型，支持 `Low` / `Medium` / `High` / `XHigh` 多档思考强度，面向仓库级重构、复杂调试与多步骤工具编排。
   - **`Gemini 4 Argon`**：均衡主力档（`Low` / `Medium` / `High`），日常接口开发、常规排障响应快且稳定。
   - **`Gemini 4 Hydrogen` / `Gemini 3.8 Flash`**：高频轻量快模型，适合大仓库代码检索、日志摘要、网页排查、脚本生成和单元测试编写。
   - **`Gemini 4 Carbon`**：偏重深度长程推理与复杂架构校验。
   - **`Orchestrator` 编排模式**：如 `Orchestrator (Neon)` / `Orchestrator (Argon)`，自动用强模型做规划审校、快模型跑高频执行。
   - 同时支持切换 `Claude Opus 5.5` / `Claude Sonnet 5.5` 与 `GPT-OSS 120B` 等外部模型。

2. **阶梯透明、App / IDE / CLI 共享的订阅配额池**
   - **Free 免费档（`$0/月`）**：自带无限次编辑器 Tab 补全与按周刷新的基础 Agent 额度（轻量探索与小项目试水零门槛）。
   - **Google AI Plus（约 `$4.99/月`）**：面向轻度日常用户的入门扩容档。
   - **Google AI Pro（约 `$19.99–$20/月`）**：个人开发者主力甜点档，解锁 Gemini 4 新模型与并行子代理工作流，采用滚动时间窗口刷新。
   - **Google AI Ultra（`$100/月` 5 倍额度 / `$200/月` 20 倍额度）**：重度多 Agent 并发与持续跑任务档位，App、IDE、CLI 共享同一 token 速率池。
   - 另有面向团队合规与按量计费的 Google Cloud Enterprise 方案（标准席位 `$30/人/月` 起）。

:::tip[先说一条贯穿全文的核心原则]
很多新人刚用反重力时容易踩一个坑：**全天无论大小事一律开着 `Neon (XHigh)` 当普通聊天框问问题**，结果不仅思考等得久，5 小时滚动限额也掉得飞快。反重力真正的威力，在于**按场景用对命令、用对 `@` 引用、给对工具层级，以及把高频杂活让给轻量模型和自动化机制**。
:::

下文严格拆为 **基础技巧** 与 **进阶技巧** 两大部分，帮你把 Antigravity 的实战效率彻底榨干。

---

## 第一部分：基础技巧（上手当天就能明显提效）

### 1. 用好内置 `/` 斜杠命令，一句话切换工作流状态

在反重力对话输入框里直接键入 `/`，就能调用一系列内置工作流指令，比每次手动写几百字“请先分析不要直接改代码”稳定得多：

| 斜杠命令 | 适用场景 | 实战效果 |
| :--- | :--- | :--- |
| `/plan` | 较大需求、跨多文件重构 | 强制先做只读调研与方案拆解，确认计划后再动手改代码，避免写一半推倒重来 |
| `/grill-me` | 需求还模糊、细节没想清 | Agent 会主动对你发起结构化追问，帮你把边界条件、数据结构与技术选型敲死 |
| `/compact` | 长对话变慢、上下文跑偏 | 主动压缩并提炼前序对话关键事实，腾出干净上下文窗口继续推进 |
| `/learn` | 刚纠正完 AI 的坏习惯或踩完环境坑 | 把本次总结出的项目规范或踩坑经验固化下来，后续任务不再反复犯错 |
| `/browser` | 网页检查、前端验收、表单交互 | 显式唤起内置浏览器子代理访问页面、排查控制台报错与网络请求 |
| `/schedule` | 延迟提醒、定时巡检任务 | 设定一次性倒计时或 5 字段 Cron 定时任务（如定期构建检查、日志巡检） |

### 2. Antigravity 2.0 桌面端精准投喂上下文

在桌面端对话画布里，盲目让 Agent 自己满仓库找文件是最费时间与 token 的行为，建议养成三个小习惯：

- **用 `@` 精准挂载对象**：输入 `@` 可以直接引用 **文件/目录**、**历史对话**、**运行中的终端会话**、**Rules** 以及 **MCP 工具/服务**。需要接着昨天另一个会话的结论继续写时，开一条干净新对话直接 `@历史对话` 即可，既保留核心结论又甩掉了无关对话噪音。
- **报错与 UI 问题直接拖图 / 贴图**：网页排版错位、桌面端报错弹窗、设计参考图，直接 `Ctrl+V` 贴图或拖进输入框，视觉定位比干巴巴打字描述快很多。
- **左侧 `Projects` 严格切项目工作区**：不同仓库分别绑定进左侧 Projects；反重力不仅会切换上下文根路径，还会自动读取该项目独立的 `.agents/` 规则与项目级权限配置。
- **善用右侧辅助面板盯进度**：执行复杂任务时，无需在聊天区连环追问“做完了没”，直接看右侧辅助面板里的 **Subagents**（子代理状态）、**Background Tasks**（后台任务）、**Artifacts**（文档与产物）、**Files Changed**（代码 Diff 审阅）和 **Terminals**。

### 3. 「轻量侦察 + 重型主攻」的省额度选模法

把模型和思考强度配平，体感速度能翻倍，额度还能多撑几倍：

- **读文档、查报错、全局搜代码、简单网页操作**：切 **`Gemini 4 Hydrogen`** 或 **`Gemini 3.8 Flash`**（`Low` / `Medium`）。
- **日常业务开发、写接口、修常见 Bug**：主力使用 **`Gemini 4 Argon`**（`Medium` / `High`）。
- **复杂架构改造、疑难竞态排查、全仓库审校**：切到 **`Gemini 4 Neon`（`High` / `XHigh`）** 或直接使用 **`Orchestrator`** 模式让其自己做高配规划 + 快模执行。

### 4. 内置浏览器的正确协作姿势：人过门禁，AI 干粗活

当你需要用反重力帮你验收本地页面或处理繁琐网页后台时：

- **本地开发验收直接交页面 URL**：起好本地 dev server 后，直接让它打开对应 `localhost` 端口截屏查布局、响应式断点、网络请求状态码（`404`/`500`）和浏览器 Console Error。
- **遇登录/验证码/扫码时「接力合作」**：反重力严守安全边界，**不会绕过验证码（CAPTCHA）、短信验证、扫码或代付**。正确配合方式是：让浏览器子代理打开登录页停下来 → 你在侧边浏览器手动扫码/滑过验证 → 回一句“好了”，子代理会直接在**同一个标签页**里保留登录态继续帮你批量填表、发文或整理列表，既安全又省心。

### 5. Antigravity IDE 编辑器内的四个高频快捷键

如果你同时安装了独立版 **Antigravity IDE**：

1. **智能 `Tab` 预测三连**：除了传统单行补全，还支持 **Supercomplete**（浮窗预览包含删除操作的大块 Diff）、**Tab to Jump**（预测并一键跳转到下一个相关修改点）和 **Tab to Import**（写到新依赖时自动在文件头补 `import`）。
2. **逐词精控接受**：`Tab` 全收、`Esc` 取消；如果只想要补全前半句，用 **`⌘ + →`（macOS）** 或 **`Ctrl + →`（Linux/Windows）** 逐词放行。
3. **行内指令 `⌘ + I` / `Ctrl + I`**：选中函数或代码块按快捷键直接“只改选区”；不选任何文本时按则在光标处生成新代码——给函数补 Docstring、加边界校验、拆小重构比去侧边栏聊快一个量级。
4. **Code Lenses 与 Diagnostic Auto-Fix**：函数/类上方自带 `Refactor`、`Write Tests`、`Explain Code` 内联按钮；编译器红线报错或 Problems 面板可直接触发报错自动修复。

---

## 第二部分：进阶技巧（把反重力改造成顺手的工程系统）

### 1. 高阶命令组合与过夜后台自动化

当你面对大型项目或周期性工程任务时，可以用这几组高阶能力：

- **`/grill-me` → `/plan` → `/boost` / `/teamwork` 连招**：不确定需求时先 `/grill-me` 把架构敲透，再进 `/plan` 审查改动路径，真正落地复杂实现时开 `/boost`（强思考 + 严验证）或 `/teamwork`（自动拉起多子代理并行推进）。
- **`/goal` 跑长链闭环任务**：明确验收条件与测试命令后，用 `/goal` 驱动 Agent 持续编码、跑测试、修失败直至全绿才收尾。
- **`/automation` + 桌面防休眠设定**：通过 `Scheduled Tasks` 建 Cron 自动巡检（例如每天定时检查依赖更新、汇总工作日志、跑健康检查）。跑过夜长任务或后台定时任务前，记得进 App Settings 打开 **`Keep computer awake`**、**`Run in background`** 与 **`Notifications`**，避免电脑休眠断网。

### 2. 五层定制化体系与最容易踩的隐藏限制

反重力有一套从高到低分层的定制系统：**项目 `.agents/` > 项目声明式配置 (`skills.json`/`plugins.json`) > 全局 `~/.gemini/config/` > 内置定制 > 全局 JSON 配置**。写对层级能彻底告别重复贴提示词：

:::warning[写 `AGENTS.md` / Rules 前必看的两条硬限制]
1. **单文件硬上限 `24 KB`（`24,000` 字节）**：包含展开 `@[label](path)` 引用后的总大小超过上限时会在行边界被截断。
2. **常驻 Rules 汇总预算上限 `20,000` tokens**：目录级 `AGENTS.md` / `GEMINI.md` 与全局常驻规则共享这块预算。一旦超预算，低优先级规则会被**降级成纯文件路径指针**（需要时 Agent 再按需去读），内置插件自带的 Rules 则不占该预算。  
👉 **最佳实践**：`AGENTS.md` 只写项目架构约束、构建测试命令与“禁止踩的坑”，严禁往里塞大段教学文档。
:::

- **Skills（`.agents/skills/<name>/SKILL.md`）—— 按需渐进披露**  
  Skills 平时**不会把全文塞进上下文**，系统只把 `SKILL.md` 顶部的 `name` 和 `description` 告诉模型；只有当前任务触发场景匹配 `description` 时，Agent 才会按需读取全文。
  - **关键点**：`description` 决定 Skill 会不会被正确触发，必须同时写清 **“它做什么 + 什么时候该用它”**；冗长资料拆进 `references/`，可复用命令封成 `scripts/` 放到 Skill 目录下按相对路径引用。

  ```markdown title=".agents/skills/release-check/SKILL.md"
  ---
  name: release-check
  description: >-
    Verify formatting, Astro type-check, and production build before pushing to main.
    Use whenever the user asks to prepare a release, verify build health, or push site changes.
  ---
  ```

- **Hooks（`.agents/hooks.json`）—— 生命周期自动护栏**  
  支持在 `SessionStart`、`PreToolUse`、`PostToolUse`、`PreInvocation`、`PostInvocation`、`Stop` 六个节点挂本地脚本。例如：模型每次调完编辑/写文件工具（`PostToolUse`）自动跑一遍 linter，或在运行破坏性终端命令前（`PreToolUse`）做一层校验拦截。

  ```json title=".agents/hooks.json"
  {
    "lint-checker": {
      "PostToolUse": [
        {
          "matcher": "edit_file|write_file",
          "hooks": [
            {
              "type": "command",
              "command": "./scripts/lint.sh",
              "timeout": 10
            }
          ]
        }
      ]
    }
  }
  ```

- **Plugins（`.agents/plugins/<name>/plugin.json`）—— 成套打包与迁移**  
  如果你同时积累了一套配套的 Rules + Skills + Hooks + `mcp_config.json`，打包成 Plugin 就可以在 `config.json` 里通过 `"plugins": { "my-plugin": { "enabled": false } }` 一键整体开关。（注意：原生 Plugin 的 `hooks.json` 必须直接放在插件根目录，而不是二级 `hooks/` 子目录。）如果你原本在 Claude Code、Cursor、Codex 或 Gemini CLI 里攒了整套规则和 MCP 配置，也可以直接在反重力里让内置迁移技能自动帮你整合成插件。

### 3. 权限与安全调优：全局从严 + 单项目放行

很多开发者用着觉得“要么太啰嗦老弹窗确认，要么全开 `always-proceed` 又心里发虚”。反重力的正解是利用 **Project-Level Settings 覆盖全局**：

:::steps[一套兼顾安全与流畅度的权限配法]
1. **全局保持安全基线**

   在 Global Settings 里把默认工具执行策略保留在 `request-review` 或 `proceed-in-sandbox`，同时启用 **Terminal Sandbox**，限制全局非工作区文件写权限。

2. **对你信任的常用仓库单独放行**

   在左侧切换进你的高频个人项目后，打开 **Project-Level Settings**，只针对当前仓库覆写 `Auto-Execution Policy`、联网策略与工作区权限。

3. **维护常用命令白名单 / 高危黑名单**

   把只读查询、单元测试、打包构建命令加入 **Command Allowlist**，把危险删库或不可逆推送指令放进 **Denylist**；如涉及内网调试或防越权抓取，可顺便配置 **Browser Allowlist** 限定允许访问的域名范围。
:::

### 4. Antigravity CLI（`agy`）与跨工具无头并发工作流

如果你已经习惯终端操作，或者重度依赖其他编程工具想借用反重力的高性价比模型池，`agy` CLI（本机已验证 `1.5.14`）非常值得一用：

- **交互式终端**：命令行输入 `agy` 即启，进 TUI 后 `/help` 看全量命令，`Ctrl+D` 连按两次（或 `/exit` / `/quit`）退出；CLI 配置文件位于 `~/.gemini/antigravity-cli/settings.json`。
- **无头流式调用与跨轮续聊**：配合 `-p` 与 `--output-format stream-json`，可以把 `agy` 直接嵌进你的自动化脚本或多 Agent 调度器里；加上 `--conversation <id>` 可在同一会话上下文中无缝追问，纯只读探索记得带上 `--sandbox`。

  ```bash
  # 查看可用模型列表（零额度消耗）
  agy models

  # 无头只读检索并输出结构化事件流
  agy -p "分析 src/utils 目录下的核心工具函数与调用关系" \
    --model gemini-4-hydrogen-xhigh \
    --sandbox \
    --output-format stream-json
  ```

- **Windows 子进程防挂死坑点**：在 Python / Node 脚本里通过子进程调用 `agy -p` 时，**务必传 `stdin=subprocess.DEVNULL`**，否则子进程会等待标准输入直到超时卡死。我自己也用纯 Python 写了一个开源 MCP 桥接项目，让 OpenAI Codex 在对话中全自动调度本地 `agy` 当异步子代理池：

::github{repo="Sereneoned/codex-agy-subagents"}

### 5. Python SDK 与官方 `.md` 文档秒查技巧

:::details[点开查看：Python SDK 最小启动模板 & 官方 `.md` 文档直查索引]
- **Python SDK（`google-antigravity`）**：通过 `pip install google-antigravity` 安装，可在 CI、评测脚本或自动化工具中通过异步上下文管理器拉起本地 Agent，并实时消费思考链与工具调用事件：

  ```python
  import asyncio
  from google.antigravity import Agent, LocalAgentConfig, CapabilitiesConfig

  async def main():
      # 默认以安全只读模式运行；需要写文件或执行命令时显式传入 CapabilitiesConfig()
      config = LocalAgentConfig(
          system_instructions="You are a concise code review assistant.",
          capabilities=CapabilitiesConfig(),
      )
      async with Agent(config) as agent:
          response = await agent.chat("Inspect recent changes and summarize potential risks.")
          async for token in response:
              print(token, end="", flush=True)

  asyncio.run(main())
  ```

- **官方权威文档 Markdown 直达链接**（无需手动翻网页目录）：
  - 全站文档地图索引：`https://antigravity.google/llms.txt`
  - 任意官方文档 URL 后直接追加 `.md` 就是纯文本精简版——比如查最新功能与版本号更新可直接抓：`https://antigravity.google/docs/changelog.md`
:::

---

## 附：一图看懂基础 vs 进阶使用路线

| 阶段 | 核心关注点 | 推荐立刻上手的 3 个动作 |
| :--- | :--- | :--- |
| **基础提效** | 控住上下文、省下额度、顺手交互 | ① 复杂改动先 `/plan` 再执行；② 检索切 `Hydrogen/Flash`、开发用 `Argon`、难活才上 `Neon`；③ IDE 多练 `⌘/Ctrl + I` 与 `Tab` 跳转 |
| **进阶系统化** | 规范持久化、自动化门禁、多工具打通 | ① 精简项目根目录 `AGENTS.md`（控在 `24 KB` 内）；② 把重复操作沉淀成带 `SKILL.md` + `scripts/` 的 Skill；③ 用 `hooks.json` 或 `agy` 无头脚本接入自动化流水线 |

如果这篇汇总对你有帮助，欢迎在下方评论区交流你的反重力工作流与配置心得；想要尝试用 `agy` 扩展 Codex 子代理并发上限，也可以顺手去看看 [codex-agy-subagents](https://github.com/Sereneoned/codex-agy-subagents)。
