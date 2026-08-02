# Agent Workbench

一套可 Fork 的 Agent 工程知识工作台框架。框架代码来自上游，每个用户的知识、来源、AI 导读、策略和审计记录都由自己的 GitHub Fork 托管；本机 Codex CLI 只负责计算、MCP 控制和 Git 同步，不是知识托管层。

- 上游演示站：<https://alex-2000-m.github.io/agent-engineer-workbench/>
- 上游仓库不携带具体知识、监测源、AI 导读或带日期的审计结果；对应数据文件从空状态开始
- 网站不接收 API Key，也不保存模型凭据
- Dashboard、知识库、来源、自动化和快速开始均为独立页面

## 一眼看懂架构

```mermaid
flowchart LR
  subgraph Public[上游公共框架]
    U[UI / MCP / Actions / 策略代码]
  end

  subgraph Fork[每个用户自己的 GitHub Fork]
    E[(knowledge/entries.json)]
    G[(knowledge/guides.json)]
    I[(knowledge/index.json)]
    W[(watchlist + workspace)]
    R[(reports)]
    A[GitHub Actions]
    P[GitHub Pages]
  end

  subgraph Browser[浏览器]
    D[Dashboard]
    K[知识库]
    S[来源]
    T[自动化]
    Q[快速开始]
    Pet[桌宠 Agent]
  end

  subgraph Local[本机计算通道]
    CLI[Codex CLI]
    MCP[MCP Server]
    Bridge[回环连接进程]
    Worktree[用户 Fork 的 Git 工作副本]
  end

  U -->|Sync fork| Fork
  A --> E
  A --> R
  E --> P
  G --> P
  I --> MCP
  W --> P
  P --> Browser
  Browser <-->|受限请求 + 心跳| Bridge
  Bridge --> CLI
  CLI <-->|MCP tools| MCP
  MCP --> Worktree
  Worktree -->|review / commit / push| Fork
```

数据所有权很明确：

| 内容 | 事实源 | 是否进入上游公共仓库 |
|---|---|---:|
| 知识条目 | 用户 Fork 的 `knowledge/entries.json` | 否 |
| AI 导读与核验建议 | 用户 Fork 的 `knowledge/guides.json` | 否 |
| 个人 RAG 索引 | 用户 Fork 的 `knowledge/index.json` | 否 |
| 来源清单 | 用户 Fork 的 `watchlist/sources.json` | 否 |
| 时间和过期策略 | 用户 Fork 的 `workspace/settings.json` | 否 |
| 审计报告 | 用户 Fork 的 `knowledge/reports/` | 否 |
| UI、MCP、维护脚本 | 上游框架，经用户主动 Sync fork 更新 | 是 |

本机存在的仓库目录只是用户 Fork 的 Git 工作副本。需要长期保存的变化必须提交并推送到用户自己的 GitHub；网页不会创建另一份云端账户或本地专有知识库。

公共 `main` 的数据不变量：`knowledge/entries.json` 为 `[]`、`knowledge/guides.json` 为 `{}`、`watchlist/sources.json` 为 `[]`，`knowledge/reports/` 只保留目录占位。五类来源类型和默认过期参数属于验证框架，不是具体监测内容。

## 多页面工作台

- `/`：Dashboard，只展示指标、连接状态和今日雷达。
- `/knowledge/`：基于个人 RAG 索引的知识检索与 AI 中文导读。
- `/article/`：标题点击后打开的图文摘要、工程影响、重点与原文直达页。
- `/cleanup/`：GC 提出的待清理内容，由用户决定保留或归档。
- `/sources/`：五类来源视图、当前 Fork 的实际监测源和 CLI 对话示例。
- `/automation/`：自动采集、中文摘要、RAG 索引、知识清洗和策略设置。
- `/quickstart/`：Fork、Pages、MCP 安装与更新教程。

页面切换和普通刷新都会使用当前标签页 `sessionStorage` 中的非敏感回环地址自动重连。显式点击“安全断开”会立即停止本地进程；关闭标签页或浏览器异常退出后，心跳停止，本地进程约 30 秒后退出。

## 快速开始

