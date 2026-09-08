# 知识库实现说明

本文档说明当前知识库的文档模型、上传索引流程、两阶段检索、LLM 元数据提取、权限和审计边界。知识库面向通用的产品、项目、流程和技术文档，不依赖特定业务领域。

## 1. 能力定位

知识库用于检索非数据库类的文档信息，例如产品说明、部署指南、操作流程、技术规范和项目约定。它不替代实时数据库查询，也不向 AI 暴露任意 SQL。

知识库有两个相互独立的职责：

- 文档管理：由拥有 `knowledge:manage` 的用户上传、确认元数据、更新、重建索引和删除文档。
- 文档检索：由拥有 `knowledge:read` 的用户或已绑定相应权限的渠道身份检索授权文档；群聊访客只能检索公开文档。

## 2. 文档模型与通用字段

当前对外使用的文档字段如下：

| 字段      | 表单名称   | 用途                                                               | 约束                           |
| --------- | ---------- | ------------------------------------------------------------------ | ------------------------------ |
| `title`   | 文件标题   | 默认取上传文件名（不含扩展名），也作为文档识别名称                 | 最多 200 个字符                |
| `topics`  | 可检索主题 | 描述文档覆盖的主题、关键词或用户可能使用的问法，参与知识源目录检索 | 最多 20 项，每项最多 80 个字符 |
| `summary` | 知识源说明 | 用一两句话说明文档内容、适用范围和主要用途，参与知识源目录检索     | 可为空，最多 2,000 个字符      |
| `content` | 文档正文   | 用于正文分块和第二阶段语义检索                                     | UTF-8 纯文本，最多 5 MB        |
| `roleIds` | 可访问角色 | 控制哪些角色可以读取文档，是权限配置，不是文档语义元数据           | 角色必须真实存在               |

`topics` 和 `summary` 是面向通用文档场景保留的语义字段；角色访问控制单独维护。来源机构、文档类型、产品或业务对象等旧字段没有稳定的通用语义，当前 API、前端表单、模型提示、Provider 和数据库均不再使用。

### 旧字段迁移

- `0000000000032_add_knowledge_catalog_metadata.ts` 增加了目录元数据和目录向量能力。
- `0000000000033_remove_non_generic_knowledge_metadata.ts` 删除了 `source_name`、`document_type` 和 `subject` 列，并保留回滚逻辑。
- 已有文档如在字段清理前生成过目录向量，建议通过管理台逐条执行“重建索引”，使目录向量只基于当前的标题、知识源说明和可检索主题重新生成。

## 3. 上传、提取与索引流程

```text
选择 TXT / MD / MARKDOWN / RST 文件（单文件 ≤ 5 MB）
        ↓
服务端读取 UTF-8 文本并清理 BOM、空白和无效内容
        ↓
metadata-preview 调用 LLM，生成 summary / topics 建议
        ↓
管理员在表单中审核、修改并确认建议，同时配置可访问角色
        ↓
保存文档正文、摘要、主题和角色关系
        ↓
生成正文分块向量 + 知识源目录向量
```

LLM 元数据提取是“预览建议”，不会直接写入数据库、授予访问权限或替代管理员确认。模型只读取最多 14,000 个字符的正文摘录，输出必须是结构化 JSON；无法确认的 `summary` 返回 `null`，无法确认的 `topics` 返回空数组。文档中的指令始终是不可信内容，不会成为系统策略或权限依据。

管理台表单中“可检索主题”使用逗号分隔多个主题；保存前会清理首尾空白和空项。主题和说明都可以人工修改，管理员也可以不采用 LLM 建议。

## 4. 管理 API

所有知识文档管理接口均位于 `/api/v1/system`，需要 Bearer 认证、`knowledge:manage` 权限，并由后端完成角色校验、文件校验、持久化和审计。

| 方法     | 路径                                    | 用途                         | 请求体/限制                                                        |
| -------- | --------------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `GET`    | `/knowledge-documents`                  | 分页获取文档及角色           | `page`、`limit`；服务端限制分页上限                                |
| `POST`   | `/knowledge-documents/metadata-preview` | 生成待确认的 LLM 元数据建议  | multipart `file`；单文件 ≤ 5 MB                                    |
| `POST`   | `/knowledge-documents`                  | 创建并索引单个文档           | multipart `file`、`summary`、JSON 字符串 `topics`、`roleIds`       |
| `POST`   | `/knowledge-documents/batch`            | 批量创建并索引文档           | multipart `files`，最多 20 个；每个文件 ≤ 5 MB；`roleIds` 统一应用 |
| `PUT`    | `/knowledge-documents/:id`              | 更新文档和元数据             | 可选新 `file`；`summary`、`topics`、`roleIds` 必须按当前表单提交   |
| `POST`   | `/knowledge-documents/:id/reindex`      | 使用当前正文和元数据重建向量 | 无请求体                                                           |
| `DELETE` | `/knowledge-documents/:id`              | 删除文档、正文分块和向量     | 需要前端确认                                                       |

成功响应遵循 `{ "data": ... }` envelope；列表响应为 `data.items` 和 `data.meta`。普通读取接口不会返回向量、Provider 内部字段或角色 pivot 数据。

