---
## 🎬  JoyFlix观影平台（基于NEXT.JS）
<p align="center">
<img src="https://github.com/jeffernn/LibreTV-MoonTV-Mac-Objective-C/blob/main/img/icon.png?raw=true" alt="JeffernTV Logo" width="120" height="120">
</p>

> 🎬 JoyFlix观影平台是一款基于 MoonTV二次开发完全重构（包括底层后端及其前端UI及其交互逻辑）的影视播放平台

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-14-000?logo=nextdotjs)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3-38bdf8?logo=tailwindcss)
![TypeScript](https://img.shields.io/badge/TypeScript-4.x-3178c6?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green)
![Docker Ready](https://img.shields.io/badge/Docker-ready-blue?logo=docker)

</div>

- ⚠️ 因默认使用图片代理方式为豆瓣精品CDN，因此Api获取问题导致部分图片加载异常，可部署后在应用设置中将图片代理改为直连或部署时通过环境变量修改为直连即可恢复正常（懒得改默认了，辛苦各位手动改一下）
- ⚠️相对于原版进行了如下功能的添加及其重构（仅列举部分）：
- 1️⃣ 新增详细页（使用了服务器在线爬虫技术，第三方API调用，从后端API搜索获取等三种不同的回退机制确保数据获取的稳定性）
- 2️⃣ 支持浏览滚动记录（确保进入详细页查看影片不喜欢退出上级页面不会丢失浏览记录，可以回到之前的滚动位置）
- 3️⃣ 对交互逻辑、后端代码及其UI的全面重构（包括桌面端与移动端，更加人性化的交互逻辑更加符合用户的交互逻辑，提升用户的使用体验），播放页面集数可以按钮或悬停实现查看完整信息（避免综艺长标题影响选集功能），对站点API配置页实现API有效性测试及其自动排序功能
- 4️⃣ 对观看记录的记录逻辑进行重构
- 5️⃣ 对收藏页面进行重构
- 6️⃣ 对搜索页面实现热门推荐功能（具有结合数据库热更新快速获取推荐内容的功能，及其每次加载的实时性推荐），对搜索功能实现流式搜索提高响应速度提高用户的使用体验，对搜索结果的排序顺序进行重构，聚合逻辑重构（提高用户的使用体验）
- 7️⃣ 对加载页面进行响应的优化（增加加载的速度及其加载趣味性）
- 8️⃣ 对优选路线评分机制逻辑进行完全的增强重构，确保优选路线的有效性播放，加强优选的科学性，有效性，及其优选速度
- 9️⃣ 修复内存泄漏问题，提高稳定性
- 🔟 移除各项无用冗余功能（减少冗余度，提高网站响应速度，布局合理简洁易用）
- 1️⃣1️⃣ 对移动端和桌面端进行针对性的多端优化，符合不同设备相应的最佳科学的交互逻辑
- 1️⃣2️⃣ 对UI、布局进行重构，加入动态效果
- 1️⃣3️⃣ 登陆页面新增记住我，查看密码功能
- 1️⃣4️⃣ 增强广告过滤逻辑，史诗级加倍拦截广告，提升广告拦截的有效性
- 1️⃣5️⃣ 实现影片内容预加载功能，提高了加载效率，提高用户的使用体验，实现无感加载，减少加载的延迟感，同时减小API的滥用
- 1️⃣6️⃣ 还有更多，欢迎部署体验感受其不同，几乎对原有项目进行了手术级别的重构，新增多项功能，修复若干BUG，欢迎审查所有代码～
- 🎉欢迎大佬加入项目开发，有想贡献的佬佬们可以在issue中/TG群与我联系

<details>
<summary>点击查看项目图</summary>
<img width="1680" height="920" alt="image" src="https://github.com/user-attachments/assets/5d120f71-b198-4e4f-833f-e26e349a32f3" />
<img width="1680" height="925" alt="image" src="https://github.com/user-attachments/assets/6ee1ae0d-9994-4c24-8961-d0a3c7b6cd5c" />
<img width="1680" height="926" alt="image" src="https://github.com/user-attachments/assets/d4c7b0ab-249f-4667-b418-1548cb069076" />
<img width="1680" height="923" alt="image" src="https://github.com/user-attachments/assets/0875d4b1-5280-4d2f-8bc8-5c1d5b65c0e3" />
<img width="322" height="269" alt="image" src="https://github.com/user-attachments/assets/e672b701-ed02-45e5-9235-eca9a3fb409b" />
<img width="628" height="510" alt="image" src="https://github.com/user-attachments/assets/7fd61d68-a370-430f-b803-11f40e95b7b8" />
<img width="1680" height="917" alt="image" src="https://github.com/user-attachments/assets/0e9af9a7-5e8f-4a8d-a380-6b60545dfd97" />
<img width="1680" height="921" alt="image" src="https://github.com/user-attachments/assets/e34a1536-9265-4523-8b80-60c5cbd4ece7" />
<img width="1680" height="924" alt="image" src="https://github.com/user-attachments/assets/146bbd6d-936d-4193-a6d6-1c0e2df8614d" />
<img width="1680" height="929" alt="image" src="https://github.com/user-attachments/assets/a0849da2-93a0-4a6e-95d4-7a06db3da8e4" />
<img width="1680" height="923" alt="image" src="https://github.com/user-attachments/assets/b034ba1e-e904-4844-bcd3-ed3ff15ac620" />
<img width="1680" height="930" alt="image" src="https://github.com/user-attachments/assets/cfc792cf-1401-4058-ba21-82455e161fa7" />
<img width="1680" height="875" alt="image" src="https://github.com/user-attachments/assets/f2e918c2-43f7-4d32-974a-b5aaad602ba9" />
<img width="1680" height="659" alt="image" src="https://github.com/user-attachments/assets/222c5621-8f69-47d0-bc21-24429a7820f3" />
<img width="1679" height="878" alt="image" src="https://github.com/user-attachments/assets/8d0b98ee-3dc0-4433-97ef-770303f6f54a" />
<img width="1680" height="881" alt="image" src="https://github.com/user-attachments/assets/6c069501-8949-444f-9b29-54b1608f9d70" />
<img width="1680" height="926" alt="image" src="https://github.com/user-attachments/assets/cbac7ff6-be4c-4eef-a77b-2271c83d054d" />
<img width="590" height="1278" alt="IMG_0120" src="https://github.com/user-attachments/assets/bfc1c2b1-933f-4745-959d-3a1e4dbc12f8" />
</details>
### 请不要在 B站、小红书、微信公众号、抖音、今日头条或其他中国大陆社交平台发布视频或文章宣传本项目，不授权任何“科技周刊/月刊”类项目或站点收录本项目。
---

## 技术栈

| 分类      | 主要依赖                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------- |
| 前端框架  | [Next.js 14](https://nextjs.org/) · App Router                                                        |
| UI & 样式 | [Tailwind&nbsp;CSS 3](https://tailwindcss.com/)                                                       |
| 语言      | TypeScript 4                                                                                          |
| 播放器    | [ArtPlayer](https://github.com/zhw2590582/ArtPlayer) · [HLS.js](https://github.com/video-dev/hls.js/) |
| 部署      | Docker · Vercel                                                                                       |

## 部署

支持 Vercel、Docker、Netlify。

> Tài khoản: trang xem phim là công khai, không còn mật khẩu chung. Người dùng tự đăng ký và đăng nhập để có lịch sử/favorite riêng; chỉ tài khoản đã đăng nhập mới thấy danh mục BDZY 18+. Cần đặt `AUTH_SECRET` là chuỗi ngẫu nhiên dài để ký phiên đăng nhập. `PASSWORD` vẫn được đọc như một tương thích cũ, nhưng không còn là mật khẩu để vào web.

存储支持矩阵

|               | Docker | Vercel | Netlify |
| :-----------: | :----: | :----: | :-----: |
|    sqlite     |   ✅   |   ❌   |   ❌    |
| localstorage  |   ✅   |   ✅   |   ✅    |
|  原生 redis   |   ✅   |        |         |
| Upstash Redis |        |   ✅   |   ✅    |

✅：经测试支持

`sqlite` là mặc định, lưu tại `data/joyflix.sqlite`; Docker/VPS phải gắn volume cho thư mục `data`. Vercel/Netlify có filesystem tạm thời nên cần dùng Upstash Redis cho tài khoản và lịch sử bền vững.

### Vercel 部署

#### Chỉ xem với tư cách khách (localstorage, không có đăng ký)

1. **Fork** 本仓库到你的 GitHub 账户。
2. 登陆 [Vercel](https://vercel.com/)，点击 **Add New → Project**，选择 Fork 后的仓库。
3. Đặt `NEXT_PUBLIC_STORAGE_TYPE=localstorage`.
4. 保持默认设置完成首次部署。
5. 如需自定义 `config.json`，请直接修改 Fork 后仓库中该文件。
6. 每次 Push 到 `main` 分支将自动触发重新构建。

部署完成后即可通过分配的域名访问，也可以绑定自定义域名。

#### Upstash Redis 支持

0. 完成普通部署并成功访问。
1. 在 [upstash](https://upstash.com/) 注册账号并新建一个 Redis 实例，名称任意。
2. 复制新数据库的 **HTTPS ENDPOINT 和 TOKEN**
3. 返回你的 Vercel 项目，新增环境变量 **UPSTASH_URL 和 UPSTASH_TOKEN**，值为第二步复制的 endpoint 和 token
4. 设置环境变量 NEXT_PUBLIC_STORAGE_TYPE，值为 **upstash**；设置 `AUTH_SECRET`，并可设置 `USERNAME` 和 `OWNER_PASSWORD` 作为超管账号
5. 重试部署

### Netlify 部署

#### Chỉ xem với tư cách khách (localstorage, không có đăng ký)

1. **Fork** 本仓库到你的 GitHub 账户。
2. 登陆 [Netlify](https://www.netlify.com/)，点击 **Add New project → Importing an existing project**，授权 Github，选择 Fork 后的仓库。
3. Đặt `NEXT_PUBLIC_STORAGE_TYPE=localstorage`.
4. 保持默认设置完成首次部署。
5. 如需自定义 `config.json`，请直接修改 Fork 后仓库中该文件。
6. 每次 Push 到 `main` 分支将自动触发重新构建。

部署完成后即可通过分配的域名访问，也可以绑定自定义域名。

#### Upstash Redis 支持

0. 完成普通部署并成功访问。
1. 在 [upstash](https://upstash.com/) 注册账号并新建一个 Redis 实例，名称任意。
2. 复制新数据库的 **HTTPS ENDPOINT 和 TOKEN**
3. 返回你的 Netlify 项目，**Project Configuration → Environment variables** 新增环境变量 **UPSTASH_URL 和 UPSTASH_TOKEN**，值为第二步复制的 endpoint 和 token
4. 设置环境变量 NEXT_PUBLIC_STORAGE_TYPE，值为 **upstash**；设置 `AUTH_SECRET`，并可设置 `USERNAME` 和 `OWNER_PASSWORD` 作为超管账号
5. 重试部署

#### BDZY relay khi Netlify báo HTTP 403

BDZY có thể chặn IP của Netlify. Khi endpoint `/api/source-categories` trả lỗi `HTTP 403`, triển khai worker giới hạn sẵn trong repo này, thay vì dùng một proxy công khai:

1. Đăng nhập Cloudflare, cài/đăng nhập Wrangler trên máy của bạn rồi chạy `npx wrangler deploy --config workers/bdzy-relay/wrangler.toml`.
2. Wrangler sẽ trả một URL dạng `https://joyflix-bdzy-relay.<tên-tài-khoản>.workers.dev`. Kiểm tra `https://...workers.dev/bdzy?ac=videolist&t=6&pg=1` phải trả JSON.
3. Trong **Netlify → Project configuration → Environment variables**, thêm `BDZY_RELAY_URL` với giá trị `https://...workers.dev/bdzy`, rồi trigger deploy lại.

Worker chỉ chấp nhận `GET /bdzy` với bốn query `ac`, `t`, `pg`, `wd`, và luôn gọi cố định `api.apibdzy.com`; không thể dùng nó để proxy URL khác, stream video hoặc hình ảnh.

### 爪云部署

#### 普通部署（localstorage）

1. Image Name 填写 ghcr.io/jeffernn/joyflix@sha256:453fd835de93538a880dce307680da0f20d805c575c6ddfe09557f7018a2a877
2. 根据以下环境变量要求填写环境变量

部署完成后即可通过分配的域名访问，也可以绑定自定义域名。

#### Upstash Redis 支持

0. 爪云环境变量处要填写。
1. 在 [upstash](https://upstash.com/) 注册账号并新建一个 Redis 实例，名称任意。
2. 复制新数据库的 **HTTPS ENDPOINT 和 TOKEN**
3. 返回你的项目，环境变量 **UPSTASH_URL 和 UPSTASH_TOKEN**，值为第二步复制的 endpoint 和 token
4. 设置环境变量 NEXT_PUBLIC_STORAGE_TYPE，值为 **upstash**；设置 `AUTH_SECRET`，并可设置 `USERNAME` 和 `OWNER_PASSWORD` 作为超管账号

### Docker 部署

### SQLite 版本（mặc định, tài khoản và lịch sử riêng trên VPS/Docker）

Đặt `AUTH_SECRET` và gắn volume `./data:/app/data` để tệp `data/joyflix.sqlite` không mất khi container được tạo lại.

### Redis 版本（推荐，多账户数据隔离，跨设备同步）

```yaml
services:
  joyflix-core:
    image: ghcr.io/jeffernn/joyflix@sha256:453fd835de93538a880dce307680da0f20d805c575c6ddfe09557f7018a2a877
    container_name: joyflix-core
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      - USERNAME=admin
      - OWNER_PASSWORD=admin_password
      - AUTH_SECRET=replace-with-a-long-random-secret
      - NEXT_PUBLIC_STORAGE_TYPE=redis
      - REDIS_URL=redis://joyflix-redis:6379
    networks:
      - joyflix-network
    depends_on:
      - joyflix-redis
    # 如需自定义配置，可挂载文件
    # volumes:
    #   - ./config.json:/app/config.json:ro
  joyflix-redis:
    image: redis:alpine
    container_name: joyflix-redis
    restart: unless-stopped
    networks:
      - joyflix-network
    # 如需持久化
    # volumes:
    #   - ./data:/data
networks:
  joyflix-network:
    driver: bridge
```

## 环境变量

| 变量                                | 说明                                            | 可选值                               | 默认值              |
| ----------------------------------- | ----------------------------------------------- | ------------------------------------ | ------------------- |
| AUTH_SECRET                         | Ký phiên đăng nhập, bắt buộc khi dùng tài khoản | Chuỗi ngẫu nhiên dài                 | （空）              |
| USERNAME                            | Tài khoản quản trị tùy chọn                     | 任意字符串                           | （空）              |
| OWNER_PASSWORD                      | Mật khẩu của tài khoản quản trị tùy chọn        | 任意字符串                           | （空）              |
| PASSWORD                            | Tương thích cũ cho mật khẩu quản trị/ký phiên   | 任意字符串                           | （空）              |
| NEXT_PUBLIC_SITE_NAME               | 站点名称                                        | 任意字符串                           | JoyFlix             |
| ANNOUNCEMENT                        | 站点公告                                        | 任意字符串                           | 请勿分享 ʕ •ᴥ•ʔ ～  |
| NEXT_PUBLIC_STORAGE_TYPE            | Kho dữ liệu tài khoản/lịch sử                   | sqlite、localstorage、redis、upstash | sqlite              |
| JOYFLIX_DB_PATH                     | Đường dẫn tệp SQLite trên máy chủ/VPS           | Đường dẫn tuyệt đối hoặc tương đối   | data/joyflix.sqlite |
| REDIS_URL                           | redis 连接 url                                  | 连接 url                             | 空                  |
| UPSTASH_URL                         | upstash redis 连接 url                          | 连接 url                             | 空                  |
| UPSTASH_TOKEN                       | upstash redis 连接 token                        | 连接 token                           | 空                  |
| BDZY_RELAY_URL                      | URL worker relay BDZY khi Netlify bị BDZY chặn  | https://...workers.dev/bdzy          | （空）              |
| NEXT_PUBLIC_SEARCH_MAX_PAGE         | 搜索接口可拉取的最大页数                        | 1-50                                 | 5                   |
| NEXT_PUBLIC_DOUBAN_PROXY_TYPE       | 豆瓣数据源请求方式                              | 见下方                               | direct              |
| NEXT_PUBLIC_DOUBAN_PROXY            | 自定义豆瓣数据代理 URL                          | url prefix                           | (空)                |
| NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE | 豆瓣图片代理类型                                | 见下方                               | direct              |
| NEXT_PUBLIC_DOUBAN_IMAGE_PROXY      | 自定义豆瓣图片代理 URL                          | url prefix                           | (空)                |
| NEXT_PUBLIC_BASE_URL                | 搜索推荐数据库获取值接口 URL                    | https://xxx.com                      | 空                  |

NEXT_PUBLIC_DOUBAN_PROXY_TYPE 选项解释：

- direct: 由服务器直接请求豆瓣源站
- cors-proxy-zwei: 浏览器向 cors proxy 请求豆瓣数据
- cmliussss-cdn-tencent: 浏览器向豆瓣 CDN 请求数据由腾讯云 cdn 提供加速
- cmliussss-cdn-ali: 浏览器向豆瓣 CDN 请求数据，由阿里云 cdn 提供加速

- custom: 用户自定义 proxy，由 NEXT_PUBLIC_DOUBAN_PROXY 定义

NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE 选项解释：

- direct：由浏览器直接请求豆瓣分配的默认图片域名
- server：由服务器代理请求豆瓣分配的默认图片域名
- img3：由浏览器请求豆瓣官方的精品 cdn（阿里云）
- cmliussss-cdn-tencent：由浏览器请求豆瓣 CDN，由腾讯云 cdn 提供加速
- cmliussss-cdn-ali：由浏览器请求豆瓣 CDN，由阿里云 cdn 提供加速
- custom: 用户自定义 proxy，由 NEXT_PUBLIC_DOUBAN_IMAGE_PROXY 定义

NEXT_PUBLIC_BASE_URL 选项解释：

- 必须设置为服务器的网址，搜索推荐功能将使用到此地址

## 配置说明

所有可自定义项集中在根目录的 `config.json` 中：

```json
{
  "cache_time": 7200,
  "api_site": {
    "dyttzy": {
      "api": "http://caiji.dyttzyapi.com/api.php/provide/vod",
      "name": "电影天堂资源",
      "detail": "http://caiji.dyttzyapi.com"
    }
    // ...更多站点
  },
  "custom_category": [
    {
      "name": "华语",
      "type": "movie",
      "query": "华语"
    }
  ]
}
```

- `cache_time`：接口缓存时间（秒）。
- `api_site`：你可以增删或替换任何资源站，字段说明：
  - `key`：唯一标识，保持小写字母/数字。
  - `api`：资源站提供的 `vod` JSON API 根地址。
  - `name`：在人机界面中展示的名称。
  - `detail`：（可选）部分无法通过 API 获取剧集详情的站点，需要提供网页详情根 URL，用于爬取。
- `custom_category`：自定义分类配置，用于在导航中添加个性化的影视分类。以 type + query 作为唯一标识。支持以下字段：
  - `name`：分类显示名称（可选，如不提供则使用 query 作为显示名）
  - `type`：分类类型，支持 `movie`（电影）或 `tv`（电视剧）
  - `query`：搜索关键词，用于在豆瓣 API 中搜索相关内容

custom_category 支持的自定义分类如下：

- movie：热门、最新、经典、豆瓣高分、冷门佳片、华语、欧美、韩国、日本、动作、喜剧、爱情、科幻、悬疑、恐怖、治愈
- tv：热门、美剧、英剧、韩剧、日剧、国产剧、港剧、日本动画、综艺、纪录片

支持标准的苹果 CMS V10 API 格式。

## TV 使用

配合 [OrionTV](https://github.com/zimplexing/OrionTV) 在 TV 上使用

## 技术

- [ts-nextjs-tailwind-starter](https://github.com/theodorusclarence/ts-nextjs-tailwind-starter) — 脚手架。
- [ArtPlayer](https://github.com/zhw2590582/ArtPlayer) — 网页视频播放器。
- [HLS.js](https://github.com/video-dev/hls.js) — 实现 HLS 流媒体在浏览器中的播放支持。

---

### ✨✨✨ 福利

- 啦啦～
- 看到这里啦！说明你认真熟读了 README，我必须送你一些专属福利～
- ⬇️⬇️Emby 客户端（macos/ipados/ios）高级订阅会员破解脚本 ⬇️⬇️
- https://github.com/jeffernn/jeffern-qx/blob/main/%E9%87%8D%E5%86%99/Embypremiere/Embypremiere.conf
- 配合 Quantumult x 使用，懂得都懂！切勿外传哦～

---

### 🚨 重要声明

- 本项目仅供学习和个人使用
- 请勿用于商业用途或公开服务（**禁止用于任何商业用途**）
- 如因公开分享导致的任何法律问题，用户需自行承担责任
- 如有问题或建议，欢迎提交 Issue
- 如需分支项目请引用本项目地址
- 二次开发许遵守开源协议并引用本项目地址
- 项目开发者不对用户的使用行为承担任何法律责任
- 本项目不在中国大陆地区提供服务。如有该项目在向中国大陆地区提供服务，属个人行为。在该地区使用所产生的法律风险及责任，属于用户个人行为，与本项目无关，须自行承担全部责任。特此声明
- 如因公开分享导致的任何法律问题，用户需自行承担责任

---

## ⚠️ 免责声明

JoyFlix 仅作为视频搜索工具，不存储、上传或分发任何视频内容。所有视频均来自第三方影视站提供的搜索结果。如有侵权内容，请联系相应的内容提供方。

本项目开发者不对使用本项目产生的任何后果负责。使用本项目时，您必须遵守当地的法律法规。

---

## 🚀 欢迎加入我们的 Telegram 社区！

[![加入 Telegram](https://img.shields.io/badge/Telegram-加入我们的社区-blue?logo=telegram&style=for-the-badge)](https://t.me/+vIMxDGDIWiczMTE1)

欢迎加入我们的 Telegram 群，获取最新动态、分享创意、与志同道合的朋友交流！🌟

---

## 🌟 Star History

[![Stargazers over time](https://starchart.cc/jeffernn/joyflix.svg?variant=adaptive)](https://starchart.cc/jeffernn/joyflix)

---

<p align="center">
  <b>⭐ 如果这个项目对你有帮助，请给个 Star 支持一下！</b>
</p>