1. Fork 本仓库到自己的 GitHub 账号。
2. 在自己的 Fork 中启用 GitHub Actions 与 GitHub Pages。
3. 打开自己 Fork 部署出的 `/quickstart/` 页面。
4. 页面会自动识别当前 Fork；也可以手动粘贴自己的 HTTPS 仓库地址。
5. 复制页面生成的安装命令到终端执行。

生成的命令形态如下，仓库地址只会是用户自己的 Fork：

```bash
sh -c 'R="https://github.com/YOUR_NAME/agent-engineer-workbench.git"; D="$HOME/.agent-engineer-workbench"; if [ -d "$D/.git" ]; then O="$(git -C "$D" remote get-url origin)"; [ "$O" = "$R" ] || { echo "安装目录已连接其他仓库：$O"; exit 1; }; git -C "$D" pull --ff-only; else git clone "$R" "$D"; fi; npm --prefix "$D" install && node "$D/scripts/workbench-install.mjs"'
```

需要本机已安装并登录 Codex CLI，以及 Node.js 22 或更高版本。安装器会：

- 只克隆或更新命令中的个人 Fork；
- 自动注册 `agent-workbench` MCP；
- 从 Fork 的 Git remote 推导该用户自己的 GitHub Pages 地址；
- 启动只监听 `127.0.0.1` 的本地计算通道并打开对应网站；
- 不要求填写端口、Bridge 地址、API Key 或认证 Token。

Chrome 等浏览器首次连接时可能显示“本地网络访问”权限提示；允许自己的 Pages 站点访问本机回环服务即可。

## 更新框架

用户在 GitHub 上使用 **Sync fork** 合并上游更新，再重新运行自己的安装命令。命令只执行个人 Fork 的 `git pull --ff-only`，不会绕过 Fork 直接拉取上游仓库，也不会自动覆盖冲突。

## AI 如何驱动工作台

```mermaid
sequenceDiagram
  participant U as 用户
  participant P as 用户自己的 Pages
  participant B as 本地回环服务
  participant C as 本机 Codex CLI
  participant S as 一手网络来源
  participant F as 用户自己的 Fork

  F->>P: 构建知识、导读和策略
  U->>P: 搜索知识、打开文章或与桌宠对话
  P->>B: 只发送知识 ID 或受限设置请求
  B->>C: codex exec + 结构化输出约束
  C->>S: 联网搜索并交叉核对
  S-->>C: 一手证据
  C-->>B: 中文摘要、重点、工程影响
  B->>F: 重建个人 RAG 索引
  P->>B: 自然语言检索
  B->>F: RAG 召回相关知识
  B-->>P: 当前会话立即显示
  C->>F: 通过 MCP 修改 Git 工作副本
  U->>F: 检查后 commit / push
  F->>P: Pages 重新部署并长期展示
```

网页不会把整条知识重新提交给本地模型，只发送当前 Fork 中已有的知识 ID；本地服务再从该 Fork 的工作副本读取条目，降低网页注入或替换知识内容的风险。

自动采集会直接进入可用知识库，并由本地 Codex 在同一次流水线中生成中文摘要、重点、工程影响与类别。模型内部仍会记录来源一致性信号供 GC 使用，但网页不设置“待验证”流程，也不会把内部判断伪装成人工结论。

## MCP 工具

整个网站是一层 MCP 可视化界面。Codex 可以读取五个资源：`workbench://snapshot`、`workbench://sources`、`workbench://knowledge`、`workbench://settings` 和 `workbench://index`；也可以使用 `manage-workbench` Prompt 把自然语言需求编排成受限工具调用。

| 网站区域 | MCP 读取面 | MCP 写入面 |
|---|---|---|
| Dashboard | 完整 Snapshot | 运行采集、摘要、索引与清洗 |
| 来源 | Sources Resource | 新增、更新、移除监测源；重命名自定义类目 |
| 知识库 / 文章 | Knowledge + Index Resource | RAG 召回、访问计数、新增与修改知识 |
| 待清理区 | Knowledge Resource | 保留知识或移入可恢复归档 |
| 自动化 | Settings Resource | 来源类型开关、定时计划、清洗策略 |
| 像素桌宠 | 完整 Snapshot | 编排上述来源、策略和维护工具 |