## 5. 两阶段 AI 检索

AI 回答产品、项目、配置、部署、功能或流程问题时，必须按以下顺序执行：

### 阶段一：检索知识源目录

调用 `search_knowledge_catalog`，输入一个自然语言 `query`。服务端先验证 `knowledge:read`，再根据当前用户角色或访客公开范围过滤文档，使用目录向量检索最多 12 个候选知识源。

目录结果只返回用于选源的元数据：`documentId`、`title`、`summary`、`topics` 和 `similarity`，不返回正文片段。目录元数据可以帮助模型选择文档，但不是最终回答证据。

### 阶段二：限定文档精检索

模型从阶段一结果中选择 1 至 10 个 `documentId`，调用 `search_knowledge` 并提供原始问题或精炼查询。服务端会拒绝不属于本轮目录结果的 ID，再次验证权限，并只在选定文档内检索语义分块。

精检索结果返回 `documentId`、`title`、`chunkId`、`excerpt` 和 `similarity`。最终回答只能使用这些正文片段；目录摘要、模型常识和通用框架推测不能替代正文证据。没有相关片段时，应明确说明知识库无法确认，而不是编造答案。

两个工具均为顺序执行。第二阶段不能单独调用，也不能复用其他轮次的目录 ID；每轮 AI 运行都会重新建立本轮目录范围。检索工具是只读能力，不创建、修改或删除知识文档。

### 访客模式

企业微信、飞书或钉钉群聊中的未绑定访客使用 `knowledge-only` 模式。两个阶段都只检索没有角色限制的公开文档，不能访问用户、角色、权限、API Key、审计日志或其他实时系统数据，也不能创建确认提议。

## 6. 权限矩阵

| 场景                             | 所需权限             | 服务端行为                               |
| -------------------------------- | -------------------- | ---------------------------------------- |
| 管理台查看文档列表               | `knowledge:manage`   | 允许管理列表和角色范围展示               |
| 上传、预览、更新、重建索引、删除 | `knowledge:manage`   | 校验输入和角色，执行对应管理操作并写审计 |
| 管理台 AI 知识问答               | `knowledge:read`     | 目录和正文检索都按当前角色过滤           |
| 已绑定渠道私聊问答               | `knowledge:read`     | 复用系统用户角色和同一两阶段检索规则     |
| 群聊访客问答                     | 渠道访客公开知识能力 | 强制 `publicOnly`，只返回无角色限制文档  |

前端路由和按钮显隐只是体验层保护；后端路由 middleware、Bouncer 和知识检索 service 会在每次请求或工具调用时重新鉴权。

## 7. 审计与数据保护

知识库管理和 AI 检索分别记录审计事件：

| 事件                           | 触发时机                   | 关键元数据                                                         |
| ------------------------------ | -------------------------- | ------------------------------------------------------------------ |
| `knowledge_document.created`   | 单个或批量创建成功         | 文档 ID、标题、角色 ID；批量操作带 `batch: true`                   |
| `knowledge_document.updated`   | 更新完成                   | 标题、变更字段、是否重建索引、角色 ID                              |
| `knowledge_document.reindexed` | 手动重建索引完成           | 文档 ID、标题                                                      |
| `knowledge_document.deleted`   | 删除完成                   | 文档 ID、标题                                                      |
| `knowledge.catalog_searched`   | 目录检索成功、拒绝或失败   | `stage`、查询哈希、授权结果、候选数/结果数、`publicOnly`、耗时     |
| `knowledge.searched`           | 正文精检索成功、拒绝或失败 | `stage`、查询哈希、授权结果、选中文档数/结果数、`publicOnly`、耗时 |

AI 检索审计不保存原始查询、正文、摘录、完整文档 ID 列表或敏感参数，只保存查询的 SHA-256 哈希和计数类运行元数据。权限拒绝和参数失败也会记录；用户主动中止的请求不额外写失败审计。

## 8. 维护与排障

1. 修改文档标题、知识源说明、可检索主题或正文后，系统会自动重建正文分块和目录向量。
2. 只修改访问角色时不需要重新计算向量，但会立即影响下一次目录和正文检索的权限过滤。
3. LLM 提取失败时，管理员可以手工填写主题和说明后继续保存；预览接口本身不会产生半成品文档。
4. 检索结果异常时，先确认用户拥有 `knowledge:read`，再检查文档是否分配了预期角色，最后对该文档执行重建索引。
5. 数据库迁移状态应在目标本地环境确认：

```bash
pnpm --dir apps/backend exec node ace migration:status
```

实现入口：

- 后端管理接口：`apps/backend/app/controllers/knowledge_documents_controller.ts`
- 文档与检索服务：`apps/backend/app/services/knowledge_service.ts`
- LLM 元数据提取：`apps/backend/app/services/knowledge_metadata_service.ts`
- 两阶段 AI 工具：`apps/backend/app/ai/tools/search_knowledge_catalog.ts`、`search_knowledge.ts`
- 检索审计：`apps/backend/app/services/knowledge_audit.ts`
- 管理台 feature：`apps/frontend/src/features/knowledge/`
