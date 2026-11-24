---
title: 如何让你的反重力（Antigravity）像 Codex 和 Claude Code 一样随意操作电脑？终端权限 + 接管本地 Chrome + 操控桌面应用全攻略
published: 2026-11-24
description: 全面拆解 Google Antigravity（反重力）桌面端从“只能改工作区代码”进化为“本机全能 Agent”的三件套方案：底层终端与跨目录权限放开、chrome-devtools MCP + local-chrome-ops 接管本地 Chrome 永久保留登录态、agent-desktop (local-desktop) MCP + local-desktop-ops 驱动 Windows 桌面客户端，附完整配置清单与避坑细节。
image: /images/posts/antigravity-computer-control-cover.webp
tags:
  - Antigravity
  - MCP
  - Chrome DevTools
  - 桌面自动化
  - AI编程
  - 效率工具
category: 工程实战
---

## 引言：为什么默认状态下的“反重力”总觉得被拴住了手脚？

很多从 **Claude Code** 或 **Codex CLI** 切到 **Google Antigravity（反重力）桌面端** 的开发者，头几天都会有一种很微妙的割裂感：明明模型代码能力很强、多智能体也很顺手，可一旦让它帮忙干点“跨出当前项目文件夹”的活，体验就开始别扭了：

1. **权限卡得紧**：动一下工作区外的文件、跑个本机脚本、清个临时构建目录，动不动就弹窗停下来等你点确认，甚至被终端沙盒拦在工作区里面出不去。
2. **侧边内置浏览器换号就“失忆”**：在反重力自带的侧边浏览器里辛辛苦苦扫码登录了小红书、知乎、CSDN、GitHub，只要切一个 Google Antigravity 账号，再点回原来的对话，侧边浏览器里的登录态看起来像**全被清空了一样**，每个网站都得重新扫码过验证。
3. **只敢逛网页，不敢碰桌面软件**：碰到 Keil 编译调试、记事本测试、桌面客户端填表、或者检查系统弹窗通知，默认 Agent 只能“口头教你怎么点两下鼠标”，没办法像真正在电脑前干活的人一样自己打开软件、操作控件、再核对结果。

后来我陆续给反重力配了三套东西，装完之后很多朋友甚至自己都记不清——**“我当时到底给它装的是 Skill、插件（Plugin），还是 MCP？”**

先花 30 秒把本机这套“全能操控三件套”的真实身份一次理清，后面每一步你都能直接照着抄作业。

---

## 一、先理清「MCP / Plugin (Rule) / Skill」三层架构，装完不再脸盲