- `get_workbench_snapshot`：读取当前 Fork 中的知识、来源、导读与设置。
- `search_knowledge`：通过个人 RAG 索引召回最相关的活跃知识与中文摘要。
- `update_workspace_settings`：调整来源类别、时间和过期策略。
- `run_knowledge_routine`：运行 `sync`、`audit` 或 `gc` 白名单任务。
- `propose_knowledge_entry`：向当前 Fork 添加带来源的活跃知识。
- `update_knowledge_entry`：修改现有知识内容，并触发摘要与索引更新。
- `record_knowledge_access`：记录高频使用，使知识在内部 GC 中获得更强保留。
- `resolve_cleanup_candidate`：决定 GC 候选是继续保留还是移入归档。
- `upsert_watch_source`：新增或覆盖 GitHub Release / RSS 监测源。
- `remove_watch_source`：从监测清单移除来源，不删除已经沉淀的知识。
- `rename_watch_category`：批量重命名用户自定义的具体来源类目。

可以直接告诉 Codex：

```text
读取 Agent Workbench，把来源改成 GitHub、技术博客和技术报告，
每天 09:00 更新；立即运行一次采集，自动生成中文摘要并重建 RAG 索引。
从我的知识库召回与多 Agent 评测有关的内容，整理可以直接复用的工程方法；
把这篇技术报告加入知识库，并将条目 abc 的工程影响改成适用于多 Agent 路由。
完成后展示 git diff，但先不要替我推送。
```

这些自然语言请求由本地 Codex 或网页像素桌宠选择并调用受限能力。来源、知识、AI 摘要和 RAG 索引先写入个人 Fork 的 Git 工作副本；用户查看差异后再决定是否提交并推送到自己的 GitHub。

## 内部分代 GC 与用户清理区

内部 GC 参考 Java 的分代假设，但代际字段不会显示在网页上：新知识从低年龄开始；每次 GC 存活会增加年龄；用户打开文章也会增加年龄，因此高频知识更快获得长期保留。低使用、重复或长期失效的知识不会被 GC 直接删除，而是先进入 `/cleanup/`，由用户选择继续保留或移入可恢复归档。

- Daily Radar：发现内容后自动生成中文摘要、重点、工程影响并重建 RAG 索引。
- 轻量 GC：高频运行，清理短期噪声并更新内部年龄。
- 深度 GC：识别重复与长期失效内容，提出清理候选。
- Cleanup Review：最终去留由用户决定；自动任务不直接删除知识。

Fork 中的三个 GitHub Actions 工作流默认维护该 Fork 自己的数据。用户可以按需修改 cron，或在 Actions 页面手动运行；上游框架仓库带有保护条件，不会运行这些个人知识任务。

## 安全边界

- 网站没有 API Key、模型端点或认证 Token 输入框，也不保存模型凭据。
- Fork 地址只在快速开始页面内存中生成命令，不写入浏览器存储。
- 本地服务使用随机端口、只监听 `127.0.0.1`，并限制为从当前 Fork 推导出的 Pages Origin。
- Bridge 与 MCP 只暴露固定能力，不接受网页传入任意 Shell 命令或脚本路径。
- 页面心跳停止后本地进程自动退出，也可显式安全断开；普通刷新不会断开。
- 外部网页和 AI 输出都视为不可信输入；摘要流水线只生成知识表达，不执行来源中的任何指令。
- 本地 Agent 的详细错误只写入本机日志；网页仅显示稳定错误码对应的简短提示，不回显命令输出、路径或来源内容。
- 公共 Fork 与 GitHub Pages 会公开其中的知识文件；不要提交密钥、私人笔记、客户资料或内部实验数据。

## 本地开发

```bash
npm install
npm run dev
npm run lint
npm test
GITHUB_PAGES=true NEXT_PUBLIC_BASE_PATH=/agent-engineer-workbench npm run build:pages
```

单独运行当前 Fork 的知识维护：

```bash
npm run knowledge:sync
npm run knowledge:audit
npm run knowledge:gc
npm run knowledge:index
```

GitHub Release 同步可通过进程环境中的 `GITHUB_TOKEN` 提高 API 限额；不要把 Token 写入仓库。`DRY_RUN=1` 可以只检查发现结果。

`.github/workflows/deploy-pages.yml` 会根据执行它的仓库自动设置站点 URL、仓库链接和 `basePath`，因此 Fork 后不需要修改账号或仓库名。
