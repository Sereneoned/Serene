---
title: "给 AI Agent 接上严格只读的微信 4.x 本地记忆：实测打通 WAL 实时同步、V2/WXGF 自动解图与离线语音转文字"
published: 2026-11-25
description: "开源发布 wechat-readonly-mcp v1.1.0：深度拆解 Windows 微信 4.2 严格只读 MCP 架构——SQLCipher 4 WAL 毫秒级增量同步、kvcomm 离线派生 V2 密钥与 WXGF(HEVC) 内存转 JPG、media_0.db SILK v3 本地 SenseVoiceSmall 离线转写，以及 PDF/Office/ZIP 全格式直读与安全防注入设计。"
image: /images/posts/wechat-readonly-mcp-cover.webp
tags:
  - WeChat
  - MCP
  - Antigravity
  - SenseVoice
  - 开源实战
category: 工程实战
---

每天在 **Google Antigravity、Claude Code、Codex 或 Cursor** 里高频写代码、做科研和整理文档时，有一个绕不开的效率断层：

**大量最关键的实时上下文其实都在微信里**——群聊刚对齐的需求变更、同事顺手甩过来的 PDF/Excel/Word/ZIP 附件、满屏以加密 `.dat` 存放的报错截图，以及动辄三四十秒的语音消息。以前每次都要手动切窗、截长图、把附件另存到项目目录、再自己听完语音打字喂给 AI，信息链路非常割裂。

为此我开发并开源了 **`wechat-readonly-mcp`（v1.1.0）**：一套 **100% 本地离线、严格只读** 的 Windows 微信 4.x（实测 `4.2.0.53`）MCP 服务与 Antigravity 原生插件，一次打通 **文字 + 全格式附件 + 自动解图 + 离线语音转文字** 四个维度，共提供 **15 个只读工具**。

::github{repo="Sereneoned/wechat-readonly-mcp"}

> **合规与隐私声明**：本项目仅用于个人本机以严格只读方式检索**本人**的微信本地数据以提升工作效率。代码库中**不存在任何发消息、控制微信窗口、DLL 注入或修改原目录的接口**，语音与图片解码全部在本地完成，绝不上传任何第三方云端。

---

## 一、整体架构：4 条本地只读引擎 + 15 个标准 MCP 工具

![WeChat Readonly MCP 严格只读本地架构图](/images/posts/wechat-readonly-mcp-arch.webp)

与早期只支持“全量导出一份静态 CSV”的脚本不同，面向实时 Agent 交互的核心诉求有四个：

1. **实时低延迟**：群里刚发完新消息，Agent 下一秒就能查到，不能每次都花十几秒把几百 MB 的数据库全量解密一遍；
2. **图文语文档无盲区**：不仅读纯文字，还要直接读懂收到的 PDF/DOCX/XLSX/PPTX/ZIP，直接解密微信 4.2 的 V2 / `WXGF` 图片给多模态模型看，还要把 `SILK v3` 语音本地转成文字；
3. **跨客户端通用 + 零手工提示**：底层是零外部 MCP SDK 依赖的纯 Python JSON-RPC 2.0 `stdio` 服务（同时兼容 LSP `Content-Length` 与换行分隔帧），在 Antigravity 里配套 `rules/AGENTS.md` + `SKILL.md` 后，只要随口说“看看微信里刚才讨论了什么”，Agent 就会主动查库；
4. **严格只读与防提示词注入**：所有数据库只用 SQLite `?mode=ro` URI 打开，所有返回结果强制包裹 `UNTRUSTED_WECHAT_DATA` 安全提示，杜绝别人发来的微信消息反向操控你的本机 Agent。

---

## 二、核心技术一：SQLCipher 4 密钥扫描与 `FastDBCache` 毫秒级 WAL 增量补丁