其实你给反重力配的并不是“三选一”，而是一套**分工极其明确的三层神经系统**——全都在全局目录 `C:\Users\<你的用户名>\.gemini\config\`（下文简称 `~/.gemini/config/`）下生效，**哪怕切换不同 Antigravity 账号也能无缝共享**：

![Antigravity 三层本地控制架构图](/images/posts/antigravity-three-layer-arch.webp)

| 层级 | 在电脑上的真实位置 | 当前启用的组件 | 到底负责干什么？ |
| :--- | :--- | :--- | :--- |
| **手与眼（工具执行层 / MCP）** | `~/.gemini/config/mcp_config.json` | **`chrome-devtools`**（33 个浏览器工具）<br>**`local-desktop`**（67 个桌面 GUI 工具） | 提供真正能调浏览器、点按钮、读写剪贴板、操作窗口的底层工具接口 |
| **大脑条件反射（Plugin + Always-On Rules）** | `~/.gemini/config/plugins/local-chrome-ops/`<br>`~/.gemini/config/plugins/local-desktop-ops/` | 两个全局定制 **Plugin** 及其 `rules/AGENTS.md` | 不需要你每次在 Prompt 里苦口婆心提醒“用本地 Chrome”“别口头教程”；常驻规则会自动告诉 Agent 遇到网页走本地 Chrome、遇到 Windows 客户端直接动手 |
| **操作手册（Workflow Skill）** | `plugins/local-desktop-ops/skills/local-desktop-ops/SKILL.md` | **`local-desktop-ops`** 技能 | 按需加载，规定了操控桌面软件的 `observe → act → verify` 标准化 SOP、冒烟测试与踩坑禁忌 |
| **底层放行开关（权限底座）** | `~/.gemini/config/config.json` + Settings | Turbo 权限预设 + 关终端沙盒 + 放开非工作区访问 | 把命令行和跨目录读写权限真正还给 Agent，对齐 Codex / Claude Code 的本机执行力 |

看懂这张表，困惑就解开一半了：**操控浏览器用的是 `chrome-devtools` MCP + `local-chrome-ops`（纯规则插件）；操控电脑桌面用的是 `local-desktop` MCP + `local-desktop-ops`（规则 + Skill 混合插件）；而敢在本地电脑畅通无阻跑脚本、跨目录改文件，靠的是全局 `config.json` 放开了底座权限。**

下面逐个把每一层的原理、真实配置和最容易踩的坑讲透。

---

## 二、支柱一：放开底层终端与全盘文件权限（对齐 Codex / Claude Code 执行力）

为什么 Codex CLI 和 Claude Code 用起来像“真在你终端里驻场的工程师”？核心原因不是模型多神秘，而是**工作区边界和命令执行权放得开**——能读用户目录里的配置、能跨仓库协同、能直接跑构建和系统命令。

Google Antigravity 桌面端默认把安全阀门拧得很紧（命令需要 `request-review` 审批、开启 Terminal Sandbox、拦截工作区外文件访问），新手试用期很安全，但做全流程自动化时处处掣肘。

### 1. 怎么在 `~/.gemini/config/config.json` 打开生产力？

检查全局配置 `~/.gemini/config/config.json` 里的 `userSettings` 段，实际放开本地自由度的核心开关是这四项：

```json
{
  "userSettings": {
    "autoExecutionPolicy": "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER",
    "enableTerminalSandbox": false,
    "nonWorkspaceFileAccessPolicy": "AGENT_SETTING_POLICY_ALLOW",
    "permissionPreset": "AGENT_PERMISSION_PRESET_TURBO",
    "sandboxEnabledAtV2Migration": false
  }
}
```

拆开看每一项的实际含义：

- **`permissionPreset: "AGENT_PERMISSION_PRESET_TURBO"` & `autoExecutionPolicy`**：常规读写、构建、检查命令无需每步停下来点 Allow，让多步流水线一口气跑通。
- **`enableTerminalSandbox: false`**：关闭终端沙盒限制，命令行工具才能真正触达本地真实环境（如读全局配置、调用本机已装浏览器与编译器）。
- **`nonWorkspaceFileAccessPolicy: "AGENT_SETTING_POLICY_ALLOW"`**：允许 Agent 跨出当前打开的单一工程目录，直接读取并维护位于 `%USERPROFILE%` 下的配置、跨仓源码或桌面素材目录。

:::warning[放权不等于“裸奔”：必须守住的安全红线]
哪怕开到了 Turbo 档，也要守住两条硬边界：
1. **认证、验证码、支付与高危破坏动作绝不绕过**：Chrome 远程调试首次放行弹窗、GitHub 删仓 Sudo 授权、网站图形验证码、登录扫码、付款页，一律停下来让真人操作。
2. **禁止探测或破坏宿主沙盒与鉴权状态**：工具能跑全盘命令，是用来做正经工程与自动化协作，不是去修改权限检查状态或绕开登录态校验。
:::

---

## 三、支柱二：接管本地真实 Chrome —— 彻底根治“换号丢登录态”

这是日常高频使用反重力时**体感提升最大**的一步，先看清问题的底层真相，很多人之前都猜错了。

### 1. 底层真相：侧边浏览器的 Cookie 根本没丢，而是“按账号隔离了”

切一次 Antigravity 账号，发现原先好好的小红书、知乎、GitHub 全退出登录了，很多人第一反应是“更新/切号把浏览器缓存清了”。

实际上去查本地目录就会发现：**Antigravity 内置侧边浏览器（基于 Electron）为每一个登录过的 Antigravity 账号分配了独立的存储分区目录**：`Partitions/hub-browser-<账号哈希>`。

- 对话记录存在全局 `conversations/` 里，所以切号后你依然能打开老对话；
- 但内置浏览器的 **Cookies / LocalStorage 绑定在当前账号的独立 Electron 分区上**，不跟着对话走。切到 B 账号时，侧边栏切去了 B 的分区，A 账号分区里的 Cookie 实际上纹丝不动躺在硬盘里。

:::tip[千万别用 Windows `mklink /J` 硬并分区目录！]
网上偶尔有人图省事，想用符号链接把几个 `hub-browser-*` 文件夹强行指向同一个物理路径——**非常不建议这么做**：
1. Chromium 内核对分区的 `Cookies`（SQLite）和 `Local Storage`（LevelDB）持有独占文件锁，应用内不彻底杀进程直接切号时，两个会话同时读写同一份数据库极易锁死或损坏；
2. 会打破官方的账号隔离边界，容易引起 Google OAuth 鉴权串号或异常退出。
:::

既然官方侧边浏览器按账号隔离，正确的破局思路其实特别简单：**干脆让全账号共享的全局 MCP，直接接管你平时自己用的本地 Google Chrome！** 账号再怎么切，你桌面上那个 Chrome 里的 Cookie 永远稳如磐石。

### 2. 三步打通 `chrome-devtools-mcp` + `local-chrome-ops`

#### 第一步：在本地 Chrome 144+ 一键开启原生远程调试
你不需要用特殊命令行参数重启 Chrome 才能搞调试——Chrome 144+（实测 `v157`）原生内置了开关：
1. 打开本地常用的 Google Chrome，在地址栏输入：`chrome://inspect/#remote-debugging`
2. 开启 **Allow remote debugging for this browser instance**。
3. 开启后 Chrome 会在本地 User Data 目录下生成 `DevToolsActivePort`（监听本机 `9222` 调试端口）。

