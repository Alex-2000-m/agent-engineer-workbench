# Agent Workbench

一个由 GitHub 托管的 Agent 工程知识工作台：发现最新变化、保留证据、安排复现，并让陈旧知识及时退出默认检索。

## 核心机制

- `knowledge/entries.json` 是网站的知识事实源。
- `watchlist/sources.json` 定义需要跟踪的 Agent 工程仓库。
- 每日雷达只写入 `candidate`，不会自动升级为可信知识。
- 每周审计依据 `validUntil` 将内容降级为 `review` 或 `stale`。
- 每月 GC 将长期过期内容改为 `archived`，保留审计历史。
- 所有自动修改都通过 Pull Request 提交，合并后才会进入网站。

知识生命周期：

```text
candidate → verified → adopted → review → stale → archived
                     ↘ quarantined
```

## 本地运行

需要 Node.js 22 或更高版本。

```bash
npm install
npm run dev
```

验证两种构建目标：

```bash
npm test
GITHUB_PAGES=true NEXT_PUBLIC_BASE_PATH=/agent-engineer-workbench npm run build:pages
```

## 知识维护

```bash
npm run knowledge:sync
npm run knowledge:audit
npm run knowledge:gc
```

首次同步 GitHub Release 时，可通过 `GITHUB_TOKEN` 提高 API 限额。不要将 Token 写入仓库。

## GitHub Pages

仓库包含 `.github/workflows/deploy-pages.yml`。创建 GitHub 仓库后：

1. 打开 **Settings → Pages**。
2. 将 Source 设为 **GitHub Actions**。
3. 在 **Settings → Actions → General** 中允许 GitHub Actions 创建 Pull Request。
4. 推送到 `main`，或手动运行 `Deploy GitHub Pages`。

部署工作流会自动使用仓库名作为 `basePath`，无需手工修改资源路径。

## 安全边界

- 网站当前只包含公开示例数据，可以安全地部署为公共 Pages。
- 不要把密钥、私人笔记、客户信息或内部实验结果提交到公共仓库。
- 普通 GitHub Pages 不等同于私有网站。真正的私有 Pages 访问控制需要 GitHub Enterprise Cloud。
- 外部网页和 Release 内容一律视为不可信输入；自动化只创建 PR，不自动合并。
- 日常雷达应使用只读访问；代码、Issue、PR 和知识状态升级需要独立审批。