Windows 微信 4.x 将聊天、联系人、媒体与收藏拆分存储在 `Documents\xwechat_files\<account>\db_storage\` 下的多张 SQLCipher 4 加密库（4096 字节页大小、AES-256-CBC + HMAC-SHA512）中，并开启了 SQLite WAL（Write-Ahead Log）模式。

### 2.1 只读 `Config.Cipher` 密钥校验
首次启动（或微信重启/版本更新触发 `wechat_status(refresh_keys=true)`）时，`crypto_engine.py` 仅使用只读权限 `OpenProcess(0x0410)` 与 `ReadProcessMemory` 扫描正在运行的 `Weixin.exe` 中 `com.Tencent.WCDB.Config.Cipher` 结构，提取候选 32 字节密钥后，对每个 `.db` 文件的第 1 页执行标准 SQLCipher 4 `PBKDF2-HMAC-SHA512` 校验，确认完全匹配后才缓存到用户隔离状态目录 `~/.wechat-readonly-mcp/all_keys.json`（绝不写入代码仓，也绝不向模型输出）。

### 2.2 `FastDBCache` 三级快路径（为什么查最新消息几乎是瞬时的）
聊天主库 `message_0.db` 往往动辄数百 MB。如果每次查询都重新全量解密，交互体验会非常卡顿。`FastDBCache` 通过追踪每个数据库的 `(db_mtime, db_size, wal_mtime, wal_size, wal_salt1, wal_salt2, wal_end_offset)` 实现三级调度：

1. **快路径 1（零开销命中）**：主库与 `-wal` 的元数据均未变化 → 直接返回本地缓存库路径（`< 1 ms`）；
2. **快路径 2（WAL 增量打补丁）**：主库未变，`-wal` 文件的 `salt1 / salt2` 一致且体积单调增长 → 只从上次记录的 `wal_end_offset` 开始读取新增 WAL 帧，逐页解密后原地写入缓存库对应页号（`(pgno - 1) * 4096`），通常几毫秒即可同步刚收到的最新消息；
3. **回退路径（原子全量重建）**：当微信执行 SQLite checkpoint 导致主库更新或 WAL salt 轮换时，以 1 MiB 块缓冲全量解密到临时文件并应用 WAL，最后通过 `os.replace` 原子替换缓存库，避免读到半截损坏文件。

并且所有查询连接全部强制以只读 URI 模式打开：

```python
def _ro_connect(db_path: str) -> sqlite3.Connection:
    uri = Path(db_path).resolve().as_uri() + "?mode=ro"
    return sqlite3.connect(uri, uri=True, timeout=15.0)
