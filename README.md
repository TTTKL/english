# LexiSprint AI 背单词 App

一个基于 `Python + SQLite + 原生前端` 的背单词应用，支持：

- 手动维护词库
- 后端持久化存储
- 按“认识 / 模糊 / 不认识”进行每日复习
- 基于熟悉度安排后续复习
- 统计今日学习词与已掌握词
- 根据“今日新词 + 已掌握基础词 + 目标考试”生成长句或短文
- 支持离线演示模式和 OpenAI 兼容 API 模式
- 导入考研词汇 JSON 文件

## 启动方式

```bash
python server.py
```

然后访问 <http://127.0.0.1:8000>

## 使用流程

1. 启动服务后打开页面。
2. 添加单词，点击“载入示例词库”，或点击“导入考研词库”。
3. 系统会把词汇、复习记录、配置持久化到 SQLite。
4. 在“今日背词”里完成一轮学习。
5. 选择考试类型，比如 CET-4、IELTS、考研英语。
6. 在“长句 / 文章生成”里输入主题并点击生成。
7. 如果想接真实大模型，把生成模式切到 `API 模式`，填写 `API Base URL`、`API Key`、`模型名称`。

## 后端存储

- 数据库文件：`lexisprint.db`
- 默认监听地址：<http://127.0.0.1:8000>
- 当前后端接口：
  - `GET /api/health`
  - `GET /api/state`
  - `POST /api/words`
  - `DELETE /api/words/:id`
  - `POST /api/review`
  - `POST /api/reset-today`
  - `POST /api/settings`
  - `POST /api/import-dataset`

## 考研词库导入

- 默认导入文件：
  - `D:\qq_down\down\1521164661106_KaoYanluan_1\KaoYanluan_1.json`
- 文件格式是逐行 JSON。
- 服务端会自动抽取单词、中文释义、示例句和 rank。
- 重复单词会自动跳过。

## AI 生成逻辑

- 离线演示模式：不联网，使用当前学习记录拼装一份可演示的考试风格内容。
- API 模式：调用 OpenAI 兼容的 `/chat/completions` 接口生成真正动态的内容。

## 说明

- 所有学习数据现在保存在本地 SQLite，而不是浏览器 `localStorage`。
- 当前版本适合做产品原型，也适合作为后续完整 Web App 的基础。
- 如果你希望，我下一步可以继续把它升级成带登录、云同步、错词本、作文批改和更完整 SRS 算法的版本。
