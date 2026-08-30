# Paste X-Ray

**让不可见字符留下指纹。**

检查粘贴或拖入文本中的零宽字符、homoglyph 视觉混淆字符、特殊空格、双向文本控制符、异常标点、换行差异与隐藏 HTML。所有分析都在浏览器本地完成，文本不会上传。

> [立即在线使用 Paste X-Ray](https://nisconder.github.io/paste-xray/)

Inspect pasted text or local text files for invisible Unicode, mixed-script homoglyphs, bidi controls, unusual whitespace, hidden HTML, and line-ending differences—entirely in your browser.

## 为什么需要它

从网页、PDF、聊天工具或 AI 回答中复制的文本，可能夹带肉眼看不见的字符。它们会造成配置失效、代码比较异常、搜索匹配失败，甚至形成具有迷惑性的 Unicode 文本。

Paste X-Ray 可以帮助你在粘贴前确认：

- 两段看起来相同的文本为什么比较结果不同
- 代码、配置或命令中是否混入零宽字符与 Bidi 控制符
- 普通空格是否被替换为 NBSP、NNBSP 等特殊空格
- 域名、账号、文件名或代码标识符是否混入形似拉丁字母的西里尔 / 希腊字符
- 文本使用的是 CRLF、LF 还是混合换行
- 剪贴板是否携带额外的隐藏 HTML
- 哪些字符可以安全清理，哪些需要人工确认
- 如何把检测结论导出为可独立打开的扫描报告

## 使用方法

1. 打开[在线版本](https://nisconder.github.io/paste-xray/)。
2. 粘贴文本、选择文件，或把文本文件直接拖入输入区。
3. 查看风险标记与上下文；确认清理选项后复制预览结果。
4. 需要留档或分享时，导出独立 HTML 扫描报告。

清理选项默认全部关闭，工具不会擅自删除字符。

## 当前功能

- 检测常见零宽字符（ZWSP、ZWNJ、ZWJ、WJ、BOM 等）、不可见数学控制符与 Unicode 标签字符
- 本地拖入或选择常见文本、代码和数据文件；支持 UTF-8 与带 BOM 的 UTF-16，单文件上限 5 MB
- 检测 Latin、Cyrillic 与 Greek 混排中的 homoglyph 视觉混淆字符，并给出可疑片段和对应 Latin 字符
- 仅在同一连续片段混用文字系统时报警，避免把正常的整段俄文或希腊文直接判为风险
- 对可能随 AI 对话、网页或 PDF 复制带入的隐藏字符显示来源提示，同时明确说明这不能证明内容由 AI 生成
- 检测 NBSP、NNBSP 和多种 Unicode 特殊空格
- 检测 Bidi 方向控制符
- 标记 CRLF、CR、LF 与不可打印控制字符
- 将字符区分为“正常结构 / 需要确认 / 较高风险”，统一换行默认不高亮
- 可选“显示换行与 Tab”，用于深度检查文本结构
- 为每类字符展示原文上下文、常见来源、可恢复性和下一步建议
- 明确识别 `U+FFFD`：说明原字符已经丢失，并提示从原文件按正确编码重新复制
- 标记智能引号、长横线、减号和省略号
- 同时展示剪贴板 `text/plain` 和 `text/html`
- 按选项生成清理预览并一键复制
- 导出无外部依赖、带内容安全策略的独立 HTML 扫描报告，包含摘要、字符显影带、检测明细和处理建议
- 所有处理均在浏览器本地完成

## 隐私与安全

- 不需要账号
- 不依赖后端服务
- 不上传或保存粘贴内容
- 不使用遥测或分析脚本
- 文件读取和报告生成均在当前浏览器中完成
- 扫描报告包含被扫描内容及上下文；分享前请检查密码、密钥、个人信息等敏感内容
- 所有清理选项默认关闭，避免破坏 emoji、多语言文字或编辑器排版
- 可以删除 `U+FFFD`（`�`）占位符，但这不能恢复已经丢失的原字符

## 本地运行

这是一个无依赖的纯前端项目。在 Windows 中直接双击 **`打开 Paste X-Ray.cmd`** 即可；也可以直接打开 `index.html`。

如果浏览器限制了本地文件功能，可以启动一个临时本地服务器：

```powershell
python -m http.server
```

命令会显示访问地址；在浏览器中打开该地址即可。端口只是临时的本地入口，不影响工具功能。

## 运行测试

```powershell
node --test tests/app.test.cjs
```

测试覆盖全部已支持的零宽字符、Unicode 标签字符、AI 复制提示、homoglyph 混排与多语言误报保护、UTF-8 / UTF-16 文件解码、报告转义、清理结果与字符位置。

## 反馈

如果你发现漏检、误报或浏览器兼容问题，请[提交 Issue](https://github.com/nisconder/paste-xray/issues)。

## License

[MIT](LICENSE)
