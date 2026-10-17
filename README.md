[README.md](https://github.com/user-attachments/files/33601025/README.md)
# Balatro 分值计算器 + 种子查种器

纯前端的 Balatro（小丑牌）工具集，纯静态托管即可运行，无需后端。包含两个独立页面：

| 页面 | 文件 | 用途 |
| --- | --- | --- |
| 分值计算器 | `index.html` | 精确计算一手牌的得分，并做小丑/出牌优化分析 |
| 种子查种器 | `seed.html` | 输入种子，模拟生成全进程商店/包/券/标签并按名检索定位 |

## 工具一：分值计算器（`index.html`）

输入打出牌、手牌、小丑、牌组与 Boss，得到**精确分值**与逐步触发链（筹码 × 倍率，含每一次加成的来源）。

- **150 个小丑**建模：支持版本（普通/金/彩/多/负片）、异能与特殊参数（如偶像的点数花色、古老的花色、积分卡的剩余触发次数）。
- **13 种牌型** + 等级输入，含「基础 / 本局已打出 / 整局已打出」的成长字段。
- **12 种 Boss 减益**：花色/人头/全减益、Flint 减半、Psychic 必须 5 张、Arm 等级-1，以及：
  - **The Eye**：已用牌型**多选**（复选框），重复牌型判无效；
  - **The Mouth**：整轮仅允许一种牌型；
  - **Crimson Heart**：随机一个小丑减益 → 用小丑行的「**减**」开关手动指定；
  - 「**Boss 已解除**」开关一键跳过所有 Boss 减益（如 Verdant Leaf 已清）。
- **牌组**：普通 / 等离子（等离子按平分后结算，最小替换按平分前原始筹码倍率计算）。
- **5 种版本**（普通/金箔/彩/多/负）、**5 种印章**、**9 种强化**、天文台加成。
- **分析面板**：
  - 移除某小丑的等价换算；
  - **最优小丑替换排名**（每个候选替换的最大分、等效乘率、最优摆法与出牌）；
  - **全量出牌搜索**（枚举出牌组合取最大分，Boss 禁用牌型时给出说明）;
  - 最小替换所需的倍率/筹码/倍率乘数。
- 交互：小丑**收藏（★）置顶**、**拖拽排序**、**禁**（失效）/**减**（减益）开关、占位小丑自定义倍率/筹码/倍率×、点牌卡打开编辑器（点数/花色/强化/版本/印章/减益）。

## 工具二：种子查种器（`seed.html`）

输入 8 位种子，通过内置 **Immolate WASM**（已扩容至 2GB 内存）模拟整个流程，渲染**中文 + 图片**视图。

- 生成 **39 个底注**的商店队列、**补充包**、**优惠券**、**标签**、**Boss** 与幻灵牌。
- **按名检索并精确定位**：命中「第 X 底注第 N 个」或「第 X 底注·**包内**（某包）」，支持收藏常用与名单快速检索。
- **负片检索**：单独检索负片（Negative）牌在各底注的位置。
- **幻灵牌检索**。
- 可选**牌组 / 难度 / 版本**，改动即重新生成；**每底注显示牌数**可调（超出部分不显示但检索仍可命中）。
- 解锁码**兼容新旧格式**；搜索建议带中文名。

## 本地运行

两个页面均可直接双击打开；查种器建议用本地静态服务器（WASM 需 `http` 环境）：

```
npx serve balatro_calc        # 或 python -m http.server
```

打开 `http://localhost:<port>/index.html` 与 `.../seed.html`。

## 部署上传清单

上传以下 **24 个文件**即可部署（相对 `balatro_calc/`）：

```
index.html
seed.html
app.js
core/analyze.js
core/data.js
core/engine.js
core/format.js
core/hand_eval.js
core/jokers.js
core/names.js
soul/zh.js
soul/engine.js
soul/wasm-bin.js
soul/immolate.js
soul/UI.js
soul/images/8BitDeck.png
soul/images/BlindChips.png
soul/images/Editions.png
soul/images/Enhancers.png
soul/images/Jokers.png
soul/images/Tarots.png
soul/images/Vouchers.png
soul/images/stickers.png
soul/images/tags.png
```

**不要上传**（本地/构建产物，运行时不需要）：

- `serve.js`、`build_names.js`、`build_soul_zh.js`、`build_wasm_bin.js`
- `soul/index.src.html`、`soul/patch_wasm_memory.js`
- `soul/immolate.js.orig`、`soul/immolate.wasm.orig`
- `soul/immolate.wasm`（WASM 已内联进 `soul/wasm-bin.js`，不单独 fetch）
- `soul/m6x11plus.ttf`（运行时无引用）
- `extract/`（提取素材用）、`tests/`（测试）

## 目录结构

```
balatro_calc/
├── index.html        计算器页面
├── seed.html         查种器页面（内联 IIFE）
├── app.js            计算器 UI 逻辑
├── core/             计算器内核
│   ├── data.js       牌型/Boss/版本/印章等静态数据
│   ├── names.js      中英文名
│   ├── hand_eval.js  牌型识别
│   ├── jokers.js     150 个小丑效果
│   ├── engine.js     计分引擎（含 Boss 减益/版本/等离子）
│   ├── analyze.js    替换/全量搜索分析
│   └── format.js     数值格式化
└── soul/             查种器
    ├── engine.js     WASM 加载与流程封装
    ├── wasm-bin.js   内联 base64 WASM（2GB 扩容版）
    ├── immolate.js   WASM 胶水
    ├── zh.js         中文本地化
    ├── UI.js         渲染（队列/包/券/标签/卡面）
    └── images/       卡面与图标图集
```