```

---

## 三、核心技术二：攻克微信 4.2 图片解密——`kvcomm` 离线派生 + `WXGF`（HEVC）自动转 JPG

在微信 4.2 实测过程中，我们踩出了一个社区老脚本普遍翻车的双层深坑：

:::warning[为什么很多旧版 `.dat` 解密脚本在微信 4.2 上大面积失灵？]
1. **绝大多数图片解开后并不是 JPG/PNG，而是腾讯私有 `wxgf` 容器**：在实机样本中，超过 90% 的微信 4.2 缓存图片解密后的魔数是 `b"wxgf"`（内部封装了 H.265 / HEVC Annex-B 视频单帧），旧脚本只检测 `FF D8 FF`（JPEG）和 `89 50 4E 47`（PNG），直接把解出来的有效图片当失败丢弃了。
2. **V2 加密头（`07 08 V2 08 07`）采用了每账号独立的 16 字节 AES-ECB 密钥 + 尾部 XOR**：仅靠在内存里盲扫容易漏命中，而且依赖进程实时驻留。
:::

`wechat-readonly-mcp` 在 [crypto_engine.py](https://github.com/Sereneoned/wechat-readonly-mcp/blob/main/server/crypto_engine.py) 里把整条链路彻底做成了**全自动闭环**：

1. **第一级：100% 离线 `kvcomm` 密钥派生（零内存扫描）**
   扫描 `%APPDATA%\Tencent\xwechat\net\kvcomm\key_*_*.statistic` 文件名中的整数 `code`，结合当前账号 `wxid` 计算：
   ```python
   aes_key = hashlib.md5(f"{code}{wxid}".encode("utf-8")).hexdigest()[:16]
   xor_key = code & 0xFF
   ```
   用该密钥对 `.dat` 的首个 AES 块解密校验魔数（含 JPG / PNG / GIF / WebP / **`wxgf`**），命中后持久化到 `media_keys.json`——实测对数百张本地 V2 图片达到 **100% 离线命中**。只有在极少数 `kvcomm` 缺失场景下，才会降级触发只读内存回退扫描。
2. **第二级：`WXGF`（HEVC）内存无损转标准 JPEG**
   一旦检测到解密后的载荷为 `wxgf`，立即定位内部 HEVC Annex-B 起始码（`00 00 00 01 40 01` / `42 01`），优先使用 `PyAV` 在内存中直接解码首帧并编码为高质量 JPEG（如果环境未装 PyAV 则自动回退系统 `ffmpeg` 管道），最后经 `Pillow` `im.verify()` 验证图片完整性并落盘至 `decoded_images/` 缓存目录。

此后多模态 Agent 调用 `wechat_get_image` 拿到标准 `.jpg` 路径，再直接用内置 `read_file` 就能清晰“看见”聊天里的每一张截图、照片和架构图。

---

## 四、核心技术三：100% 本地离线语音转文字（`media_0.db` + `SILK v3` + `SenseVoiceSmall int8`）

微信 4.x 把收发的语音消息以腾讯魔改 `SILK v3` 编码（带前导 `0x02` 字节）统一存放在 `message/media_0.db` 的 `VoiceInfo` 表里，通过 `(chat_name_id, local_id)` 与聊天记录精确对应。

为了做到**隐私语音绝不离本机**，同时又快到能一次批量消化几十上百条语音，`voice_engine.py` 采用了全本地轻量管线：

1. **纯内存 `SILK v3` 解码**：通过 `silk-python` 在内存 `BytesIO` 中直接将 `VoiceInfo.voice_data` 解码为 16 kHz float32 PCM（自动兼容是否带有前导 `0x02` 字节，全程不写临时 `.silk` / `.wav` 文件）；
2. **本地 `sherpa-onnx` + 阿里 `SenseVoiceSmall int8` 推理**：模型体积仅约 160 MB，CPU 多线程即可稳定跑到几十倍实时速度，支持**中/英/日/韩/粤自动语种识别**与**标点/数字逆文本正则化（ITN）**；
3. **按会话持久化增量缓存**：转写结果按 `(chat_id, local_id)` 原子写入 `~/.wechat-readonly-mcp/voice_cache/<md5(chat_id)>.json`。
   - 调用 `wechat_get_voice(chat=..., period="7d")` 可批量离线转写并按时间顺序返回发信人、时长与文本；
   - 调用 `wechat_get_messages` 时，凡是已转写过的语音会自动内联显示 `[语音 12.4s] 实际文本`，传入 `transcribe_voice=true` 更可实现“边读聊天记录、边对未缓存语音即时离线转写”。

---

## 五、核心技术四：全格式本地附件直读与 15 个只读 MCP 工具全景

在 `file_reader.py` 中，所有微信收到的文件（`msg/file/YYYY-MM/`）均经过 `validate_allowed_path()` 沙盒校验（严格限制在当前微信账号目录与插件缓存目录内，杜绝 `../` 路径穿越），支持直接解析：

- **PDF**：优先 `PyMuPDF`（速度快、保留页码分隔），缺省回退 `pypdf`；
- **Office 三件套**：`DOCX`（段落 + 表格 Markdown 化）、`XLSX`（只读遍历全工作表与行上限保护）、`PPTX`（每页正文 + 表格 + 演讲者备注 Notes），缺失三方库时自动降级解析 OOXML ZIP 内 XML；
- **ZIP 压缩包**：不传 `zip_member` 时列举压缩包全部目录（并自动将 Windows 未设 UTF-8 标志位的 CP437 乱码恢复为 GB18030 中文文件名）；传入 `zip_member` 时可直接读取包内源码、文本甚至嵌套的 PDF/Office 文档；
- **代码与文本**：自动尝试 `utf-8-sig / utf-8 / gb18030 / gbk / utf-16` 编码，支持 `offset_chars` / `max_chars` 分页读取超大文件。

完整暴露的 **15 个只读 MCP 工具**：

| 分类 | 工具名 | 核心能力 |
| :--- | :--- | :--- |
| **会话与检索** | `wechat_list_sessions` / `wechat_resolve_chat` | 列出最近私聊/群聊、未读数与最后消息；按备注/昵称/群名模糊解析 `chat_id` |
| **消息与上下文** | `wechat_get_messages` / `wechat_search_messages` / `wechat_get_context` | 按时间窗与消息类型分页读取（含引用、文件、合并转发、图片、语音）；跨全库 `zstd` 关键词搜索；按 `local_id` 拉取前后上下文 |
| **群成员与统计** | `wechat_get_group_members` / `wechat_get_stats` | 查询群主与全部群成员；统计消息总量、类型占比与高频发言人 |
| **文件直读** | `wechat_list_files` / `wechat_read_file` | 按名称/后缀/月份检索收到文件；直接提取 PDF/DOCX/XLSX/PPTX/ZIP/HTML/源码文本 |
| **多模态解图** | `wechat_get_image` | 自动解码 Legacy/V1/V2/`.wxgf` 为标准 JPEG/PNG，配合多模态模型直接视觉读图 |
| **离线语音** | `wechat_get_voice` | 只读提取 `media_0.db` `SILK v3` 语音并经本地 SenseVoiceSmall 转文字（带缓存） |
| **扩展信息源** | `wechat_get_favorites` / `wechat_get_biz_messages` / `wechat_get_moments` | 检索微信收藏、公众号推送文章与朋友圈动态 |
| **运维状态** | `wechat_status` | 查看已解锁库数、ASR 就绪状态与缓存数；微信重启后 `refresh_keys=true` 自动刷新密钥 |

---

## 六、一键安装与接入指南

前置条件：**Windows 10/11**、**微信 4.x**（实测 `4.2.0.53`）、**Python 3.10+**。

### 1. 一键安装为 Antigravity 原生插件（推荐）

```bash
git clone https://github.com/Sereneoned/wechat-readonly-mcp.git
cd wechat-readonly-mcp
python scripts/install.py --install-deps --download-asr
```

- `--install-deps`：安装 `requirements.txt` 里的解密、文档解析、图片解码与语音依赖；
- `--download-asr`：自动从官方 `k2-fsa/sherpa-onnx` Release 下载约 160 MB 的 `SenseVoiceSmall int8` 模型到 `~/.wechat-readonly-mcp/asr_models/`（如暂不需要语音转文字可省略）；
- 安装脚本会自动将 `plugin.json`、`rules/AGENTS.md`、`skills/wechat-readonly/SKILL.md` 与 `server/` 复制到 `~/.gemini/config/plugins/wechat-readonly/`，并把 `mcp_config.json` 指向你当前的 Python 解释器。
- 保持微信登录并重启一次 Antigravity，之后在**所有新老对话**里直接自然语言提问即可（例如：“看看今天技术群里讨论了什么，把发来的 PDF 和语音一起总结一下”）。

### 2. 接入 Claude Code / Codex / Cursor 等任意 MCP 客户端

```bash
pip install -r requirements.txt
```

在客户端的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "wechat-readonly": {
      "command": "python",
      "args": ["-u", "你的绝对路径/wechat-readonly-mcp/server/mcp_server.py"]
    }
  }
}
```

### 3. 日常使用注意事项
- **微信重启或升级后**：如果数据库密钥轮换导致查询报错，只需保持微信处于登录状态，让 Agent 调用一次 `wechat_status(refresh_keys=true)`（Antigravity 规则已内置自动重试）即可恢复；
- **安全边界提醒**：微信里别人发来的消息和附件一律属于不可信外部输入，`wechat-readonly-mcp` 在每个工具响应体中都硬编码了 `UNTRUSTED_WECHAT_DATA` 防注入声明，也建议在日常使用中保持该只读原则。

欢迎前往 [GitHub 仓库](https://github.com/Sereneoned/wechat-readonly-mcp) 点 Star 体验或提 Issue 交流！
