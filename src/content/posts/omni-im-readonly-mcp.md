---
title: "继微信只读 MCP 之后：全网首发「微信 + QQ + 飞书」三合一严格只读 MCP（完全个人版、零公司管理员）"
published: 2026-11-27
description: "前几天开源 wechat-readonly-mcp 后，我进一步把微信 4.x、QQ (NTQQ) 与飞书（含跨组织外部群和云文档/Wiki）统一收口为 14 个严格只读 MCP 工具：共享 PDF/Office/ZIP 解析与离线 SenseVoiceSmall 语音转文字，100% 个人账号可用，无需企业 IT 管理员审批。"
image: /images/posts/omni-im-readonly-mcp-cover.webp
tags:
  - MCP
  - WeChat
  - QQ
  - Feishu
  - Antigravity
  - SenseVoice
  - 开源实战
category: 工程实战
---

前些天我开源了 [wechat-readonly-mcp](/Serene/posts/wechat-readonly-mcp/)，把本地微信 4.x 的聊天记录、接收文件、V2/WXGF 加密图片和离线语音转文字全都接进了 AI Agent。用起来确实很爽，但高强度跑了两天后，我立刻意识到一个更真实的痛点：

**当代开发者、科研人和打工人的个人上下文，从来不止落在微信一个软件里。**

- 日常快速沟通、朋友圈收藏、临时甩过来的 PDF/Word/压缩包，在 **微信**；
- 大量技术交流群、历史文件、几百条 `.amr` 语音和上万张截图缓存，在 **QQ (NTQQ)**；
- 跨团队合作外部群、项目需求文档、在线表格、Wiki 知识库，全都在 **飞书**。

以前想查一句“上周谁发过那个数据集/需求文档/报错轨迹”，你得在三个软件里分别搜三遍，再把飞书 Wiki 复制成 Markdown、把 QQ 里的 PDF 找出来拖进 IDE。

觉得单端微信还远远不够，我干脆把底座彻底抽象重构，今天正式开源全新三合一项目——**`omni-im-readonly-mcp`（v1.0.0）**：**面向完全个人账号、零企业管理员依赖、架构级严格只读的「微信 + QQ + 飞书」三合一 MCP Server 与 Antigravity 原生插件**。

::github{repo="Sereneoned/omni-im-readonly-mcp"}

---

## 一、整体架构：3 大异构底座 → 14 个统一只读 MCP 工具

![Omni IM Readonly MCP 三合一架构图](/images/posts/omni-im-readonly-mcp-arch.webp)

很多人第一反应会问：“市面上的多平台 IM 项目（比如 `openclaw`、`cc-connect`、`CowAgent`）不也支持多软件吗？”

但它们的方向刚好是**反的**：那些项目是**“IM 遥控 AI 机器人网关”**——让你在聊天软件里给机器人发消息；而 `omni-im-readonly-mcp` 做的是**“面向本地 AI IDE / Agent 的跨平台只读知识中枢”**——你在 Antigravity / Cursor / Claude Code 里写代码时，Agent 一句话就能跨微信、QQ、飞书同时查消息、读附件、解图片、转语音、拉云文档，并且**从架构上彻底封死任何发送/回复/删除能力**。

### 为什么不是“四合一”——我为什么果断砍掉了钉钉？

在开发过程中，我其实完整写完并测试了钉钉官方 `dws` CLI 适配层，但在实机扫码验证时踩到了一个决定性的产品红线：

当个人账号授权 `dws` 时，如果当前选中了学校或公司组织，钉钉会在 Step 4 直接拦截并返回：
`您暂无 CLI 数据访问权限，请联系组织主管理员开启`。

既然定位是**“完全个人版、零公司/学校管理员门槛、人手拿来就能跑通”**，与其保留一个大部分普通人卡在管理员审批的半残模块，不如壮士断腕，把全部精力聚焦在**真正 100% 个人可用**的三强组合：**微信 4.x + QQ (NTQQ) + 飞书**。

