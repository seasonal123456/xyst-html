# 技术方案草案

## 当前 MVP

当前版本是浏览器端静态 MVP：

```text
index.html
styles.css
app.js
```

依赖通过 CDN 加载：

- SheetJS：解析 Excel

浏览器本地存储：

```text
project-card-tool:v1
```

## 服务端迁移目标

后续上线建议迁为独立服务：

```text
project-card-tool
  app
  modules
    auth
    company
    entitlement
    import
    render
    trace
    storage
  data
  storage
```

服务端表结构可沿用 MVP 字段：

```text
Company
ToolUser
CompanyMember
CompanyUsageLog
ImportBatch
ImportedProjectRow
ProjectCardJob
GeneratedCard
StoredFile
```

## 官网接入

推荐轻量 SSO：

```text
官网登录
  ↓
生成一次性 ticket
  ↓
跳转到工具站 /sso/callback?ticket=...
  ↓
工具站校验 ticket
  ↓
创建工具站自己的 session
```

不要共用官网 cookie，不直接读官网生产数据库。