#### 第二步：全局安装 `chrome-devtools-mcp` 并写进 `~/.gemini/config/mcp_config.json`
全局安装官方工具包（实测版本 `chrome-devtools-mcp@1.13.0`）：

```powershell
npm install -g chrome-devtools-mcp
```

:::tip[Windows 用户避坑关键：别直接写 `"command": "npx"`！]
在 Windows 的 PowerShell 环境下，直接让 MCP 客户端调用 `npx` 很容易撞上 `npx.ps1` 的脚本执行策略拦截（或每次启动现拉包卡死）。最稳的写法是**直接把路径指死到 `node.exe` 和包里的入口 `.js` 文件，再带上 `--autoConnect`**：
:::

在 `~/.gemini/config/mcp_config.json` 中加入 `chrome-devtools`：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "C:\\Users\\<你的用户名>\\AppData\\Local\\Programs\\<Node目录>\\node.exe",
      "args": [
        "C:\\Users\\<你的用户名>\\AppData\\Local\\Programs\\<Node目录>\\node_modules\\chrome-devtools-mcp\\out\\Default\\gen\\src\\bin\\chrome-devtools-mcp.js",
        "--autoConnect"
      ]
    }
  }
}
```

配置保存并 Refresh MCP 后，**33 个真实浏览器控制工具**（`list_pages`、`new_page`、`navigate_page`、`take_snapshot`、`click`、`fill`、`upload_file`、`evaluate_script`、`list_network_requests`、`take_screenshot` 等）全部就位。

第一次 Agent 调用 `list_pages` 连向 Chrome 时，Chrome 会弹出确认框 **Allow remote debugging?**，你**手动点一次 Allow**，以后就能丝滑连上了。

> **多 Chrome Profile 小贴士**：如果你本地 Chrome 分了好几个工作/生活配置文件，`--autoConnect` 会连接到 Chrome 当前判定的默认活跃配置；如果想彻底专机专用，可以把 `--autoConnect` 换成 `--userDataDir=C:\path\to\agent-profile` 分出一个专供 Agent 持久化登录态的 Chrome 窗口。

#### 第三步：装上 `local-chrome-ops` 全局插件，把“先看后开新页”写进肌肉记忆
光装好 MCP 还不够——如果不加约束，Agent 要看网页时仍会习惯性去拉内置 `browser` 子代理，或者直接一脚把你正在看资料的标签页跳转走！

因此在 `~/.gemini/config/plugins/local-chrome-ops/` 下建一个极轻的纯规则插件（只需 `plugin.json` + `rules/AGENTS.md`）：

- **优先路由**：遇到需要打开、交互、且依赖持久化登录态的网页任务，优先走 `chrome-devtools` MCP 而不是内置隔离侧边浏览器（除非用户显式点名 `/browser`）。
- **护住用户当前标签页**：动手前**必须先调 `list_pages`** 查看现存标签；**一律用 `new_page` 单独新建自己的工作标签页**，严禁在用户正在阅读的原有标签页上跳转，也严禁读取或关闭无关个人标签页。
- **不越界**：碰到 Chrome 的 `Allow remote debugging` 弹窗、登录框、图形验证码、支付页，直接停下来让用户在本地 Chrome 里亲自点，绝不用桌面工具代点“Allow”。

> **顺手小优化**：在 Antigravity `Settings > General > Open Links In` 里也可以顺手选成 **External Browser**，这样平时你自己手点对话里的超链接，也会直接进本地 Chrome，内外无缝打通。

---

## 四、支柱三：操控任意 Windows 桌面软件 —— `local-desktop` (`agent-desktop`) MCP

搞定网页只是半壁江山，真正让反重力在体感上逼近“本地 AI 数字员工”的，是让它能直接操作你电脑上的原生 Windows 桌面程序——比如 **记事本、Keil 等专业工程软件、系统通知弹窗、剪贴板、文件选择框以外的各类传统客户端窗口**。

### 1. 把 `agent-desktop` 挂成全局 `local-desktop` MCP

这里用到的是开源/原生桌面自动化引擎 `agent-desktop.exe`（实测 `v1.2.0`），直接把它的 `mcp` 子命令和持久化快照状态目录 `AGENT_DESKTOP_HOME` 配进同一份 `~/.gemini/config/mcp_config.json`：

```json
{
  "mcpServers": {
    "local-desktop": {
      "command": "C:\\Users\\<你的用户名>\\AppData\\Local\\Programs\\CodexAgentTools\\agent-desktop\\agent-desktop.exe",
      "args": [
        "mcp"
      ],
      "env": {
        "AGENT_DESKTOP_HOME": "C:\\Users\\<你的用户名>\\AppData\\Local\\Programs\\CodexAgentTools\\agent-desktop\\state"
      }
    }
  }
}
```

接入后，反重力直接多出 **67 个 `desktop_*` 工具**，覆盖窗口枚举/置顶/还原（`desktop_list_windows`、`desktop_restore`）、无障碍树快照与检索（`desktop_snapshot`、`desktop_find`）、控件交互（`desktop_click`、`desktop_set_value`、`desktop_select`、`desktop_check`）、剪贴板与系统通知（`desktop_clipboard_*`、`desktop_list_notifications`）乃至多步批处理（`desktop_batch`）。

### 2. 为什么 UIA 控件树方案比“截屏 OCR 点坐标”稳得多？

![本地 Chrome 接管与桌面 UIA 闭环实战图](/images/posts/antigravity-desktop-chrome-workflow.webp)

很多人印象里的桌面自动化是“截全屏 → 猜像素坐标 `(x, y)` → 强行抢占鼠标点一下”，窗口稍微挪动或者改了缩放比例就点偏。

`local-desktop` 配合 `local-desktop-ops` 插件（`rules/AGENTS.md` + `skills/local-desktop-ops/SKILL.md`）走的是另一套完全基于 **Windows UI Automation（UIA）无障碍控件树** 的严谨闭环——**`observe → act → verify`**：

1. **Observe（列窗口 → 拍控件树快照）**：先 `desktop_list_windows` 找到目标窗口精确 `window_id`，用 `desktop_snapshot(window_id=..., compact=true, interactive_only=true)` 生成带结构化引用 `@<snapshot_id>:eN` 的交互树（只在遇到纯 Canvas 自绘界面读不出控件时，才用 `desktop_screenshot` 辅助）。
2. **Act（语义 ref 直达控件）**：直接对 `@snapshot_id:eN` 调语义方法，比如按钮用 `desktop_click`，输入框直接用 `desktop_set_value`（而不是瞎模拟按键），下拉用 `desktop_select`。
3. **Verify（必须复读校验）**：每次交互后绝不“默认成功”，立刻调 `desktop_get(ref_id=..., property="text"|"value")` 或 `desktop_is` / 重拍快照确认改写真正落盘，避免页面变化引发 `STALE_REF`。

### 3. 实战必须知道的 4 个底层避坑点

从实际配置的 `SKILL.md` 和踩坑记录里提炼出几条最值钱的经验：

1. **无头语义模式不抢鼠标，但物理键鼠工具会报 `POLICY_DENIED`**：默认 `agent-desktop mcp` 跑在 **strict headless semantic delivery** 模式下——好处是不抢你前台焦点、不乱晃鼠标，坏处是 `desktop_type`、`desktop_double_click`、`desktop_mouse_*` 等物理键鼠工具默认直接被策略拒绝，优先老老实实用 `desktop_set_value` 写值；只有确实无法语义输入的老旧自绘软件，才在明确授权后启用 `--headed` 模式。
2. **严格按 `window_id` 划边界，绝不滥用 `desktop_close_app`**：关闭测试窗口时只关目标 `window_id`，禁止图省事调 `desktop_close_app` 把用户正在写东西的其他软件窗口一锅端掉。
3. **Windows 11 多标签记事本的 `no_attach` 坑**：Windows 11 新版记事本支持多标签，如果你本来开着一个 Notepad，再用 `desktop_launch(app="notepad.exe", no_attach=true)` 试图单开测试窗，系统会报错 `ACTION_FAILED (Application is already running)`，因此动手前务必先用 `desktop_list_windows` 确认现存窗口。
4. **同名同级控件冲突（`AMBIGUOUS_TARGET`）**：同一层级出现 role、name、native ID 完全相同的兄弟控件时，无头模式会拒绝盲点，需改用更精确的父子节点限定或让用户配合介入。

### 4. 三步跑通你的第一次“记事本冒烟测试”

配好之后想 30 秒验证到底灵不灵？直接让反重力执行一次标准的 **Notepad 冒烟测试**：
- 列出当前窗口，启动独立的 `notepad.exe` 测试窗口并拍下 UIA 快照；
- 找到编辑区 `ref_id`，用 `desktop_set_value` 写入 `"Antigravity 桌面操作测试"`；
- 再用 `desktop_get` 重新把编辑区文本读出来比对完全一致，最后只关掉这个测试窗且点“不保存”，确认用户原窗口毫发无损。

---

## 五、三件套合体后的实战威力与使用口诀

把 **底层权限 + 本地 Chrome + 本地桌面控制** 全部接进全局配置之后，反重力才算真正摆脱了“只会在单个文件夹里写代码的聊天框”定位——平时你用多个账号轮换保额度时，**MCP 工具池和你的 Chrome 登录态、桌面规则全都在背后稳稳待命**：

- **写完直接全网发稿**：本地生成文章和图卡 → `git push` 推送部署 → 直接驱动本地已经登录好的 Chrome 多标签页逐个平台完成图文排版、线上图片尺寸校验与发布（遇到登录过期或人机验证自动停住让你手动过）。
- **真·桌面级全栈联调**：像开发嵌入式或传统工程项目时，Agent 改完代码 → 命令行编译构建 → 用 `local-desktop` 直接操作 **Keil** 等桌面软件运行验证 → 截图回传分析结果，端到端一气呵成。
- **日常电脑巡检与收尾**：读剪贴板、查系统通知、自动给测试窗做端到端冒烟，全程记录精简，不再动不动就贴一长串操作教程甩锅给人类自己去点。

记混了今天到底装了啥，随时回来看这一句口诀就够了：
> **`config.json` 管放行，`mcp_config.json` 里两套 MCP（`chrome-devtools` + `local-desktop`）提供 100 个真手真眼，再加 `plugins/` 里 `local-chrome-ops` 与 `local-desktop-ops` 的规则和 Skill 当大脑条件反射——反重力就能彻底接管你的 Chrome 和 Windows 工作台。**