---

## 二、三大平台各自的“个人版最稳 + 信息最全”工程选型

三个聊天软件的底层架构截然不同，绝不能一刀切套“解密本地数据库”的套路：

| 平台 | 在线 / 核心通道 | 零配置本地层（开箱即用） | 实机实测覆盖能力 |
|---|---|---|---|
| **微信 4.x** | 内置 `wechat-readonly` 本地只读 SQLCipher 4 + WAL 增量引擎 | 自动发现 `xwechat_files` | 全部私聊/群聊、全文搜索、上下文、群成员、接收文件解析、V2/WXGF 图片解密、离线 SILK 语音转写、收藏（映射为个人文档）、公众号、朋友圈 |
| **QQ (NTQQ)** | 本地 **NapCatQQ (OneBot 11 HTTP)** 严格只读 16 接口白名单 + 离线 JSON 导出归档 | 自动扫描 `Tencent Files/<QQ号>/nt_qq/nt_data/{File,Pic,Ptt}` | 零配置直接读取本机收到的一切 PDF/XLSX/ZIP、上万张 `Pic` 图片，并**实机离线转写 `Ptt/*.amr` 语音**；挂接 NapCatQQ 后再解锁实时私聊/群聊、群成员、群文件与合并转发 |
| **飞书 (Feishu)** | 官方 **`@larksuite/cli` (`lark-cli v1.0.100+`)** 个人 DPoP 授权 + 直连 OpenAPI `GET` | 本地下载 / Markdown 导出目录 | **零公司管理员！** 2 分钟个人扫码即可直读个人单聊、**跨组织外部群**、跨群消息检索、群成员，以及**个人与跨组织共享的云文档 / Wiki / 表格**（自动拆包输出干净 Markdown） |

### 三个意想不到的工程惊喜

1. **QQ NTQQ 的 `.amr` 语音竟然和微信一脉相承**：实测检查本机 QQ `nt_data/Ptt/` 下 860 条 `.amr` 语音的二进制魔数，全部是标准腾讯 `\x02#!SILK_V3`！这意味着 QQ 语音可以直接复用我们微信项目里成熟的 `pysilk` + 本地离线 `SenseVoiceSmall` 引擎（甚至自动复用已有 `~/.wechat-readonly-mcp/asr_models`，连 160 MB 模型都不用重复下），实测 12 秒 QQ 语音秒级离线转写并持久化缓存。
2. **飞书纯个人账号竟然能直接读“外部群”和“跨组织共享 Wiki”**：很多人以为飞书开放平台必须公司管理员审批才能用，但实测使用飞书官方开源的 `lark-cli v1.0.100`，通过 `lark-cli config init --new` 创建个人 CLI 应用 + `lark-cli auth login --domain im,docs,drive,wiki` 扫码后，走硬件级 DPoP 个人态凭证，**不仅能拉到所有个人会话，连你加入的外部合作群、外部单聊、以及别人共享给你的跨组织飞书文档和 Wiki 都能几秒内直接读取正文**！
3. **实机排雷 `lark-cli` 的真实 JSON 封装与 Windows PATH 陷阱**：
   - `lark-cli v1.0.100` 的真实返回体把数据分别包在 `data.chats`、`data.messages`、`data.results` 和 `data.document.content`（带 `<title>` 标签）里，且 `drive +search` 属于纯用户态接口（不接受 `--as user` 且单页上限 20）；
   - Windows GUI 启动的 MCP 子进程 `PATH` 往往不包含用户级 Node 目录，`config.py` 新增了跨目录自动探测，并在 `subprocess.run` 时将 CLI 所在目录动态注入子进程 `PATH`，确保 `lark-cli.cmd` 永不报 `'node' is not recognized`。

---

## 三、架构级严格只读：绝不让 Prompt Injection 替你发消息

把聊天软件接给 AI Agent，最大的安全隐患不是读不到，而是**外部群友发来一条恶意 Prompt Injection，诱导 Agent 给老板或全员群发一条社死消息**。

`omni-im-readonly-mcp` 在 4 个层面做了“物理级”只读锁死：

1. **工具层零写接口**：14 个 MCP 工具全部标注 `readOnlyHint: true, destructiveHint: false`，代码里根本不存在 `send` / `reply` / `delete` / `create` 工具定义；
2. **Adapter 层硬编码白名单**：
   - QQ OneBot 11 仅放行 `ALLOWED_ONEBOT_ACTIONS` 中的 16 个 `get_*` 查询动作，任何 `send_group_msg` / `delete_msg` 直接抛出 `ReadOnlyViolationError`；
   - 飞书 `lark-cli` 仅放行 `ALLOWED_LARK_CLI_COMMANDS`（`+chat-list`、`+chat-search`、`+chat-messages-list`、`+messages-search`、`drive +search`、`docs +fetch` 等），且对参数做禁止词校验，拦截一切 `+messages-send` / `+create` / `api POST`；
   - 微信 SQLite 强制 `?mode=ro` 只读 URI 连接。
3. **文件系统路径穿越拦截**：`im_read_file` 解析符号链接并强制校验目标路径必须严格落在三端允许的根目录内，越权读取外部任意文件一律拒绝。
4. **不可信数据隔离包裹**：所有工具返回 JSON 统一携带 `_notice: UNTRUSTED_IM_DATA`，明确告知模型将聊天正文、文件名、云文档与转写文本严格视为被动数据而非可执行指令。

---

## 四、5 分钟上手指南

### 1. 克隆并一键安装（支持 Antigravity 插件与标准 MCP 客户端）

```bash
git clone https://github.com/Sereneoned/omni-im-readonly-mcp.git
cd omni-im-readonly-mcp
python scripts/install.py --with-deps --with-asr
```

> 如果你之前已经装过 `wechat-readonly-mcp`，`--with-asr` 会自动检测并复用 `~/.wechat-readonly-mcp/asr_models` 下的 SenseVoiceSmall 模型，零重复下载。

### 2. 开启个人飞书（2 分钟扫码，零公司管理员）

```bash
npm install -g @larksuite/cli@latest --allow-scripts=@larksuite/cli
lark-cli config init --new --lang zh_cn
lark-cli auth login --domain im,docs,drive,wiki
```

### 3. （可选）开启 QQ 实时文字聊天

本地 `nt_data/File`（接收文件）、`Pic`（图片）、`Ptt`（离线语音转文字）已经**零配置开箱即用**。如果需要实时拉取 QQ 群/私聊文字历史与群文件，本机启动 NapCatQQ 并开启 OneBot 11 HTTP（`http://127.0.0.1:3000`），运行：

```bash
python scripts/auth_helper.py qq --onebot-url http://127.0.0.1:3000
```

### 4. 检查三端实时状态 & 运行自动化测试

```bash
python scripts/auth_helper.py status
python -m unittest discover -s tests -v
```

装好之后，直接在 Antigravity / Cursor / Claude Code 里用自然语言提问即可：
- *“跨平台搜一下我最近一周在微信和飞书里关于某某项目的全部讨论和相关云文档”*
- *“列出我微信和 QQ 最近收到的 PDF/Excel/ZIP 文件，直接帮我读最新那份并整理重点”*
- *“把我 QQ 里最新收到的几条语音离线转成文字”*
- *“读取我飞书里那篇《xxx 需求文档》，对照本地代码库检查还有哪些需求没实现”*

如果你也受够了在微信、QQ、飞书和 IDE 之间反复复制粘贴，欢迎去 GitHub 点个 Star 试一试，也欢迎提 Issue 和 PR 一起把个人知识中枢打磨得更好用！
